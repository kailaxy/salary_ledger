const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{indexedDB}=require('fake-indexeddb');
const {fixture}=require('./helpers/operations-server.cjs');const html=fs.readFileSync(require('node:path').join(__dirname,'../Index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function client(){const c=vm.createContext({indexedDB,Intl,Date});for(const marker of ['Shared deterministic operation planner','Durable full-snapshot storage','Local single-record mutations','Read-only ledger query engine','Deterministic capability allowlist']){let src=scripts.find(s=>s.includes(marker));if(!src&&marker==='Read-only ledger query engine')src=fs.readFileSync(require('node:path').join(__dirname,'../web/ledger-query.js'),'utf8');vm.runInContext(src,c);}return c;}
let n=0;const now=new Date('2026-10-22T03:00:00Z');
function request(categoryId='',periodId='',type='EXPENSE',table='TRANSACTIONS'){const id=++n;return {version:1,ledgerId:'test-ledger',mutationId:'request_standalone_'+id,operation:'add',table,recordId:(table==='INCOME'?'inc_':'txn_')+'standalone_'+id,values:table==='INCOME'?{periodId,date:'2026-10-22',amountMinor:25000,kind:'SALARY',source:'',note:''}:{periodId,categoryId,date:'2026-10-22',amountMinor:25000,note:'Fare',type}};}
function setup(){const server=fixture();server.put('BUDGET_LINES',{line_id:'line_food',period_id:'per_test',category_id:'cat_food',planned_amount:1000});return {server,c:client()};}
test('standalone expense is durable, synchronizes idempotently, counts in spending and does not consume a plan',async()=>{
 const {server,c}=setup(),snapshot=server.snapshot();await c.LedgerLocal.save(snapshot);const p=request('cat_food'),rev=c.LedgerPending.revision(snapshot,[],p.table,p.recordId);await c.LedgerLocal.enqueue(p,rev);
 let view=await c.LedgerLocal.view(),s=c.LedgerPending.project(view.snapshot,view.entries);assert.equal(c.LedgerQuery.query(s,{action:'query',operation:'sum',kind:'expense',range:'current_period'},now).totalMinor,25000);
 assert.equal(c.LedgerQuery.query(s,{action:'query',operation:'budgets',kind:'expense',range:'current_period',categoryId:'cat_food',mode:'remaining'},now).budgets[0].remainingMinor,100000);assert.equal(s.state.summary.spent,250);assert.equal(s.state.periods[0].spent,250);
 const receipt=JSON.parse(JSON.stringify(server.run(p)));await c.LedgerLocal.acknowledge('test-ledger',p.mutationId,receipt);server.run(p);assert.equal(server.rows('TRANSACTIONS').length,1);assert.equal((await c.LedgerLocal.list('test-ledger')).length,0);
});
test('only explicitly linked expenses consume a plan; unlink/edit/delete preserve the plan',()=>{
 const {server,c}=setup(),p=request('cat_food','per_test');server.run(p);let s=server.snapshot();assert.equal(c.LedgerQuery.query(s,{action:'query',operation:'budgets',kind:'expense',range:'current_period',mode:'remaining',categoryId:'cat_food'},now).budgets[0].remainingMinor,75000);
 const op=server.propose('editRecord',[{table:'TRANSACTIONS',id:p.recordId,amount:250,date:'2026-10-22',note:'Still an actual expense',categoryId:'cat_food',periodId:''}]);server.runOp(op);s=server.snapshot();assert.equal(s.state.summary.spent,250);assert.equal(s.state.byCat.per_test?.cat_food||0,0);assert.equal(server.rows('BUDGET_LINES')[0].planned_amount,1000);
 server.runOp(server.propose('deleteRecord',['txn',p.recordId]));assert.equal(server.snapshot().state.summary.spent,0);assert.equal(server.rows('BUDGET_LINES')[0].planned_amount,1000);
});
test('recording needs neither categories nor periods; planning still requires both',()=>{
 const {server,c}=setup();server.sheets.PAY_PERIODS.rows.splice(1);server.sheets.CATEGORIES.rows.splice(1);server.run(request());const s=server.snapshot();assert.equal(s.state.summary.spent,250);assert.equal(s.state.recent[0].title,'Uncategorized');assert.equal(c.LedgerQuery.query(s,{action:'query',operation:'sum',kind:'expense',range:'this_month'},now).totalMinor,25000);assert.throws(()=>server.runOp(server.propose('setBudget',[{periodId:'',categoryId:'',amount:1000,applyToFuture:false}])));
});
test('income, fund movements and counted loan payments allow no period but retain real fund/loan invariants',()=>{
 const {server}=setup();server.run(request('','','EXPENSE','INCOME'));assert.equal(server.snapshot().state.summary.received,250);
 assert.throws(()=>server.run(request('','','FUND_IN')),/category|fund/i);server.put('CATEGORIES',{category_id:'cat_fund',name:'Safety',kind:'FUND'});server.run(request('cat_fund','','FUND_IN'));assert.equal(server.snapshot().state.summary.inFunds,250);assert.equal(server.snapshot().state.summary.spent,0);
 const pay=server.request();pay.values.periodId='';pay.values.categoryId='';server.runLoan(pay);assert.equal(server.rows('LOAN_PAYMENTS').length,1);const mirrored=server.rows('TRANSACTIONS').find(t=>t.type==='EXPENSE');assert.equal(mirrored.period_id,'');assert.equal(mirrored.category_id,'');assert.equal(server.snapshot().state.summary.spent,500);
});
test('modern assistant accepts arbitrary descriptions safely, defaults to unlinked, and offers only matching plans',()=>{
 const {server,c}=setup(),s=server.snapshot();for(const text of ['Add 80 fare','80 fare','Record 90 for school supplies']){const r=c.AssistantActions.interpret(text,s,now);assert.equal(r.type,'draft',text);const d=c.AssistantActions.resolve(r.id,r.params,s);assert.equal(d.params.periodId,'');assert.equal(d.params.categoryId,'');assert.ok(d.params.note);assert.equal(d.missing.length,0);}
 for(const text of ['Add 80 fare except yesterday','Add 80 fare and deposit 20','Add -80 fare','Add 80 fare tomorrow','Add $80 fare','Add 80k fare','Add 80 per day fare'])assert.notEqual(c.AssistantActions.interpret(text,s,now).type,'draft');
 assert.equal(c.AssistantActions.choices('expense.create','periodId',s,{categoryId:'cat_food'}).length,2);assert.equal(c.AssistantActions.choices('expense.create','periodId',s,{categoryId:''}).length,1);
});
test('unlinked fund edits/deletes retain overdraft checks and never affect expense totals',()=>{
 const {server}=setup();server.put('CATEGORIES',{category_id:'cat_fund',name:'Safety',kind:'FUND'});const deposit=request('cat_fund','','FUND_IN');server.run(deposit);server.runOp(server.propose('editRecord',[{table:'TRANSACTIONS',id:deposit.recordId,amount:300,date:'2026-10-22',note:'Revised deposit',periodId:'',categoryId:'cat_fund'}]));
 const withdrawal=request('cat_fund','','FUND_OUT');withdrawal.values.amountMinor=30100;assert.equal(server.run(withdrawal).status,'conflict');const validWithdrawal=request('cat_fund','','FUND_OUT');validWithdrawal.values.amountMinor=10000;server.run(validWithdrawal);assert.equal(server.snapshot().state.summary.inFunds,200);assert.equal(server.snapshot().state.summary.spent,0);
 assert.throws(()=>server.runOp(server.propose('deleteRecord',['txn',deposit.recordId])),/overdraw/i);assert.equal(server.snapshot().state.summary.inFunds,200);
});
test('unlinked counted loan payment edits and deletion maintain the mirror without a planning prerequisite',()=>{
 const {server}=setup();const pay=server.request();pay.values.periodId='';pay.values.categoryId='';server.runLoan(pay);const id=pay.recordId;
 server.runOp(server.propose('editRecord',[{table:'LOAN_PAYMENTS',id,amount:400,date:'2026-10-22',note:'Corrected',periodId:'',categoryId:'',alsoSpend:true}]));assert.equal(server.snapshot().state.summary.spent,400);assert.equal(server.rows('TRANSACTIONS').find(t=>!t.deleted_at).amount,400);
 server.runOp(server.propose('deleteRecord',['loanpay',id]));assert.equal(server.snapshot().state.summary.spent,0);assert.ok(server.rows('TRANSACTIONS')[0].deleted_at);assert.equal(server.rows('BUDGET_LINES')[0].planned_amount,1000);
});
test('partially updated deployments do not advertise optional references or queue incompatible requests',()=>{
 const {server,c}=setup();server.ctx.optionalLoanRecordingVersion_=undefined;const s=server.snapshot();assert.equal(s.capabilities.optionalPlanningVersion,0);const p=request();assert.throws(()=>c.LedgerPending.validate(s,[],p,c.LedgerPending.revision(s,[],p.table,p.recordId)),/Update.*Code.gs/);
});
