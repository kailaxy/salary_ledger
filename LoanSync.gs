/** Add-only offline loan payments. Shares the prepared SYNC_JOURNAL; no schema changes. */
function loanSyncVersion_() { return 1; }
function loanSyncRow_(ss, table, id) {
  const key = colsOf_(table)[0], rows = readTable_(ss,table,true).filter(r => r[key] === id);
  if (rows.length > 1) throw new Error('SYNC_DUPLICATE_RECORD_ID');
  return rows[0] || null;
}
function loanSyncContext_(ss, loanId, excludePaymentId) {
  const loan = loanSyncRow_(ss,'LOANS',loanId);
  if (!loan || loan.deleted_at) return null;
  const installments = readTable_(ss,'LOAN_INSTALLMENTS').filter(r => r.loan_id === loanId);
  const payments = readTable_(ss,'LOAN_PAYMENTS').filter(r => r.loan_id === loanId && r.payment_id !== excludePaymentId);
  return {loan:loan, fingerprint:syncHash_('LOANS',loan), paidMinor:payments.reduce((n,r) => n + Math.round(r.amount*100),0),
    schedule:installments.map(r => r.installment_id + ':' + syncHash_('LOAN_INSTALLMENTS',r)).sort(),
    metrics:loanMetrics_(loan,installments,payments,'0000-00-00')};
}
function loanSyncValidate_(input) {
  syncFields_(input,['version','ledgerId','mutationId','operation','table','recordId','baseFingerprint','values']);
  if (input.version !== 1 || input.table !== 'LOAN_PAYMENTS' || input.operation !== 'add' ||
      typeof input.ledgerId !== 'string' || !input.ledgerId || input.ledgerId.length > 200 ||
      typeof input.mutationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/.test(input.mutationId) ||
      typeof input.recordId !== 'string' || !/^pay_[A-Za-z0-9_-]{4,76}$/.test(input.recordId) ||
      typeof input.baseFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.baseFingerprint)) fail_('Invalid loan payment request.');
  const fields=['loanId','date','amountMinor','note','alsoSpend','periodId','categoryId','expectedPaidMinor','schedule'], v=input.values;
  syncFields_(v,fields);
  if (fields.some(k => v[k] === undefined)) fail_('Complete all loan payment fields.');
  if (typeof v.loanId !== 'string' || !v.loanId || v.loanId.length > 80 ||
      !Number.isSafeInteger(v.amountMinor) || v.amountMinor <= 0 || v.amountMinor > MAX_AMOUNT*100 ||
      !Number.isSafeInteger(v.expectedPaidMinor) || v.expectedPaidMinor < 0 || typeof v.alsoSpend !== 'boolean') fail_('Invalid loan amount or reference.');
  if (typeof v.date !== 'string') fail_('Invalid payment date.');
  dateIn_(v.date,'date'); syncText_(v.note,200,false,'Note');
  if (typeof v.periodId !== 'string' || v.periodId.length > 80 || typeof v.categoryId !== 'string' || v.categoryId.length > 80 ||
      (!v.alsoSpend && (v.periodId || v.categoryId))) fail_('Invalid spending references.');
  if (!Array.isArray(v.schedule) || v.schedule.length > 120 || v.schedule.some(x => typeof x !== 'string' || !/^[A-Za-z0-9_-]{1,80}:[a-f0-9]{64}$/.test(x)) ||
      JSON.stringify(v.schedule) !== JSON.stringify(v.schedule.slice().sort()) || new Set(v.schedule).size !== v.schedule.length) fail_('Invalid installment context.');
  const request={version:1,ledgerId:input.ledgerId,mutationId:input.mutationId,operation:'add',table:'LOAN_PAYMENTS',recordId:input.recordId,baseFingerprint:input.baseFingerprint,values:{}};
  fields.forEach(k => request.values[k]=v[k]); return request;
}
function loanSyncConflict_(request, context) {
  return {status:'conflict',mutationId:request.mutationId,recordId:request.recordId,remote:null,fingerprint:null,
    reason:'LOAN_CHANGED',loanFingerprint:context ? context.fingerprint : null,paidMinor:context ? context.paidMinor : null};
}
function loanSyncSameContext_(request, context) {
  return context && context.fingerprint === request.baseFingerprint && context.paidMinor === request.values.expectedPaidMinor &&
    JSON.stringify(context.schedule) === JSON.stringify(request.values.schedule);
}
function loanSyncWrite_(ss, table, record) {
  const current=loanSyncRow_(ss,table,record[colsOf_(table)[0]]);
  if (current) {
    const cols=colsOf_(table);
    ss.getSheetByName(table).getRange(current._row,1,1,cols.length).setNumberFormats([cols.map(colFmt_)]).setValues([cols.map(k=>record[k])]);
  } else appendRows_(ss,table,[record]);
  SpreadsheetApp.flush();
}
function loanSyncRecoverEntry_(ss, journal, entry) {
  const request=JSON.parse(entry.row[1]), bundle=JSON.parse(entry.row[6]);
  const targets=(bundle.expense ? [{table:'TRANSACTIONS',record:bundle.expense}] : []).concat([{table:'LOAN_PAYMENTS',record:bundle.payment}]);
  const currents=targets.map(t=>loanSyncRow_(ss,t.table,t.record[colsOf_(t.table)[0]]));
  const partial=currents.some(Boolean), context=loanSyncContext_(ss,bundle.payment.loan_id,bundle.payment.payment_id);
  const beforeLoan=JSON.parse(entry.row[5]);
  const loanMatches=context && (context.fingerprint === syncHash_('LOANS',beforeLoan) || context.fingerprint === syncHash_('LOANS',bundle.loan));
  const relatedMatches=context && context.paidMinor === request.values.expectedPaidMinor && JSON.stringify(context.schedule) === JSON.stringify(request.values.schedule);
  const targetsMatch=currents.every((r,i)=>!r || syncHash_(targets[i].table,r) === syncHash_(targets[i].table,targets[i].record));
  if (!loanMatches || !relatedMatches || !targetsMatch) {
    // Before any financial row, a changed base can safely be rejected. Never abandon half a payment.
    if (!partial) return syncFinish_(journal,entry.number,'CONFLICT',loanSyncConflict_(request,context));
    throw new Error('SYNC_LOAN_RECOVERY_REQUIRED: A partially saved payment was changed directly in Sheets. Preserve the journal and restore its prepared values before retrying.');
  }
  if (bundle.expense && !currents[0]) { if(bundle.expense.period_id)findPeriod_(ss,bundle.expense.period_id); if(bundle.expense.category_id)findCategory_(ss,bundle.expense.category_id,'SPENDING'); }
  targets.forEach((t,i)=>{if (!currents[i]) loanSyncWrite_(ss,t.table,t.record);});
  if (context.fingerprint !== syncHash_('LOANS',bundle.loan)) loanSyncWrite_(ss,'LOANS',bundle.loan);
  // Verify all effects, including status, before issuing a durable acknowledgement.
  const records=targets.concat([{table:'LOANS',record:bundle.loan}]);
  if (records.some(t=>{const r=loanSyncRow_(ss,t.table,t.record[colsOf_(t.table)[0]]);return !r || syncHash_(t.table,r)!==syncHash_(t.table,t.record);})) throw new Error('SYNC_LOAN_RECOVERY_REQUIRED');
  return syncFinish_(journal,entry.number,'COMMITTED',{status:'committed',committedAt:new Date().toISOString(),mutationId:request.mutationId,recordId:request.recordId,
    record:bundle.payment,fingerprint:syncHash_('LOAN_PAYMENTS',bundle.payment),
    expense:bundle.expense ? {record:bundle.expense,fingerprint:syncHash_('TRANSACTIONS',bundle.expense)} : null,
    loan:{record:bundle.loan,fingerprint:syncHash_('LOANS',bundle.loan)}});
}
/** Must run under the script lock before any application read or write. */
function recoverPendingLoanPayments_(ss) {
  const sheet=ss.getSheetByName('SYNC_JOURNAL');if (!sheet || sheet.getLastRow() < 2) return;
  TZ_=ss.getSpreadsheetTimeZone();const journal=syncJournal_(ss);
  const entries=journal.getRange(2,1,journal.getLastRow()-1,SYNC_HEADERS.length).getValues();
  entries.forEach((row,i)=>{if (row[2]==='PREPARED' && row[3]==='LOAN_PAYMENTS') loanSyncRecoverEntry_(ss,journal,{row:row,number:i+2});});
}
/** Public RPC: exact confirmed add-only proposal, with a permanent payment and mirror ID. */
function syncLoanPayment(pin,input) {
  requirePinForWrite_(pin);const request=loanSyncValidate_(input), json=JSON.stringify(request);
  return withLock_(function(){
    const ss=SpreadsheetApp.getActiveSpreadsheet();TZ_=ss.getSpreadsheetTimeZone();
    if (request.ledgerId !== ss.getId()) throw new Error('SYNC_WRONG_LEDGER');
    const journal=syncJournal_(ss), count=journal.getLastRow();
    const entries=count>1 ? journal.getRange(2,1,count-1,SYNC_HEADERS.length).getValues() : [];
    const matches=entries.map((row,i)=>({row:row,number:i+2})).filter(x=>x.row[0]===request.mutationId);
    if (matches.length>1) throw new Error('SYNC_DUPLICATE_MUTATION_ID');
    if (matches.length) {
      const entry=matches[0];if (entry.row[1]!==json) throw new Error('SYNC_KEY_REUSED');
      if (entry.row[2]==='COMMITTED' || entry.row[2]==='CONFLICT') return JSON.parse(entry.row[7]);
      throw new Error('SYNC_JOURNAL_CORRUPT'); // Prepared entries were recovered before this callback.
    }
    const v=request.values, context=loanSyncContext_(ss,v.loanId);
    if (!loanSyncSameContext_(request,context)) return loanSyncConflict_(request,context);
    if (v.amountMinor > Math.round(context.loan.total_payable*100)-context.paidMinor) return loanSyncConflict_(request,context);
    const txnId=v.alsoSpend ? 'txn_'+request.recordId.slice(4) : '';
    if (loanSyncRow_(ss,'LOAN_PAYMENTS',request.recordId) || (txnId && loanSyncRow_(ss,'TRANSACTIONS',txnId))) return loanSyncConflict_(request,context);
    if (v.alsoSpend) { if(v.periodId)findPeriod_(ss,v.periodId);if(v.categoryId)findCategory_(ss,v.categoryId,'SPENDING'); }
    const stamp=stamp_(), note=syncText_(v.note,200,false,'Note');
    const payment=syncCleanRecord_('LOAN_PAYMENTS',{payment_id:request.recordId,loan_id:v.loanId,installment_id:context.metrics.next ? context.metrics.next.id : '',txn_id:txnId,paid_date:v.date,amount:v.amountMinor/100,note:note,created_at:stamp,updated_at:stamp,deleted_at:''});
    const expense=v.alsoSpend ? syncCleanRecord_('TRANSACTIONS',{txn_id:txnId,period_id:v.periodId,category_id:v.categoryId,type:'EXPENSE',txn_date:v.date,amount:v.amountMinor/100,note:note || ('Loan: '+context.loan.name),created_at:stamp,updated_at:stamp,deleted_at:''}) : null;
    const loan=syncCleanRecord_('LOANS',context.loan);loan.status=context.paidMinor+v.amountMinor>=Math.round(loan.total_payable*100) ? 'PAID' : 'ACTIVE';loan.updated_at=stamp;
    const row=[request.mutationId,json,'PREPARED','LOAN_PAYMENTS',request.recordId,JSON.stringify(syncCleanRecord_('LOANS',context.loan)),JSON.stringify({payment:payment,expense:expense,loan:loan}),'',stamp];
    const number=journal.getLastRow()+1;if (journal.getMaxRows()<number) journal.insertRowsAfter(journal.getMaxRows(),100);
    journal.getRange(number,1,1,row.length).setNumberFormat('@').setValues([row]);SpreadsheetApp.flush();
    return loanSyncRecoverEntry_(ss,journal,{row:row,number:number});
  });
}

function optionalLoanRecordingVersion_(){return 1;}
