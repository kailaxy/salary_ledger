# Salary Ledger — Quick Guide

Salary Ledger tracks each paycheck from the moment it arrives: what you planned to do with it, what you actually spent, what went into savings funds, and what you still owe on loans. Everything is stored in your own Google Sheet.

## The four ideas

- **Pay period**: one paycheck. Periods are created from your pay days (default: the 15th and the last day of the month). Every expense, fund deposit and income entry belongs to one pay period.
- **Category**: something you spend on, like Rent or Groceries. Categories can have an optional group (for example, Home).
- **Fund**: money you set aside toward a goal, like an Emergency Fund. A fund has a balance and an optional target amount and date.
- **Loan**: money you owe, with a fixed number of installments. The app builds the schedule for you.

## First-time setup (about 5 minutes)

1. Create a blank Google Sheet, then Extensions → Apps Script. Paste in `Code.gs` and add `Index.html`.
2. Reload the sheet. Open the **Salary Ledger** menu → **Set up (run once)**.
3. **Salary Ledger → Set or change PIN** (6 to 12 digits). Saving is switched off until a PIN exists.
4. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. Open the link on your phone.

## The screens

### Home
Your summary at a glance: total saved (salary received minus spending), where your salary went (spent, moved to funds, not yet assigned), total loans owed, the current pay period, and a history of past pay periods.

### Plan
Decide what each paycheck is for.
- Pick a pay period at the top, then type a planned amount beside each category or fund. It saves when you leave the box.
- Tick **copy to every later pay period** to set a recurring amount once instead of every paycheck.
- The bar under each row shows how much of the plan you have used. It turns red when you go over.
- **New category** and **New fund** create them. Tap **Edit** on any row to rename it, change its group or target, archive it (hides it but keeps its history), or delete it (only possible if it has no records).

### Add
One form for everything you record. Pick the type at the top:
- **Expense**: amount, category, pay period, date, optional note.
- **Fund**: deposit into a fund or withdraw from it. You can't withdraw more than the fund holds.
- **Income**: salary, bonus or other, with an optional source such as your employer. You can enter more than one per pay period.
- **Loan pay**: choose the loan; the amount is filled in with the next installment. Leave **Also count it as spending** ticked if the payment should reduce your budget in a category (for example, Loan Payment).

Recent entries appear below the form. To remove one, tap **Delete** and then **Sure?**. To fix a mistake, delete the entry and add it again.

### Funds
Every fund with its balance, progress toward its target, how far you have to go, and whether you are on track against your plan so far. **New fund** starts a fund from here.

### Loans
- **New loan**: enter what you borrowed, the total to repay (including interest and fees), the number of installments, the first due date, and how often you pay (twice a month, monthly, every 2 weeks or weekly).
- Each loan card shows progress, what is left, and the next installment due. **Installments** lists the full schedule with paid, partial and overdue marks. **Payments** lists what you have paid.
- **Record payment** jumps to the Add screen for that loan. Payments cover installments oldest first.
- You can delete a loan only after its payments are deleted.

### Settings (gear icon, top right)
- **App name**: rename the app.
- **Pay days**: day numbers from 1 to 28, or EOM for end of month, for example `15,EOM` or `10,25`. This applies to pay periods you add from now on.
- **Add pay periods for year**: creates the pay periods for another year. Do this each December.

### Refresh (arrow icon)
Reloads the latest data from your sheet. Useful if you also edit the sheet directly.

## Good habits

- Record salary first each pay period, then log expenses as they happen.
- Set your plan at the start of a period, so the Plan bars tell you where you stand.
- Keep the PIN to yourself. Anyone with the link and PIN can add or delete records.

## Behind the scenes

The setup creates ten tabs: SETTINGS, PAY_PERIODS, INCOME, CATEGORIES, FUND_GOALS, BUDGET_LINES, TRANSACTIONS, LOANS, LOAN_INSTALLMENTS and LOAN_PAYMENTS. Deleting a record in the app only stamps its `deleted_at` column, so you can restore it by clearing that cell. Please avoid editing IDs or moving columns by hand.

## If something looks wrong

- **"Set up (run once)" message in the app**: run the setup from the sheet's Salary Ledger menu, then refresh.
- **"Saving is off until you set a PIN"**: use Salary Ledger → Set or change PIN in the sheet.
- **"Too many wrong tries"**: wait 10 minutes and try again.
- **A save seemed to fail**: tap Save again. A retry never records the same entry twice.
