# Validation and remaining gates

Local cloud validation, 2026-10-22:

| Check | Result | What it establishes |
| --- | --- | --- |
| Standalone `assembleDebug lintDebug testDebugUnitTest` | Passed; zero lint errors, six JVM tests | ARM64 JNI app builds; model verifier/request/lifecycle tests pass |
| APK signature check | Passed with local debug key | Installable signed artifact structure; not an owner-key update artifact |
| ELF and ZIP layout checker | Passed for libledgerbench.so and libc++_shared.so | ELF64 AArch64; LOAD alignment ≥16 KB; stored native ZIP entries aligned to 16 KB; no Internet/broad-storage permission or GGUF weights bundled |
| Native compile command inspection | Passed | Android API 26 target, baseline ARMv8-a, `-O3 -DNDEBUG`, CPU-only configuration |
| Real native core host smoke test | Passed | Native runtime links/executes; missing model, cancelled load, failure recovery, idempotent unload and JSON escaping; **no inference or device performance** |
| Offline scoring tests | Seven passed | 80 labeled intents validate against actual LedgerQuery; strict parsing, no dropped exclusions, coverage/latency stats and separate semantic fact review |
| Official-pin helper tests | Four passed using mocked metadata | Immutable revision/source/license/pointer/size/hash consistency checks; not actual official artifact retrieval |
| Production Node regression tests | 209 passed | Existing deterministic queries, personalities, snapshots and sync logic retain regression behavior |
| Production browser regression suite | Ten scenario passes | Existing hosted/packaged adapter flows, financial actions, assistant and personality controls retain regression behavior |
| `git diff --check` | Passed | No whitespace errors |

Production runtime files were not edited. New functionality is confined to the standalone project/workflow; the shared read-only JS contract/personality configuration is imported by build/scoring tools, not connected to the benchmark's native app as a financial database.

The checked-in model manifest is an **unresolved seed**, not a known artifact hash. Official huggingface.co requests returned an environment proxy 403. No model weights or official model revision/checksum were obtained here. A local unpinned APK must therefore refuse imports. The separate Actions workflow resolves official metadata and its LFS pointer into an immutable per-APK manifest before building the usable device-test artifact; that remote workflow has not been observed from this workspace. Its success is not claimed.

No physical phone or Android emulator is attached. Android JNI library loading, the real official GGUF's metadata/import, model initialization/generation, cancellation under actual inference, repeated model load/unload memory, OS termination, battery/thermal behavior and all speed/accuracy/fact-preservation targets remain **unverified on both phones**. The host test is not a substitute. Native/OS allocation failures may still terminate a process; persisted markers and Android exit reasons provide observations when possible, not guarantees of survival or proof of OOM.

Use the Actions benchmark artifact's manifest, import the exact file through the document picker, and follow README.md on the Infinix and Xiaomi. Do not use this machine's temporary-signed, unpinned diagnostic APK as an update to the persistent-signed Actions benchmark; signing keys differ. Keep Dev/release Salary Ledger installed independently. Complete physical-device records before recommending any production integration or an alternative model.

Diagnostic revision 2 adds switchable v1/v2 instructions, grammar-constrained structured generation, an eight-case development check, exact-token-prefix KV reuse, chat-template/CPU diagnostics and separate scorer profiles for cold/warm cache. Local host smoke tests parse and exercise the actual GBNF with llama.cpp (valid query/rejections accepted; mutation, extra rejection fields, markdown and truncation rejected). Eight scorer tests cover historical v1 compatibility and independent experiment profiles. Android build/lint/JVM tests and 16 KB layout checks pass. Real model generation, cached-versus-fresh output equivalence, cancellation during cache reuse and any improvement in speed/accuracy need phone testing. No new device result is claimed.
