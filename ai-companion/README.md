# Salary Ledger AI Companion — local Gemma prototype

An isolated **laptop-hosted conversational API**, using Python 3.11+, FastAPI and Ollama's already installed `gemma3:4b`. It does not import or modify Salary Ledger, Apps Script, Android, the deterministic assistant, the on-device benchmark, or any real ledger. There are no tools, financial mutations, verified ledger payloads, conversation database, cloud provider or phone connection.

The API listens on **127.0.0.1:8765**. Ollama stays on **127.0.0.1:11434**. This phase supports local testing only. The user's laptop timing observations have not been reproduced in the cloud environment.

## Install on Linux Mint

Use Python **3.11 or newer** (`python3 --version`). Mint releases with older Python need a supported Python 3.11+ interpreter first. Install the matching venv package if `python3 -m venv` is unavailable; do not replace Mint's system Python.

```bash
cd salary_ledger/ai-companion
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
ollama list
```

Confirm the existing list includes **gemma3:4b**. Nothing in this project downloads a model, changes Ollama's service, installs a background service or requires Docker. `systemctl status ollama` and `curl http://127.0.0.1:11434/api/tags` can diagnose the existing local service without inference.

Start in the activated environment:

```bash
./scripts/start.sh
```

It runs one Uvicorn worker with access logging disabled. Leave this terminal open; **Ctrl+C** stops it. Health and deterministic responses work even when Ollama is unavailable. Actual generation requires the existing model and local service. These commands were exercised on Linux/Python 3.12 here, not on a physical Linux Mint laptop.

## Try the API

In another terminal:

```bash
curl http://127.0.0.1:8765/health
curl -X POST http://127.0.0.1:8765/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"I finally paid off my last loan!","personality":"financial_gremlin","chaosLevel":70,"tone":"celebratory"}'
```

`GET /health` checks **only `/api/tags`**, never inference/model loading. It returns `status` (`ok`/`degraded`), `ollamaReachable`, `model`, `modelAvailable` and `cleanupRequired`. Unavailable service or missing model yields HTTP 200 with degraded health and truthful booleans.

`POST /v1/chat` accepts exactly:

| Field | Allowed values |
|---|---|
| `message` | Strict nonempty string, trimmed, at most 500 characters; no non-text control characters |
| `personality` | `financial_gremlin`, `supportive_bestie`, `sarcastic_accountant` |
| `chaosLevel` | Strict integer 0–100; strings, floats and booleans are rejected |
| `tone` | `playful`, `celebratory`, `supportive`, `informational` |

Unknown fields (including model, URL, tools, roles, verified data or administrative arguments) are rejected. JSON bodies are limited to 8 KiB and a five-second body-read deadline. Errors use 422 for schema errors, 413 for oversized bodies, 415 for unsupported content type, 408 for a slow body, 401 for configured authentication, 403 for cross-origin requests, and 429 with Retry-After for busy generation. Error responses omit Pydantic input/context values; they never return raw server exceptions. Swagger/OpenAPI endpoints are disabled in this prototype.

Successful and fallback replies share this schema:

```json
{
  "reply": "That sounds like a meaningful milestone. Enjoy the moment!",
  "personality": "financial_gremlin",
  "chaosLevel": 70,
  "requestedTone": "celebratory",
  "tone": "celebratory",
  "source": "fallback",
  "model": null,
  "durationMs": 1,
  "reason": "unavailable",
  "validationPassed": null,
  "modelTimings": null
}
```

The example illustrates the schema, not measured Gemma output. `tone` is the **effective** server-side tone; `requestedTone` preserves the harness label. `source` is `gemma` or `fallback`; `model` is populated only for accepted Gemma output. `validationPassed` is true/false for an examined generation, or null when none was examined. The stable `reason` is generated, invalid_output, timeout, unavailable, cleanup_required, or the deterministic policy category (medical, hardship, essential, supportive, unsupported, missing_data). Ollama timing fields are whitelisted original counters: total/load/prompt-eval/eval durations in **nanoseconds**, prompt/eval counts in tokens. No timings are invented when unavailable. `durationMs` includes generation/cleanup work inside the handler, not network transport or body parsing.

## Optional local authentication

Default authentication is disabled for the documented loopback-only harness. To enable it, generate your own random token locally (at least 24 ASCII characters, no whitespace), put it in ignored `.env` as `COMPANION_TOKEN`, and restart. Both health and chat then require `Authorization: Bearer YOUR_LOCAL_TOKEN`. Use the same environment/.env for the benchmark; it reads the token without placing it on a command line. Never commit it or put it in Android/JavaScript source. `.env` is a literal KEY=value file with optional quotes; there is no shell execution, interpolation or automatic export.

There is no permissive CORS middleware. Cross-origin browser requests with Origin are rejected, and Host is restricted to loopback hostnames to limit DNS rebinding. This does not make an unauthenticated local service a trusted boundary against other processes/users on the laptop; configure a token for that threat model. Use only the supported launcher: binding Uvicorn to another interface yourself defeats the local-only assumption.

## Personality, tone and policy

Central style specifications implement three presets and five chaos bands: 0–20 straightforward, 21–40 subtle, 41–60 witty, 61–80 playful, 81–100 expressive but bounded. Tone and policy always override chaos. Prompts use concise English and one personality/tone-specific demonstration above chaos 20, otherwise none (never more than three); the user message stays a separate, untrusted user message.

A deliberately limited pattern policy bypasses generation for medical expenses, expressed hardship, essential spending, explicitly supportive requests, financial questions without ledger data, and unsupported record/tool requests. Contradictory playful/celebratory labels do not override these paths. The API cannot accept verified ledger facts in this phase and never computes a financial answer. Milestone reactions respond to a user's statement, not an independently verified achievement.

Free-form output is normalized and checked for length, repeated phrases/catchphrases, excessive capitals, obvious action-completion claims, common authoritative financial claims and unsupported numbers. Ordinary counts already mentioned by the user can be echoed; currency/percentage output is rejected conservatively even if supplied by the user. Obvious truncation and malformed output fall back without retries. Additional narrow grounding checks reject common purchase-type/property drift, changed adjacent purchase counts (including number words zero–twenty), broader debt-freedom/credit-score conclusions, and unsupported savings-goal or overspending claims. These checks do not cover arbitrary semantic paraphrases; negation handling is intentionally limited. Harmless figurative language can be rejected. All sensitive/factual fallbacks are restrained at every personality/chaos level. Ordinary fallback wording avoids inventing a purchase where none was mentioned.

**These are bounded heuristics, not comprehensive sentiment recognition, prompt-injection prevention, factual verification or proof of safety.** They can miss implications, insults, number words, paraphrases and nuanced hardship; they can also reject harmless replies. No automatic humor score is used. A future client must render replies as untrusted plain text, outside canonical figures, transaction details, caveats and save/sync status, with deterministic content always authoritative.

## Inference and resource lifecycle

The fixed server configuration sends `/api/chat` with `stream:false`, `keep_alive:0`, context 2048, output 55, temperature 0.5 and repeat penalty 1.15 by default. Clients cannot override these. The HTTP client ignores proxy environment variables, rejects redirects and connects only to a configured loopback HTTP origin. Responses are bounded to 256 KiB.

One in-flight generation is admitted per process by default, with **no waiting queue**; excess generation requests get 429. Deterministic fallbacks and health checks remain available. The total upstream timeout includes connect, response and generation; client disconnect/cancellation cancels the upstream HTTP task. There are no generation retries. Keep one worker; multiple workers or separately launched servers have independent limits and could overload the laptop. Other Ollama clients are also outside this API's concurrency boundary.

`keep_alive:0` requests unloading after every inference. Timeout/error/cancellation additionally attempts a bounded fixed-model unload via `/api/generate`. Admission remains occupied during cleanup. Failed/uncertain cleanup sets `cleanupRequired`; further model requests fall back until an operator cleans up and restarts the companion. Health checks do not perform cleanup or load a model.

**A socket cancellation, process crash or failed unload does not guarantee immediate model unloading or termination of Ollama's existing work.** Check locally:

```bash
ollama ps
python scripts/unload.py
ollama ps
```

Run cleanup only when another application is not using the same model. If necessary, the local operator can use `ollama stop gemma3:4b`; check `ollama ps` and the existing service before restarting the API. The script cannot take an arbitrary model, URL or shell command from API clients. No cleanup endpoint is exposed. A failed cleanup is reported honestly, not silently treated as released memory.

## Configuration

Environment variables override literal `.env` entries. Restart after changes.

| Variable | Default | Bounds/purpose |
|---|---|---|
| COMPANION_PORT | 8765 | 1024–65535; bind host remains 127.0.0.1 |
| COMPANION_TOKEN | empty | Optional bearer token; at least 24 ASCII non-whitespace chars |
| OLLAMA_BASE_URL | http://127.0.0.1:11434 | Loopback HTTP origin only; no credentials, paths or redirects |
| OLLAMA_MODEL | gemma3:4b | Server-controlled existing model name; no auto-pull |
| OLLAMA_CONNECT_TIMEOUT | 2 | Seconds, >0 to 10 |
| OLLAMA_TOTAL_TIMEOUT | 45 | Seconds, >0 to 120; total generation deadline |
| OLLAMA_CLEANUP_TIMEOUT | 3 | Seconds, >0 to 10 |
| OLLAMA_NUM_CTX | 2048 | 512–4096 |
| OLLAMA_NUM_PREDICT | 55 | 16–128 output tokens |
| OLLAMA_TEMPERATURE | 0.5 | 0–1 |
| OLLAMA_REPEAT_PENALTY | 1.15 | 1–2 |
| OLLAMA_SEED | unset | Optional server-side integer 0–2147483647; restart after changing |
| COMPANION_MAX_IN_FLIGHT | 1 | 1 or 2; prefer 1 on the specified 16 GB laptop |

## Tests and real HTTP benchmark

```bash
# From ai-companion, activated virtual environment:
python -m pytest -q
python scripts/benchmark.py --supplementary --markdown
python scripts/benchmark.py --personality supportive_bestie --chaos 30 \
  --output results/supportive.local.json --markdown
```

The benchmark calls the **actual running API**, sequentially, using the ten requested synthetic cases and optional four supplementary cases. It stores input, requested/effective tone, preset/chaos, reply, source, validation outcome, API and client latency, HTTP failures and any actual model counters. JSON and optional Markdown are local private-mode files under ignored `results/`. No subjective quality scores are assigned. Outputs are not committed. Source fallback and generated latency must be compared separately; a fast fallback is not fast Gemma inference. For a custom port, pass `--base-url http://127.0.0.1:PORT`.

Normal tests mock Ollama and need no model, GPU, real ledger, network provider or running service. The project's validation report records actual checks and unverified areas. A unit test is not evidence of model humor quality, laptop memory release, or phone compatibility.

## Troubleshooting

- Degraded health: check existing Ollama service, `/api/tags`, model name and `ollama list`. No model is auto-downloaded.
- 401: check the local token environment/.env used by both terminals; do not paste tokens into screenshots or messages.
- 429: finish/cancel the existing request and retry manually. Do not launch multiple workers to bypass the limit.
- Fallback with timeout: inspect the laptop locally. Try shorter prompts; retain actual benchmark files. Increasing timeouts does not establish acceptable responsiveness.
- cleanup_required: inspect `ollama ps`, run local cleanup and restart the API. Restarting the API alone does not terminate an orphaned Ollama generation.
- 422: send only the four documented fields and correct enum/integer types. 415 requires Content-Type application/json.
- Validation fallback: read the generated/fallback source and reason. Do not weaken financial boundaries to obtain funnier replies.
- Port in use: stop the old companion terminal with Ctrl+C, or configure another local port consistently. There is no auto-start service to disable.

## Future private phone-access boundary (not implemented)

A separate phase must choose private Tailscale access or an authenticated local proxy, explicit device authentication/revocation, token storage outside frontend assets, transport encryption, rate limits and request size limits, authorization independent of network membership, and background/cancel/session invalidation. Keep Ollama itself on loopback. No public port forwarding, tunnel or Tailscale Funnel belongs in this design. Only a narrow conversation endpoint may cross that boundary; no financial tools, ledger authority, raw Ollama proxy, credentials or executable payloads. Require explicit user invocation and retain the deterministic app without the laptop/model.


## v1.1 update and benchmark workflow (Linux Mint)

First stop the running API with **Ctrl+C** in its terminal. Inspect local modifications before pulling; commit or stash tracked edits you want to preserve. Do not discard them to resolve a pull conflict. Your ignored `.env`, `.venv` and results stay local; make a separate backup of important results before moving files.

```bash
cd ~/Projects/salary_ledger
git status --short
git pull --ff-only origin main
cd ai-companion
source .venv/bin/activate
pip install -r requirements.txt
# Keep your existing .env; do not replace it with the example.
./scripts/start.sh
```

In a second terminal:

```bash
cd ~/Projects/salary_ledger/ai-companion
source .venv/bin/activate
curl http://127.0.0.1:8765/health
# Same original 14 scenarios:
python scripts/benchmark.py --supplementary --markdown
# Separate 19-case quality suite, repeated three times:
python scripts/benchmark.py --suite quality --repeat 3 --markdown
# Both suites, all three personalities in separate runs:
python scripts/benchmark.py --suite all --supplementary --repeat 2 --personality financial_gremlin --chaos 70 --markdown
python scripts/benchmark.py --suite all --supplementary --repeat 2 --personality supportive_bestie --chaos 50 --markdown
python scripts/benchmark.py --suite all --supplementary --repeat 2 --personality sarcastic_accountant --chaos 70 --markdown
```

The health curl needs your configured Authorization header if authentication is enabled; benchmark scripts read the local token themselves. All benchmark prompts are synthetic. Default filenames now include a UTC timestamp; explicit `--output` paths are refused if already present (including their Markdown companion). Existing results are preserved. Each case records run/scenario identifiers, input/effective tone, source/reason, preset/chaos, token counters and available timings. Existing flags and original scenario order remain supported.

For repeatable experiments, optionally uncomment `OLLAMA_SEED=42` in `.env`, then restart the API. This adds a server-controlled Ollama seed without changing the public request schema. Leave it unset to preserve baseline behavior. A fixed seed does not guarantee identical output across Ollama/model/hardware versions; compare unseeded repeated runs for natural variation too. Recorded configuration is the benchmark process's local snapshot, not remotely attested server configuration: keep server and benchmark settings matched.

Compare saved runs (replace paths with actual filenames):

```bash
python scripts/compare.py results/v1-baseline.local.json results/benchmark-YOUR-TIMESTAMP.local.json
```

The utility accepts original v1 JSON rows. It reports source counts, average/median/min/max client latency separately for generated/fallback replies, handler duration, load/prompt-evaluation/generation/total model milliseconds, token counts, output word lengths, fallback reasons and common two-word generated openings. Missing metrics remain null rather than zero. Markdown benchmark output includes the same summary. Repeated openings are a development diagnostic, not an automated humor score; fallbacks are excluded from that opening report.

See [BASELINE.md](BASELINE.md) for the supplied laptop baseline and optional old-commit workflow, and [VALIDATION.md](VALIDATION.md) for actual cloud checks. The baseline inference options, one-generation admission, no retries and `keep_alive:0` remain unchanged. Shorter instructions and zero/one examples bound prompt overhead, but actual tokenizer counts and speed require laptop measurements; prompt changes cannot eliminate cold loading. Review jokes, relevance, factual anchoring and variety manually across matched runs. Neither 14 nor 19 passing scenarios establishes comprehensive conversational reliability.

## Benchmark-driven monetary and style patch

The response schema now includes optional `validationReason`: null for accepted replies and paths without output validation, or a fixed rejection category when a generation is rejected. The existing `source:fallback`, `reason:invalid_output` and `validationPassed:false` behavior is preserved. Categories distinguish monetary claims, unsupported numbers, grounding, financial/action claims, dismissive/hostile text, instruction leaks, malformed/long/incomplete output, excessive capitals and repetition. No rejected text or exception is included. This adds no conversation storage or raw-output logging.

Benchmark JSON automatically retains the new field; summaries, Markdown and `scripts/compare.py` include `validationRejections`. Old exports without categories report `unspecified`; their rejected generations cannot be recovered. No model retry or second generation is added.

Currency vocabulary now includes bucks, quid, cents/centavos and additional named currencies, with narrow numeric-context checks for singular buck and grand. This rejects spelled-out amounts with these units even when they echo user input. Ordinary counts and idioms such as “a grand entrance” remain allowed. The checks are not a general number parser or semantic verifier: uncommon slang and paraphrases can still escape, and unit words can cause conservative false positives.

Prompts explicitly omit monetary restatements, favor specific openings over “Seriously?”/superhero praise, and invite conversation rather than dismissing boredom or tiredness. The Gremlin's high-chaos demonstrations now model concrete observations instead of generic hype. These are guidance, not proof of improved humor or variety. A narrow dismissiveness check catches the observed replies; it does not classify every unkind sentence. Common openings are not globally banned and no conversation history is kept.

After pulling, stop and restart the API, then rerun the quality benchmark:

```bash
cd ~/Projects/salary_ledger
# Preserve tracked local modifications before pulling.
git status --short
git pull --ff-only origin main
cd ai-companion
source .venv/bin/activate
./scripts/start.sh
```

In another activated terminal in `ai-companion`, run `python scripts/benchmark.py --suite quality --repeat 3 --markdown`. Inspect `validationRejections`, generated openings and actual replies; repeated “Seriously?” responses may still require further prompt tuning. Compare matched runs with the existing comparison utility.

## Completion and ownership follow-up patch

Output completion now uses Ollama metadata when available: `done:true` with `done_reason:stop` does not require final punctuation, while `done_reason:length` always returns an `invalid_output` fallback with `validationReason:incomplete_output`, even if the text happens to end with punctuation. The client's existing `keep_alive:0` request remains unchanged. A completed length stop does not trigger a retry or get mislabeled as an unavailable service; its token/timing counters are retained.

For older Ollama versions that omit the reason, a conservative ending heuristic remains. It now handles closing quotes/format markers, Unicode symbol/emoji endings, variation selectors and skin-tone modifiers rather than a short emoji whitelist. `incomplete_output` on that legacy path is a heuristic label, not proof of truncation. Neither a stop reason nor punctuation guarantees grammatical or factual correctness; all other content checks still run. Previous exports lack the rejected text, so the thirteen earlier ending rejections cannot be retrospectively classified as true or false positives.

Narrow checks also reject the observed dismissive “that's just...sad”/“hear about my day” responses and unsupported ownership/absolute-status phrases such as “officially yours,” “completely free,” “own it outright” and “clean title.” A loan repayment establishes neither legal title nor the absence of other obligations. These remain limited pattern checks, with possible missed paraphrases and conservative false positives. No further personality rewrite or conversation storage was introduced.
