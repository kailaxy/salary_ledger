# Step 4: durable local additions and confirmed edits

## Install

Update all three Apps Script files from this repository: `Code.gs`, `Sync.gs`, and `Index.html`. Save and deploy a **new version of the existing deployment**, keeping the URL, Execute as Me / Anyone settings and PIN. If not already done, reload the Sheet and run Salary Ledger → Prepare reliable sync once. Do not rerun the original ledger setup or remove the journal. Refresh the app online to obtain the updated snapshot capability. No APK rebuild is required for this hosted increment.

Backend and frontend must both be updated: mutations now include the expected spreadsheet identity, and committed receipts include their commit time. An older backend rejects unsupported requests; pending data is retained for retry after deployment.

## User flow

- In Add, income and ordinary expenses now use **Review entry**. Check the exact amount, date, period, category or income type/source and note. Nothing is saved until **Save on device**. Go back or Escape cancels without a financial change.
- Confirmed changes commit to IndexedDB with an audit image and durable outbox entry. The ledger summary, recent entries, category actuals and local questions reflect non-conflicting queued entries immediately.
- Recent ordinary income/expense rows have **Edit**. The form shows the existing record, keeps its stable ID and requires a before/after review. Cancel edit leaves the record alone. You can edit an addition before it uploads; the edit waits for that addition's acknowledgement.
- Home shows an expandable **pending changes** panel only while items are queued. It includes request errors, blocked dependencies, conflicts and Retry sync. Refresh and browser online events trigger synchronization. A network hint alone is never treated as a successful save.
- If cloud content changed, the proposal remains durable. Review cloud version shows the exact local proposal and cloud row. Go back preserves it. Use cloud version discards that record's pending chain only after a fresh authenticated fetch confirms the reviewed cloud fingerprint. The discarded proposal remains in local audit storage. If cloud content changes again, the app asks for a new review. To keep your intended changes, keep the proposal until reviewed, then use the cloud version and create a fresh explicit edit; there is no force-overwrite shortcut.

Questions use cloud values for conflicted records; conflicts are not silently counted as accepted local edits. The original proposal remains in the pending panel and audit. New cloud snapshots never clear the queue. Wrong-deployment requests are rejected by spreadsheet identity. A committed acknowledgement removes its outbox entry and updates the local base/dependent fingerprint together in one database transaction. Failed/invalid replies retain the queue. Snapshots captured before an acknowledged write are rejected rather than replacing newer acknowledged state. Reads for the dashboard take a consistent snapshot/outbox view.

The current pay period and default date are selected in the spreadsheet timezone when the local view loads. Existing draft dates are preserved, so always review the displayed date before confirming.

## Current limits

- This increment works offline **while the hosted page is available**. The Android wrapper still opens the Apps Script URL and cannot reliably cold-launch offline. Bundled frontend assets and a secure packaged transport are next.
- Funds, loan payments, plans, settings, categories and deletion still use their existing online flows. Online-only changes require the ordinary pending queue to be synchronized first. Queued records cannot be deleted. Fund/loan retry behavior remains the legacy implementation; check the Sheet after an uncertain result before retrying.
- Edits are currently exposed for the 40 recent rows; older records remain queryable from the complete cached ledger but do not yet have an edit picker.
- Only one page instance actively drains its own queue; different tabs may retry the same key, and backend durable idempotency plus atomic acknowledgement prevents duplicate application. A dependency is unblocked only after its parent acknowledgement is locally committed. Up to 100 requests are sent per drain; additional queued work can be sent with Retry sync. No background Android worker exists yet.
- Invalid PINs stop synchronization and require online unlock. Existing hosted PIN persistence and device-local data protection have not been redesigned or encrypted. Do not clear app/WebView site data while changes are pending. Local audit retention has no cleanup/export UI yet.
- No LLM is installed. Chat remains read-only and deterministic; additions and edits use the normal Add form and explicit confirmation.
- Script locks do not serialize simultaneous human Sheet edits; the previously documented check/write race remains. Do not claim transactional protection against concurrent manual edits.

## Verification

Run `npm ci && npm test` in `tests/`. The Node tests cover cache persistence, query arithmetic, backend journal recovery, queue persistence, dependencies, stale confirmation rejection, failed sends, cloud pulls with local overlays, invalid acknowledgements, conflict preservation and stale-snapshot rejection. The browser test uses mocked Apps Script replies with the actual UI and IndexedDB: `npm run test:browser`. Set `CHROMIUM_PATH` if Chromium/Chrome is not at its standard Linux path. The Ledger tests workflow runs both suites using the runner's Chrome installation. Test tooling is development-only and is not bundled into Apps Script or the APK.

Browser checks performed locally include confirmed/cancelled additions, an offline addition edited before upload, reload recovery, response loss after remote success, safe replay with one final server row, conflict review/cancel/keep-cloud, and horizontal layout at 320/393/768 pixels. Tests simulate server callbacks; they do not prove a live deployment or native offline launch.

On the phone, after updating all files: refresh online, disable internet with the app still open, add a small test expense, confirm it, edit its amount, and check Home's pending count and query totals. Reconnect and tap refresh; verify exactly one Sheet row with the final amount and journal receipts for both operations. Test income separately. Use a separate test spreadsheet for conflicts and interrupted network tests. Live Apps Script and device testing of this revision remain outstanding.
