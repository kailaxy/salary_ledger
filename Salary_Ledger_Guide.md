# Salary Ledger — Quick Guide

Salary Ledger tracks each paycheck from the moment it arrives: what you planned to do with it, what you actually spent, what went into savings funds, and what you still owe on loans. Your Google Sheet is the cloud copy. After the first download, the Android app can open, answer supported ledger questions, and save confirmed changes offline.

## The four ideas

- **Pay period**: one paycheck. Periods are created from your pay days (default: the 15th and the last day of the month). Every expense, fund deposit and income entry belongs to one pay period.
- **Category**: something you spend on, like Rent or Groceries. Categories can have an optional group (for example, Home).
- **Fund**: money you set aside toward a goal, like an Emergency Fund. A fund has a balance and an optional target amount and date.
- **Loan**: money you owe, with a fixed number of installments. The app builds the schedule for you.

## First-time setup (about 5 minutes)

1. Create a blank Google Sheet, then Extensions → Apps Script. Add the latest `Code.gs`, `Sync.gs`, `LoanSync.gs`, `Operations.gs`, `OperationSync.gs`, `Transport.gs` and `Index.html`.
2. Reload the sheet. Open the **Salary Ledger** menu → **Set up (run once)**.
3. **Salary Ledger → Set or change PIN** (6 to 12 digits). Saving is switched off until a PIN exists. Run **Prepare reliable sync** from the same menu.
4. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. Open the link on your phone.

## The screens

### Home
Your summary at a glance: total saved (salary received minus spending), where your salary went (spent, moved to funds, not yet assigned), total loans owed, the current pay period, and a history of past pay periods.

### Ask about your ledger
Tap the compact Home question box to expand it. It works offline after the first download, includes non-conflicting pending changes, and never changes records through chat.

Try:

- “Magkano gastos ko this month?” or “Show October spending.”
- “How much do I have left for Food?” or “Saan ako sumobra this cutoff?”
- “How close am I to my Emergency Fund goal?”
- “Contributions to Emergency Fund this month.”
- “May utang ba akong due this month?” or “Next loan payment.”
- “Did I spend more this cutoff than the previous one?”
- “Average daily spending this month” or “Spending trends last 3 pay periods.”
- “Can I afford 500 for Food?” — checks your remaining category plan, not your bank balance.

Use your actual category/fund/loan names. Dates use the ledger timezone. Weeks start Monday; cutoff questions use your recorded pay periods. You can also use yesterday, last week, last month, this year, October 2026, or from 2026-10-01 to 2026-10-20. Balances/goals use all-time records; ask deposits, withdrawals or contributions for a selected period.

Fund transfers are separate from income and spending. “Saved this month” means gross fund deposits; net contributions subtract withdrawals. “Income minus spending” and savings rate use recorded income and expenses, and are not bank balances. Loan payments count as spending only if a linked expense was recorded. Goal estimates require an explicit monthly contribution and assume no withdrawals, interest or other deposits.

Ambiguous names, unsupported exclusions and extra conditions produce an explanation instead of a guessed answer. Missing records cannot establish actual cash or complete obligations. See [the supported-question reference](docs/assistant-questions.md) for examples, formulas and limits. No AI model is installed or required.

### Plan
Decide what each paycheck is for.
- Pick a pay period at the top, then type a planned amount beside each category or fund. Leaving the box opens a review. Confirm **Save on device** to queue the change.
- Tick **copy to every later pay period** to copy the amount to later open periods already on your ledger. Newly generated periods are not filled retrospectively.
- The bar under each row shows how much of the plan you have used. It turns red when you go over.
- **New category** and **New fund** create them. Tap **Edit** on any row to rename it, change its group or target, archive it (hides it but keeps its history), or delete it (only possible if it has no records).

### Add
One form for everything you record. Pick the type at the top:
- **Expense**: amount, category, pay period, date, optional note.
- **Fund**: deposit into a fund or withdraw from it. You can't withdraw more than the fund holds.
- **Income**: salary, bonus or other, with an optional source such as your employer. You can enter more than one per pay period.
- **Loan pay**: choose the loan; the amount is filled in with the next installment. Leave **Also count it as spending** ticked if the payment should reduce your budget in a category (for example, Loan Payment).

Recent entries appear below the form. Tap **Edit** for income, expenses, fund movements or loan payments; review before saving. **Find an older entry** searches the full saved history by category, note, date or ID. A loan payment and its counted spending are edited together. For deletion, tap **Delete**, **Sure?**, then review all affected records. Deletions retain history in the Sheet. Fund changes cannot overdraw a fund. Each loan can have one pending new payment; synchronize or resolve it before recording another.

### Funds
Every fund with its balance, progress toward its target, how far you have to go, and whether you are on track against your plan so far. **New fund** starts a fund from here.

### Loans
- **New loan**: enter what you borrowed, the total to repay (including interest and fees), the number of installments, the first due date, and how often you pay (twice a month, monthly, every 2 weeks or weekly).
- Each loan card shows progress, what is left, and the next installment due. **Installments** lists the full schedule with paid, partial and overdue marks. **Payments** lists what you have paid.
- **Record payment** jumps to the Add screen for that loan. Payments cover installments oldest first.
- **Edit loan** changes its name and lender while preserving the existing schedule. You can delete a loan only after its payments are deleted.

### Settings (gear icon, top right)
- **App name**: rename the app.
- **Pay days**: day numbers from 1 to 28, or EOM for end of month, for example `15,EOM` or `10,25`. This applies to pay periods you add from now on.
- **Add pay periods for year**: creates the pay periods for another year. Do this each December.


Under **Assistant Personality**, choose **Supportive Bestie**, **Financial Gremlin**, or **Sarcastic Accountant**. Adjust **Chaos** from 0–100 in steps of 5 to change the tone of new Home answers. The fictional preview updates immediately; its example amounts are not from your ledger. Changes save automatically on this device for this ledger, separately from financial settings. **Restore defaults** returns to Supportive Bestie at 30% without affecting records. If storage is unavailable, the section warns that preferences apply for this session only.

Chaos never changes amounts, explanations or warnings. Overdue debt, budget shortfalls and missing information always receive gentle responses. This is a deterministic personality system, with no AI model or download. See [personality settings and limitations](docs/assistant-personality.md).

### Refresh (arrow icon)
Synchronizes confirmed changes, then downloads the latest cloud copy. Home shows pending changes, retries and conflicts. Keep a failed proposal until you review the current cloud values; discarding it keeps a local audit copy. Related pending changes wait for earlier changes and may also need review if an earlier proposal is discarded.

## Saving offline

After the first complete online download, all existing ledger forms work offline: budgets, categories and fund goals, loan creation/renaming, income and expense entries, fund/loan-payment edits, deletion, settings and pay-period generation. Every write has a confirmation step. Plans, new categories and new loans can be used by later queued entries before reconnecting. Changes survive closing and reopening the app, then synchronize on refresh, reconnect or authorized app resume. Background sync while the app is closed is not provided.

Set up and pair the Android device online first. Initial setup, changing the cloud PIN and pairing/revoking devices remain owner/online operations. The release and Dev apps have separate local caches but use the same Sheet by default. Never clear app data or uninstall with pending changes. If storage is full, the app reports that nothing was saved; free space and retry. Large multi-record changes are limited to 150 rows or the journal's safe size; split very large plans into smaller saves.

## Good habits

- Record salary first each pay period, then log expenses as they happen.
- Set your plan at the start of a period, so the Plan bars tell you where you stand.
- Keep the PIN to yourself. Anyone with the link and PIN can add or delete records.

## Behind the scenes

The setup creates ten tabs: SETTINGS, PAY_PERIODS, INCOME, CATEGORIES, FUND_GOALS, BUDGET_LINES, TRANSACTIONS, LOANS, LOAN_INSTALLMENTS and LOAN_PAYMENTS. Deleting a record in the app stamps its `deleted_at` column. Linked payments/spending and loan schedules must be restored consistently; do not clear one tombstone alone. Preserve SYNC_JOURNAL and use its before/after records when investigating recovery. Avoid editing IDs, moving columns, or changing partially synchronized rows directly in Sheets.

## If something looks wrong

- **"Set up (run once)" message in the app**: run the setup from the sheet's Salary Ledger menu, then refresh.
- **"Saving is off until you set a PIN"**: use Salary Ledger → Set or change PIN in the sheet.
- **"Too many wrong tries"**: wait 10 minutes and try again.
- **A save seemed to fail**: confirmed changes stay in the pending list and retry with the same request identity. Do not create the same entry again. Review Home for conflicts. If an interrupted bundle was edited directly in Sheets, recovery pauses; preserve the journal and pending data and restore its recorded before/after values before retrying.
