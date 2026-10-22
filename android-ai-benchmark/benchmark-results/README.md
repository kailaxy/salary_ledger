# Device results: not yet measured

No physical phones are attached to the cloud environment. No model weights were obtained or inference performed here. Desktop native smoke tests and APK cross-compilation are **not** performance evidence for either phone.

| Metric | Xiaomi Redmi Note 14 Pro 5G | Infinix Hot 11S NFC | Initial target |
| --- | --- | --- | --- |
| arm64 Android userspace and actual library load | Unverified | Unverified | Required |
| Android version / reported physical and available RAM | Unmeasured | Unmeasured | Record, do not assume |
| Official pinned GGUF import/load | Unverified | Unverified | Exact checksum/metadata match |
| Model load median/p95/worst | Unmeasured | Unmeasured | <10 s preferred |
| Short structured latency median/p95/worst | Unmeasured | Unmeasured | <5 s preferred |
| Short personality latency median/p95/worst | Unmeasured | Unmeasured | <10 s preferred |
| Sampled peak PSS / lifetime RSS | Unmeasured | Unmeasured | Stable and practical on each phone |
| Runtime failures, cancellation and repeat load/unload | Unmeasured | Unmeasured | No crashes in repeated tests |
| Held-out exact intent accuracy | Unmeasured | Unmeasured | ≥95%, full held-out coverage |
| Reviewed financial-fact preservation | Unmeasured | Unmeasured | 100%; surface checks insufficient |
| Thermal, battery and background-app effects | Unmeasured | Unmeasured | Record supported raw metrics |

Run the procedure in ../README.md with the same APK/model revision and prompt set. Keep raw JSON/CSV exports private by default (git ignores them); add a deliberately reviewed, sanitized comparison only after real measurements exist. Preserve the exact bundled model and evaluation manifests. Never fill this table with desktop, emulator, invented or projected numbers.

The Infinix is the gating device. If it fails, identify whether the issue is a 32-bit OS/ABI, unavailable RAM or OS termination, excessive latency/thermal slowdown, malformed/inaccurate queries, or semantic/personality fact errors. Do not choose a replacement model or add production routing based solely on file size or tokens per second.
