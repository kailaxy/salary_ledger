#!/usr/bin/env python3
"""Controlled local-only sampling experiment; owns one server at a time."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.config import Config
from benchmark import QUALITY_PATH, write_private
from reporting import summarize

CELLS = [(temperature, penalty) for temperature in (.5, .8, 1.0) for penalty in (1.15, 1.0)]


def fingerprint():
    digest = hashlib.sha256()
    for path in sorted((ROOT / 'app').glob('*.py')):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def environment(temperature, penalty, seed):
    # Explicit overrides affect only owned child processes, never .env/services.
    return {**os.environ, 'OLLAMA_TEMPERATURE': str(temperature),
            'OLLAMA_REPEAT_PENALTY': str(penalty), 'OLLAMA_SEED': str(seed),
            'COMPANION_MAX_IN_FLIGHT': '1'}


def run_cell(temperature, penalty, seed, repeat, output):
    config = Config.load()
    env = environment(temperature, penalty, seed)
    # Inherit an already-bound socket: no port guessing or existing server reuse.
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen(128)
        port = listener.getsockname()[1]
        server = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), '--worker-fd', str(listener.fileno())],
            cwd=ROOT, env=env, pass_fds=(listener.fileno(),),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        headers = {'Authorization': 'Bearer ' + config.token} if config.token else {}
        with httpx.Client(trust_env=False, follow_redirects=False, timeout=2) as client:
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError('Owned server failed to start')
                try:
                    response = client.get(f'http://127.0.0.1:{port}/health', headers=headers)
                    response.raise_for_status()
                    health = response.json()
                    if health.get('status') != 'ok':
                        raise RuntimeError('Ollama/model unavailable or cleanup required; no inference comparison performed')
                    break
                except (httpx.ConnectError, httpx.ReadTimeout):
                    time.sleep(.1)
            else:
                raise RuntimeError('Owned server startup timed out')
        command = [sys.executable, 'scripts/benchmark.py', '--base-url', f'http://127.0.0.1:{port}',
                   '--suite', 'quality', '--repeat', str(repeat), '--personality', 'financial_gremlin',
                   '--chaos', '70', '--output', str(output), '--markdown']
        subprocess.run(command, cwd=ROOT, env=env, check=True)
        data = json.loads(output.read_text())
        if any(row.get('response', {}).get('reason') in ('timeout', 'unavailable', 'cleanup_required')
               for row in data['rows']):
            raise RuntimeError('Inference failure in this cell; inspect saved results before continuing')
        return summarize(data['rows'])
    finally:
        server.terminate()
        try:
            server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker-fd', type=int, help=argparse.SUPPRESS)
    parser.add_argument('--run', action='store_true', help='Actually run six sequential sampling cells')
    parser.add_argument('--repeat', type=int, default=1)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--reverse', action='store_true', help='Reverse cell order for an order-effect check')
    args = parser.parse_args()
    if args.worker_fd is not None:
        import uvicorn
        from app.main import create_app
        uvicorn.run(create_app(), fd=args.worker_fd, workers=1, access_log=False, log_level='warning')
        return
    if not 1 <= args.repeat <= 20 or not 0 <= args.seed <= 2147483647:
        parser.error('repeat must be 1..20; seed must be 0..2147483647')
    print('Six cells, 19 frozen cases each. Fixed seed, same prompt/preset/chaos; keep_alive:0, one generation at a time.')
    print('Stop other inference clients before running. No settings or existing processes will be changed.')
    cells = list(reversed(CELLS)) if args.reverse else CELLS
    print(json.dumps(cells))
    if not args.run:
        print('Plan only. Add --run to execute locally with existing Ollama/model.')
        return
    os.chdir(ROOT)
    folder = args.output_dir or ROOT / 'results' / ('sampling-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    folder = folder.resolve()
    folder.mkdir(parents=True, exist_ok=False)
    manifest = {'qualitySetSha256': hashlib.sha256(QUALITY_PATH.read_bytes()).hexdigest(),
                'appCodeSha256': fingerprint(), 'seed': args.seed, 'repeat': args.repeat,
                'cells': cells, 'scope': 'Local synthetic sampling comparison; no subjective automated scores.'}
    write_private(folder / 'manifest.local.json', json.dumps(manifest, indent=2))
    results = []
    try:
        for index, (temperature, penalty) in enumerate(cells, 1):
            output = folder / f'cell-{index}.local.json'
            summary = run_cell(temperature, penalty, args.seed, args.repeat, output)
            results.append({'temperature': temperature, 'repeatPenalty': penalty, 'summary': summary})
            write_private(folder / f'comparison-through-{index}.local.json', json.dumps(results, indent=2))
    except (RuntimeError, subprocess.CalledProcessError, KeyboardInterrupt):
        print('Experiment stopped. Partial files preserved. Check local Ollama and ollama ps; no retry was attempted.', file=sys.stderr)
        return 1
    print('Results: ' + str(folder))
    print('Compare matched penalty/temperature pairs, review content manually, and repeat in reversed order to assess load/order effects.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
