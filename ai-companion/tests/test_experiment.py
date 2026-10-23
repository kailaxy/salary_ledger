import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Thread
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import pytest
from test_refinement import load_script

ROOT=Path(__file__).parents[1]


def test_frozen_eval_fingerprint_and_grid(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT/'scripts'))
    experiment=load_script('sampling_experiment')
    assert hashlib.sha256((ROOT/'eval/quality-v1.json').read_bytes()).hexdigest()=='8d34a798886bb9f335e715860d4a3db5bef1702393a212d86901b156cb48c73b'
    assert experiment.CELLS==[(.5,1.15),(.5,1.0),(.8,1.15),(.8,1.0),(1.0,1.15),(1.0,1.0)]
    env=experiment.environment(.8,1.0,42)
    assert env['COMPANION_MAX_IN_FLIGHT']=='1'
    assert env['OLLAMA_REPEAT_PENALTY']=='1.0'
    assert len(experiment.fingerprint())==64


def test_review_and_ceiling_export_preserve_policy_and_blank_scores(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT/'scripts'))
    review=load_script('prepare_review')
    pack=review.ceiling_pack()
    assert len(pack['rows'])==19
    assert sum(not r['runModel'] for r in pack['rows'])==5
    assert all(r['messages'] is None for r in pack['rows'] if r['policyReason'])
    assert review.safe_cell('=formula')=="'=formula"
    data={'rows':[{'input':{'message':'Synthetic input'},'response':{'reply':'Hello!','source':'gemma'}}]}
    sheet=review.review_csv(data)
    assert 'funny_1_to_5' in sheet and 'grounded_0_or_1' in sheet
    assert 'Hello!,gemma' in sheet


def test_dry_run_starts_nothing(tmp_path):
    result=subprocess.run([sys.executable,'scripts/sampling_experiment.py'],cwd=ROOT,capture_output=True,text=True,timeout=10)
    assert result.returncode==0 and 'Plan only' in result.stdout


@pytest.mark.parametrize('available', [True, False])
def test_actual_managed_servers_and_benchmark_with_mock_ollama(tmp_path,available):
    payloads=[]
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def respond(self,data):
            body=json.dumps(data).encode()
            self.send_response(200);self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def do_GET(self):
            self.respond({'models':[{'name':'gemma3:4b'}] if available else []})
        def do_POST(self):
            payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            payloads.append(payload)
            self.respond({'done':True,'done_reason':'stop','message':{'role':'assistant','content':'Thanks for sharing that moment!'},'eval_count':7})
    upstream=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread=Thread(target=upstream.serve_forever,daemon=True);thread.start()
    env={**os.environ,'OLLAMA_BASE_URL':f'http://127.0.0.1:{upstream.server_port}',
         'COMPANION_TOKEN':'x'*32,'OLLAMA_MODEL':'gemma3:4b'}
    output=tmp_path/'sampling'
    try:
        result=subprocess.run([sys.executable,'scripts/sampling_experiment.py','--run','--output-dir',str(output)],
                              cwd=ROOT,env=env,capture_output=True,text=True,timeout=60)
    finally:
        upstream.shutdown();upstream.server_close();thread.join()
    assert result.returncode==(0 if available else 1),result.stderr
    if available:
        reports=sorted(output.glob('cell-*.local.json'))
        assert len(reports)==6
        assert all(len(json.loads(p.read_text())['rows'])==19 for p in reports)
        assert all(p.stat().st_mode & 0o777==0o600 for p in reports)
        assert {(p['options']['temperature'],p['options']['repeat_penalty']) for p in payloads}=={(.5,1.15),(.5,1.0),(.8,1.15),(.8,1.0),(1.,1.15),(1.,1.)}
        assert all(p['keep_alive']==0 and p['options']['seed']==42 and p['options']['num_ctx']==2048 for p in payloads)
    else:
        assert not payloads
        assert not list(output.glob('cell-*.local.json'))
        assert 'stopped' in result.stderr
