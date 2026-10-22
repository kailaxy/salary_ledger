# Offline Home assistant: question reference

Ask in the existing compact Home textbox. No model, download or Internet connection is needed after the first authenticated ledger download. Answers use the complete local ledger and non-conflicting pending changes. Refresh to obtain changes from other devices. Conflicted proposals and their dependent changes are excluded; they remain available for review.

Names below are examples: substitute your actual category, fund or loan name. Matching ignores case, whitespace and common punctuation. Exact normalized names take precedence over aliases. `pagkain`/`groceries` can match Food, `pamasahe`/`transportation` can match Transport, and `ipon` can match a fund named Savings when there is no exact match. Duplicate normalized names require clarification; the assistant never picks one arbitrarily.

| Ask about | English examples | Filipino / Taglish examples |
| --- | --- | --- |
| Spending | “My spending this month?”; “Show October spending”; “How much did I spend on Food last month?” | “Magkano gastos ko this month?”; “Magkano na nagastos ko this payday?” |
| Income | “Total income this month”; “How much salary did I receive this year?”; “Total bonus this month”; “Total other income” | “Magkano sahod ko this month?” |
| Expense rankings | “What's my biggest expense this month?”; “Smallest expense”; “Show my top five expenses” | “Ano pinakamalaking gastos ko?” |
| Category breakdown | “Spending by category”; “Which category ate most of my paycheck?” | “Saan napunta sahod ko?” |
| Averages | “What's my average daily spending?”; “Average weekly spending last month”; “Average monthly spending this year”; “Average per pay period spending last 3 pay periods” | Use these bounded English templates with the supported time phrases. |
| Comparisons | “Compare this month's expenses with last month's”; “Did I spend more this cutoff than the previous one?” | “Compare gastos ko last cutoff.” |
| Budgets | “How much do I have left for Food?”; “Which budgets am I exceeding?”; “Budget utilization”; “Unallocated paycheck”; “Compare budgets across pay periods” | “Magkano natira sa budget ko?”; “Saan ako sumobra this cutoff?” |
| Funds | “Fund balances”; “Balance of Emergency Fund”; “How close am I to my Emergency Fund goal?”; “How much more do I need for my Emergency Fund target?” | “Magkano savings ko ngayon?”; “Magkano na laman ng savings ko?” |
| Fund movement | “How much have I saved this month?”; “Deposits to Emergency Fund this cutoff”; “Withdrawals from Emergency Fund last month”; “Contributions to Emergency Fund this month” | Gross deposits and net contributions are explicitly distinguished in answers. |
| Target estimate | “When will I reach Emergency Fund goal if I save 500 monthly?” | The amount and monthly assumption must be explicit. |
| Loans | “How much do I still owe?”; “How much debt have I paid off this month?”; “Loan repayment progress”; “Paid versus unpaid installments” | “Magkano utang ko?” |
| Due dates | “Next loan payment”; “Overdue installments”; “What loans are due next payday?” | “May due ba akong loans?”; “May utang ba akong due this month?” |
| Named loan | “Balance for loan Phone”; “Progress for loan Phone”; “Payments for loan Phone this month”; “Due dates for loan Phone this month” | Use the exact loan name. |
| Insights | “Spending trends last 3 pay periods”; “Highest spending periods last 6 pay periods”; “Most frequent expense categories”; “Recurring expenses” | These report recorded patterns, not predictions. |
| Ratios and net income | “How much of my salary have I spent?”; “Spending as a percentage of recorded income”; “Savings rate this month”; “Income minus spending this month” | Ratios explain their accounting basis. |
| Plan check | “Can I afford 500 for Food?” | Checks the remaining category plan; cannot certify available cash. |

## Time phrases and defaults

Calendar scopes: `today` / `ngayon`, `yesterday` / `kahapon`, `this week`, `last week`, `this month` / `ngayong buwan`, `last month` / `nakaraang buwan`, `this year`, month names or abbreviations with an optional year (`October 2026`, `Oct 2026`), or an unambiguous ISO range (`from 2026-10-01 to 2026-10-20`). Weeks run Monday–Sunday. No-year months use the current year in the ledger timezone. Explicit dates must fall in 2000–2100, consistent with ledger entry validation. Numeric dates such as `10/11/26` are unsupported.

Pay-period scopes: `this cutoff`, `this payday`, `this pay period`, `current pay period`, `ngayong cutoff`, `last cutoff`, `previous cutoff`, `last pay period`, or `last N pay periods` / `last N cutoffs` (1–24, including the current period). The current period is the latest recorded pay date on or before ledger-local today. Previous and next use adjacent actual PAY_PERIODS rows; no paydays are hardcoded. Duplicate pay dates or insufficient periods produce an error.

Expense, income and budget cutoff queries use the record's assigned period ID, even if its transaction date falls outside that period. Answers show the assigned periods. Loan payments have no assigned period field, so loan paid/due questions use the calendar window from that pay date through the day before the next pay date. `next payday` asks due obligations in the next such window. Add later pay periods if an end boundary is missing. The latest current period's window ends today when no later period exists. “Next loan payment” instead shows the earliest unpaid date, including overdue obligations, with all obligations sharing that date.

Unqualified totals, rankings and recorded balances use all dates. Budget/affordability/paycheck questions default to the current recorded period. Averages default to this month, except per-pay-period averages default to the current period. Savings rate defaults to this month. “May due ba akong loans?” defaults to this month. Unqualified spending trends use the last three recorded periods and require that many periods.

## What the numbers mean

- Money is parsed and summed in safe integer minor units. Averages round half up to the nearest cent; rates round to 0.01 percentage points. Values outside safe precision fail with an error.
- Transaction averages divide by matching entries. Daily averages include zero-spend days; weekly averages are the daily rate × 7. Monthly averages divide by calendar months touched, including empty months. Current calendar/period averages use elapsed days through today and exclude future-dated records explicitly. A per-pay-period average divides by the selected actual period count, including periods with no recorded expenses. All-time time-based averages start at the first matching record and end today; future-dated records require an explicit range.
- Recorded spending includes EXPENSE transactions only. Fund deposits/withdrawals are transfers. Loan repayment totals use LOAN_PAYMENTS, while spending includes only their mirrored EXPENSE rows, once. Unmirrored repayments do not increase spending.
- Salary share = recorded expenses ÷ recorded SALARY income × 100. General income share includes SALARY, BONUS and OTHER. Savings rate = (all recorded income − recorded expenses) ÷ all recorded income × 100. No income means the percentage is undefined. These measures cannot prove bank savings or cash availability.
- Remaining spending plan = planned SPENDING allocation − recorded expenses assigned to the selected periods. Over-budget totals sum individual category overages, including unplanned spending; one category's unused allocation does not cancel another's overage. Fund goals/allocations are separate. Unallocated paycheck = recorded income − all recorded budget allocations, including fund plans; it is not income minus spending. Without recorded income it cannot be determined.
- Fund balances and targets are all-time. “Saved this month” means gross fund deposits and is labeled that way. Contributions mean deposits minus withdrawals in the selected scope. Goal estimates assume the stated monthly contribution with no withdrawals, interest or other deposits; they give contribution counts, not guaranteed dates. No target means no progress estimate.
- Loan outstanding = total payable − live recorded payments. Installments consume the payment pool by sequence, consistent with the app. Paid, partial, overdue and upcoming coverage describes current records, not historical balances. Missing or inconsistent schedules prevent due-amount answers. No interest or future charges are invented.
- Recurring candidates repeat a category and exact amount on at least two distinct dates. They are not confirmed subscriptions, predictions or duplicate errors. Frequency counts transactions; category percentages use monetary totals. Trends compare assigned recorded spending and warn that the current period can be incomplete.
- Archived categories remain in historical calculations. Soft-deleted rows are excluded. Unknown expense-category IDs are labeled unknown; missing category references in budget plans require correction rather than invented allocations.

## Deliberate boundaries

Supported templates are not unrestricted language understanding. Extra clauses, exclusions (e.g. “top five expenses excluding rent”), unsupported filters, multiple requests, vague entity names and invalid dates produce an explicit error. There is no conversational pronoun resolution (“what about that one?”), automatic mutation, bank balance integration, interest projection or inferred future income. Structured validation also rejects unsupported field/operation combinations.

The financial result is a structured fact object. A separate formatter creates labels, values, explanatory text, comparisons and list items; the UI inserts text through `textContent`. Notes and names never become HTML, code or instructions. Results show the saved-ledger timestamp and pending/conflict context. Conversation remains in memory, capped at ten turns. At most 50 items render per answer, with truncation stated.

## Development and later model integration

`web/ledger-query.js` is the standalone source; run `python3 tools/embed-query.py` after edits to embed the identical engine into Index.html. Hosted Apps Script and the Android APK use that same inline source without a production dependency or separate fetch. Existing LedgerQuery methods remain available; `format(result, currency)` is the new presentation seam.

The 91-case machine-readable question corpus is `tests/fixtures/query-corpus.json`. Behavioral tests cover amounts, dates, entities, errors, projections and rendering. Run `npm test` and `npm run test:browser` in tests, plus the Android build/lint/unit checks. Browser fixtures are simulated; they do not verify a physical phone or live deployment.

For a later Qwen2.5-0.5B experiment, use the existing validated query schema as a bounded interpretation target. A model output must pass validation and entity/date resolution before deterministic execution. Never let a model compute monetary facts, call arbitrary RPC methods or turn notes into instructions. Personality should consume the verified result separately. Preserve deterministic fallback and explicit clarification, and benchmark speed/memory on the 4 GB Infinix Hot 11S NFC as well as the Xiaomi before choosing model/runtime settings. No inference, model download, native integration or external AI service is implemented here.

Deployment: update Index.html in the existing Apps Script web-app deployment for hosted use, and install the new persistent-signed Dev APK from Actions for the packaged frontend. This increment changes no server files, spreadsheet schemas, synchronization protocol, Android application IDs or signing configuration. Previously prepared reliable sync remains required for writes; assistant queries themselves are read-only.

## Verification for this increment

- `npm test` (in tests): **193 tests passed**, including the original 76 regressions, 91 corpus cases and 26 expanded behavioral tests. The qualifier test also appends three unsupported constraints to each accepted corpus question and verifies rejection.
- `npm run test:browser` (in tests): **eight scenario passes**, covering existing offline ordinary/fund/loan/form workflows plus the expanded assistant in hosted and packaged-origin adapters. Mobile widths: 320, 393 and 768 px. The rendered screenshot was inspected.
- Android `assembleDebug lintDebug testDebugUnitTest`: **passed**, with three JVM tests and no failures. The APK asset was compared against the final Index.html, allowing only removal of hosted font/base tags.
- `git diff --check`: passed. No production dependencies, spreadsheet schemas, native source or synchronization protocols changed.

These are local automated results. No physical Infinix/Xiaomi test, live Apps Script deployment test or remote Actions run is claimed. No release APK/signing-key operation was required for this frontend increment.
