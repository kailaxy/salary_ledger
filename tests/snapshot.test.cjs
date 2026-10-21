const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {indexedDB} = require('fake-indexeddb');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root,'Index.html'),'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function client(){
  const ctx = vm.createContext({indexedDB, console});
  vm.runInContext(scripts[0],ctx);
  return ctx.LedgerLocal;
}
function snapshot(){
  const tables = {};
  for(const name of ['SETTINGS','PAY_PERIODS','INCOME','CATEGORIES','FUND_GOALS','BUDGET_LINES','TRANSACTIONS','LOANS','LOAN_INSTALLMENTS','LOAN_PAYMENTS']) tables[name]=[];
  tables.TRANSACTIONS = Array.from({length:65},(_,i)=>({record:{txn_id:'txn_'+i,amount:12.34,deleted_at:i===64?'2026-01-01':''},fingerprint:'a'.repeat(64)}));
  return {formatVersion:1,ledgerId:'test-ledger',capturedAt:'2026-10-21T00:00:00.000Z',timezone:'Asia/Manila',currency:'₱',minorUnitScale:2,tables,state:{setupDone:true}};
}
test('all inline JavaScript parses',()=>{ for(const script of scripts) new vm.Script(script); });
test('complete snapshot survives new client connection, including tombstones',async()=>{
 const first=client(); const input=snapshot(); await first.save(input);
 const restored=await client().restore();
 assert.equal(restored.tables.TRANSACTIONS.length,65);
 assert.equal(restored.tables.TRANSACTIONS[64].record.deleted_at,'2026-01-01');
 assert.equal(restored.currency,'₱');
});
test('reject incomplete or malformed snapshots without overwriting saved data',async()=>{
 const local=client(); await local.save(snapshot());
 const bad=snapshot(); delete bad.tables.INCOME;
 await assert.rejects(local.save(bad),/Incomplete/);
 const badHash=snapshot(); badHash.tables.TRANSACTIONS[0].fingerprint='x';
 await assert.rejects(local.save(badHash),/Invalid record/);
 assert.equal((await local.restore()).tables.TRANSACTIONS.length,65);
});
test('server requires PIN and exports every table with stable content fingerprints',()=>{
 const ctx=vm.createContext({console});
 vm.runInContext(fs.readFileSync(path.join(root,'Code.gs'),'utf8'),ctx);
 let authorized=false, checked=0;
 ctx.requirePinForWrite_=()=>{checked++;if(!authorized)throw Error('BAD_PIN');};
 ctx.withLock_=fn=>fn();
 ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getSpreadsheetTimeZone:()=> 'Asia/Manila',getId:()=> 'sheet-id'})};
 ctx.getSettings_=()=>({currency:'₱'});
 ctx.buildState_=()=>({setupDone:true,recent:[]});
 let amount=12.34;
 ctx.readTable_=(ss,name,deleted)=>{
  assert.equal(deleted,true);
  return name==='TRANSACTIONS' ? Array.from({length:65},(_,i)=>({_row:i+2,txn_id:'txn_'+i,amount,deleted_at:i===64?'deleted':''})) : [];
 };
 ctx.Utilities={DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()]};
 assert.throws(()=>ctx.getLedgerSnapshot('bad'),/BAD_PIN/);
 authorized=true;
 const a=ctx.getLedgerSnapshot('valid');
 assert.equal(checked,2); assert.equal(Object.keys(a.tables).length,10);
 assert.equal(a.tables.TRANSACTIONS.length,65);
 assert.equal(a.tables.TRANSACTIONS[0].record._row,undefined);
 const fingerprint=a.tables.TRANSACTIONS[0].fingerprint;
 assert.match(fingerprint,/^[a-f0-9]{64}$/);
 assert.equal(ctx.getLedgerSnapshot('valid').tables.TRANSACTIONS[0].fingerprint,fingerprint);
 amount=20;
 assert.notEqual(ctx.getLedgerSnapshot('valid').tables.TRANSACTIONS[0].fingerprint,fingerprint);
});
