const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
function environment(){
 const sheets={}, cache=new Map();let flushCount=0,failAt=0;
 class Sheet{
  constructor(name,rows=[]){this.name=name;this.rows=rows;this.maxRows=1000;}
  getLastRow(){return this.rows.length;}
  getMaxRows(){return this.maxRows;}
  insertRowsAfter(n,count){this.maxRows+=count;}
  setFrozenRows(){}
  getRange(start,col,n=1,m=1){const sheet=this;return {
   getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>(sheet.rows[start+i-1]||[])[col+j-1]??''));},
   setValues(values){for(let i=0;i<n;i++){const row=sheet.rows[start+i-1]||(sheet.rows[start+i-1]=[]);for(let j=0;j<m;j++)row[col+j-1]=values[i][j];}return this;},
   setNumberFormats(){return this;},setNumberFormat(){return this;}
  };}
 }
 const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n)),getSpreadsheetTimeZone:()=> 'Asia/Manila'};
 const ctx=vm.createContext({console});
 ctx.SpreadsheetApp={getActiveSpreadsheet:()=>ss,getUi:()=>({alert(){}}),flush(){flushCount++;if(flushCount===failAt)throw Error('SIMULATED_CRASH');}};
 ctx.PropertiesService={getScriptProperties:()=>({getProperty:()=> '123456'})};
 ctx.CacheService={getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})};
 ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
 ctx.Utilities={DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},formatDate:()=> '2026-10-21 10:00:00',computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()]};
 for(const file of ['Code.gs','Sync.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
 function put(table,record){if(!sheets[table])sheets[table]=new Sheet(table,[Array.from(ctx.colsOf_(table))]);sheets[table].rows.push(Array.from(ctx.colsOf_(table),c=>record[c]??''));}
 put('PAY_PERIODS',{period_id:'per_test',label:'Oct',pay_date:'2026-10-15'});
 put('CATEGORIES',{category_id:'cat_food',name:'Food',kind:'SPENDING'});
 for(const table of ['TRANSACTIONS','INCOME','LOAN_PAYMENTS'])sheets[table]=new Sheet(table,[Array.from(ctx.colsOf_(table))]);
 return {ctx,sheets,put,prepare:()=>ctx.prepareReliableSync_(),run:r=>ctx.syncLedgerMutation('123456',r),crashAt:n=>{flushCount=0;failAt=n;},reset:()=>{flushCount=0;failAt=0;}};
}
const addition=(extra={})=>({version:1,mutationId:'request_00000000001',operation:'add',table:'TRANSACTIONS',recordId:'txn_client_00000001',values:{periodId:'per_test',date:'2026-10-21',amountMinor:12345,categoryId:'cat_food',note:'Lunch'},...extra});
function edit(receipt,extra={}){return addition({mutationId:'request_00000000002',operation:'edit',baseFingerprint:receipt.fingerprint,values:{amountMinor:5000},...extra});}
test('requires valid PIN, explicit preparation and exact journal schema',()=>{
 const e=environment();assert.throws(()=>e.run(addition()),/SYNC_NOT_PREPARED/);
 e.prepare();const before=e.sheets.SYNC_JOURNAL.rows.length;
 assert.throws(()=>e.ctx.syncLedgerMutation('bad',addition()),/BAD_PIN/);
 assert.equal(e.sheets.SYNC_JOURNAL.rows.length,before);
 e.sheets.SYNC_JOURNAL.rows[0][0]='wrong';assert.throws(()=>e.run(addition()),/SYNC_SCHEMA_MISMATCH/);
});
test('add retries remain exactly one row without any CacheService receipt',()=>{
 const e=environment();e.prepare();const r=e.run(addition());assert.equal(r.status,'committed');assert.equal(r.record.amount,123.45);
 const again=e.run(addition());assert.equal(again.fingerprint,r.fingerprint);
 assert.equal(e.sheets.TRANSACTIONS.rows.length,2);assert.equal(e.sheets.SYNC_JOURNAL.rows.length,2);
 assert.throws(()=>e.run(addition({values:{...addition().values,amountMinor:500}})),/SYNC_KEY_REUSED/);
});
test('edit requires the exact base and respects direct Sheet edits with unchanged timestamps',()=>{
 const e=environment();e.prepare();const r=e.run(addition());
 const amountCol=Array.from(e.ctx.colsOf_('TRANSACTIONS')).indexOf('amount');
 e.sheets.TRANSACTIONS.rows[1][amountCol]=999;
 const conflict=e.run(edit(r));assert.equal(conflict.status,'conflict');assert.equal(conflict.remote.amount,999);
 assert.equal(e.sheets.TRANSACTIONS.rows[1][amountCol],999);
});
test('an edit is idempotent, keeps its ID and audits before and after',()=>{
 const e=environment();e.prepare();const r=e.run(addition());const request=edit(r);
 const changed=e.run(request);assert.equal(changed.record.amount,50);assert.equal(changed.record.txn_id,r.recordId);
 assert.equal(e.run(request).fingerprint,changed.fingerprint);assert.equal(e.sheets.TRANSACTIONS.rows.length,2);
 const audit=e.sheets.SYNC_JOURNAL.rows[2];assert.equal(JSON.parse(audit[5]).amount,123.45);assert.equal(JSON.parse(audit[6]).amount,50);
});
test('recover crashes after prepared intent, after record write, and after receipt write',()=>{
 for(const crash of [1,2,3]){
  const e=environment();e.prepare();e.crashAt(crash);
  assert.throws(()=>e.run(addition()),/SIMULATED_CRASH/);
  e.reset();assert.equal(e.run(addition()).status,'committed');
  assert.equal(e.sheets.TRANSACTIONS.rows.length,2);assert.equal(e.sheets.SYNC_JOURNAL.rows.length,2);
 }
});
test('conflicting prepared replay preserves remote data and remains terminal',()=>{
 const e=environment();e.prepare();const receipt=e.run(addition());const request=edit(receipt);
 e.crashAt(1);assert.throws(()=>e.run(request),/SIMULATED_CRASH/);e.reset();
 const index=Array.from(e.ctx.colsOf_('TRANSACTIONS')).indexOf('amount');e.sheets.TRANSACTIONS.rows[1][index]=750;
 assert.equal(e.run(request).status,'conflict');assert.equal(e.run(request).status,'conflict');assert.equal(e.sheets.TRANSACTIONS.rows[1][index],750);
});
test('reject unsafe fields, invalid amounts/dates, formulas, and unsupported loan or fund writes',()=>{
 const e=environment();e.prepare();
 for(const request of [addition({operation:'delete'}),addition({code:'alert(1)'}),addition({values:{...addition().values,amountMinor:1.1}}),addition({values:{...addition().values,date:'2026-02-30'}}),addition({values:{...addition().values,note:'=IMPORTXML("bad")'}})])assert.throws(()=>e.run(request));
 assert.equal(e.sheets.TRANSACTIONS.rows.length,1);
 const r=e.run(addition());e.put('LOAN_PAYMENTS',{payment_id:'pay_test',txn_id:r.recordId});
 assert.throws(()=>e.run(edit(r)),/ordinary expenses/);
});
test('income additions and edits preserve kind and source; stable-ID collision never overwrites',()=>{
 const e=environment();e.prepare();
 const r=e.run(addition({table:'INCOME',recordId:'inc_client_00000001',values:{periodId:'per_test',date:'2026-10-21',amountMinor:500000,kind:'SALARY',source:'Employer',note:''}}));
 assert.equal(r.record.kind,'SALARY');assert.equal(r.record.source,'Employer');
 const changed=e.run(edit(r,{table:'INCOME',recordId:r.recordId}));assert.equal(changed.record.amount,50);assert.equal(changed.record.kind,'SALARY');
 assert.equal(e.run(addition({mutationId:'request_00000000003',table:'INCOME',recordId:r.recordId,values:{periodId:'per_test',date:'2026-10-21',amountMinor:1,kind:'OTHER',source:'',note:''}})).status,'conflict');
 assert.equal(e.sheets.INCOME.rows.length,2);
});
