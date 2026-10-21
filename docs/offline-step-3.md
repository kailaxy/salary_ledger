# Step 3: reliable single-record synchronization backend

## Deployment

1. In Apps Script, replace `Code.gs` with the repository version.
2. Add a new script file named `Sync` and paste the complete contents of `Sync.gs`. Keep `Index.html` from the Home UI revision.
3. Save and reload the Google Sheet. Use Salary Ledger → Prepare reliable sync once. This adds `SYNC_JOURNAL`; the ten existing ledger tables are not migrated or reordered. Re-running preparation validates the journal headers without clearing any rows. If a journal sheet with different headers already exists, setup fails rather than overwriting it.
4. Deploy a new version of the existing web-app deployment. Keep its URL and configured PIN.

Do not delete or edit the journal: durable idempotency, recovery and before/after audit records depend on it. It contains financial record details and is protected by the Sheet's own sharing permissions. No automatic cleanup is implemented.

## Scope and contract

`syncLedgerMutation(pin, request)` is the new authenticated RPC. It supports additions and edits to INCOME and ordinary EXPENSE records in TRANSACTIONS. Existing online endpoints and forms remain unchanged; this backend increment alone does not enable offline forms or alter the status message. Funds, loan payments, deletion and multi-row writes are deliberately unsupported in this endpoint.

The request uses:

```json
{
  "version": 1,
  "ledgerId": "spreadsheet_id_from_snapshot",
  "mutationId": "request_unique_uuid_here",
  "operation": "add",
  "table": "TRANSACTIONS",
  "recordId": "txn_client_unique_uuid_here",
  "values": {
    "periodId": "existing_period_id",
    "date": "2026-10-21",
    "amountMinor": 50000,
    "categoryId": "existing_spending_category_id",
    "note": "Lunch"
  }
}
```

Generate IDs once and retain them across retries. Record IDs are permanent: no temporary mapping is needed. For INCOME use an `inc_` record ID and values `periodId`, `date`, `amountMinor`, `kind` (SALARY/BONUS/OTHER), `source`, and `note`. Additions require all fields, including empty optional text. Edits use `operation: "edit"`, a new mutation ID, `baseFingerprint` from a complete snapshot or prior committed receipt, and only changed value fields. One request affects one row. Amounts are positive integer hundredths of the configured currency, at most the existing MAX_AMOUNT. Unknown fields, invalid dates, mismatched foreign keys and leading formula markers in text are rejected. Edits to loan-linked expense IDs are refused.

Responses distinguish `status: "committed"` and `status: "conflict"`. A committed receipt includes the record ID, resulting record, fingerprint and committedAt timestamp. A conflict includes the current remote row and fingerprint, or null for a missing row. Never silently resubmit a conflict with a new fingerprint: obtain explicit user resolution first. Reusing a mutation ID with a different payload is rejected. Repeating a committed request returns the original receipt even if later mutations have changed that record; pull a fresh snapshot for the current state.

## Recovery and limitations

Under the Apps Script lock the server validates the request, records a PREPARED journal entry and flushes it, applies the row, flushes, and records a COMMITTED receipt. A retry checks whether the intended row already exists before writing. Prepared recovery applies only when the current row still matches its before-image; otherwise it persists a terminal conflict. Audit rows preserve both images.

Hashes cover current row content and audit fields, not just timestamps, so direct Sheet changes made before the sync check are detectable. Apps Script locks serialize script callers, not humans editing Sheets. A simultaneous human edit can race with the check/write; a read-back detects a differing persisted value but cannot guarantee preservation of an edit made in the check/write window. Strong guarantees require app-mediated writes or a separate access policy for manual editing. Multi-step spreadsheet failures and corruption beyond the tested boundaries can still require journal inspection. This is not a transaction across multiple financial rows.

Existing online RPCs still use the legacy cache-based retry scheme. The next increment must route supported ordinary forms through the durable local outbox and this RPC. Offline cold startup and secure packaged transport remain pending. The LLM is last.

## Validation

Run `npm ci` then `npm test` in `tests/`. Eighteen tests currently pass. The sync tests use in-memory Apps Script service mocks, exercising PIN enforcement, explicit preparation, schema rejection, add/edit retries, stable IDs, changed-content conflicts, journal audit data, three interrupted-write boundaries, prepared replay conflicts, income handling, ID collisions, and rejected unsafe requests. A new Ledger tests Actions workflow runs the Node tests independently of the APK workflow.

Live Apps Script deployment and real multi-device/Sheet race tests have not been executed. Before connecting the outbox, use a test spreadsheet deployment to verify the new RPC and journal behavior. Do not claim offline writes are enabled after only deploying this increment.
