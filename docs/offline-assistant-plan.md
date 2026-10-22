# Offline ledger and assistant status

All existing ledger forms now have confirmed local saving and durable synchronization; LLM integration is deliberately excluded until a separate model/runtime discussion. Setup/pairing/PIN administration remain owner/online operations. The Android wrapper supports Android 8+, bundled startup, native device pairing, app-private ledger storage and Keystore-protected credentials. Release and persistent-signed Dev variants have separate application IDs.

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

## Deferred by the owner

Discuss on-device LLM options only after the owner is satisfied with the offline ledger. Evaluate official runtime availability, license, formats, verified downloads, model size, SDK/ABI support, RAM and real-device latency on the Infinix Hot 11S NFC (target 4 GB RAM) and Xiaomi Note 14 Pro 5G, while retaining Android 8 support for core ledger functions. The existing deterministic query/proposal validation and explicit confirmations must remain authoritative. No runtime/model selection, cloud AI, model download or inference integration is included in the current work.
