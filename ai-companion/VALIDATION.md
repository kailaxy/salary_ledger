# Phase 1 validation

Validated in the cloud Linux workspace with Python 3.12.14. Physical Linux Mint, the target laptop, and Gemma inference were not available.

- `python -m pytest -q`: **92 passed**, with one Starlette test-client dependency deprecation warning. Tests mock Ollama and cover schemas, policy, prompts, output checks, inference parameters, deadlines, cancellation, cleanup failures, concurrency, authentication and request boundaries.
- `pip check`: no broken requirements.
- Started the supported loopback launcher and exercised actual HTTP endpoints. Health correctly reported degraded with Ollama unreachable/model unavailable. A medical message requested as playful returned a supportive deterministic fallback.
- Ran the actual HTTP benchmark: all 10 required and 4 supplementary cases completed, with **zero Gemma replies**. This validates harness and fallback operation only. JSON/Markdown outputs stayed outside the repository. Fallback latency is not model performance evidence.
- Stopped the temporary server cleanly.

No production web, Android, Apps Script or deterministic engine files changed. There is no APK or phone connection in this phase.

## Laptop validation still required

Follow README installation and health checks with the existing `gemma3:4b`, then run `python scripts/benchmark.py --supplementary --markdown`. Inspect source/reason and timing fields separately for Gemma and fallback replies. Manually review personality, relevance, restraint and truncation. Check `ollama ps` after successful requests and timeout/cancellation tests.

Actual generation quality, hardware latency and Ollama resource release remain unverified here. Policy and output checks are bounded heuristics, not a reliable safety classifier or financial verification system.
