# Step 2: deterministic read-only assistant

Update `Index.html` in Apps Script and deploy a new version of the existing deployment. Keep `Code.gs` from step 1. No APK rebuild or sheet migration is required. Use the question field directly on Home. Refresh online first if the complete snapshot has not been downloaded.

Supported examples:

- What's my biggest expense this month?
- Show my top five expenses
- How much salary did I receive this year?
- How much did I spend on Food last month?
- Compare this month's expenses with last month's.
- Spending by category this month
- How much money came in versus went out this month?

Category names must exactly match a unique SPENDING category, ignoring case. Missing or ambiguous names produce a clarification message. No guessed aliases. The interpreter deliberately uses anchored patterns; it rejects unsupported qualifiers rather than silently ignoring them. The backend-independent engine also supports validated structured sums, averages, extrema, top-N, counts, lists, category/date/amount/text/ID filters, cash-flow and month comparisons. Not every engine operation has a natural-language template yet.

Queries use only the full in-memory cached snapshot and never call an AI or network service. Displayed answers identify the snapshot time and date range. A cloud write does not update that snapshot automatically: refresh before asking about a new write. Income and EXPENSE are separate; FUND_IN and FUND_OUT are excluded from spending and income. Linked loan payments are not counted again. Cash flow here explicitly means recorded income minus budget spending, not every bank account movement. Soft-deleted records are excluded. Monetary values are summed in safe integer minor units; averages round to the nearest minor unit. Dates are evaluated using the snapshot's spreadsheet timezone.

Chat remains in memory, bounded to 40 messages, and renders plain text rather than interpreting record notes as HTML. Conversation history is not durable. No model or write actions are enabled. The app still requires internet to load after a cold launch; local calculations work without network once the page and complete snapshot are available. Offline cold launch, authentication redesign, durable outbox replay, conflict resolution, native inference and confirmed writes remain outstanding.

Run `npm ci && npm test` from `tests/`. Ten automated tests cover the engine and prior snapshot/storage behavior. The subsequent Home UI revision has been tested in Chromium with mocked ledger data; phone verification remains outstanding. On the phone, refresh, compare answers against the Sheet, then disable connectivity while the page is loaded and repeat the suggested questions. Verify malformed questions receive an unsupported-request message and no write occurs. Settings → Guide and all existing ledger forms should remain available.
