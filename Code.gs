/**
 * SALARY LEDGER — Apps Script backend (v1)
 *
 * Bind this project to a NEW, BLANK Google Sheet (Extensions → Apps Script),
 * add Index.html next to this file, then:
 *   1. Reload the sheet. A "Salary Ledger" menu appears.
 *   2. Salary Ledger → Set up (run once). It builds every tab below.
 *   3. Salary Ledger → Set or change PIN (6+ digits).
 *   4. Deploy → New deployment → Web app → Execute as: Me, Access: Anyone.
 *
 * Tabs (one table each): SETTINGS, PAY_PERIODS, INCOME, CATEGORIES, FUND_GOALS,
 * BUDGET_LINES, TRANSACTIONS, LOANS, LOAN_INSTALLMENTS, LOAN_PAYMENTS.
 * Dates are stored as yyyy-mm-dd text, amounts as numbers. Deleting a record
 * only stamps deleted_at, so it can be undone by clearing that cell.
 *
 * Because the web app may be open to "Anyone", reading needs the PIN (if one is
 * set) and ADDING / EDITING / DELETING is refused until a PIN exists.
 */

const APP_NAME = 'Salary Ledger';
const SCHEMA_VERSION = '1';
const MAX_PIN_FAILS = 5;
const LOCKOUT_SECONDS = 600;
const MAX_AMOUNT = 10000000;
const RECENT_COUNT = 40;

const AUDIT = ['created_at', 'updated_at', 'deleted_at'];
const TABLES = {
  SETTINGS:          { cols: ['key', 'value'], audit: ['updated_at'] },
  PAY_PERIODS:       { cols: ['period_id', 'label', 'start_date', 'pay_date', 'is_closed'], prefix: 'per' },
  INCOME:            { cols: ['income_id', 'period_id', 'received_date', 'amount', 'kind', 'source', 'note'], prefix: 'inc' },
  CATEGORIES:        { cols: ['category_id', 'name', 'kind', 'group_name', 'sort_order', 'is_archived'], prefix: 'cat' },
  FUND_GOALS:        { cols: ['category_id', 'target_amount', 'target_date'] },
  BUDGET_LINES:      { cols: ['line_id', 'period_id', 'category_id', 'planned_amount'], prefix: 'bud' },
  TRANSACTIONS:      { cols: ['txn_id', 'period_id', 'category_id', 'type', 'txn_date', 'amount', 'note'], prefix: 'txn' },
  LOANS:             { cols: ['loan_id', 'name', 'lender', 'principal', 'total_payable', 'start_date', 'installment_amount', 'frequency', 'installment_count', 'status'], prefix: 'lon' },
  LOAN_INSTALLMENTS: { cols: ['installment_id', 'loan_id', 'seq_no', 'due_date', 'amount_due'], prefix: 'ins' },
  LOAN_PAYMENTS:     { cols: ['payment_id', 'loan_id', 'installment_id', 'txn_id', 'paid_date', 'amount', 'note'], prefix: 'pay' },
};
const NUM = { amount: 1, planned_amount: 1, principal: 1, total_payable: 1, installment_amount: 1, amount_due: 1, target_amount: 1 };
const INTC = { seq_no: 1, installment_count: 1, sort_order: 1 };
const BOOL = { is_closed: 1, is_archived: 1 };
const ENUMS = {
  INCOME: { kind: ['SALARY', 'BONUS', 'OTHER'] },
  CATEGORIES: { kind: ['SPENDING', 'FUND'] },
  TRANSACTIONS: { type: ['EXPENSE', 'FUND_IN', 'FUND_OUT'] },
  LOANS: { frequency: ['WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY'], status: ['ACTIVE', 'PAID'] },
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let TZ_ = 'UTC';

// ------------------------------------------------------------ web app + menu

function doGet() {
  let title = APP_NAME;
  try { title = getSettings_(SpreadsheetApp.getActiveSpreadsheet()).app_name || APP_NAME; } catch (e) { /* not set up yet */ }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu(APP_NAME)
    .addItem('Set up (run once)', 'setupLedger')
    .addItem('Set or change PIN', 'setPinFromMenu')
    .addItem('Prepare reliable sync', 'prepareReliableSync_')
    .addItem('Pair Android device', 'createAndroidPairing_')
    .addItem('Revoke Android devices', 'revokeAndroidDevices_')
    .addToUi();
}

// ------------------------------------------------------------------ PIN

function getPin_() { return PropertiesService.getScriptProperties().getProperty('DASHBOARD_PIN'); }

function checkPin_(pin) {
  const expected = getPin_();
  if (!expected) return;
  if (!pin) throw new Error('PIN_REQUIRED');
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pin_fails') || 0);
  if (fails >= MAX_PIN_FAILS) throw new Error('LOCKED');
  if (String(pin) !== String(expected)) {
    cache.put('pin_fails', String(fails + 1), LOCKOUT_SECONDS);
    throw new Error('BAD_PIN');
  }
  cache.remove('pin_fails');
}

function requirePinForWrite_(pin) {
  if (!getPin_()) throw new Error('PIN_NOT_SET');
  checkPin_(pin);
}

function setPinFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Set PIN', 'Choose a PIN of 6 or more digits. It protects the web app, including adding and deleting records.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const v = String(r.getResponseText()).trim();
  if (!/^\d{6,12}$/.test(v)) { ui.alert('PIN not changed', 'Use 6 to 12 digits, numbers only.', ui.ButtonSet.OK); return; }
  PropertiesService.getScriptProperties().setProperty('DASHBOARD_PIN', v);
  ui.alert('PIN saved', 'Use it to unlock the web app.', ui.ButtonSet.OK);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('BUSY');
  try { return fn(); } finally { lock.releaseLock(); }
}

// ------------------------------------------------------------ tiny helpers

function fail_(msg) { throw new Error('INVALID: ' + msg); }
function r2_(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
function pad_(n) { return (n < 10 ? '0' : '') + n; }
function isoOf_(y, m, d) { return y + '-' + pad_(m) + '-' + pad_(d); }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v); }
function stamp_() { return Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd HH:mm:ss'); }
function todayIso_(now) { return Utilities.formatDate(now, TZ_, 'yyyy-MM-dd'); }
function newId_(prefix, taken) {
  let id;
  do { id = prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 8); } while (taken && taken[id]);
  if (taken) taken[id] = true;
  return id;
}
function validIso_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return y >= 2000 && y <= 2100 && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
function labelOf_(iso) { const p = iso.split('-'); return MON[+p[1] - 1] + ' ' + (+p[2]); }
function money_(v, what) {
  const n = r2_(Number(v));
  if (!isFinite(n) || n <= 0) fail_('Enter ' + what + ' above zero.');
  if (n > MAX_AMOUNT) fail_('That amount looks too large. Check the digits.');
  return n;
}
function text_(v, max, required, what) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !s) fail_(what + ' is required.');
  if (s.length > max) fail_(what + ' is too long (max ' + max + ' characters).');
  return s;
}
function dateIn_(v, what, optional) {
  if (optional && !v) return '';
  if (!validIso_(v)) fail_('Pick a valid ' + what + '.');
  return String(v);
}

// --------------------------------------------------------------- table layer

function colsOf_(name) { const t = TABLES[name]; return t.cols.concat(t.audit || AUDIT); }
function colFmt_(c) { return NUM[c] ? '#,##0.00' : INTC[c] ? '0' : BOOL[c] ? 'General' : '@'; }
function cell_(col, v) {
  if (NUM[col] || INTC[col]) return typeof v === 'number' ? v : (Number(v) || 0);
  if (BOOL[col]) return v === true || String(v).toUpperCase() === 'TRUE';
  if (isDate_(v)) return Utilities.formatDate(v, TZ_, 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}

function readTable_(ss, name, withDeleted) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('NOT_SETUP');
  const cols = colsOf_(name), last = sh.getLastRow();
  if (last < 2) return [];
  const out = [];
  sh.getRange(2, 1, last - 1, cols.length).getValues().forEach((r, i) => {
    if (r[0] === '' || r[0] == null) return;
    const o = { _row: i + 2 };
    cols.forEach((c, k) => { o[c] = cell_(c, r[k]); });
    if (!withDeleted && o.deleted_at) return;
    out.push(o);
  });
  return out;
}

function appendRows_(ss, name, objs) {
  if (!objs.length) return;
  const sh = ss.getSheetByName(name), cols = colsOf_(name), start = sh.getLastRow() + 1, st = stamp_();
  if (sh.getMaxRows() < start + objs.length) sh.insertRowsAfter(sh.getMaxRows(), Math.max(200, objs.length));
  const rows = objs.map(o => cols.map(c => {
    if (c === 'created_at' || c === 'updated_at') return o[c] || st;
    const v = o[c];
    return v === undefined ? (NUM[c] || INTC[c] ? 0 : BOOL[c] ? false : '') : v;
  }));
  const rg = sh.getRange(start, 1, rows.length, cols.length);
  rg.setNumberFormats(rows.map(() => cols.map(colFmt_)));
  rg.setValues(rows);
}

function patchRow_(ss, name, o, patch) {
  const sh = ss.getSheetByName(name), cols = colsOf_(name);
  const rg = sh.getRange(o._row, 1, 1, cols.length);
  const row = rg.getValues()[0];
  cols.forEach((c, k) => {
    if (Object.prototype.hasOwnProperty.call(patch, c)) row[k] = patch[c];
    if (c === 'updated_at') row[k] = stamp_();
  });
  rg.setValues([row]);
}
function softDelete_(ss, name, o) { patchRow_(ss, name, o, { deleted_at: stamp_() }); }

function allIds_(ss, name) {
  const taken = {}, pk = TABLES[name].cols[0];
  readTable_(ss, name, true).forEach(r => { taken[r[pk]] = true; });
  return taken;
}

// ------------------------------------------------------------------ settings

function getSettings_(ss) {
  const s = { app_name: APP_NAME, currency: '₱', pay_days: '15,EOM', schema_version: SCHEMA_VERSION };
  readTable_(ss, 'SETTINGS').forEach(r => { s[r.key] = r.value; });
  return s;
}
function putSetting_(ss, key, value) {
  const hit = readTable_(ss, 'SETTINGS').find(r => r.key === key);
  if (hit) patchRow_(ss, 'SETTINGS', hit, { value: String(value) });
  else appendRows_(ss, 'SETTINGS', [{ key: key, value: String(value) }]);
}

// ------------------------------------------------------------- pay periods

function parsePayDays_(s) {
  const parts = String(s || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
  if (!parts.length || parts.length > 4) fail_('Enter 1 to 4 pay days, like 15,EOM.');
  const out = [];
  parts.forEach(p => {
    if (p === 'EOM') { out.push('EOM'); return; }
    const n = Number(p);
    if (!/^\d{1,2}$/.test(p) || n < 1 || n > 28) fail_('Pay days must be 1 to 28, or EOM (end of month).');
    out.push(n);
  });
  return out.filter((v, i) => out.indexOf(v) === i);
}
function payDatesForYear_(year, days) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const eom = new Date(Date.UTC(year, m, 0)).getUTCDate();
    days.forEach(d => out.push(isoOf_(year, m, d === 'EOM' ? eom : d)));
  }
  return out.sort().filter((v, i, a) => a.indexOf(v) === i);
}
function generatePeriods_(ss, year, daysSpec) {
  const have = {};
  readTable_(ss, 'PAY_PERIODS', true).forEach(p => { have[p.pay_date] = true; });
  const taken = allIds_(ss, 'PAY_PERIODS');
  const rows = payDatesForYear_(year, parsePayDays_(daysSpec)).filter(d => !have[d])
    .map(d => ({ period_id: newId_('per', taken), label: labelOf_(d), start_date: d, pay_date: d, is_closed: false }));
  appendRows_(ss, 'PAY_PERIODS', rows);
  return rows.length;
}

// -------------------------------------------------------------------- loans

function addDays_(iso, n) {
  const p = iso.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return isoOf_(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function addMonths_(iso, n, day) {
  const p = iso.split('-').map(Number), t = p[1] - 1 + n;
  const y = p[0] + Math.floor(t / 12), m = ((t % 12) + 12) % 12;
  return isoOf_(y, m + 1, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()));
}
function dueDates_(first, freq, n) {
  const out = [first], day0 = +first.split('-')[2];
  for (let i = 1; i < n; i++) {
    const prev = out[i - 1];
    if (freq === 'WEEKLY') out.push(addDays_(prev, 7));
    else if (freq === 'BIWEEKLY') out.push(addDays_(prev, 14));
    else if (freq === 'MONTHLY') out.push(addMonths_(first, i, day0));
    else { // SEMI_MONTHLY: alternate between the 15th and the last day
      const p = prev.split('-').map(Number), eom = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
      if (p[2] < 15) out.push(isoOf_(p[0], p[1], 15));
      else if (p[2] < eom) out.push(isoOf_(p[0], p[1], eom));
      else out.push(addMonths_(isoOf_(p[0], p[1], 1), 1, 15));
    }
  }
  return out;
}
function splitAmounts_(total, n) {
  const each = Math.floor(total / n * 100) / 100, out = [];
  for (let i = 0; i < n - 1; i++) out.push(each);
  out.push(r2_(total - each * (n - 1))); // last one absorbs the rounding
  return out;
}

/** Pure: how much of each installment is covered, oldest first, given everything paid so far. */
function loanMetrics_(loan, insts, pays, today) {
  const sorted = insts.slice().sort((a, b) => a.seq_no - b.seq_no);
  const paid = r2_(pays.reduce((s, p) => s + p.amount, 0));
  let pool = paid;
  const items = sorted.map(i => {
    const covered = r2_(Math.min(pool, i.amount_due));
    pool = r2_(pool - covered);
    const left = r2_(i.amount_due - covered);
    const status = left <= 0.005 ? 'PAID' : (i.due_date < today ? 'OVERDUE' : (covered > 0 ? 'PARTIAL' : 'UPCOMING'));
    return { id: i.installment_id, seq: i.seq_no, due: i.due_date, amount: i.amount_due, covered: covered, left: left, status: status };
  });
  const remaining = Math.max(0, r2_(loan.total_payable - paid));
  const next = items.find(i => i.status !== 'PAID') || null;
  return {
    paid: paid, remaining: remaining,
    pct: loan.total_payable ? Math.min(100, paid / loan.total_payable * 100) : 0,
    items: items, next: next,
    overdue: items.filter(i => i.status === 'OVERDUE').length,
    paymentsLeft: items.filter(i => i.status !== 'PAID').length,
  };
}

function refreshLoanStatus_(ss, loanId) {
  const loan = readTable_(ss, 'LOANS').find(l => l.loan_id === loanId);
  if (!loan) return;
  const m = loanMetrics_(loan, readTable_(ss, 'LOAN_INSTALLMENTS').filter(i => i.loan_id === loanId),
    readTable_(ss, 'LOAN_PAYMENTS').filter(p => p.loan_id === loanId), '0000-00-00');
  const status = m.remaining <= 0.005 ? 'PAID' : 'ACTIVE';
  if (status !== loan.status) patchRow_(ss, 'LOANS', loan, { status: status });
}

// ---------------------------------------------------------------- state

function getState(pin) {
  checkPin_(pin);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  TZ_ = ss.getSpreadsheetTimeZone();
  try { return buildState_(ss, new Date()); }
  catch (e) {
    if (/NOT_SETUP/.test(String(e.message))) return { setupDone: false, app: { name: APP_NAME } };
    throw e;
  }
}

/** Complete read-only snapshot for local storage; never use the 40-row recent list as a ledger. */
function getLedgerSnapshot(pin) {
  // Offline exports always require a configured, valid PIN, including first setup.
  requirePinForWrite_(pin);
  return withLock_(function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    TZ_ = ss.getSpreadsheetTimeZone();
    const now = new Date(), settings = getSettings_(ss), tables = {};
    Object.keys(TABLES).forEach(function (name) {
      tables[name] = readTable_(ss, name, true).map(function (row) {
        const record = {};
        colsOf_(name).forEach(function (col) { record[col] = row[col]; });
        // Hash content, not updated_at alone: direct Sheet edits may leave timestamps unchanged.
        const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
          JSON.stringify(colsOf_(name).map(function (col) { return record[col]; })), Utilities.Charset.UTF_8);
        return { record: record, fingerprint: bytes.map(function (b) {
          return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
        }).join('') };
      });
    });
    let syncVersion = 0;
    if (typeof syncJournal_ === 'function') { try { syncJournal_(ss); syncVersion = 1; } catch (e) { /* Explicit preparation is required. */ } }
    return {
      capabilities: {recordSyncVersion: syncVersion},
      formatVersion: 1, ledgerId: ss.getId(), capturedAt: now.toISOString(),
      timezone: TZ_, currency: settings.currency || '₱', minorUnitScale: 2,
      tables: tables, state: buildState_(ss, now)
    };
  });
}

function buildState_(ss, now) {
  const today = todayIso_(now);
  const set = getSettings_(ss);
  const periodsRaw = readTable_(ss, 'PAY_PERIODS').sort((a, b) => a.pay_date < b.pay_date ? -1 : 1);
  const cats = readTable_(ss, 'CATEGORIES').sort((a, b) => a.sort_order - b.sort_order);
  const goals = {}; readTable_(ss, 'FUND_GOALS').forEach(g => { goals[g.category_id] = g; });
  const budget = readTable_(ss, 'BUDGET_LINES');
  const income = readTable_(ss, 'INCOME');
  const txns = readTable_(ss, 'TRANSACTIONS');
  const loansRaw = readTable_(ss, 'LOANS');
  const insts = readTable_(ss, 'LOAN_INSTALLMENTS');
  const pays = readTable_(ss, 'LOAN_PAYMENTS');

  const catById = {}; cats.forEach(c => { catById[c.category_id] = c; });
  const perById = {}; periodsRaw.forEach(p => { perById[p.period_id] = p; });

  const plan = {}; // periodId -> categoryId -> planned
  budget.forEach(b => { (plan[b.period_id] = plan[b.period_id] || {})[b.category_id] = b.planned_amount; });
  const byCat = {}; // periodId -> categoryId -> actual (funds net of withdrawals)
  const spentBy = {}, fundBy = {}, incomeBy = {}, hasInc = {};
  txns.forEach(t => {
    const m = (byCat[t.period_id] = byCat[t.period_id] || {});
    const sign = t.type === 'FUND_OUT' ? -1 : 1;
    m[t.category_id] = r2_((m[t.category_id] || 0) + sign * t.amount);
    if (t.type === 'EXPENSE') spentBy[t.period_id] = (spentBy[t.period_id] || 0) + t.amount;
    else fundBy[t.period_id] = (fundBy[t.period_id] || 0) + sign * t.amount;
  });
  income.forEach(i => { incomeBy[i.period_id] = (incomeBy[i.period_id] || 0) + i.amount; hasInc[i.period_id] = true; });

  let current = null;
  periodsRaw.forEach(p => { if (p.pay_date <= today) current = p.period_id; });
  if (!current && periodsRaw.length) current = periodsRaw[0].period_id;

  const periods = periodsRaw.map(p => {
    const inc = r2_(incomeBy[p.period_id] || 0), sp = r2_(spentBy[p.period_id] || 0), fd = r2_(fundBy[p.period_id] || 0);
    const planned = r2_(Object.keys(plan[p.period_id] || {}).reduce((s, k) => s + plan[p.period_id][k], 0));
    return { id: p.period_id, label: p.label, date: p.pay_date, closed: p.is_closed, isCurrent: p.period_id === current,
      hasIncome: !!hasInc[p.period_id], income: inc, spent: sp, funds: fd, planned: planned,
      unassigned: hasInc[p.period_id] ? r2_(inc - sp - fd) : 0 };
  });

  const totals = {}; // categoryId -> all-time actual
  const toDate = {}; // categoryId -> planned up to today
  Object.keys(byCat).forEach(pid => Object.keys(byCat[pid]).forEach(cid => { totals[cid] = (totals[cid] || 0) + byCat[pid][cid]; }));
  Object.keys(plan).forEach(pid => {
    if (!perById[pid] || perById[pid].pay_date > today) return;
    Object.keys(plan[pid]).forEach(cid => { toDate[cid] = (toDate[cid] || 0) + plan[pid][cid]; });
  });
  const yearPlan = {};
  Object.keys(plan).forEach(pid => Object.keys(plan[pid]).forEach(cid => { yearPlan[cid] = (yearPlan[cid] || 0) + plan[pid][cid]; }));

  const categories = cats.map(c => {
    const g = goals[c.category_id];
    return { id: c.category_id, name: c.name, kind: c.kind, group: c.group_name, archived: c.is_archived,
      actual: r2_(totals[c.category_id] || 0), planToDate: r2_(toDate[c.category_id] || 0), yearPlan: r2_(yearPlan[c.category_id] || 0),
      target: g ? g.target_amount : 0, targetDate: g ? g.target_date : '' };
  });

  const loans = loansRaw.map(l => {
    const li = insts.filter(i => i.loan_id === l.loan_id), lp = pays.filter(p => p.loan_id === l.loan_id);
    const m = loanMetrics_(l, li, lp, today);
    return { id: l.loan_id, name: l.name, lender: l.lender, principal: l.principal, total: l.total_payable,
      firstDue: l.start_date, frequency: l.frequency, count: l.installment_count, installment: l.installment_amount,
      status: m.remaining <= 0.005 ? 'PAID' : 'ACTIVE', paid: m.paid, remaining: m.remaining, pct: m.pct,
      installments: m.items, next: m.next, overdue: m.overdue, paymentsLeft: m.paymentsLeft,
      payments: lp.map(p => ({ id: p.payment_id, date: p.paid_date, amount: p.amount, note: p.note, counted: !!p.txn_id }))
        .sort((a, b) => a.date < b.date ? 1 : -1) };
  });

  const mirrored = {}; pays.forEach(p => { if (p.txn_id) mirrored[p.txn_id] = true; });
  const loanName = {}; loansRaw.forEach(l => { loanName[l.loan_id] = l.name; });
  const recent = [];
  income.forEach(i => recent.push({ kind: 'income', id: i.income_id, date: i.received_date, at: i.created_at,
    title: i.source || (i.kind.charAt(0) + i.kind.slice(1).toLowerCase()), amount: i.amount, dir: 'in',
    sub: ['Income', i.kind.toLowerCase(), perById[i.period_id] ? 'for ' + perById[i.period_id].label : '', i.note].filter(Boolean).join(' · ') }));
  txns.forEach(t => {
    if (mirrored[t.txn_id]) return;
    const c = catById[t.category_id];
    recent.push({ kind: 'txn', id: t.txn_id, date: t.txn_date, at: t.created_at, title: c ? c.name : '(deleted category)', amount: t.amount,
      dir: t.type === 'FUND_OUT' ? 'in' : 'out',
      sub: [t.type === 'EXPENSE' ? 'Expense' : t.type === 'FUND_IN' ? 'Fund deposit' : 'Fund withdrawal',
        perById[t.period_id] ? 'for ' + perById[t.period_id].label : '', t.note].filter(Boolean).join(' · ') });
  });
  pays.forEach(p => recent.push({ kind: 'loanpay', id: p.payment_id, date: p.paid_date, at: p.created_at, title: loanName[p.loan_id] || '(deleted loan)',
    amount: p.amount, dir: 'out', sub: ['Loan payment', p.txn_id ? 'also counted as spending' : '', p.note].filter(Boolean).join(' · ') }));
  recent.sort((a, b) => a.at < b.at ? 1 : a.at > b.at ? -1 : (a.date < b.date ? 1 : -1));

  const received = r2_(income.reduce((s, i) => s + i.amount, 0));
  const spent = r2_(txns.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0));
  const inFunds = r2_(categories.filter(c => c.kind === 'FUND').reduce((s, c) => s + c.actual, 0));
  return {
    setupDone: true, generatedAt: Utilities.formatDate(now, TZ_, 'MMM d, yyyy h:mm a'), today: today,
    app: { name: set.app_name || APP_NAME },
    settings: { appName: set.app_name || APP_NAME, payDays: set.pay_days },
    years: periodsRaw.map(p => +p.pay_date.slice(0, 4)).filter((v, i, a) => a.indexOf(v) === i),
    currentPeriodId: current, periods: periods, categories: categories, plan: plan, byCat: byCat, loans: loans,
    summary: { received: received, spent: spent, inFunds: inFunds, saved: r2_(received - spent), unassigned: r2_(received - spent - inFunds),
      loanRemaining: r2_(loans.reduce((s, l) => s + l.remaining, 0)) },
    recent: recent.slice(0, RECENT_COUNT),
  };
}

// ------------------------------------------------------------------ writes

/** Runs one write under the lock, ignores a retried request id, returns {state}. */
function mutate_(pin, rec, fn) {
  requirePinForWrite_(pin);
  return withLock_(function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    TZ_ = ss.getSpreadsheetTimeZone();
    const now = new Date(), cache = CacheService.getScriptCache();
    const cid = rec && rec.cid ? String(rec.cid) : '';
    if (cid) {
      if (!/^[\w-]{8,40}$/.test(cid)) fail_('Bad request id.');
      if (cache.get('cid_' + cid)) return { duplicate: true, state: buildState_(ss, now) };
    }
    fn(ss, rec || {}, now);
    SpreadsheetApp.flush();
    if (cid) cache.put('cid_' + cid, '1', 6 * 3600);
    return { state: buildState_(ss, now) };
  });
}

function findPeriod_(ss, id) {
  const p = readTable_(ss, 'PAY_PERIODS').find(x => x.period_id === String(id || ''));
  if (!p) fail_('Pick a pay period.');
  return p;
}
function findCategory_(ss, id, kind) {
  const c = readTable_(ss, 'CATEGORIES').find(x => x.category_id === String(id || ''));
  if (!c) fail_(kind === 'FUND' ? 'Pick a fund.' : 'Pick a category.');
  if (c.is_archived) fail_('"' + c.name + '" is archived. Un-archive it first.');
  if (kind && c.kind !== kind) fail_(kind === 'FUND' ? 'That is not a fund.' : 'That is a fund, not a spending category.');
  return c;
}
function fundBalance_(ss, categoryId) {
  return r2_(readTable_(ss, 'TRANSACTIONS').filter(t => t.category_id === categoryId)
    .reduce((s, t) => s + (t.type === 'FUND_OUT' ? -t.amount : t.amount), 0));
}

function addIncome(pin, rec) {
  return mutate_(pin, rec, function (ss, r) {
    const per = findPeriod_(ss, r.periodId);
    const kind = String(r.kind || 'SALARY');
    if (ENUMS.INCOME.kind.indexOf(kind) < 0) fail_('Pick an income type.');
    appendRows_(ss, 'INCOME', [{
      income_id: newId_('inc', allIds_(ss, 'INCOME')), period_id: per.period_id,
      received_date: dateIn_(r.date, 'date'), amount: money_(r.amount, 'an amount'), kind: kind,
      source: text_(r.source, 60, false, 'Source'), note: text_(r.note, 200, false, 'Note') }]);
  });
}

function addTransaction(pin, rec) {
  return mutate_(pin, rec, function (ss, r) {
    const type = String(r.type || '');
    if (ENUMS.TRANSACTIONS.type.indexOf(type) < 0) fail_('Pick a record type.');
    const per = findPeriod_(ss, r.periodId);
    const cat = findCategory_(ss, r.categoryId, type === 'EXPENSE' ? 'SPENDING' : 'FUND');
    const amount = money_(r.amount, 'an amount');
    if (type === 'FUND_OUT' && amount > fundBalance_(ss, cat.category_id) + 0.005) fail_('"' + cat.name + '" only holds ₱' + fundBalance_(ss, cat.category_id).toFixed(2) + '.');
    appendRows_(ss, 'TRANSACTIONS', [{
      txn_id: newId_('txn', allIds_(ss, 'TRANSACTIONS')), period_id: per.period_id, category_id: cat.category_id, type: type,
      txn_date: dateIn_(r.date, 'date'), amount: amount, note: text_(r.note, 200, false, 'Note') }]);
  });
}

function saveCategory(pin, rec) {
  return mutate_(pin, rec, function (ss, r) {
    const all = readTable_(ss, 'CATEGORIES');
    const name = text_(r.name, 40, true, 'Name');
    const existing = r.id ? all.find(c => c.category_id === String(r.id)) : null;
    if (r.id && !existing) fail_('That category no longer exists.');
    if (all.some(c => c.name.toLowerCase() === name.toLowerCase() && (!existing || c.category_id !== existing.category_id))) fail_('You already have "' + name + '".');
    const group = text_(r.group, 30, false, 'Group');
    const kind = existing ? existing.kind : String(r.kind || '');
    if (ENUMS.CATEGORIES.kind.indexOf(kind) < 0) fail_('Choose Spending or Fund.');
    if (existing && r.kind && String(r.kind) !== existing.kind) fail_('A category’s type can’t be changed. Make a new one instead.');
    const archived = r.archived === true;
    let id;
    if (existing) {
      id = existing.category_id;
      if (archived && !existing.is_archived && kind === 'FUND' && Math.abs(fundBalance_(ss, id)) > 0.005) fail_('Withdraw the fund’s balance before archiving it.');
      patchRow_(ss, 'CATEGORIES', existing, { name: name, group_name: group, is_archived: archived });
    } else {
      id = newId_('cat', allIds_(ss, 'CATEGORIES'));
      appendRows_(ss, 'CATEGORIES', [{ category_id: id, name: name, kind: kind, group_name: group,
        sort_order: all.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1, is_archived: false }]);
    }
    if (kind === 'FUND') {
      const target = r.target === '' || r.target == null ? 0 : r2_(Number(r.target));
      if (!isFinite(target) || target < 0 || target > MAX_AMOUNT) fail_('Target must be zero or more.');
      const tdate = dateIn_(r.targetDate, 'target date', true);
      const goal = readTable_(ss, 'FUND_GOALS').find(g => g.category_id === id);
      if (goal) patchRow_(ss, 'FUND_GOALS', goal, { target_amount: target, target_date: tdate });
      else appendRows_(ss, 'FUND_GOALS', [{ category_id: id, target_amount: target, target_date: tdate }]);
    }
  });
}

function deleteCategory(pin, id) {
  return mutate_(pin, null, function (ss) {
    const c = readTable_(ss, 'CATEGORIES').find(x => x.category_id === String(id || ''));
    if (!c) fail_('That category is already gone.');
    if (readTable_(ss, 'TRANSACTIONS').some(t => t.category_id === c.category_id)) fail_('It has records. Archive it instead of deleting.');
    readTable_(ss, 'BUDGET_LINES').filter(b => b.category_id === c.category_id).forEach(b => softDelete_(ss, 'BUDGET_LINES', b));
    readTable_(ss, 'FUND_GOALS').filter(g => g.category_id === c.category_id).forEach(g => softDelete_(ss, 'FUND_GOALS', g));
    softDelete_(ss, 'CATEGORIES', c);
  });
}

function setBudget(pin, rec) {
  return mutate_(pin, null, function (ss) {
    const r = rec || {};
    const per = findPeriod_(ss, r.periodId);
    const cat = findCategory_(ss, r.categoryId, null);
    const amt = r2_(Number(r.amount === '' || r.amount == null ? 0 : r.amount));
    if (!isFinite(amt) || amt < 0 || amt > MAX_AMOUNT) fail_('Planned amount must be zero or more.');
    const targets = readTable_(ss, 'PAY_PERIODS').filter(p => p.period_id === per.period_id || (r.applyToFuture === true && p.pay_date > per.pay_date && !p.is_closed));
    const lines = readTable_(ss, 'BUDGET_LINES'), taken = allIds_(ss, 'BUDGET_LINES'), add = [];
    targets.forEach(p => {
      const hit = lines.find(b => b.period_id === p.period_id && b.category_id === cat.category_id);
      if (hit) patchRow_(ss, 'BUDGET_LINES', hit, { planned_amount: amt });
      else if (amt > 0) add.push({ line_id: newId_('bud', taken), period_id: p.period_id, category_id: cat.category_id, planned_amount: amt });
    });
    appendRows_(ss, 'BUDGET_LINES', add);
  });
}

function saveLoan(pin, rec) {
  return mutate_(pin, rec, function (ss, r) {
    const all = readTable_(ss, 'LOANS');
    const name = text_(r.name, 40, true, 'Loan name');
    const existing = r.id ? all.find(l => l.loan_id === String(r.id)) : null;
    if (r.id && !existing) fail_('That loan no longer exists.');
    if (all.some(l => l.name.toLowerCase() === name.toLowerCase() && (!existing || l.loan_id !== existing.loan_id))) fail_('You already have a loan called "' + name + '".');
    const lender = text_(r.lender, 40, false, 'Lender');
    if (existing) { patchRow_(ss, 'LOANS', existing, { name: name, lender: lender }); return; }
    const principal = money_(r.principal, 'the amount borrowed');
    const total = r.total === '' || r.total == null ? principal : money_(r.total, 'the total to repay');
    if (total < principal) fail_('Total to repay can’t be less than the amount borrowed.');
    const n = Number(r.count);
    if (!/^\d+$/.test(String(r.count)) || n < 1 || n > 120) fail_('Installments must be a whole number from 1 to 120.');
    const freq = String(r.frequency || '');
    if (ENUMS.LOANS.frequency.indexOf(freq) < 0) fail_('Pick how often it is paid.');
    const first = dateIn_(r.firstDue, 'first due date');
    const amounts = splitAmounts_(total, n), dues = dueDates_(first, freq, n);
    const id = newId_('lon', allIds_(ss, 'LOANS')), taken = allIds_(ss, 'LOAN_INSTALLMENTS');
    appendRows_(ss, 'LOANS', [{ loan_id: id, name: name, lender: lender, principal: principal, total_payable: total, start_date: first,
      installment_amount: amounts[0], frequency: freq, installment_count: n, status: 'ACTIVE' }]);
    appendRows_(ss, 'LOAN_INSTALLMENTS', amounts.map((a, i) => ({ installment_id: newId_('ins', taken), loan_id: id, seq_no: i + 1, due_date: dues[i], amount_due: a })));
  });
}

function deleteLoan(pin, id) {
  return mutate_(pin, null, function (ss) {
    const l = readTable_(ss, 'LOANS').find(x => x.loan_id === String(id || ''));
    if (!l) fail_('That loan is already gone.');
    if (readTable_(ss, 'LOAN_PAYMENTS').some(p => p.loan_id === l.loan_id)) fail_('Delete its payments first.');
    readTable_(ss, 'LOAN_INSTALLMENTS').filter(i => i.loan_id === l.loan_id).forEach(i => softDelete_(ss, 'LOAN_INSTALLMENTS', i));
    softDelete_(ss, 'LOANS', l);
  });
}

function addLoanPayment(pin, rec) {
  return mutate_(pin, rec, function (ss, r, now) {
    const loan = readTable_(ss, 'LOANS').find(l => l.loan_id === String(r.loanId || ''));
    if (!loan) fail_('Pick a loan.');
    const lp = readTable_(ss, 'LOAN_PAYMENTS').filter(p => p.loan_id === loan.loan_id);
    const m = loanMetrics_(loan, readTable_(ss, 'LOAN_INSTALLMENTS').filter(i => i.loan_id === loan.loan_id), lp, todayIso_(now));
    if (m.remaining <= 0.005) fail_('"' + loan.name + '" is already fully paid.');
    const amount = money_(r.amount, 'an amount');
    if (amount > m.remaining + 0.005) fail_('That is more than the ₱' + m.remaining.toFixed(2) + ' still owed on "' + loan.name + '".');
    const date = dateIn_(r.date, 'date');
    let txnId = '';
    if (r.alsoSpend === true) {
      const per = findPeriod_(ss, r.periodId), cat = findCategory_(ss, r.categoryId, 'SPENDING');
      txnId = newId_('txn', allIds_(ss, 'TRANSACTIONS'));
      appendRows_(ss, 'TRANSACTIONS', [{ txn_id: txnId, period_id: per.period_id, category_id: cat.category_id, type: 'EXPENSE',
        txn_date: date, amount: amount, note: text_(r.note, 200, false, 'Note') || ('Loan: ' + loan.name) }]);
    }
    appendRows_(ss, 'LOAN_PAYMENTS', [{ payment_id: newId_('pay', allIds_(ss, 'LOAN_PAYMENTS')), loan_id: loan.loan_id,
      installment_id: m.next ? m.next.id : '', txn_id: txnId, paid_date: date, amount: amount, note: text_(r.note, 200, false, 'Note') }]);
    refreshLoanStatus_(ss, loan.loan_id);
  });
}

/** kind: 'income' | 'txn' | 'loanpay'. A loan payment and the spending row it created go together. */
function deleteRecord(pin, kind, id) {
  return mutate_(pin, null, function (ss) {
    id = String(id || '');
    if (kind === 'income') {
      const x = readTable_(ss, 'INCOME').find(i => i.income_id === id);
      if (!x) fail_('That record is already gone.');
      softDelete_(ss, 'INCOME', x);
    } else if (kind === 'txn' || kind === 'loanpay') {
      const pays = readTable_(ss, 'LOAN_PAYMENTS');
      const pay = kind === 'loanpay' ? pays.find(p => p.payment_id === id) : pays.find(p => p.txn_id === id);
      const txn = readTable_(ss, 'TRANSACTIONS').find(t => t.txn_id === (kind === 'txn' ? id : (pay ? pay.txn_id : '')));
      if (!pay && !txn) fail_('That record is already gone.');
      if (txn) softDelete_(ss, 'TRANSACTIONS', txn);
      if (pay) { softDelete_(ss, 'LOAN_PAYMENTS', pay); refreshLoanStatus_(ss, pay.loan_id); }
    } else fail_('Unknown record type.');
  });
}

function saveSettings(pin, rec) {
  return mutate_(pin, null, function (ss) {
    const r = rec || {};
    putSetting_(ss, 'app_name', text_(r.appName, 30, true, 'App name'));
    putSetting_(ss, 'pay_days', parsePayDays_(r.payDays).join(','));
  });
}

function generatePeriods(pin, year) {
  return mutate_(pin, null, function (ss) {
    const y = Number(year);
    if (!/^\d{4}$/.test(String(year)) || y < 2000 || y > 2100) fail_('Enter a year like 2027.');
    generatePeriods_(ss, y, getSettings_(ss).pay_days);
  });
}

// ------------------------------------------------------------------- setup

function setupLedger() {
  const ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActiveSpreadsheet();
  const have = Object.keys(TABLES).filter(n => ss.getSheetByName(n));
  if (have.length) { ui.alert('Already set up', 'These tabs already exist, so nothing was changed: ' + have.join(', '), ui.ButtonSet.OK); return; }
  if (ui.alert('Set up ' + APP_NAME + '?', 'This creates ' + Object.keys(TABLES).length + ' blank tabs with headers and this year’s pay periods. Continue?', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  try {
    const msg = setupLedger_(ss);
    ui.alert('Ready', msg + (getPin_() ? '' : '\n\nNext: Salary Ledger → Set or change PIN, then deploy the web app.'), ui.ButtonSet.OK);
  } catch (e) { ui.alert('Setup stopped', String((e && e.message) || e), ui.ButtonSet.OK); }
}

function setupLedger_(ss) {
  TZ_ = ss.getSpreadsheetTimeZone();
  const blank = ss.getSheets().filter(s => /^Sheet\d+$/.test(s.getName()) && s.getLastRow() === 0);
  Object.keys(TABLES).forEach(name => {
    const sh = ss.insertSheet(name), cols = colsOf_(name), rows = 1000;
    if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1B3A2D');
    sh.setFrozenRows(1);
    cols.forEach((c, k) => {
      sh.getRange(2, k + 1, rows - 1, 1).setNumberFormat(colFmt_(c));
      sh.setColumnWidth(k + 1, /note|name|source|lender|group/.test(c) ? 200 : /_at$/.test(c) ? 150 : 120);
      const list = ENUMS[name] && ENUMS[name][c];
      if (list) sh.getRange(2, k + 1, rows - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build());
      if (BOOL[c]) sh.getRange(2, k + 1, rows - 1, 1).insertCheckboxes();
    });
    sh.setTabColor(/LOAN/.test(name) ? '#C07A12' : name === 'SETTINGS' ? '#888888' : '#1F6F46');
  });
  blank.forEach(s => { if (ss.getSheets().length > 1) ss.deleteSheet(s); });
  putSetting_(ss, 'app_name', APP_NAME);
  putSetting_(ss, 'currency', '₱');
  putSetting_(ss, 'pay_days', '15,EOM');
  putSetting_(ss, 'schema_version', SCHEMA_VERSION);
  const year = Number(Utilities.formatDate(new Date(), TZ_, 'yyyy'));
  const n = generatePeriods_(ss, year, '15,EOM');
  return 'Created ' + Object.keys(TABLES).length + ' tabs and ' + n + ' pay periods for ' + year + '.';
}
