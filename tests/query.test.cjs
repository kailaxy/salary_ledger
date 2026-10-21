const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8');
const code=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('Deterministic cached-ledger query engine'));
const ctx=vm.createContext({Intl,Date});vm.runInContext(code,ctx);const engine=ctx.LedgerQuery;
const now=new Date('2026-10-21T00:00:00Z');
const wrap=record=>({record,fingerprint:'a'.repeat(64)});
function fixture(){return {timezone:'Asia/Manila',tables:{
 CATEGORIES:[wrap({category_id:'food',name:'Food',kind:'SPENDING'}),wrap({category_id:'travel',name:'Travel',kind:'SPENDING'})],
 TRANSACTIONS:[
  {txn_id:'a',txn_date:'2026-10-01',type:'EXPENSE',amount:0.1,category_id:'food'},
  {txn_id:'b',txn_date:'2026-10-21',type:'EXPENSE',amount:0.2,category_id:'food',note:'Lunch'},
  {txn_id:'c',txn_date:'2026-09-30',type:'EXPENSE',amount:100,category_id:'travel'},
  {txn_id:'d',txn_date:'2026-10-02',type:'FUND_IN',amount:500},
  {txn_id:'e',txn_date:'2026-10-02',type:'FUND_OUT',amount:200},
  {txn_id:'f',txn_date:'2026-10-02',type:'EXPENSE',amount:999,deleted_at:'deleted'},
  {txn_id:'loan-mirror',txn_date:'2026-10-02',type:'EXPENSE',amount:50,category_id:'travel'}].map(wrap),
 INCOME:[wrap({income_id:'i',received_date:'2026-10-01',kind:'SALARY',amount:1000}),wrap({income_id:'j',received_date:'2026-10-02',kind:'BONUS',amount:100})],
 LOAN_PAYMENTS:[wrap({txn_id:'loan-mirror',amount:50})]
}};}
const q=(operation='sum',extra={})=>({action:'query',operation,kind:'expense',range:'this_month',...extra});
test('integer cents, sums, transfers, tombstones and mirrored loan payment accounting',()=>{
 assert.equal(engine.cents(0.1)+engine.cents(0.2),30);
 const r=engine.query(fixture(),q(),now);assert.equal(r.totalMinor,5030);assert.equal(r.count,3);
 assert.throws(()=>engine.cents('1.001'),/invalid/);
});
test('date ranges use ledger timezone and calendar month boundaries',()=>{
 assert.deepEqual(Array.from(engine.bounds('today','Asia/Manila',new Date('2026-09-30T17:00:00Z'))),['2026-10-01','2026-10-01']);
 assert.deepEqual(Array.from(engine.bounds('last_month','UTC',new Date('2024-03-01T00:00:00Z'))),['2024-02-01','2024-02-29']);
 assert.equal(engine.query(fixture(),q('sum',{range:'last_month'}),now).totalMinor,10000);
});
test('top, minimum, average, category filters, text, amount and stable IDs',()=>{
 assert.equal(engine.query(fixture(),q('top',{limit:2}),now).rows[0].id,'loan-mirror');
 assert.equal(engine.query(fixture(),q('min'),now).rows[0].id,'a');
 assert.equal(engine.query(fixture(),q('average',{categoryId:'food'}),now).averageMinor,15);
 assert.equal(engine.query(fixture(),q('list',{text:'lunch',minMinor:20,maxMinor:20}),now).rows[0].id,'b');
 assert.equal(engine.query(fixture(),q('list',{entryId:'a'}),now).rows[0].minor,10);
 assert.equal(engine.query(fixture(),q('categories'),now).categories[0].name,'Travel');
});
test('salary, comparison, cashflow and empty results are explicit',()=>{
 assert.equal(engine.query(fixture(),q('sum',{kind:'income',incomeKind:'SALARY'}),now).totalMinor,100000);
 assert.equal(engine.query(fixture(),q('compare'),now).differenceMinor,-4970);
 assert.equal(engine.query(fixture(),q('cashflow'),now).netMinor,104970);
 const r=engine.query(fixture(),q('average',{entryId:'missing'}),now);assert.equal(r.count,0);assert.equal(r.averageMinor,null);
});
test('strict actions and unsupported or ambiguous language cannot mutate or drop qualifiers',()=>{
 for(const bad of [q('delete'),q('sum',{code:'alert(1)'}),q('top',{limit:500}),q('sum',{categoryId:'missing'})])assert.throws(()=>engine.query(fixture(),bad,now));
 assert.equal(engine.interpret("What's my biggest expense this month?").operation,'max');
 assert.equal(engine.interpret('Show my top five expenses').limit,5);
 assert.equal(engine.interpret('How much did I spend on food last month?',fixture()).categoryId,'food');
 for(const text of ['Add a 500 food expense','How much did I spend on groceries last month?','Show my top five expenses excluding rent'])assert.throws(()=>engine.interpret(text));
});
test('invalid calendar dates fail rather than producing a misleading total',()=>{
 const s=fixture();s.tables.TRANSACTIONS[0].record.txn_date='2026-02-30';assert.throws(()=>engine.query(s,q(),now),/invalid date/);
});
