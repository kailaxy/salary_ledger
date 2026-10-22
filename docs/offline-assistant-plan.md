# Offline ledger and assistant status

All existing ledger forms now have confirmed local saving and durable synchronization; Production LLM integration remains deferred until the isolated prototype has physical-device evidence. Setup/pairing/PIN administration remain owner/online operations. The Android wrapper supports Android 8+, bundled startup, native device pairing, app-private ledger storage and Keystore-protected credentials. Release and persistent-signed Dev variants have separate application IDs.

## Delivered increments

- offline-step-1.md through offline-step-4.md: complete snapshots, local cache, deterministic Home queries, durable ordinary entries, outbox and conflicts.
- offline-step-5.md: bundled Android startup, local-origin bridge and native pairing/transport.
- offline-step-6.md: offline funds and approved header spacing.
- offline-step-7.md: recoverable loan payments and optional mirrored spending.
- offline-step-8.md: budgets, categories/goals, loan creation/renaming, remaining edits/deletions, settings/periods, full-history editing, dependencies, recovery and usability checks.

Sheets remains authoritative; IndexedDB holds the complete cloud base, confirmed outbox/audit and pending projections. Integer cents and deterministic allowlisted actions compute results; no model executes code or selects unrestricted RPC methods. Conflicts preserve proposals. Multi-row journal recovery runs before application reads/writes under the script lock. Direct human edits are outside that lock and can require explicit recovery. Budgets/new categories/new loans can be used by dependent offline entries. One pending new payment per loan and bounded multi-row operations are documented limits. Synchronization occurs in the foreground on refresh, reconnect and authorized resume, not while the app is closed.

Automated Node, browser and Android checks are documented per increment. Required phone/live deployment checks are in device-validation.md; they cannot be certified from a cloud workspace. Deployment and signing instructions are in ../android/README.md. No original Sheet table/header migration is required beyond the already prepared additive SYNC_JOURNAL.

## Deterministic assistant expansion

The next increment expands the existing read-only LedgerQuery engine with calendar and recorded-pay-period scopes, income kinds, averages, category rankings/frequencies, comparisons/trends, budgets and overages, fund goals/transfers, installment obligations, savings ratios, recurring candidates and bounded plan affordability checks. English/Taglish parsing separates normalization, time extraction, exact entity resolution, anchored intent templates and strict structured validation. Financial results use checked integer cents; presentation is a separate formatter. Conflicted projections remain excluded. See [assistant-questions.md](assistant-questions.md) for supported templates, formulas, deployment and known limits. No model or native integration is included.

## Deterministic personalities

The next presentation increment adds three local presets, a step-5 chaos slider, fictional live preview and per-ledger preference persistence. AssistantPersonality decorates the canonical formatter output with controlled context-aware reactions; no financial calculation or source metadata is rewritten. Sensitive cases override humor. Its reusable config exposes tone, expression and boundaries for a future model adapter. See [assistant-personality.md](assistant-personality.md). No inference or model download is included.

## Phase 3: isolated native feasibility prototype

[android-ai-benchmark](../android-ai-benchmark/README.md) is a separate arm64/API 26+ app with a pinned llama.cpp CPU provider, private verified-model import, cancellation/unload, measured timing/memory fields, 80 labeled intent cases and 16 synthetic personality cases, JSON/CSV export and offline scoring against LedgerQuery. It does not access the production ledger or change Home routing, native authentication, financial synchronization or signing. The local APK builds, but official Hugging Face metadata is blocked in this cloud environment; imports remain disabled until an exact official model pin is bundled (the separate CI workflow resolves one). No weights or device inference have been run here. Xiaomi/Infinix performance, model accuracy, fact preservation and memory/thermal suitability remain unverified; see the benchmark's device procedure and results table.

## Production integration remains deferred

Use the isolated Qwen2.5/llama.cpp benchmark as a candidate, then compare physical-device accuracy, memory, ABI compatibility, stability, battery/thermal behavior and latency on the Infinix Hot 11S NFC and Xiaomi Note 14 Pro 5G before choosing production settings. Retain Android 8 support for core ledger functions, the deterministic query validator, canonical monetary facts, personality boundaries and explicit financial confirmations. No model routing, AI network service, automatic financial mutation or inference integration into the production app is enabled.


Phase 4 now prioritizes a universal deterministic capability registry and conversational entry previews. The first slice supports in-chat ordinary expenses, income and fund movements; complex CRUD stays discoverable through existing secure review workflows. See assistant-capabilities.md for current boundaries. Production Qwen integration remains deferred: explicit on-demand invocation and serialized unload-after-use are documented in conversation-provider-contract.md. Ordinary saves use deterministic preset/chaos reactions only.
