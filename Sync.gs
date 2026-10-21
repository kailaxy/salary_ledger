/** Reliable single-record sync, v1. Add this file beside Code.gs.
 * Supports INCOME and unlinked EXPENSE only. Existing online RPCs are unchanged.
 * SYNC_JOURNAL is durable and must not be deleted while clients can retry requests.
 */
const SYNC_HEADERS = ['request_id', 'request_json', 'status', 'table_name', 'record_id', 'before_json', 'after_json', 'receipt_json', 'created_at'];

/** Owner-only spreadsheet menu operation; no automatic changes on app reads. */
function prepareReliableSync_() {
  withLock_(function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('SYNC_JOURNAL');
    if (!sheet) {
      sheet = ss.insertSheet('SYNC_JOURNAL');
      sheet.getRange(1, 1, 1, SYNC_HEADERS.length).setValues([SYNC_HEADERS]);
      sheet.setFrozenRows(1);
    }
    syncJournal_(ss); // Validate, never reorder or overwrite existing headers.
  });
  SpreadsheetApp.getUi().alert('Reliable sync prepared. Existing ledger tables were not changed.');
}

function syncJournal_(ss) {
  const sheet = ss.getSheetByName('SYNC_JOURNAL');
  if (!sheet) throw new Error('SYNC_NOT_PREPARED');
  const headers = sheet.getRange(1, 1, 1, SYNC_HEADERS.length).getValues()[0];
  if (JSON.stringify(headers) !== JSON.stringify(SYNC_HEADERS)) throw new Error('SYNC_SCHEMA_MISMATCH');
  return sheet;
}
function syncFields_(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => keys.indexOf(k) < 0)) fail_('Unsupported sync fields.');
}
function syncHash_(table, record) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(colsOf_(table).map(col => record[col])), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function syncCleanRecord_(table, record) {
  const clean = {};
  colsOf_(table).forEach(col => { clean[col] = record[col]; });
  return clean;
}
function syncText_(value, max, required, name) {
  if (typeof value !== 'string') fail_('Invalid ' + name + '.');
  const text = text_(value, max, required, name);
  if (/^[=+@-]/.test(text)) fail_(name + ' cannot begin with a formula marker.');
  return text;
}
function syncValidate_(request) {
  syncFields_(request, ['version', 'mutationId', 'operation', 'table', 'recordId', 'baseFingerprint', 'values']);
  if (request.version !== 1 || ['add', 'edit'].indexOf(request.operation) < 0 ||
      ['INCOME', 'TRANSACTIONS'].indexOf(request.table) < 0) fail_('Unsupported sync action.');
  if (typeof request.mutationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/.test(request.mutationId)) fail_('Invalid mutation ID.');
  const prefix = request.table === 'INCOME' ? 'inc_' : 'txn_';
  if (typeof request.recordId !== 'string' || request.recordId.indexOf(prefix) !== 0 ||
      !/^[A-Za-z0-9_-]{8,80}$/.test(request.recordId)) fail_('Invalid record ID.');
  if (request.operation === 'edit' && (typeof request.baseFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(request.baseFingerprint))) fail_('An edit needs the base fingerprint.');
  if (request.operation === 'add' && request.baseFingerprint !== undefined) fail_('An addition cannot have a base fingerprint.');
  const fields = request.table === 'INCOME' ? ['periodId', 'date', 'amountMinor', 'kind', 'source', 'note'] : ['periodId', 'date', 'amountMinor', 'categoryId', 'note'];
  syncFields_(request.values, fields);
  const values = request.values;
  if (!Object.keys(values).length) fail_('No changes supplied.');
  if (request.operation === 'add' && fields.some(k => values[k] === undefined)) fail_('An addition needs all record fields.');
  if (values.amountMinor !== undefined && (!Number.isSafeInteger(values.amountMinor) || values.amountMinor <= 0 || values.amountMinor > MAX_AMOUNT * 100)) fail_('Invalid minor-unit amount.');
  if (values.date !== undefined) {
    if (typeof values.date !== 'string') fail_('Invalid date.');
    dateIn_(values.date, 'date');
  }
  ['periodId', 'categoryId'].forEach(k => { if (values[k] !== undefined && (typeof values[k] !== 'string' || !values[k] || values[k].length > 80)) fail_('Invalid ' + k + '.'); });
  if (values.kind !== undefined && ENUMS.INCOME.kind.indexOf(values.kind) < 0) fail_('Invalid income kind.');
  if (values.note !== undefined) syncText_(values.note, 200, false, 'Note');
  if (values.source !== undefined) syncText_(values.source, 60, false, 'Source');
  // Stable serialization also rejects key re-use with different payloads after a lost response.
  const canonical = { version: 1, mutationId: request.mutationId, operation: request.operation, table: request.table, recordId: request.recordId };
  if (request.baseFingerprint !== undefined) canonical.baseFingerprint = request.baseFingerprint;
  canonical.values = {};
  fields.forEach(k => { if (values[k] !== undefined) canonical.values[k] = values[k]; });
  return canonical;
}
function syncAfter_(ss, request, before) {
  const income = request.table === 'INCOME', v = request.values;
  const result = before ? syncCleanRecord_(request.table, before) : income ? {
    income_id: request.recordId, period_id: '', received_date: '', amount: 0, kind: '', source: '', note: '', created_at: stamp_(), updated_at: stamp_(), deleted_at: ''
  } : { txn_id: request.recordId, period_id: '', category_id: '', type: 'EXPENSE', txn_date: '', amount: 0, note: '', created_at: stamp_(), updated_at: stamp_(), deleted_at: '' };
  const mapping = income ? {periodId:'period_id', date:'received_date', kind:'kind', source:'source', note:'note'} : {periodId:'period_id', date:'txn_date', categoryId:'category_id', note:'note'};
  Object.keys(mapping).forEach(k => {
    if (v[k] !== undefined) result[mapping[k]] = k === 'note' ? syncText_(v[k], 200, false, 'Note') : k === 'source' ? syncText_(v[k], 60, false, 'Source') : v[k];
  });
  if (v.amountMinor !== undefined) result.amount = v.amountMinor / 100;
  result.updated_at = stamp_();
  findPeriod_(ss, result.period_id);
  if (!income) findCategory_(ss, result.category_id, 'SPENDING');
  return result;
}
function syncCurrent_(ss, table, id) {
  const key = table === 'INCOME' ? 'income_id' : 'txn_id';
  const matches = readTable_(ss, table, true).filter(r => r[key] === id);
  if (matches.length > 1) throw new Error('SYNC_DUPLICATE_RECORD_ID');
  return matches[0] || null;
}
function syncLinked_(ss, request) {
  return request.table === 'TRANSACTIONS' && readTable_(ss, 'LOAN_PAYMENTS', true).some(p => p.txn_id === request.recordId);
}
function syncFinish_(sheet, rowNumber, status, receipt) {
  // Commit status and receipt together, leaving the original before/after audit data intact.
  const row = sheet.getRange(rowNumber, 1, 1, SYNC_HEADERS.length).getValues()[0];
  row[2] = status; row[7] = JSON.stringify(receipt);
  sheet.getRange(rowNumber, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  SpreadsheetApp.flush();
  return receipt;
}

/** Public RPC. A client must confirm the exact proposal before invoking this endpoint. */
function syncLedgerMutation(pin, input) {
  requirePinForWrite_(pin);
  const request = syncValidate_(input), requestJson = JSON.stringify(request);
  return withLock_(function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet(); TZ_ = ss.getSpreadsheetTimeZone();
    const journal = syncJournal_(ss), count = journal.getLastRow();
    const entries = count > 1 ? journal.getRange(2, 1, count - 1, SYNC_HEADERS.length).getValues() : [];
    const matches = entries.map((row, index) => ({row:row, number:index + 2})).filter(x => x.row[0] === request.mutationId);
    if (matches.length > 1) throw new Error('SYNC_DUPLICATE_MUTATION_ID');
    let entry = matches[0];
    if (entry) {
      if (entry.row[1] !== requestJson) throw new Error('SYNC_KEY_REUSED');
      if (entry.row[2] === 'COMMITTED' || entry.row[2] === 'CONFLICT') return JSON.parse(entry.row[7]);
      if (entry.row[2] !== 'PREPARED') throw new Error('SYNC_JOURNAL_CORRUPT');
    }
    let current = syncCurrent_(ss, request.table, request.recordId);
    if (!entry) {
      if ((request.operation === 'add' && current) || (request.operation === 'edit' && (!current || current.deleted_at || syncHash_(request.table, current) !== request.baseFingerprint))) {
        return {status:'conflict', mutationId:request.mutationId, recordId:request.recordId, remote:current ? syncCleanRecord_(request.table, current) : null, fingerprint:current ? syncHash_(request.table,current) : null};
      }
      if (syncLinked_(ss, request) || (current && current.type && current.type !== 'EXPENSE')) fail_('Only ordinary expenses can be synced or edited here.');
      const after = syncAfter_(ss, request, current);
      const row = [request.mutationId, requestJson, 'PREPARED', request.table, request.recordId, current ? JSON.stringify(syncCleanRecord_(request.table,current)) : '', JSON.stringify(after), '', stamp_()];
      const number = journal.getLastRow() + 1;
      if (journal.getMaxRows() < number) journal.insertRowsAfter(journal.getMaxRows(), 100);
      journal.getRange(number, 1, 1, row.length).setNumberFormat('@').setValues([row]);
      SpreadsheetApp.flush(); // Persist intent before touching the financial row.
      entry = {row:row, number:number};
    }
    const after = JSON.parse(entry.row[6]), before = entry.row[5] ? JSON.parse(entry.row[5]) : null;
    const afterHash = syncHash_(request.table, after);
    current = syncCurrent_(ss, request.table, request.recordId);
    // If the row already equals the intended result, recover the receipt without reapplying.
    if (!(current && syncHash_(request.table,current) === afterHash)) {
      const baseMatches = before ? current && syncHash_(request.table,current) === syncHash_(request.table,before) : !current;
      if (!baseMatches || syncLinked_(ss,request)) {
        return syncFinish_(journal,entry.number,'CONFLICT',{status:'conflict',mutationId:request.mutationId,recordId:request.recordId,remote:current ? syncCleanRecord_(request.table,current) : null,fingerprint:current ? syncHash_(request.table,current) : null});
      }
      // Recheck relationships after a crash before replaying the prepared write.
      findPeriod_(ss, after.period_id);
      if (request.table === 'TRANSACTIONS') findCategory_(ss,after.category_id,'SPENDING');
      if (current) {
        const cols = colsOf_(request.table);
        ss.getSheetByName(request.table).getRange(current._row,1,1,cols.length).setNumberFormats([cols.map(colFmt_)]).setValues([cols.map(c => after[c])]);
      } else appendRows_(ss,request.table,[after]);
      SpreadsheetApp.flush();
    }
    // A concurrent human Sheet edit is not serialized by LockService. Never acknowledge a different value.
    const persisted = syncCurrent_(ss,request.table,request.recordId);
    if (!persisted || syncHash_(request.table,persisted) !== afterHash) {
      return syncFinish_(journal,entry.number,'CONFLICT',{status:'conflict',mutationId:request.mutationId,recordId:request.recordId,remote:persisted ? syncCleanRecord_(request.table,persisted) : null,fingerprint:persisted ? syncHash_(request.table,persisted) : null});
    }
    return syncFinish_(journal,entry.number,'COMMITTED',{status:'committed',mutationId:request.mutationId,recordId:request.recordId,record:syncCleanRecord_(request.table,persisted),fingerprint:afterHash});
  });
}
