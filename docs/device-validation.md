# Phone and live deployment validation

These checks require the owner's actual phone and deployed Apps Script; they have not been performed by the cloud workspace. Use a test Sheet/deployment for conflict or interrupted-write experiments. Dev and release have separate local data but connect to the same Sheet by default.

## Install and connect

1. Deploy the complete latest script set, preserving /exec, PIN and Execute as Me / Anyone. Prepare reliable sync if not already prepared.
2. Update the installed release with a signed release APK using the same release key. Alternatively install Salary Ledger Dev alongside it using the persistent debug key and pair that app separately. Do not uninstall or clear an app with pending records.
3. Authenticate with the phone credential; pair/download online. Confirm Settings reports all offline forms enabled. Compare known Sheet totals and the Home question results.

## Cold offline session

1. Enable airplane mode, force-stop, reopen and unlock. Check every tab, today's date/overdue installments, header clearance, system bars, cutout, keyboard, rotation and Back behavior.
2. In Plan, create a category, set a budget and record an expense in it. Cancel one review and verify no pending item appears for that cancellation.
3. Create a fund/goal, deposit, withdraw, edit a movement and try an overdraw. The overdraw must be rejected without a new item. Fund movements must not inflate income/spending.
4. Create a loan, rename it, queue a payment, then edit the payment and its counted-spending option. The loan schedule must total exactly; spending counts the mirror once. A second new payment to that loan must wait for the first.
5. Search an older entry by note/date and edit it. Change Settings and generate another year's periods. Back during Settings confirmation must dismiss only the review and leave the settings draft usable; opening Settings must not open the keyboard immediately.
6. Force-stop/reopen with pending changes. Confirm drafts that were explicitly saved remain in the queue, with correct projected totals. Unsaved form drafts are not promised across process death.

## Reconnect and compare

1. Restore connectivity and refresh. Verify each intended permanent row once, stable IDs for created categories/loans, correct budget periods, a complete loan schedule, linked payment/expense amounts, final loan status and COMMITTED journal receipts. All acknowledged items should disappear from the queue.
2. Archive/restore a category and change a goal; delete an unused category/loan and a payment with counted spending. Verify tombstones and linked effects. No orphan live expense should remain for a deleted payment.
3. On a separate test ledger, create a pending budget change, edit the same cloud budget from another device, reconnect and verify conflict preservation. Cancel cloud review, reopen and explicitly discard. A dependent proposal must remain reviewable if its prerequisite is discarded.
4. Background/resume and rotate while syncing; native authentication should gate the UI and preserve the queue. Revoke the test device and check denied sync does not remove pending data; reconnect by pairing again.

## Recovery boundaries

Automated tests inject failures after each journal/write/receipt boundary and inject IndexedDB quota failures. Do not simulate these by killing production rows or deleting the journal. If a direct Sheet edit interrupted a partially applied bundle, preserve SYNC_JOURNAL and device data; compare its before/after audit and restore the recorded values before retrying. Clearing one payment tombstone without its mirror/status is not a safe restoration.

Record phone model, Android/WebView versions, APK variant/version, tested deployment version, observed outcome and any failure. Successful mocks or compilation are not evidence that physical phone checks passed. LLM inference is outside this checklist.
