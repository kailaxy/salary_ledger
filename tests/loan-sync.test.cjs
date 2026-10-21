const {test}=require('node:test'),assert=require('node:assert/strict');
const {loanFixture:fixture}=require('./helpers/loan-server.cjs');

test('loan payment atomically acknowledges permanent payment, expense and status; repeats never duplicate',()=>{
 const e=fixture(),r=e.request(),receipt=e.runLoan(r);
 assert.equal(receipt.status,'committed');assert.equal(receipt.record.txn_id,'txn_client_00000001');assert.equal(receipt.expense.record.amount,500);assert.equal(receipt.record.installment_id,'ins_first');
 assert.equal(e.runLoan(r).fingerprint,receipt.fingerprint);assert.equal(e.rows('LOAN_PAYMENTS').length,1);assert.equal(e.rows('TRANSACTIONS').length,1);
 assert.throws(()=>e.runLoan({...r,values:{...r.values,note:'Changed'}}),/SYNC_KEY_REUSED/);
 const final=e.request(false);final.recordId='pay_client_00000002';final.mutationId='request_loan_000002';
 const last=e.runLoan(final);assert.equal(last.record.txn_id,'');assert.equal(last.record.installment_id,'ins_second');assert.equal(last.expense,null);assert.equal(last.loan.record.status,'PAID');assert.equal(e.rows('TRANSACTIONS').length,1);
});
test('loan recovery handles every flush boundary with and without a mirrored expense',()=>{
 for(const mirror of [false,true])for(let crash=1;crash<=(mirror?5:4);crash++){
  const e=fixture(),r=e.request(mirror);r.values.amountMinor=100000;e.crashAt(crash);
  assert.throws(()=>e.runLoan(r),/SIMULATED_CRASH/);e.reset();
  const receipt=e.runLoan(r);assert.equal(receipt.status,'committed');assert.equal(receipt.loan.record.status,'PAID');
  assert.equal(e.rows('LOAN_PAYMENTS').length,1);assert.equal(e.rows('TRANSACTIONS').length,mirror?1:0);
  assert.equal(e.runLoan(r).fingerprint,receipt.fingerprint);
 }
});
test('competing payment and changed schedule/base reject before either financial effect',()=>{
 for(const change of ['payment','schedule','loan','deleted']){
  const e=fixture(),r=e.request();
  if(change==='payment')e.put('LOAN_PAYMENTS',{payment_id:'pay_other',loan_id:'lon_test',amount:100});
  if(change==='schedule')e.sheets.LOAN_INSTALLMENTS.rows[1][e.ctx.colsOf_('LOAN_INSTALLMENTS').indexOf('amount_due')]=600;
  if(change==='loan')e.sheets.LOANS.rows[1][e.ctx.colsOf_('LOANS').indexOf('total_payable')]=1200;
  if(change==='deleted')e.sheets.LOANS.rows[1][e.ctx.colsOf_('LOANS').indexOf('deleted_at')]='2026-10-22';
  assert.equal(e.runLoan(r).status,'conflict');assert.equal(e.rows('TRANSACTIONS').length,0);
  assert.equal(e.rows('LOAN_PAYMENTS').length,change==='payment'?1:0);
 }
});
test('prepared but untouched payment becomes terminal conflict when another device changed its base',()=>{
 const e=fixture(),r=e.request();e.crashAt(1);assert.throws(()=>e.runLoan(r),/SIMULATED_CRASH/);e.reset();
 e.put('LOAN_PAYMENTS',{payment_id:'pay_other',loan_id:'lon_test',amount:100});
 assert.equal(e.runLoan(r).status,'conflict');assert.equal(e.runLoan(r).status,'conflict');assert.equal(e.rows('TRANSACTIONS').length,0);
});
test('application reads and unrelated writes recover a partially applied loan payment first',()=>{
 for(const read of [true,false]){
  const e=fixture(),r=e.request();e.crashAt(2);assert.throws(()=>e.runLoan(r),/SIMULATED_CRASH/);e.reset();
  if(read){e.ctx.buildState_=()=>({payments:e.rows('LOAN_PAYMENTS').length,expenses:e.rows('TRANSACTIONS').length});const state=e.ctx.getState('123456');assert.equal(state.payments,1);assert.equal(state.expenses,1);}
  else e.run({version:1,ledgerId:'test-ledger',mutationId:'request_ordinary_001',operation:'add',table:'INCOME',recordId:'inc_ordinary_001',values:{periodId:'per_test',date:'2026-10-22',amountMinor:500,kind:'SALARY',source:'Work',note:''}});
  assert.equal(e.rows('LOAN_PAYMENTS').length,1);assert.equal(e.rows('TRANSACTIONS').length,1);
 }
});
test('human edits to a partial payment block reads/writes without deleting intent or fabricating a receipt',()=>{
 const e=fixture(),r=e.request();e.crashAt(2);assert.throws(()=>e.runLoan(r),/SIMULATED_CRASH/);e.reset();
 const col=e.ctx.colsOf_('TRANSACTIONS').indexOf('amount');e.sheets.TRANSACTIONS.rows[1][col]=999;
 e.ctx.buildState_=()=>({});assert.throws(()=>e.ctx.getState('123456'),/SYNC_LOAN_RECOVERY_REQUIRED/);
 assert.equal(e.rows('LOAN_PAYMENTS').length,0);assert.equal(e.sheets.SYNC_JOURNAL.rows[1][2],'PREPARED');
 e.sheets.TRANSACTIONS.rows[1][col]=500;assert.equal(e.runLoan(r).status,'committed');
});
test('loan sync validates PIN, ledger, amounts, dates, categories, formula notes and strict fields',()=>{
 const e=fixture(),r=e.request();assert.throws(()=>e.ctx.syncLoanPayment('bad',r),/BAD_PIN/);
 assert.throws(()=>e.runLoan({...r,ledgerId:'other'}),/SYNC_WRONG_LEDGER/);
 for(const values of [{amountMinor:0},{amountMinor:1.1},{date:'2026-02-30'},{note:'=NOW()'},{alsoSpend:'true'},{categoryId:'missing'},{unexpected:true}])assert.throws(()=>e.runLoan({...r,values:{...r.values,...values}}));
 assert.equal(e.runLoan({...r,values:{...r.values,amountMinor:100001}}).status,'conflict');
 assert.equal(e.rows('LOAN_PAYMENTS').length,0);assert.equal(e.rows('TRANSACTIONS').length,0);
});
