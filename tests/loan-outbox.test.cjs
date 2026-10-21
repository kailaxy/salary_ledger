const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {indexedDB}=require('fake-indexeddb'),{loanFixture}=require('./helpers/loan-server.cjs');
const scripts=[...fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function client(){const c=vm.createContext({indexedDB,console});for(const marker of ['Durable full-snapshot storage','Local single-record mutations','Deterministic cached-ledger query engine']){const s=scripts.find(s=>s.includes(marker));if(s)vm.runInContext(s,c);}return {local:c.LedgerLocal,pending:c.LedgerPending,query:c.LedgerQuery};}
let serial=0;
function fixture(){
 const server=loanFixture();for(const table of ['SETTINGS','BUDGET_LINES','FUND_GOALS'])server.put(table,{});
 const s=JSON.parse(JSON.stringify(server.ctx.getLedgerSnapshot('123456')));s.ledgerId='loan-local-'+(++serial);s.state.today='2026-10-22';s.capturedAt='2026-10-20T00:00:00.000Z';
 const p=JSON.parse(JSON.stringify(server.request()));p.ledgerId=s.ledgerId;p.mutationId+='_'+serial;
 return {server,s,p};
}
function revision(pending,s,p,entries=[]){return pending.loanRevision(s,entries,p.values.loanId);}
test('confirmed loan and mirror persist as one queue item; repayment and query totals count spending once',async()=>{
 const {server,s,p}=fixture(),{local,pending,query}=client();await local.save(s);
 await local.enqueue(p,revision(pending,s,p));const entries=await client().local.list(s.ledgerId),view=pending.project(s,entries);
 assert.equal(entries.length,1);assert.equal(view.tables.LOAN_PAYMENTS.length,1);assert.equal(view.tables.TRANSACTIONS.length,1);assert.equal(view.state.summary.spent,500);assert.equal(view.state.summary.loanRemaining,500);
 assert.equal(view.state.loans[0].installments[0].status,'PAID');assert.equal(view.state.loans[0].next.id,'ins_second');assert.equal(view.state.recent.length,1);assert.equal(view.state.recent[0].kind,'loanpay');
 assert.equal(s.tables.LOAN_PAYMENTS.length,0);assert.equal(query.query(view,{action:'query',operation:'sum',kind:'expense',range:'all'}).totalMinor,50000);
 const receipt=JSON.parse(JSON.stringify(server.runLoan({...p,ledgerId:'test-ledger'})));
 await local.acknowledge(s.ledgerId,p.mutationId,receipt);
 const saved=await local.restore();assert.equal((await local.list(s.ledgerId)).length,0);assert.equal(saved.state.summary.spent,500);assert.equal(saved.state.loans[0].remaining,500);assert.equal(saved.tables.LOANS[0].fingerprint,receipt.loan.fingerprint);
});
test('unmirrored payment reduces debt without increasing spending and malformed partial receipt preserves queue',async()=>{
 const {server,s,p}=fixture(),{local,pending}=client();p.values.alsoSpend=false;p.values.periodId='';p.values.categoryId='';await local.save(s);await local.enqueue(p,revision(pending,s,p));
 const projected=pending.project(s,await local.list(s.ledgerId));assert.equal(projected.state.summary.spent,0);assert.equal(projected.tables.TRANSACTIONS.length,0);assert.equal(projected.state.summary.loanRemaining,500);
 const receipt=JSON.parse(JSON.stringify(server.runLoan({...p,ledgerId:'test-ledger'})));
 await assert.rejects(local.acknowledge(s.ledgerId,p.mutationId,{...receipt,loan:null}),/complete loan payment receipt/);assert.equal((await local.list(s.ledgerId)).length,1);
 await local.acknowledge(s.ledgerId,p.mutationId,receipt);assert.equal((await local.restore()).state.summary.spent,0);
});
test('capability gating, stale review, pending payment, invalid references and overpayment reject atomically',async()=>{
 const {s,p}=fixture(),{local,pending}=client();const old=JSON.parse(JSON.stringify(s));delete old.capabilities.loanSyncVersion;
 assert.throws(()=>pending.validate(old,[],p,revision(pending,old,p)),/LoanSync.gs/);
 for(const patch of [{amountMinor:100001},{categoryId:'missing'},{date:'2026-02-30'},{note:'=1+1'}])assert.throws(()=>pending.validate(s,[],{...p,values:{...p.values,...patch}},revision(pending,s,p)));
 assert.throws(()=>pending.validate(s,[],p,'stale'),/changed/);
 await local.save(s);await local.enqueue(p,revision(pending,s,p));const entries=await local.list(s.ledgerId),next={...p,recordId:'pay_client_00000002',mutationId:'request_loan_000002'};
 await assert.rejects(local.enqueue(next,revision(pending,s,next,entries)),/pending payment/);assert.equal((await local.list(s.ledgerId)).length,1);
});
test('loan conflict retains exact mirrored proposal while cloud totals stay authoritative; discard audits it',async()=>{
 const {s,p}=fixture(),{local,pending}=client();await local.save(s);await local.enqueue(p,revision(pending,s,p));
 await local.acknowledge(s.ledgerId,p.mutationId,{status:'conflict',mutationId:p.mutationId,recordId:p.recordId,remote:null,fingerprint:null,reason:'LOAN_CHANGED'});
 const entries=await client().local.list(s.ledgerId),projected=pending.project(s,entries);
 assert.equal(entries[0].proposalRecord._expense.record.amount,500);assert.equal(projected.state.summary.spent,0);assert.equal(projected.state.summary.loanRemaining,1000);assert.equal(projected.tables.LOAN_PAYMENTS.length,0);
 await local.discardConflict(s.ledgerId,p.mutationId);assert.equal((await local.list(s.ledgerId)).length,0);
});

test('a fresh cloud snapshot after a lost reply preserves the confirmed installment and counts its mirror once',async()=>{
 const {server,s,p}=fixture(),{local,pending}=client();await local.save(s);await local.enqueue(p,revision(pending,s,p));
 const receipt=JSON.parse(JSON.stringify(server.runLoan({...p,ledgerId:'test-ledger'})));
 const fresh=JSON.parse(JSON.stringify(server.ctx.getLedgerSnapshot('123456')));fresh.ledgerId=s.ledgerId;await local.save(fresh);
 const projected=pending.project(fresh,await local.list(s.ledgerId));
 assert.equal(projected.tables.LOAN_PAYMENTS[0].record.installment_id,'ins_first');assert.equal(projected.tables.TRANSACTIONS.length,1);assert.equal(projected.state.summary.spent,500);assert.equal(projected.state.loans[0].remaining,500);
 await local.acknowledge(s.ledgerId,p.mutationId,receipt);assert.equal((await local.list(s.ledgerId)).length,0);assert.equal((await local.restore()).state.summary.spent,500);
});
