# Phase 4 first slice — validation and limits

Implemented a 39-capability allowlist and searchable help. Four write adapters work inside the conversation: expense, income, fund deposit and fund withdrawal. The rest use explicit navigation to supported existing forms, history or financial screens; these are intentionally not presented as completed in-chat mutations. See assistant-capabilities.md for the full inventory and parameters.

The conversation acknowledges the action, collects one missing value at a time (including typed replies for supported values), shows editable preview details and requires a real confirmation button. No write happens on conversational yes. Date/period/category choices come from the current ledger; no guessed category, bulk target or record selection. Cancel, Clear, replacement, background, identity/snapshot change, authorization change and expiry discard uncommitted drafts. A shared prepare/persist helper keeps the original Add flow and the assistant on LedgerPending validation and LedgerLocal's atomic outbox. An optional atomic full-view guard rejects stale assistant previews, including concurrent changes in another tab.

After successful local enqueue, authoritative transaction details and pending status are separate from a short deterministic preset/chaos reaction. Validated committed/conflict receipts update status; transport failure keeps local-save status and directs the user to pending review. Rendering failure after a successful enqueue does not invite a duplicate retry. Expenses/funds use restrained wording; necessity or discretionary spending is never guessed. Qwen is neither bundled nor invoked; the future provider/lifecycle contract is documentation only.

## Checks actually run

- `npm --prefix tests test`: **259 passed, 0 failed**. Includes registry examples/negative fields for each entry; English/Taglish parsing, no silent qualifier loss, malformed amounts/dates, archived/deleted/duplicate entities, no action from ambiguous destructive requests, source embedding, personality bounds and production AI isolation. Existing query, planner parity, outbox, conflict, tombstone, fund and linked-loan tests remain green.
- Atomic IndexedDB tests: stale stored snapshot rejected with no pending record; concurrent distinct confirmations based on one preview allow only one commit; identical mutation-ID retry remains idempotent.
- `npm --prefix tests run test:browser`: all suites passed. Hosted and mocked packaged/native adapters cover existing offline CRUD and new conversational actions. Targeted assistant suite was rerun after final changes and passed both modes.
- New browser checks: guided category/period selection and typed category replies; no save before confirmation; yes cannot save; cancel; double click produces one queued mutation; safe note rendering; offline expense/income/fund creation; failed enqueue has no reaction or partial entry; committed/conflict status from the real acknowledgement path; snapshot/background invalidation; durable reload with no persisted draft; layouts at **320, 393 and 768 px**.
- Production Android `assembleDebug lintDebug testDebugUnitTest`: **BUILD SUCCESSFUL**; three existing BridgePolicy JVM tests have zero failures/errors. Packaged assets generated from the updated root HTML. No native AI dependency or signing/application-ID change.
- `git diff --check`: clean.

## Files and deployment

- `web/assistant-actions.js`, `tools/embed-actions.py`: reusable registry/interpreter and offline inline embedding.
- `Index.html`: Home action previews/help, shared entry preparation/persistence, optional atomic view comparison, validated save-status updates and compact styling.
- `web/assistant-personality.js`: bounded contextual action reactions; embedded using existing embed-personality.py.
- Tests: assistant-actions.test.cjs, browser/actions-checks.cjs, browser/assistant.cjs and operations-outbox.test.cjs.
- Docs: capability inventory, future conversation provider contract, Home UI notes and offline assistant plan.

No Apps Script RPC/server/schema, native bridge policy, release/debug signing, application ID or isolated benchmark files changed. Packaged users need the new regular Salary Ledger APK (not Ledger AI Bench). Hosted users need the updated Index.html in their existing Apps Script deployment. Existing reliable-sync server setup remains required; no new server file is necessary.

No physical-device or live Google Sheets deployment verification was performed. This is a tested first vertical slice, not complete conversational CRUD coverage: loan payments, edits/deletions, plans, category/goal management and settings continue through existing review forms. Future slices should add in-chat adapters one at a time with equivalent confirmation, conflict and outcome tests. No runtime LLM integration or claim of model correctness is included.
