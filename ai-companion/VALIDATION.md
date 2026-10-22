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

## v1.1 refinement validation

- **132 unit tests passed**, with the same single Starlette/AnyIO dependency deprecation warning. All tests run without live Ollama. `pip check` found no broken requirements.
- New regressions cover stated counts in words/digits, invented iced/latte/designer properties, changed purchase types, debt-free/credit-score conclusions, unsupported savings achievements, unchanged conservative policy paths, chaos boundaries, compact distinct prompts, optional server seed, report aggregation and exclusive private output files.
- Started the updated API on an alternate loopback port and ran the real benchmark with `--suite all --supplementary --repeat 2 --markdown`: **66 requests completed, zero Gemma replies**. Verified degraded health, comparison of saved JSON, 0600 result permissions, and refusal to overwrite the JSON/Markdown files. The temporary server was stopped; generated files stayed outside the repository.
- Live Ollama remains unavailable here. No v1.1 inference timings, output-quality gains, tokenizer savings, hardware improvements or successful model unloading are claimed. The user's observed baseline is preserved in BASELINE.md and the old code at commit 05094f4.
- Baseline inference options, unloading requests, concurrency limits, localhost boundary, public schemas and production app isolation remain unchanged. The optional seed is unset by default.

The additional grounding lexicons and explicit-negation handling are deliberately narrow. They can miss paraphrases, compound quantities and unsupported properties outside the small vocabulary, and may reject harmless metaphors. Original monetary/percentage restrictions remain conservative. Manually review actual laptop outputs, source-specific timings, cold-load costs, variation and cleanup behavior before claiming improvement.

## Patch following the supplied quality export

- **153 unit tests passed**, one unchanged dependency deprecation warning. Added tests exercise all three observed spelled-out monetary replies, both observed dismissive replies, additional currency spellings, ordinary count/idiom acceptance, fixed diagnostic categories, API fallback privacy and legacy report compatibility.
- Revalidated the **34 previously accepted replies** in the user's supplied quality export, without generating new text: the patched validator rejects **three monetary claims** and **two dismissive replies**; the other **29 still pass**. This is replay validation, not evidence that new Gemma outputs will improve. The uploaded export and its replies were not committed.
- Repeated the real loopback HTTP harness smoke test: **66 requests completed, zero Gemma replies**, with output-file preservation, private permissions and comparison checks passing. Temporary server stopped. No live model is available in this workspace.
- Output diagnostics are fixed categories only; rejected generations remain absent from responses and files. The prompt edits' impact on repetition, relevance and latency must be measured on the laptop. No inference settings, retry behavior, resource lifecycle or production app code changed.
