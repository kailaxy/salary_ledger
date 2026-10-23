# Sampling experiments before further assistant changes

The external review offers testable hypotheses, not established causes. In particular, whether repeat penalty affects user/prompt tokens depends on Ollama/runtime behavior; these tests do not assume that it explains the observed substitutions. We have not independently verified a vendor-recommended sampler configuration. No top-k/top-p change is bundled into this experiment.

The present app-aware, zero-example prompt is held fixed. No new validator, hook schema, word gate, regeneration, opener history, event context, model download or cloud call is introduced. The existing baseline remains temperature 0.5/repeat penalty 1.15. Unloading and deterministic sensitive-context routing stay enabled.

## Frozen inputs

`eval/quality-v1.json` contains the unchanged 19 quality scenarios, with stable IDs and a SHA-256 fingerprint. Benchmark exports record that fingerprint. A different evaluation set must use a new versioned file; do not edit v1 to improve results. Existing benchmark flags and 10+4 regression cases remain unchanged.

Start with this set for a matched sampling comparison. Before selecting final settings, add a separate held-out, broader set (approximately 50 scenarios) and review it independently; repeated success on these familiar prompts is insufficient.

## Linux Mint workflow

Stop the usual API and any other clients performing Ollama inference so they do not compete with the experiment. Keep the existing local Ollama service running with the existing `gemma3:4b` model. This runner does not stop other processes or alter service settings.

```bash
cd ~/Projects/salary_ledger
git status --short
# Preserve any tracked local modifications before pulling.
git pull --ff-only origin main
cd ai-companion
source .venv/bin/activate
# Show the plan without starting a server or inference:
python scripts/sampling_experiment.py
# Run the six-cell experiment:
python scripts/sampling_experiment.py --run
```

Six combinations are tested: temperatures 0.5/0.8/1.0 × repeat penalties 1.15/1.0. The runner starts and stops its own single-worker API on an already-bound random **loopback-only** socket for each cell; it never reuses an existing API server. Environment overrides are restricted to its child processes. Your `.env`, baseline defaults, context/output limits and keep_alive:0 remain unchanged. Authentication uses your existing local token without storing it in manifests. The loopback health check must report the configured model available; otherwise no benchmark is run. Inference failures stop subsequent cells rather than silently treating an unavailable-model fallback as a quality result.

Default: 19 cases × 6 cells = 114 requests, including 84 inference-eligible cases. At the observed cold-request speeds, expect roughly **15–20 minutes**, depending on laptop load; this is an estimate, not a measured duration. Optional `--repeat 3` is considerably longer. Ctrl+C stops the owned server and preserves partial files. Cancellation/process termination cannot guarantee Ollama immediately stops or unloads work; inspect `ollama ps` and follow README cleanup if needed. No retry is attempted.

Every cell uses seed 42 by default (change with `--seed`). A common seed makes configurations repeatable but does not guarantee identical output across runtime/hardware changes. Fixed-seed repeats do not measure natural stochastic variety. After finding promising settings, use the ordinary unseeded benchmark in a separately configured/restarted server to assess variation.

A timestamped ignored results directory contains private JSON/Markdown per cell, a manifest with the frozen-case and app-code fingerprints, and cumulative comparison summaries. Explicit output directories must be new; no prior results are overwritten. Configuration in cell JSON comes from the same environment as its owned server, rather than a manually matched API process. Review generated/fallback counts, rejection reasons, source-specific latency and separate load/prompt/generation timings. Do not equate more accepted replies with higher quality.

Compare temperature pairs at the same penalty, and penalty pairs at the same temperature. Running the six cells in sequence introduces thermal/cache/order confounds. Check robustness with the opposite order:

```bash
python scripts/sampling_experiment.py --run --reverse
python scripts/compare.py results/sampling-YOUR-TIMESTAMP/cell-*.local.json
```

Do not attribute cold-load differences to sampling without repeated evidence. The experiment tests sampling only; prompt framing and example contamination need separate later ablations.

## Manual scoring

Create a blank CSV for any saved cell (use its actual filename):

```bash
python scripts/prepare_review.py results/sampling-YOUR-TIMESTAMP/cell-1.local.json \
  --output results/cell-1-review.local.csv
```

Review every visible reply using the same rubric:

- Relevant: 0/1 — responds to the actual message without a generic unrelated tangent.
- Grounded: 0/1 — introduces no unsupported literal details, amounts, statuses or broader financial outcomes. Mark ambiguous cases in notes; distinguish obvious figurative humor from factual claims.
- Funny: 1–5 — personal assessment of relevant wit, not emoji count or enthusiasm. For serious policy replies, leave this blank.
- Unsolicited advice: 0/1 — prescribes behavior without being asked.
- Notes: repetition, tone, assumptions and any failures.

Source/reason remain visible so deterministic replies are not mistaken for model outputs. Rejected raw generations are intentionally unavailable; their fallback cannot be scored as if it were the rejected reply. For accepted generations, compare opener reports alongside manual scores. Scores are blank by default, never assigned by the model or script. CSV cells escape spreadsheet formula prefixes. Files are private and overwrite-protected; keep them in ignored results/.

## Strong-model ceiling test, offline preparation only

```bash
python scripts/prepare_review.py --ceiling-pack --output results/ceiling-pack.local.json
```

This exports the exact current system/user messages for the same frozen synthetic inputs. Policy-only cases are marked and have no model prompt. No API key, provider integration, network call, real ledger data or model download is added. Choose the stronger model/provider separately; no such model was available in the cloud workspace, so this comparison has **not** been performed. Review its replies with the same rubric and record model/version, sampler, output limit and any prompt/role differences. A ceiling test can inform whether the task/prompt is viable, but differing providers and runtime settings prevent clean attribution to model size alone.

## Later proposals are not assumed solutions

An exact-substring hook checks only the hook, not the truth of the reaction. A content-word overlap/allowlist gate may reject almost every useful metaphor while missing false implications made with shared words. Higher temperature can increase diversity and errors. Retry can multiply the current cold-load latency. We should measure these tradeoffs before adopting structured outputs, word gates, recent-opener storage, retries or trusted event integration. Do not add persistent conversation tracking or relax sensitive-context policy to make humor metrics look better.
