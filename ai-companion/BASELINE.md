# Observed v1 laptop baseline

Implementation before v1.1: Git commit **05094f4**, retained in repository history. No live Ollama instance was reachable in the cloud before editing, so no cloud baseline inference was run.

The user supplied these measurements for the ASUS VivoBook X515JP, Intel i5-1035G1, 16 GB RAM, NVIDIA MX330 2 GB VRAM, Linux Mint, Ollama `gemma3:4b`:

| Metric | Observed v1 result |
|---|---:|
| Completed scenarios | 14/14 |
| Gemma responses | 8 |
| Intentional policy fallbacks | 6 |
| Median client latency (mixed sources) | 8,320 ms |
| Worst client latency | 13,857 ms |
| API failures | 0 |

Reported prompt evaluation counts were approximately 239–242 tokens. The raw baseline JSON was not supplied with this task; averages, source-specific timings and full response distributions cannot be reconstructed. These are user-reported observations, not fresh measurements or v1.1 results.

Observed quality failures included generic enthusiasm, repetitive openings, adding “iced” to unspecified coffees, and inferring complete debt freedom from the last loan repayment. Review v1.1 against these manually as well as running regression checks. No model latency or humor improvement is claimed from mocked tests or fallback-only HTTP runs.

## Optional fresh baseline comparison

Preserve any existing ignored benchmark JSON/Markdown before updating. To run the previous implementation without replacing your current checkout, create a separate worktree:

```bash
cd ~/Projects/salary_ledger
git worktree add --detach /tmp/salary-ledger-companion-v1 05094f4
cd /tmp/salary-ledger-companion-v1/ai-companion
~/Projects/salary_ledger/ai-companion/.venv/bin/python -m app
```

Stop the current API first. In another terminal, run its original benchmark using the same interpreter, working directory, model and matching settings. Use a new explicit output path; the original v1 script could overwrite existing results. Keep any token local and configure it consistently in both worktrees if used. Stop the baseline server before restarting v1.1. This does not change system Ollama settings or keep the model loaded.

Compare raw baseline and v1.1 JSON with `scripts/compare.py`. Only compare matched scenario sets, presets, chaos and inference settings; quality-suite runs have different contents. Mixed-source medians above are not a substitute for generated-only timing comparisons.
