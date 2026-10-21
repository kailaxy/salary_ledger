const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {indexedDB}=require('fake-indexeddb');
const scripts=[...fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
let ledgerNumber=0;
function client(){const c=vm.createContext({indexedDB,console});vm.runInContext(scripts[0],c);vm.runInContext(scripts.find(s=>s.includes('Local single-record mutations')),c);return {local:c.LedgerLocal,pending:c.LedgerPending};}
function snapshot(){
 const tables={};for(const name of ['SETTINGS','PAY_PERIODS','INCOME','CATEGORIES','FUND_GOALS','BUDGET_LINES','TRANSACTIONS','LOANS','LOAN_INSTALLMENTS','LOAN_PAYMENTS'])tables[name]=[];
 const wrap=record=>({record,fingerprint:'a'.repeat(64)});
 tables.PAY_PERIODS=[wrap({period_id:'per_test',pay_date:'2026-10-15'})];tables.CATEGORIES=[wrap({category_id:'cat_food',kind:'SPENDING',name:'Food',is_archived:false})];
 return {formatVersion:1,ledgerId:'queue-test-'+(++ledgerNumber),capabilities:{recordSyncVersion:1},capturedAt:'2026-10-20T00:00:00.000Z',timezone:'Asia/Manila',currency:'₱',minorUnitScale:2,tables,state:{setupDone:true,summary:{received:0,spent:0,inFunds:0,saved:0,unassigned:0},periods:[{id:'per_test',label:'Oct',income:0,spent:0,funds:0,hasIncome:false,unassigned:0}],categories:[{id:'cat_food',name:'Food',actual:0}],byCat:{},recent:[]}};
}
function add(s,id='req_'+s.ledgerId+'_00000001'){return {version:1,ledgerId:s.ledgerId,mutationId:id,operation:'add',table:'TRANSACTIONS',recordId:'txn_client_00000001',values:{periodId:'per_test',date:'2026-10-21',amountMinor:50000,categoryId:'cat_food',note:'Lunch'}};}
function receipt(entry,record){return {status:'committed',mutationId:entry.mutationId,recordId:entry.payload.recordId,record,fingerprint:'b'.repeat(64),committedAt:'2026-10-21T00:00:00.000Z'};}
test('atomic queued additions survive a new connection and project without changing cloud base',async()=>{
 const {local,pending}=client(),s=snapshot();await local.save(s);const payload=add(s);
 const e=await local.enqueue(payload,pending.revision(s,[],payload.table,payload.recordId));
 assert.equal(e.status,'pending');const all=await client().local.list(s.ledgerId);assert.equal(all.length,1);
 assert.equal((await local.restore()).tables.TRANSACTIONS.length,0);
 const view=pending.project(s,all);assert.equal(view.state.summary.spent,500);assert.equal(view.tables.TRANSACTIONS.length,1);assert.equal(view.state.recent[0].id,payload.recordId);
 await local.enqueue(payload,pending.revision(s,[],payload.table,payload.recordId));assert.equal((await local.list(s.ledgerId)).length,1);
});
test('edit to a pending add waits for its receipt and carries its permanent ID',async()=>{
 const {local,pending}=client(),s=snapshot();await local.save(s);const payload=add(s);await local.enqueue(payload,pending.revision(s,[],payload.table,payload.recordId));
 let entries=await local.list(s.ledgerId);const edit={...payload,mutationId:'req_'+s.ledgerId+'_00000002',operation:'edit',baseFingerprint:'0'.repeat(64),values:{amountMinor:75000}};
 await local.enqueue(edit,pending.revision(s,entries,payload.table,payload.recordId));entries=await local.list(s.ledgerId);
 assert.equal(entries[1].dependsOn,entries[0].mutationId);assert.equal(pending.project(s,entries).state.summary.spent,750);
 const record=pending.project(s,[entries[0]]).tables.TRANSACTIONS[0].record;
 await local.acknowledge(s.ledgerId,entries[0].mutationId,receipt(entries[0],record));entries=await local.list(s.ledgerId);
 assert.equal(entries.length,1);assert.equal(entries[0].dependsOn,null);assert.equal(entries[0].payload.baseFingerprint,'b'.repeat(64));
 assert.equal(pending.project(await local.restore(),entries).state.summary.spent,750);
 await local.acknowledge(s.ledgerId,payload.mutationId,receipt({mutationId:payload.mutationId,payload},record));assert.equal((await local.restore()).state.summary.spent,500);
});
test('failed sends retain entries; pulling cloud state preserves local overlays',async()=>{
 const {local,pending}=client(),s=snapshot();await local.save(s);const p=add(s);await local.enqueue(p,pending.revision(s,[],p.table,p.recordId));
 await local.failure(s.ledgerId,p.mutationId,'Connection lost');const fresh=JSON.parse(JSON.stringify(s));fresh.capturedAt='2026-10-20T12:00:00.000Z';await local.save(fresh);
 const entries=await local.list(s.ledgerId);assert.equal(entries[0].error,'Connection lost');assert.equal(pending.project(await local.restore(),entries).state.summary.spent,500);
});
test('invalid and stale confirmations commit neither outbox nor local financial row',async()=>{
 const {local,pending}=client(),s=snapshot();await local.save(s);let p=add(s);
 await assert.rejects(local.enqueue({...p,values:{...p.values,amountMinor:-1}},pending.revision(s,[],p.table,p.recordId)),/amount/);
 assert.equal((await local.list(s.ledgerId)).length,0);
 await local.enqueue(p,pending.revision(s,[],p.table,p.recordId));
 const e={...p,operation:'edit',mutationId:'req_'+s.ledgerId+'_00000002',baseFingerprint:'0'.repeat(64),values:{amountMinor:1}};
 await assert.rejects(local.enqueue(e,'stale'),/changed/);assert.equal((await local.list(s.ledgerId)).length,1);
});
test('conflicts remain durable; explicit discard removes the dependent chain, not other records',async()=>{
 const {local,pending}=client(),s=snapshot();await local.save(s);const p=add(s);await local.enqueue(p,pending.revision(s,[],p.table,p.recordId));
 const p2={...p,mutationId:'req_'+s.ledgerId+'_00000003',recordId:'txn_client_00000002'};await local.enqueue(p2,pending.revision(s,await local.list(s.ledgerId),p2.table,p2.recordId));
 await local.acknowledge(s.ledgerId,p.mutationId,{status:'conflict',mutationId:p.mutationId,recordId:p.recordId,remote:null,fingerprint:null});
 assert.equal((await client().local.list(s.ledgerId))[0].status,'conflict');
 await local.discardConflict(s.ledgerId,p.mutationId);const remaining=await local.list(s.ledgerId);assert.equal(remaining.length,1);assert.equal(remaining[0].payload.recordId,p2.recordId);
});
test('wrong-ledger receipts and malformed acknowledgements preserve the outbox',async()=>{
 const {local,pending}=client(),s=snapshot();await local.save(s);const p=add(s);await local.enqueue(p,pending.revision(s,[],p.table,p.recordId));
 await assert.rejects(local.acknowledge('another-ledger',p.mutationId,{status:'committed'}),/acknowledgement/);
 assert.equal((await local.list(s.ledgerId)).length,1);
});
test('snapshot fetched before an acknowledgement cannot overwrite the acknowledged row',async()=>{
 const {local,pending}=client(),s=snapshot();await local.save(s);const p=add(s);await local.enqueue(p,pending.revision(s,[],p.table,p.recordId));
 const entry=(await local.list(s.ledgerId))[0],record=pending.project(s,[entry]).tables.TRANSACTIONS[0].record;
 await local.acknowledge(s.ledgerId,p.mutationId,receipt(entry,record));
 await assert.rejects(local.save(s));assert.equal((await local.restore()).state.summary.spent,500);
});
test('conflicting proposals remain available for review without changing cloud-based totals',async()=>{
 const {local,pending}=client(),s=snapshot();await local.save(s);const p=add(s);await local.enqueue(p,pending.revision(s,[],p.table,p.recordId));
 await local.acknowledge(s.ledgerId,p.mutationId,{status:'conflict',mutationId:p.mutationId,recordId:p.recordId,remote:null,fingerprint:null});
 const view=await local.view();assert.equal(view.entries[0].proposalRecord.amount,500);assert.equal(pending.project(view.snapshot,view.entries).state.summary.spent,0);
});
test('an unprepared cached backend cannot accept a local financial write',async()=>{
 const {local,pending}=client(),s=snapshot();delete s.capabilities;await local.save(s);const p=add(s);
 await assert.rejects(local.enqueue(p,pending.revision(s,[],p.table,p.recordId)),/prepare reliable sync/);
 assert.equal((await local.list(s.ledgerId)).length,0);
});
