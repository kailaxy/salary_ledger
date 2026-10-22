# Salary Ledger: isolated offline AI benchmark

This is an **experimental standalone app**, not an assistant feature in Salary Ledger. It has a separate application ID (`com.kailaxy.salaryledger.aibench`), no Internet permission, no WebView/ledger bridge, and no access to the production app's data, Google Sheets, PIN or device credentials. It uses synthetic financial prompts only. The production query engine, personality UI, synchronization and signing workflow are unchanged.

**Physical-device inference is unverified.** No Xiaomi or Infinix performance numbers have been measured here. Targets below are hypotheses, not results. The prototype is a feasibility study, not a production model recommendation.

## Runtime and compatibility

- Java 17, Gradle 8.9, AGP 8.7.3, compile/target SDK 35, minimum API 26.
- NDK **28.2.13676358 (r28c)** and CMake **3.22.1**.
- llama.cpp **b5046**, commit `74d4f5b041ad837153b0e90fc864b8290e01d8d5` (MIT). The fetch script and CMake enforce this revision and reject tracked source edits.
- One JNI provider statically links llama/ggml. Native code uses `-O3 -DNDEBUG` even in the debug-signed APK: debug signing must not turn the CPU benchmark into an unoptimized build. CPU-only, `n_gpu_layers=0`, baseline `armv8-a`, no host-native CPU flags, OpenMP, Vulkan, network or server backend.
- Only `arm64-v8a` is built. A 64-bit processor alone does not prove the phone has a 64-bit Android userspace. The Infinix must report an arm64 ABI and install this APK successfully. A 32-bit-only OS cannot run this prototype; core Salary Ledger remains independent.
- NDK r28 and explicit 16 KB linker flags are used. `verify-apk.py` checks every native ELF LOAD alignment and uncompressed APK entry offset for 16 KB compatibility. This is a layout check, not a claim of execution on a 16 KB-page phone.
- Native CPU feature-probe output from this pinned upstream CMake may warn about a host-side `armv8-a` probe. Actual compile commands use the Android AArch64 target and baseline architecture; ELF/packaging verification is authoritative for the artifact layout. Physical CPU compatibility still needs testing.

## Build and install

From the repository root, with Node 24, Python 3, Git and the tools above installed:

```bash
android-ai-benchmark/tools/fetch-runtime.sh
# On a host with access to the official Hugging Face repository:
python3 android-ai-benchmark/tools/pin-model.py
node android-ai-benchmark/tools/generate-assets.cjs
gradle --no-daemon -p android-ai-benchmark assembleDebug lintDebug testDebugUnitTest
python3 android-ai-benchmark/tools/verify-apk.py android-ai-benchmark/app/build/outputs/apk/debug/app-debug.apk
adb install -r android-ai-benchmark/app/build/outputs/apk/debug/app-debug.apk
```

`fetch-runtime.sh` downloads source code only. **No model weights are downloaded or committed by the build.** Android SDK packages can be installed with sdkmanager: `platforms;android-35`, `build-tools;34.0.0`, `ndk;28.2.13676358`, `cmake;3.22.1`.

The separate **Build isolated Android AI benchmark** Actions workflow builds on relevant pushes, PRs or manual dispatch. Main builds reuse the existing `LEDGER_DEBUG_KEYSTORE_BASE64` secret for consistent benchmark debug signing; their application ID is different from Salary Ledger Dev and release. PR/non-main builds use `.aibench.preview` without signing secrets. No production release behavior changes. The `ledger-ai-benchmark` artifact includes the APK, **its exact model manifest**, evaluation reference and runtime license. Save these together.

The local cloud environment cannot access huggingface.co. Consequently, the checked-in seed manifest intentionally contains null revision/checksum/size. A locally built unpinned APK still launches and displays diagnostics, but **refuses every model import/load**. It never accepts an arbitrary file or guessed hash. The CI pinning step resolves official metadata and a Git LFS pointer to one immutable commit, SHA-256 and byte count, then bundles that pin into its APK. The pinning step fails closed if the source, checksum, size, pointer or license disagree.

For reproducibility, prefer committing a reviewed resolved manifest after running the pin tool, or supply the full revision from an earlier artifact as the workflow's `model_revision`. With an unresolved seed, the first CI build resolves `main` once into a build-specific pin; later unpinned builds might resolve a newer upstream revision. **Always use the manifest belonging to the APK you install.** You can set `BENCH_MODEL_MANIFEST=/absolute/path/to/pinned.json` to bundle a previously saved manifest without changing the repository file.

## Obtain and import the model

Official source: <https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF>. Required quantization: **Q4_K_M**. The artifact is approximately 491 MB; the actual expected bytes and SHA-256 come from the pinned manifest, not that approximation. Source/model license: Apache-2.0, verified from official metadata during pinning.

1. Open `model-manifest.json` from **your APK's Actions artifact**. Download its exact `downloadUrl` (immutable revision) using your browser, then transfer the file to the phone's Downloads folder if needed.
2. Optionally verify it on your computer with `sha256sum` or `Get-FileHash -Algorithm SHA256` and compare **every character** and byte count with that manifest. The app repeats verification independently.
3. Launch **Ledger AI Bench**, choose **Import model**, and select the local downloaded `.gguf` through Android's document picker. The MIME type/name are not trusted.
4. Import copies to app-private storage using a uniquely named temporary file, checks length, the pinned SHA-256, GGUF v3 metadata (`qwen2`, Q4_K_M file type 15, embedding 896, 24 blocks), bounded tensor/header structure and truncation, then atomically replaces the previous model. Failed/cancelled imports preserve the previous file. Leave roughly another model-size worth of free disk space plus 64 MB for a replacement.
5. **Load model** rechecks the full file before native loading, showing verification time separately from model loading. Model information shows actual imported byte count, source revision, quantization, GGUF version and checksum. No network is used for import verification or inference.

Use a local completed download, not a lazily streamed cloud document, for reproducible import and cancellation. Import checks cancellation between stream chunks; an unresponsive document provider can delay a read. Interrupted temporary files are never treated as installed models; another import or **Remove imported model** cleans them up. Remove unloads the current model and deletes only benchmark model files.

## Use the benchmark

The diagnostic screen works without a model. Load a verified model, then choose:

- **Structured queries**: an 80-question evaluation set (20 development, **60 held out**) with English, Filipino, Taglish, informal/misspelled questions, categories, funds, loans, income, dates/cutoffs, unsupported operations, ambiguity and important exclusions. The model sees the bounded query contract and synthetic entity names, never the expected label. Greedy sampling (temperature 0) is required for this mode.
- **Personality**: 16 synthetic cases: four financial contexts × Supportive Bestie 20, Financial Gremlin 50/100 and Sarcastic Accountant 80. Configuration comes from the existing AssistantPersonality API. Verified canonical facts remain supplied independently, with required strings/caveats and explicit direction. Personality temperature defaults to 0.6 and output to 96 tokens.
- **Free synthetic prompt**: exploratory model behavior only, excluded from labeled accuracy. Editing a labeled prompt also marks it manual; structured/personality mode keeps its task instructions, while free mode uses a generic synthetic-only instruction.

Choose 2, 3 or 4 CPU threads, context 1,024 or 2,048, output cap 64/96/128, temperature 0/0.6 and a sampling seed. No recompilation is needed. Prompts are never truncated to make them fit; an oversized prompt plus reserved output returns `CONTEXT_LIMIT` and remains a failed attempt. Use 2,048 only after testing 1,024.

Run a warm-up (excluded from scores), a selected prompt, or the evaluation suite with 1/3/5 repetitions. A suite warms up once automatically, then uses independent fresh contexts for each question: no conversation/KV contamination or few-shot answers. Native model weights remain loaded between foreground runs. `Cancel` sets an atomic abort flag checked during CPU decode and model loading; unload/destruction is queued after the native operation, never concurrent with it. Backgrounding cancels and unloads; reopening requires Load again. Rotation keeps the existing Activity and controls; other Activity destruction closes the serial executor and native model. A process-wide native model lease prevents a new Activity from loading a second copy while an old session is still stopping. If that brief overlap occurs, Load reports ENGINE_BUSY and can be retried. Normal runtime errors leave a recoverable UI; allocation failure releases model resources and stops a suite. The OS can still kill a memory-starved process, which no Java exception handler can prevent.

Runtime “success” means inference returned. It does **not** imply correct financial intent, complete JSON or preserved facts. Output-token-limit responses can be syntactically incomplete and fail evaluation.

## What is measured

- Load time: actual native model-loading call, with Java wall time and native timing; verification/copy time is separate, and combined verification-plus-load wall time is also recorded for practical readiness. Reloading an already loaded model is tagged. Cold application launch is not necessarily a cold OS filesystem cache.
- Total response time: Java elapsed time around generation (context creation, prompt preparation/decode, generation and native result return), excluding result-file persistence and Android view drawing.
- TTFT: native elapsed time to the first emitted non-EOS token, including context creation and prompt work. Text is displayed after completion, not streamed; this is **not** time to first token painted on screen. No emitted token gives null TTFT.
- Prompt-processing speed: successfully decoded input tokens / prompt-decode wall time. Generated-token speed uses output token count / generation wall time. Decode-only speed/count is supplied separately from llama's counters. Native input count includes the model's own documented chat template; no hand-built substitute is used.
- Process memory: Android `Debug.MemoryInfo` PSS before/after, maximum PSS sampled every 250 ms during inference, and native process-lifetime high-water RSS. Sampled PSS can miss short peaks; lifetime RSS cannot isolate one run. These are different metrics and must not be conflated. The sampler itself has overhead.
- Android-reported physical RAM, available device RAM, low-memory threshold/state, battery level/temperature/charge counter when supported, current CPU frequencies when readable, power-save state and thermal severity (API 29+). Battery temperature is not CPU temperature; severity/frequency alone does not prove throttling. Unknown values are null, not invented zeros. Airplane-mode state is recorded when available; airplane mode can coexist with Wi-Fi, but the app has no network permission either way.
- Successful, failed and cancelled runtime runs, with request-to-return delay for observed cancellation (button or lifecycle, not UI-paint latency); allocation failures; persisted incomplete-operation markers after a process ends. API 30+ exports recent own-process exit reasons, including actual low-memory reasons when Android supplies them. Older Android may provide no reliable termination reason; an interrupted marker alone is **not** proof of OOM. Incomplete final log tails are reported as missing measurements, never fabricated.

No GPU timings, CPU temperatures or exact energy consumption are fabricated. To study battery use, use a long controlled run, compare supported charge counters and Android battery tools, and retain the raw readings.

## Export and score offline

JSON contains full native metrics, raw synthetic prompts/outputs, config, model manifest, contract digest, device metadata, run IDs and benchmark package/version/source revision (including a dirty-build flag). CSV contains a flat timing/memory summary, not enough information for correctness scoring. Exports use Android's save-document picker. Results stay app-private unless explicitly exported. Keep device files separate; clear benchmark results between controlled rounds if useful (the model remains installed). Uninstalling this benchmark removes its private model/results, not Salary Ledger.

With the matching repository revision and the artifact's evaluation reference:

```bash
node android-ai-benchmark/tools/generate-assets.cjs
node android-ai-benchmark/tools/score.cjs infinix.json xiaomi.json \
  --reference evaluation-reference.json > comparison.json
```

The scorer uses the **actual existing LedgerQuery.validate/query** contract on a committed synthetic ledger at ledger-local 2026-10-22. It rejects contract-source digest mismatches, edited prompts, markdown fences, duplicate JSON keys, unknown fields/entities and invalid operation/filter combinations. It does not repair output or discard qualifiers. A valid sum query for “excluding rent” is still wrong against its independently labeled rejection. Strict accuracy compares every field and intended rejection/clarification with labels; key order does not matter. Manually entered or cancelled runs are not silently counted as successful interpretations; coverage and cancellation are visible.

It reports exact/held-out accuracy, field accuracy, schema-valid rate, unsupported/clarification detection and held-out coverage. A schema-valid rejection for every question can have high schema validity and very poor intent accuracy; read both. Keep the held-out set fixed and do not tune prompts against its answers. Inference failures count as failed interpretations. Unattempted cases do not prove coverage.

Latency statistics are separated by device export and configuration (including task and airplane flag). Median/worst are reported for successful runs, with failures/cancellations alongside. p95 is withheld below 20 successful samples in a profile. Check all individual outputs; aggregate speed is not evidence of correctness.

Personality scoring automatically checks required exact strings, caveat presence and unrecognized peso amounts, but those are **surface checks only**. A sentence can repeat every number and still reverse the financial direction. Review every generated answer independently for facts, direction, category/period, caveats, personality and language. Save `reviews.json`, keyed by the exported runId, e.g.:

```json
{"RUN-ID":{"factsCorrect":true,"directionCorrect":true,"categoryPeriodCorrect":true,"caveatsCorrect":true,"personalityAppropriate":true,"languageCorrect":true}}
```

Then add `--reviews reviews.json` to scoring. Fact correctness is separate from personality/language quality, and incomplete review is explicitly reported. Never call surface-string coverage “100% financial correctness.”

## Reproducible physical-device procedure

Use the same APK/model pin/dataset/seed on **Xiaomi Redmi Note 14 Pro 5G** and **Infinix Hot 11S NFC**. The Infinix is the limiting target. Record manufacturer/model, Android version, ABI, Android-reported physical RAM (not advertised RAM expansion), available RAM, reported hardware/SoC and battery/power settings. Optional ADB checks: `adb shell getprop ro.product.cpu.abilist`, `adb shell getprop ro.build.version.release`, `adb shell cat /proc/meminfo`.

1. Optionally run `android-ai-benchmark/tools/device-preflight.sh APK_PATH ADB_SERIAL` for the ABI check, diagnostics, installation and launch on each physical phone. Install alongside Salary Ledger; confirm the production apps still open independently. Launch without a model and verify useful diagnostics and a clear missing-model message.
2. Import the exact artifact. Try a truncated/corrupted/different GGUF and confirm rejection without replacing the good file.
3. Force-stop this benchmark, reopen, Load, warm up, then run structured and personality suites at **1,024 context, 2 threads** (structured temperature 0/output 128; personality 0.6/output 96; seed 42). Export JSON and CSV for this phone/profile.
4. Repeat at 3 and 4 threads under comparable battery/temperature conditions. Run at least three suite repetitions; for selected short-response latency tests gather ≥20 successful samples per profile for p95. Keep all failures and incomplete output.
5. Repeat with airplane mode enabled. Test Cancel during generation and loading, then unload/reload and run again. Rotate, background, reopen and repeat load/unload at least 10 times; watch PSS/lifetime RSS and Android exit reasons. Check the OS has not killed unrelated background apps more often.
6. Repeat 1,024-token tests with normal background apps present and record available memory; do not fill RAM deliberately to the point of destabilizing the phone. Note any OS kills. Repeat under mild thermal load and retain severity/frequency/battery readings; stop if the phone becomes uncomfortable.
7. Only after a reliable baseline, repeat at 2,048 context. Recheck accuracy and memory rather than optimizing only token speed.
8. Score offline, review personality facts/direction/caveats/language, and retain separate device exports. Compare median/p95/worst latency, load time, failure/cancel rates, coverage and complete fact reviews. Use a consistent charging/temperature setup; no desktop/emulator timing substitutes for these two phones.

Initial targets: short structured response <5 s preferred; short personality response <10 s; model loading <10 s; no repeated-test crashes; ≥95% held-out intent accuracy with complete held-out coverage; **100% reviewed financial-fact preservation**. These are design targets, not guarantees. See benchmark-results/README.md for the unverified comparison table.

## Local validation and limits

Automated tests cover exact model hashes/metadata/atomic imports, missing/unpinned/incompatible files, request limits, serial cancellation/ordered cleanup/recovery, dataset/contract scoring, unsupported qualifiers, corrupt JSON, pin metadata consistency and native ELF/APK layout. A host native smoke test links the real runtime and exercises absent-model/cancelled-load/cleanup paths; it performs no inference and supplies no device performance estimate. A successful arm64 cross-build is not a successful on-phone library load.

The official model metadata endpoint is blocked in this cloud environment, so no official model hash or weights have been fetched here and no generation has run here. The checked-in unpinned diagnostic APK cannot import weights. The CI-pinned artifact is the path to device testing; do not treat its remote build as successful until Actions confirms it. There are no physical phones attached, so actual ABI execution, import of the real official artifact, OOM/thermal/battery behavior, latency, intent quality and personality quality remain unverified.

Do not integrate the model into production yet. If the Infinix misses targets, classify the failure (ABI/runtime, RAM/OS kills, latency/thermal, structured accuracy, or fact preservation). Consider SmolLM2-360M only as a separately pinned/licensed comparison under the same tests; it is not installed automatically. A future provider should expose bounded inference behind a narrow native interface, retain deterministic validation and canonical financial rendering, and never grant a model ledger/database/RPC powers.

## Diagnostic revision 2: start here after the first Xiaomi export

The first user-provided Xiaomi export completed 80 intent cases, with 5/60 held-out exact matches and about 18.1 s median response time; it does not establish Infinix behavior or personality quality. Its long prefill and frequent unnecessary clarification motivate these experiments, not a production integration.

Update from the new Actions `ledger-ai-benchmark` artifact using the same signing key/app ID. Keep the original export. The imported model and private results survive an update; clear results after saving the old export so comparisons are easier. There is no need to import the same model again if its pin matches.

1. Load the model. Leave context 1024, threads 2, output 128, temperature 0, seed 42 and repetitions 1. Choose **Compact v2 + examples**, JSON constraint on, prefix cache off. Run **8-case development check**, then export JSON. These eight cases are fixed development questions covering English/Taglish, dates, pay periods and categories; held-out labels were not changed.
2. Choose **Original v1 baseline**, keep JSON constraint on and cache off; repeat the development check. Toggle grammar off for a separate comparison if needed. Grammar limits syntax, field names, entity IDs and core enums; it does not enforce operation-dependent validity, uniqueness of optional fields, required filters, truth or intent. The real query validator and exact-label scorer remain mandatory. Output caps can still yield incomplete JSON.
3. Switch back to v2 and enable **Reuse exact prompt prefix**. Run the development check at 2, 3 and 4 threads, exporting each round. Cache-enabled runs record actual reused and newly decoded token counts; scoring separates cold-prefix and warm-prefix profiles. Warm-up is excluded from accuracy. A repeated selected prompt may reuse almost the whole prompt and is not representative of a new question.
4. Send the exports for review before spending time on another full suite. Revised instructions, grammar and cache are experiments; on-phone speed, correctness and cache isolation are not proven by the build tests.

Prefix reuse retains one context only when system instructions, context size and thread count match. It keeps only the exact common input-token prefix and removes previous question suffixes and generated tokens before decoding the next question. Samplers/grammar reset per question; no previous answer becomes conversation context. Uncached runs, cancellation, native failures and unload discard the cache; backgrounding still unloads. The cache does not persist to disk. CPU compilation remains portable armv8-a/O3; runtime CPU feature information and the actual embedded chat template are exported for diagnosis. No device-specific ISA is forced.

When scoring an older v1 export, either its bundled evaluation reference or the revised reference accepts its exact original instructions. Profiles separate instruction version, grammar, cache state and thread count. Financial accuracy still uses the unchanged independent labels and query engine. The v2 instructions emphasize that ordinary sums need neither an amount nor a category; only affordability requires an amount.

## Filter-focused v3 development experiment

The default instruction profile is now **Filter-focused v3**; v1/v2 remain available unchanged for comparison. V3 adds hand-authored examples with different counts, dates and categories, explicitly distinguishes a payday from a calendar month, requires `periodCount` for multiple periods and both date boundaries for date ranges, preserves category filters, and forbids `limit` on sums. Example queries are validated by the existing query engine during asset generation. The 80 questions, their expected labels, the eight-case development selection and all personality cases are unchanged. Improvement on these development cases is not held-out evidence.

After installing the new Actions artifact, load the model, choose v3, keep JSON constraints on, and **enable prefix reuse**. Keep 1024 context, 2 threads, output 128, temperature 0, seed 42 and one repetition. Run the eight-case check and export JSON; retain old exports. The longer instructions make the first uncached warm-up slower, and changing profile invalidates the cached prefix. Subsequent responses are the relevant warm-cache comparison. Do not assume the old 2.16 s median survives the larger prompt. Review accuracy before running the unchanged full suite.

The scorer now reports per-profile scored count, exact accuracy and query-schema validity, as well as overall totals, so old persisted results do not hide the current experiment. It still verifies the exact recognized system/user text. No model response is repaired by appending missing filters, changing dates, or replacing period fields after generation.
