const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/operations-server.cjs');
const cat=(kind='SPENDING',name='Rent')=>({kind,name,group:'Home',archived:false,...(kind==='FUND'?{target:5000,targetDate:'2027-01-01'}:{})});
test('embedded planner exactly matches Apps Script and SHA-256 handles UTF-8, padding boundaries and long contexts',()=>{
 const e=fixture(),html=fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8'),source=fs.readFileSync(path.join(__dirname,'../Operations.gs'),'utf8');assert.ok(html.includes('<script>\n'+source+'</script>'));
 for(const text of ['','abc','漢字 ₱',...Array.from({length:130},(_,n)=>'x'.repeat(n)),'x'.repeat(50000)])assert.equal(e.ctx.LedgerOperations.hash(text),crypto.createHash('sha256').update(text).digest('hex'));
});
test('category/fund and goal, multi-period budget, archive/restore and deletion retain stable IDs',()=>{
 const e=fixture();e.put('PAY_PERIODS',{period_id:'per_later',label:'Nov',pay_date:'2026-11-15'});e.put('PAY_PERIODS',{period_id:'per_closed',label:'Dec',pay_date:'2026-12-15',is_closed:true});
 const p=e.propose('saveCategory',[cat('FUND','Emergency')]),r=e.runOp(p),id=r.changes[0].record.category_id;
 assert.equal(r.changes.length,2);assert.equal(e.runOp(p).changes[0].record.category_id,id);assert.equal(e.rows('FUND_GOALS').length,1);
 e.runOp(e.propose('setBudget',[{periodId:'per_test',categoryId:id,amount:100,applyToFuture:true}]));assert.equal(e.rows('BUDGET_LINES').length,2);
 const edit={...cat('FUND','Safety'),id,archived:true,target:6000};e.runOp(e.propose('saveCategory',[edit]));assert.equal(e.rows('CATEGORIES').find(c=>c.category_id===id).is_archived,true);
 e.runOp(e.propose('saveCategory',[{...edit,archived:false}]));e.runOp(e.propose('deleteCategory',[id]));assert.ok(e.rows('CATEGORIES').find(c=>c.category_id===id).deleted_at);assert.ok(e.rows('BUDGET_LINES').every(b=>b.deleted_at));assert.ok(e.rows('FUND_GOALS')[0].deleted_at);
});
test('loan creation uses exact schedules and cents; rename preserves schedule; deletion soft-deletes bundle',()=>{
 const e=fixture(),r=e.runOp(e.propose('saveLoan',[{name:'Laptop',lender:'Store',principal:100,total:100.01,count:3,frequency:'MONTHLY',firstDue:'2028-01-31'}])),loan=r.changes[0].record;
 const items=e.rows('LOAN_INSTALLMENTS').filter(i=>i.loan_id===loan.loan_id);assert.deepEqual(Array.from(items,i=>i.due_date),['2028-01-31','2028-02-29','2028-03-31']);assert.equal(items.reduce((n,i)=>n+Math.round(i.amount_due*100),0),10001);
 e.runOp(e.propose('saveLoan',[{id:loan.loan_id,name:'Computer',lender:'Bank'}]));assert.equal(e.rows('LOAN_INSTALLMENTS').filter(i=>i.loan_id===loan.loan_id).length,3);
 e.runOp(e.propose('deleteLoan',[loan.loan_id]));assert.ok(e.rows('LOAN_INSTALLMENTS').filter(i=>i.loan_id===loan.loan_id).every(i=>i.deleted_at));
});
test('payment edits and deletion update mirror and loan status together without changing installment history',()=>{
 const e=fixture(),pay=e.runLoan(e.request());
 e.runOp(e.propose('editRecord',[{table:'LOAN_PAYMENTS',id:pay.recordId,date:'2026-10-23',amount:1000,note:'Full',alsoSpend:true,periodId:'per_test',categoryId:'cat_food'}]));
 assert.equal(e.rows('LOANS')[0].status,'PAID');assert.equal(e.rows('TRANSACTIONS')[0].amount,1000);assert.equal(e.rows('LOAN_PAYMENTS')[0].installment_id,'ins_first');
 e.runOp(e.propose('editRecord',[{table:'LOAN_PAYMENTS',id:pay.recordId,date:'2026-10-23',amount:250,note:'Partial',alsoSpend:false,periodId:'',categoryId:''}]));assert.equal(e.rows('LOANS')[0].status,'ACTIVE');assert.ok(e.rows('TRANSACTIONS')[0].deleted_at);assert.equal(e.rows('LOAN_PAYMENTS')[0].txn_id,'');
 e.runOp(e.propose('deleteRecord',['loanpay',pay.recordId]));assert.ok(e.rows('LOAN_PAYMENTS')[0].deleted_at);assert.equal(e.snapshot().state.summary.loanRemaining,1000);
});
test('fund edits/deletion cannot overdraw or archive a nonempty fund; used categories retain history',()=>{
 const e=fixture(),r=e.runOp(e.propose('saveCategory',[cat('FUND','Reserve')])),id=r.changes[0].record.category_id;
 e.run({version:1,ledgerId:'test-ledger',mutationId:'request_fund_00000001',operation:'add',table:'TRANSACTIONS',recordId:'txn_fund_in_000001',values:{periodId:'per_test',categoryId:id,date:'2026-10-22',amountMinor:10000,note:'Deposit',type:'FUND_IN'}});
 e.run({version:1,ledgerId:'test-ledger',mutationId:'request_fund_00000002',operation:'add',table:'TRANSACTIONS',recordId:'txn_fund_out_000001',values:{periodId:'per_test',categoryId:id,date:'2026-10-22',amountMinor:6000,note:'Withdrawal',type:'FUND_OUT'}});
 for(const [action,args] of [['editRecord',[{table:'TRANSACTIONS',id:'txn_fund_in_000001',amount:50,date:'2026-10-22',note:'Less',periodId:'per_test',categoryId:id}]],['deleteRecord',['txn','txn_fund_in_000001']],['saveCategory',[{...cat('FUND','Reserve'),id,archived:true}]],['deleteCategory',[id]]])assert.throws(()=>e.runOp(e.propose(action,args)));
 assert.equal(e.snapshot().state.summary.inFunds,40);
});
test('settings and generation preserve old periods, skip closed/existing dates, and confirm exact year',()=>{
 const e=fixture();e.runOp(e.propose('saveSettings',[{appName:'My Ledger',payDays:'15,EOM'}]));const p=e.propose('generatePeriods',[2028]);e.runOp(p);assert.equal(e.snapshot().state.app.name,'My Ledger');assert.equal(e.rows('PAY_PERIODS').filter(p=>p.pay_date.startsWith('2028')).length,24);assert.ok(e.rows('PAY_PERIODS').some(p=>p.pay_date==='2028-02-29'));e.runOp(e.propose('generatePeriods',[2028]));assert.equal(e.rows('PAY_PERIODS').filter(p=>p.pay_date.startsWith('2028')).length,24);
});
test('operation context ignores row order/audit-only changes but catches direct content edits and reused keys',()=>{
 const e=fixture(),p=e.propose('saveCategory',[cat()]);e.sheets.CATEGORIES.rows[1][e.ctx.colsOf_('CATEGORIES').indexOf('updated_at')]='another timestamp';const r=e.runOp(p);assert.equal(r.status,'committed');assert.throws(()=>e.runOp({...p,values:{...p.values,args:[cat('SPENDING','Changed')]}}),/SYNC_KEY_REUSED/);
 const budget=e.propose('setBudget',[{periodId:'per_test',categoryId:'cat_food',amount:100,applyToFuture:false}]);e.sheets.CATEGORIES.rows[1][e.ctx.colsOf_('CATEGORIES').indexOf('name')]='Edited in Sheet';assert.equal(e.runOp(budget).status,'conflict');assert.equal(e.rows('BUDGET_LINES').length,0);
});
test('all multirow operation crash boundaries recover before reads with no duplicates or half-applied bundles',()=>{
 const actions=[['saveCategory',[cat('FUND','Crash Fund')]],['saveLoan',[{name:'Crash Loan',lender:'',principal:10,total:10,count:3,frequency:'WEEKLY',firstDue:'2026-10-22'}]],['saveSettings',[{appName:'Crash',payDays:'10,25'}]],['generatePeriods',[2027]]];
 for(const [action,args] of actions){const probe=fixture(),probeRequest=probe.propose(action,args);probe.crashAt(0);const count=probe.runOp(probeRequest).changes.length,boundaries=probe.flushCount();
  for(let point=1;point<=boundaries;point++){const e=fixture(),p=e.propose(action,args);e.crashAt(point);assert.throws(()=>e.runOp(p),/SIMULATED_CRASH/);e.reset();const snapshot=e.snapshot(),r=e.runOp(p);assert.equal(r.status,'committed');assert.equal(r.changes.length,count);for(const t of Object.keys(snapshot.tables)){const keys=snapshot.tables[t].map(x=>x.record[e.ctx.colsOf_(t)[0]]);assert.equal(new Set(keys).size,keys.length);}}}
});
test('partial bundle modified by a human blocks reads until restored, preserving journal and rows',()=>{
 const e=fixture(),p=e.propose('saveCategory',[cat('FUND','Partial')]);e.crashAt(2);assert.throws(()=>e.runOp(p),/SIMULATED_CRASH/);e.reset();const row=e.sheets.CATEGORIES.rows.at(-1),col=e.ctx.colsOf_('CATEGORIES').indexOf('name');row[col]='Human edit';assert.throws(()=>e.snapshot(),/SYNC_OPERATION_RECOVERY_REQUIRED/);assert.equal(e.sheets.SYNC_JOURNAL.rows.at(-1)[2],'PREPARED');row[col]='Partial';assert.equal(e.runOp(p).status,'committed');
});
test('malformed fields, unsafe text, invalid dates/precision, unsupported edits and authentication fail before writes',()=>{
 const e=fixture();assert.throws(()=>e.ctx.syncOperation('bad',e.propose('saveSettings',[{appName:'x',payDays:'15'}])),/BAD_PIN/);
 for(const [action,args] of [['saveCategory',[cat('SPENDING','=NOW()')]],['setBudget',[{periodId:'per_test',categoryId:'cat_food',amount:'1.001',applyToFuture:false}]],['saveLoan',[{id:'lon_test',name:'x',lender:'',total:999}]],['generatePeriods',[2101]],['saveSettings',[{appName:'x',payDays:'29'}]],['saveCategory',[{...cat(),code:'eval'}]]])assert.throws(()=>e.runOp(e.propose(action,args)));
 assert.equal(e.sheets.SYNC_JOURNAL.rows.length,1);
});
test('maximum loan schedule stays bounded and recovers a partially written batch without duplicates',()=>{
 const e=fixture(),p=e.propose('saveLoan',[{name:'Long term',lender:'Store',principal:120,total:120,count:120,frequency:'WEEKLY',firstDue:'2026-11-01'}]),sheet=e.sheets.LOAN_INSTALLMENTS,original=sheet.getRange.bind(sheet);let injected=false;
 sheet.getRange=function(start,col,n=1,m=1){const range=original(start,col,n,m);if(n>1&&!injected){const write=range.setValues.bind(range);range.setValues=function(values){injected=true;original(start,col,1,m).setValues(values.slice(0,1));throw Error('SIMULATED_PARTIAL_BATCH');};}return range;};
 assert.throws(()=>e.runOp(p),/SIMULATED_PARTIAL_BATCH/);sheet.getRange=original;const r=e.runOp(p);assert.equal(r.status,'committed');const loan=r.changes.find(c=>c.table==='LOANS').record,items=e.rows('LOAN_INSTALLMENTS').filter(i=>i.loan_id===loan.loan_id);assert.equal(items.length,120);assert.equal(new Set(items.map(i=>i.installment_id)).size,120);assert.equal(items.reduce((n,i)=>n+Math.round(i.amount_due*100),0),12000);
});

test('replaying full rows does not turn unsafe historical text into a Sheet formula',()=>{
 const e=fixture();e.put('INCOME',{income_id:'inc_unsafe',period_id:'per_test',received_date:'2026-10-22',amount:1,kind:'OTHER',source:'=HYPERLINK("bad")',note:''});
 assert.throws(()=>e.runOp(e.propose('deleteRecord',['income','inc_unsafe'])),/formula marker/);assert.equal(e.rows('INCOME')[0].deleted_at,'');
});
test('physical Sheet row reordering cannot change deterministic future-budget IDs or targets',()=>{
 const e=fixture();e.put('PAY_PERIODS',{period_id:'per_z',label:'November',pay_date:'2026-11-15'});e.put('PAY_PERIODS',{period_id:'per_a',label:'December',pay_date:'2026-12-15'});
 const s=e.snapshot(),p=e.propose('setBudget',[{periodId:'per_test',categoryId:'cat_food',amount:123.45,applyToFuture:true}],s),proposal=e.ctx.LedgerOperations.plan(s,p.values.action,p.values.args,p.mutationId,'client timestamp');
 e.sheets.PAY_PERIODS.rows.splice(1,e.sheets.PAY_PERIODS.rows.length-1,...e.sheets.PAY_PERIODS.rows.slice(1).reverse());const r=e.runOp(p);assert.equal(r.status,'committed');e.ctx.LedgerOperations.receipt({proposalRecord:proposal},r);assert.equal(new Set(e.rows('BUDGET_LINES').map(b=>b.line_id)).size,3);assert.ok(e.rows('BUDGET_LINES').every(b=>b.planned_amount===123.45));
});
test('Apps Script planner binds explicitly even when globalThis is a separate object',()=>{
 const vm=require('node:vm'),ctx=vm.createContext({globalThis:{}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../Operations.gs'),'utf8'),ctx);
 assert.equal(typeof ctx.LedgerOperations.plan,'function');
});
test('snapshot explains missing operation dependencies and unprepared journal',()=>{
 const e=fixture();assert.equal(e.snapshot().capabilities.operationSyncVersion,1);
 e.ctx.LedgerOperations=undefined;assert.match(e.snapshot().syncDiagnostics.operationIssue,/Operations.gs/);
 const other=fixture();other.ctx.syncJournal_=()=>{throw Error('bad journal');};
 assert.equal(other.snapshot().capabilities.operationSyncVersion,0);
 assert.match(other.snapshot().syncDiagnostics.operationIssue,/Prepare reliable sync/);
});
