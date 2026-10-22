const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{indexedDB}=require('fake-indexeddb');
const {fixture}=require('./helpers/operations-server.cjs');const scripts=[...fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function client(){const c=vm.createContext({indexedDB,console});for(const marker of ['Shared deterministic operation planner','Durable full-snapshot storage','Local single-record mutations'])vm.runInContext(scripts.find(s=>s.includes(marker)),c);return {local:c.LedgerLocal,pending:c.LedgerPending,ops:c.LedgerOperations};}
let serial=0;
async function setup(){const server=fixture(),s=server.snapshot();s.ledgerId='ops-local-'+(++serial);s.capturedAt='2026-10-20T00:00:00.000Z';const c=client();await c.local.save(s);return {...c,server,s};}
function operation(e,action,args,snapshot,entries=[]){const base=snapshot||e.s,p=e.server.propose(action,args,base);p.ledgerId=e.s.ledgerId;return {p,revision:e.pending.operationRevision(e.s,entries,action)};}
async function next(e){const entries=await e.local.list(e.s.ledgerId),first=entries.find(x=>x.status==='pending'&&!x.dependsOn);assert.ok(first);return e.local.prepareSend(e.s.ledgerId,first.mutationId);}
async function commit(e,entry){const p={...entry.payload,ledgerId:'test-ledger'},r=entry.payload.table==='OPERATIONS'?e.server.runOp(p):entry.payload.table==='LOAN_PAYMENTS'?JSON.parse(JSON.stringify(e.server.runLoan(p))):JSON.parse(JSON.stringify(e.server.run(p)));await e.local.acknowledge(e.s.ledgerId,entry.mutationId,r);return r;}
test('offline category → budget → expense survive restart, resolve dependencies and retain permanent IDs',async()=>{
 const e=await setup(),a=operation(e,'saveCategory',[{kind:'SPENDING',name:'Rent',group:'Home',archived:false}]);await e.local.enqueue(a.p,a.revision);
 let entries=await e.local.list(e.s.ledgerId),projected=e.pending.project(e.s,entries),id=projected.state.categories.find(c=>c.name==='Rent').id;
 const b=operation(e,'setBudget',[{periodId:'per_test',categoryId:id,amount:1000,applyToFuture:false}],projected,entries);await e.local.enqueue(b.p,b.revision);
 entries=await e.local.list(e.s.ledgerId);const p={version:1,ledgerId:e.s.ledgerId,mutationId:'request_dependent_expense_'+serial,operation:'add',table:'TRANSACTIONS',recordId:'txn_dependent_expense_'+serial,values:{periodId:'per_test',categoryId:id,date:'2026-10-22',amountMinor:50000,note:'Rent paid'}};
 await e.local.enqueue(p,e.pending.revision(e.s,entries,p.table,p.recordId));entries=await client().local.list(e.s.ledgerId);assert.equal(entries[1].dependsOn,entries[0].mutationId);assert.equal(entries[2].dependsOn,entries[1].mutationId);
 projected=e.pending.project(e.s,entries);assert.equal(projected.state.plan.per_test[id],1000);assert.equal(projected.state.summary.spent,500);
 for(let i=0;i<3;i++)await commit(e,await next(e));assert.equal((await e.local.list(e.s.ledgerId)).length,0);assert.equal(e.server.snapshot().state.summary.spent,500);assert.equal(e.server.rows('BUDGET_LINES')[0].category_id,id);
});
test('offline new loan → payment rebases only audit fingerprints after schedule acknowledgement',async()=>{
 const e=await setup(),a=operation(e,'saveLoan',[{name:'Offline laptop',lender:'Store',principal:1000,total:1000,count:2,frequency:'MONTHLY',firstDue:'2026-11-01'}]);await e.local.enqueue(a.p,a.revision);
 const entries=await e.local.list(e.s.ledgerId),projected=e.pending.project(e.s,entries),loan=projected.state.loans.find(l=>l.name==='Offline laptop'),context=e.pending.loanContext(projected,loan.id);
 const p={version:1,ledgerId:e.s.ledgerId,mutationId:'request_dependent_loanpay_'+serial,operation:'add',table:'LOAN_PAYMENTS',recordId:'pay_dependent_loanpay_'+serial,baseFingerprint:context.fingerprint,values:{loanId:loan.id,date:'2026-10-22',amountMinor:50000,note:'First',alsoSpend:true,periodId:'per_test',categoryId:'cat_food',expectedPaidMinor:context.paidMinor,schedule:context.schedule}};
 await e.local.enqueue(p,e.pending.loanRevision(projected,entries,loan.id));await commit(e,await next(e));const ready=await next(e);assert.notEqual(ready.payload.baseFingerprint,'0'.repeat(64));assert.ok(ready.payload.values.schedule.every(x=>!x.endsWith('0'.repeat(64))));await commit(e,ready);
 assert.equal(e.server.snapshot().state.loans.find(l=>l.id===loan.id).remaining,500);assert.equal(e.server.snapshot().state.summary.spent,500);
});
test('queued ordinary edit after bundled record edit rebases its fingerprint without changing confirmed values',async()=>{
 const e=await setup(),add={version:1,ledgerId:'test-ledger',mutationId:'request_initial_expense_001',operation:'add',table:'TRANSACTIONS',recordId:'txn_initial_expense_001',values:{periodId:'per_test',categoryId:'cat_food',date:'2026-10-22',amountMinor:10000,note:'Old'}};e.server.run(add);e.s=e.server.snapshot();e.s.ledgerId='ops-rebase-'+serial;await e.local.save(e.s);
 const a=operation(e,'editRecord',[{table:'TRANSACTIONS',id:add.recordId,amount:200,date:'2026-10-22',note:'Bundled',periodId:'per_test',categoryId:'cat_food'}]);await e.local.enqueue(a.p,a.revision);
 const entries=await e.local.list(e.s.ledgerId),projected=e.pending.project(e.s,entries),item=projected.tables.TRANSACTIONS[0],p={...add,ledgerId:e.s.ledgerId,mutationId:'request_after_bundle_edit_'+serial,operation:'edit',baseFingerprint:item.fingerprint,values:{amountMinor:30000}};
 await e.local.enqueue(p,e.pending.revision(e.s,entries,p.table,p.recordId));await commit(e,await next(e));const ready=await next(e);assert.notEqual(ready.payload.baseFingerprint,p.baseFingerprint);await commit(e,ready);assert.equal(e.server.rows('TRANSACTIONS')[0].amount,300);
});
test('failed/lost replies retain identical attempted payloads; partial receipts never remove a bundle',async()=>{
 const e=await setup(),a=operation(e,'saveCategory',[{kind:'FUND',name:'Safety',group:'',archived:false,target:100,targetDate:''}]);await e.local.enqueue(a.p,a.revision);const first=await next(e);const receipt=e.server.runOp({...first.payload,ledgerId:'test-ledger'});await e.local.failure(e.s.ledgerId,first.mutationId,'Lost reply');const again=await next(e);assert.equal(JSON.stringify(first.payload),JSON.stringify(again.payload));
 await assert.rejects(e.local.acknowledge(e.s.ledgerId,first.mutationId,{...receipt,changes:receipt.changes.slice(0,1)}),/receipt/);assert.equal((await e.local.list(e.s.ledgerId)).length,1);await commit(e,again);assert.equal(e.server.rows('FUND_GOALS').length,1);
});
test('conflicting bundle blocks descendant projection; explicit discard makes descendants reviewable instead of stuck',async()=>{
 const e=await setup(),a=operation(e,'saveCategory',[{kind:'SPENDING',name:'Rent',group:'',archived:false}]);await e.local.enqueue(a.p,a.revision);let entries=await e.local.list(e.s.ledgerId),projected=e.pending.project(e.s,entries),id=projected.state.categories.find(c=>c.name==='Rent').id;
 const b=operation(e,'setBudget',[{periodId:'per_test',categoryId:id,amount:500,applyToFuture:false}],projected,entries);await e.local.enqueue(b.p,b.revision);
 await e.local.acknowledge(e.s.ledgerId,a.p.mutationId,{status:'conflict',mutationId:a.p.mutationId,recordId:a.p.recordId,remote:null,fingerprint:null});entries=await e.local.list(e.s.ledgerId);assert.equal(e.pending.project(e.s,entries).tables.CATEGORIES.some(x=>x.record.category_id===id),false);
 await e.local.discardConflict(e.s.ledgerId,a.p.mutationId);entries=await e.local.list(e.s.ledgerId);assert.equal(entries.length,1);assert.equal(entries[0].status,'conflict');assert.equal(entries[0].dependsOn,null);await e.local.discardConflict(e.s.ledgerId,b.p.mutationId);assert.equal((await e.local.list(e.s.ledgerId)).length,0);
});
test('stale confirmations and unprepared backend commit no financial row/outbox item',async()=>{
 const e=await setup(),a=operation(e,'saveSettings',[{appName:'Offline',payDays:'15,EOM'}]);await assert.rejects(e.local.enqueue(a.p,'stale'),/changed/);delete e.s.capabilities.operationSyncVersion;await e.local.save(e.s);await assert.rejects(e.local.enqueue(a.p,a.revision),/Update Apps Script/);assert.equal((await e.local.list(e.s.ledgerId)).length,0);
});

test('quota failure while writing outbox or audit rolls back the entire confirmation',async()=>{
 const {IDBObjectStore}=require('fake-indexeddb'),original=IDBObjectStore.prototype.add;
 for(const store of ['outbox','localAudit']){const e=await setup(),a=operation(e,'saveSettings',[{appName:'Quota',payDays:'15,EOM'}]);
  IDBObjectStore.prototype.add=function(...args){if(this.name===store)throw new DOMException('Device storage is full.','QuotaExceededError');return original.apply(this,args);};
  try{await assert.rejects(e.local.enqueue(a.p,a.revision),/storage is full/);}finally{IDBObjectStore.prototype.add=original;}
  assert.equal((await e.local.list(e.s.ledgerId)).length,0);assert.notEqual((await e.local.restore()).state.app.name,'Quota');
 }
});
