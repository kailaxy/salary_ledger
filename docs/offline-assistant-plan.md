# Offline assistant integration plan

Status: snapshots, durable local cache, read-only Home assistant, and single-record income/expense outbox synchronization have been implemented incrementally; see offline-step-1.md through offline-step-4.md. Packaged offline startup and native pairing/transport are now implemented for device validation (offline-step-5.md). Stable release signing is implemented with owner-managed GitHub secrets; first signed-device installation remains an owner check. Offline fund deposits/withdrawals are now implemented (offline-step-6.md). Offline loan payments with optional mirrored spending are implemented (offline-step-7.md). Creating/editing loans and other broader offline forms remain outstanding; on-device inference stays last. Per the owner’s direction, LLM integration is last.

## Inspected sources

- `Code.gs`: ten table schemas in TABLES; PIN-protected RPCs, script locks, cached request IDs, soft deletes, and a derived dashboard response.
- `Index.html`: existing screens and Guide; google.script.run transport, localStorage PIN/cache/preferences, and hardcoded peso formatting. Fonts are fetched externally.
- `Salary_Ledger_Guide.md`: user documentation, not deployment evidence.

Android sources, actual spreadsheet headers, deployment settings, and target device constraints have not been supplied. Source schemas must be checked against deployed headers before a migration.

## Findings

getState returns summaries and at most 40 recent entries, not a complete ledger. It drops record-level audit fields and does not expose currency or spreadsheet timezone. Historical answers must not use this truncated view.

INCOME distinguishes SALARY/BONUS/OTHER. TRANSACTIONS distinguishes EXPENSE/FUND_IN/FUND_OUT. Loan payments can reference a mirrored EXPENSE through txn_id. Count that expense once; never sum the loan payment again into spending. Fund movements are internal transfers, not income or spending. Refunds and reversals have no explicit representation yet; do not infer them from positive amounts or introduce negative amounts silently.

Ordinary income and transaction edits are not implemented. The UI presently recommends delete-and-recreate. CacheService request IDs expire after six hours and may be evicted sooner; this is not durable offline idempotency. updated_at has second resolution and direct Sheet edits need not update it, so it is not a sufficient conflict token.

PIN reads are optional when no PIN is configured; writes require a PIN. PIN failures use a shared expiring counter. The client persists the PIN in localStorage. This is not a completed authentication design for a packaged offline client.

## Proposed architecture

Keep Sheets authoritative and preserve the existing tabs and screens. Bundle frontend assets in the Android app at a stable local HTTPS origin using WebViewAssetLoader. No network navigation is required to reopen the ledger. Bundle fonts or use system fallbacks.

Use IndexedDB for web ledger storage and a durable outbox, scoped to an explicit ledger/account identity. Native SQLite is an alternative if inspection reveals an existing native repository; do not maintain two authoritative local databases. Store credentials separately using an appropriate Android secure storage mechanism, not in the ledger database or saved source. Define offline unlock, logout, and local data removal explicitly.

Introduce a transport adapter: retain google.script.run for hosted mode; use a narrowly scoped Android transport in packaged mode. Android transport and authentication are design prerequisites, not a presumed arbitrary WebView fetch to Apps Script. Verify redirects, authorization, and deployment behavior end to end. If Apps Script cannot support the chosen owner authentication safely, resolve that architecture before exposing financial sync endpoints.

Model inference runs on an Android worker/executor. An origin-restricted message bridge accepts only versioned structured requests with bounded payload sizes and correlation IDs. Disable privileged access for untrusted frames or navigations; never expose arbitrary URL fetching, server function dispatch, or code execution.

## Local stores

- records: key [table, stable ID], validated schema fields, server content fingerprint, local revision, sync state.
- metadata: schema version, ledger identity, currency symbol and minor-unit scale, IANA timezone, last successful complete snapshot, sync time.
- outbox: mutation UUID, record key, add/edit operation, validated payload, base server fingerprint, predecessor mutation, creation time, retry state.
- conflicts: base/local/remote snapshots and resolution status.
- audit: mutation identity, before/after values and acknowledgement state; bounded retention.

A confirmed write must update records, audit, and outbox in one IndexedDB transaction. Do not report success until it commits. Preserve pending mutations across crashes. Handle quota failures visibly. Keep remote base records distinct from pending overlays when pulling snapshots.

## Structured actions and arithmetic

Versioned discriminated allowlist: query, propose_add, propose_edit. No deletion initially.

Queries support sum, average, min, max, top, count, list, category totals, cash-flow and range comparison. Filters use explicit table/type, category ID, income kind, validated inclusive ISO date bounds, description text, integer amount bounds, and stable record ID. Bound result limits. Resolve relative dates with the configured ledger timezone. Reject unknown fields and ambiguous categories or record matches.

Proposals contain exact table, stable ID for edits, expected local revision, and allowed changes only. Amounts use integer minor units. Dates must be real calendar dates. Validate foreign keys, archived categories, pay periods, positive limits and fund constraints on both client and server. The model cannot select unrestricted server methods. Confirmation displays before/after values and resolves pay period explicitly; reconfirm if the target changes before application.

Compute totals in safe integer minor units; define rounding of averages explicitly. Separate recorded income, expense budget spending, fund movements and loan cash outflow. For “in versus out,” show the chosen basis and separate transfers; ask when the requested meaning is unclear. Missing records never imply invented values.

## Synchronization

For fewer than 1,000 records, begin with a full authenticated snapshot of all ten tables, including tombstones and record fingerprints. Add incremental sync only after correctness is established.

Use client-generated permanent UUID-based IDs where supported to avoid temporary-ID mapping. Queue edits of pending additions behind their add, with an explicit dependency; replay and acknowledgement must preserve those IDs.

Under the script lock, validate authorization, operation schema, foreign keys, expected fingerprint and idempotency key. Fingerprints use canonical current row content, including fields changed directly in Sheets. Reject conflicts and preserve both versions. Script locks serialize Apps Script callers, not simultaneous human spreadsheet edits; recheck and document this remaining race, and prefer app-mediated edits for strong guarantees.

Durable idempotency must survive remote success followed by response loss and crashes between record and receipt writes. Design a recoverable mutation journal with deterministic record IDs and per-record operation markers, not just an expiring receipt cache. Test every crash boundary before claiming exactly-once effects. Multi-row loan mutations require explicit recovery as well.

Only remove an outbox item after a durable acknowledgement. On timeout, retry the same mutation identity. On conflict, block that record's dependent mutations and offer explicit resolution; continue unrelated safe work. Pulling must not overwrite pending local changes. Connectivity indicators report actual transport/sync outcomes, not navigator.onLine alone.

## Incremental file changes

1. `Code.gs`: additive complete snapshot API and capability metadata, exposing currency/timezone; preserve current RPCs. Add mocked Apps Script tests.
2. New local database and transport modules, integrated into `Index.html` using packaging compatible with both HTML Service and Android assets. Add IndexedDB recovery tests.
3. `Code.gs` and sync module: durable idempotent add/edit APIs, journal/recovery, fingerprints and conflict UI. Document any additive schema migration; never silently reorder columns.
4. New deterministic query/action modules and tests: independent of model, DOM and network.
5. `Index.html`: compact chat, suggestions, pending count, status, errors, result lists and confirmation/cancellation. Existing forms also need the local mutation path for complete core offline support.
6. Existing Android Activity/WebView, manifest and Gradle files once supplied: bundled origin, secure transport/bridge, model installer and worker lifecycle.
7. Android inference adapter: runtime/model selected only after checking official availability, license, format, size, SDK, ABI, RAM and device support. Verify artifact integrity and offline loading. No specific model is approved yet.
8. Update guide and deployment documentation after behavior is verified.

Expected dependencies: AndroidX WebKit; chosen inference runtime only after compatibility verification. Browser-side native IndexedDB avoids a required production database dependency. Test tooling may include Node tests, fake IndexedDB and browser automation. Exact versions await Android project inspection. No cloud AI, vector database or additional backend is required by this proposal.

## Validation gates

- Query fixtures with known sums, cents, averages, empty results, date/month/year boundaries, timezone transitions, top-N ties and loan mirror deduplication.
- Reject unsupported or malformed actions, invalid dates/amounts, formula-like text, unknown IDs, ambiguous matches and prompt-injected record notes.
- Confirm/cancel and stale confirmation tests; pending add followed by edit; restart with pending changes; quota and transaction failure recovery.
- Remote response loss, duplicate requests after cache expiry, crash recovery, failed retries, direct Sheet edits, deleted targets and multi-device conflicts.
- Unauthorized reads/writes, unconfigured PIN behavior, bridge origin/frame restrictions and hostile navigation.
- Real device airplane-mode cold launch, cached screens, all required offline forms, local questions and installed-model inference; reconnect and verify final Sheet rows and audit records.
- Verify fixture calculations against a supplied sanitized spreadsheet sample, then test a separate deployment before production.

Browser testing is currently unavailable because Chromium installation was denied by network policy. Real Apps Script and Android integration have not been executed. A local test or mock cannot substitute for those deployment and device checks.

## Inputs needed before Android integration

Provide the Android project (Activity/WebView Kotlin or Java, manifest, Gradle files/version catalog), minimum SDK and representative devices/RAM, and current deployment/authentication settings. If the Android wrapper is generated by a service, provide its name and configurable asset/bridge capabilities instead. Provide actual headers and a few sanitized rows, including a mirrored loan payment if used. Never include PINs or credentials.

Essential: complete local data, offline launch, durable writes/sync, conflict handling, deterministic queries, validated interpretation and confirmations, secure transport and supported on-device inference. Optional: incremental sync, chat persistence, model bundling versus verified first-run download, and later deletion with recovery.
