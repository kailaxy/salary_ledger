# Recording independently of plans

New expenses are actual records, not allocations. In the assistant, “Add 80 fare” (or “80 fare”) prepares an ₱80 expense with description “fare”, today’s ledger date shown in the preview, no plan link, and an optional category. No category is invented. The user can choose a category or leave the expense Uncategorized. A real confirmation button is still required. Unsupported currencies, negative/shorthand amounts, recurring/batch instructions and exclusions are not silently converted into ordinary expenses.

A Food plan of ₱1,000 remains ₱1,000 after an unlinked ₱250 Food expense. Explicitly link a ₱250 expense to that plan and its remaining allowance becomes ₱750. Unlinked and linked expenses both count in actual spending totals. Only linked expenses consume a plan. Editing an expense to remove its link restores its plan allowance; deleting it removes its spending contribution without deleting the plan.

The assistant offers “Choose category (optional)” and “Link to a plan (optional)”. The latter offers only existing periods with a plan for the chosen category. Changing category clears the previous link; it does not silently move the expense onto another category’s plan. The regular Add form also defaults to Uncategorized / No plan linked, and clears plan selection after saving or switching record type. Existing linked records retain their association when opened for editing; users can explicitly choose No plan linked. Planning itself still requires a real category and period.

## Other workflows audited

- Income and fund movements no longer need a reporting period. Without one, reports group them by date. A deposit/withdrawal still requires a real active fund; withdrawals and deletion/editing of deposits still enforce available balance. Fund movements remain excluded from expense/income totals.
- Loan setup and payment retain existing loan/schedule/balance validation. A payment counted as spending can have no plan link or category. Its mirrored expense is still created/edited/deleted atomically with the payment; no duplicated spending is introduced. Payments not counted as spending remain excluded from expense totals.
- Expense/fund/loan-payment edits accept empty plan/reporting references. Deletion uses the existing precise record IDs, before/after reviews, tombstones, linked-record rules and durable outbox. No deletion implicitly deletes a plan.
- Category creation, archive/restore and fund-goal changes do not create budget allocations. Category/fund deletion safeguards stay intact. Actual budget allocation remains an explicit Plan operation and still requires a period/category.

## Storage and compatibility

No columns, journal schema or record IDs change, and there is no automatic migration. For expenses, existing `period_id` serves as the explicit plan association; empty means unlinked. `category_id` may be empty only for ordinary/count-as-spending expenses, never fund movements. Existing nonempty associations retain their legacy meaning, so historical plan usage does not unexpectedly change. Older apps can still create their former implicit associations; update all clients to use the new defaults.

Ordinary date/month/year and all-time spending totals include every expense. Period reports use an existing explicit assignment when present, otherwise derive the reporting group from the record date (latest recorded pay date on/before the transaction). Before the first recorded pay date, no period is invented; date/all-time reports still include the record. The derived reporting group is never written back as a plan link. Plan usage uses the stored link only. This retains historical assigned-period behavior while allowing new standalone recording.

The snapshot advertises `optionalPlanningVersion: 1` only when all updated recording validators/planner are present. New clients retain the former required-reference flow against older deployments, rather than enqueue requests the old server cannot handle. Existing pending requests, fingerprints, idempotent retries and journal recovery remain compatible.

## Deploy

1. In the existing Apps Script project, replace **Code.gs, Sync.gs, LoanSync.gs and Operations.gs** with this repository’s versions. Keep the existing OperationSync.gs, Transport.gs and other files.
2. Replace **Index.html** too if using the hosted web app.
3. Deploy a **new version of the existing web-app deployment**, keeping the same `/exec` URL and access settings.
4. Install the new regular Salary Ledger APK from **Build Android APK**, then refresh online once so the upgraded capability is cached. Do not install the benchmark APK for this change.

No Sheet setup rerun, new columns or reliable-sync journal reset is required. Do not delete the sync journal or existing pending entries.

## Validation

267 Node tests pass, including new tests for linked versus unlinked budget use, records with no periods/categories, actual period/date totals, idempotent synchronization, unlink/edit/delete preserving plans, real-fund validation/overdraft conflicts, unlinked loan mirrors and partial-deployment gating. Existing planner parity, outbox/conflict, financial query, security and personality checks remain green.

Browser suites pass under hosted and mocked packaged/native adapters. New coverage exercises “Add 80 fare”, Uncategorized/No plan defaults, optional matching-plan selection, allowance restoration on deletion, the regular Add form, actual server-fixture synchronization and 320/393/768 px widths. Production Android assembleDebug/lintDebug/testDebugUnitTest pass. No physical-device or live Sheet deployment verification is claimed.
