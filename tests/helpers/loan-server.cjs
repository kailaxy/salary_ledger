const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
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
 const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n)),getSpreadsheetTimeZone:()=> 'Asia/Manila',getId:()=> 'test-ledger'};
 const ctx=vm.createContext({console});
 ctx.SpreadsheetApp={getActiveSpreadsheet:()=>ss,getUi:()=>({alert(){}}),flush(){flushCount++;if(flushCount===failAt)throw Error('SIMULATED_CRASH');}};
 ctx.PropertiesService={getScriptProperties:()=>({getProperty:()=> '123456'})};
 ctx.CacheService={getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})};
 ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
 ctx.Utilities={DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},formatDate:()=> '2026-10-21 10:00:00',computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()]};
 for(const file of ['Code.gs','Sync.gs','LoanSync.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../..',file),'utf8'),ctx);
 function put(table,record){if(!sheets[table])sheets[table]=new Sheet(table,[Array.from(ctx.colsOf_(table))]);sheets[table].rows.push(Array.from(ctx.colsOf_(table),c=>record[c]??''));}
 put('PAY_PERIODS',{period_id:'per_test',label:'Oct',pay_date:'2026-10-15'});
 put('CATEGORIES',{category_id:'cat_food',name:'Food',kind:'SPENDING'});
 for(const table of ['TRANSACTIONS','INCOME','LOAN_PAYMENTS'])sheets[table]=new Sheet(table,[Array.from(ctx.colsOf_(table))]);
 return {ctx,sheets,put,flushCount:()=>flushCount,prepare:()=>ctx.prepareReliableSync_(),run:r=>ctx.syncLedgerMutation('123456',r),crashAt:n=>{flushCount=0;failAt=n;},reset:()=>{flushCount=0;failAt=0;}};
}
function loanFixture(){
 const e=environment();e.prepare();
 e.put('LOANS',{loan_id:'lon_test',name:'Phone',lender:'Store',principal:1000,total_payable:1000,installment_amount:500,installment_count:2,frequency:'MONTHLY',start_date:'2026-10-01',status:'ACTIVE'});
 e.put('LOAN_INSTALLMENTS',{installment_id:'ins_first',loan_id:'lon_test',seq_no:1,due_date:'2026-10-01',amount_due:500});
 e.put('LOAN_INSTALLMENTS',{installment_id:'ins_second',loan_id:'lon_test',seq_no:2,due_date:'2026-11-01',amount_due:500});
 const ss={getSheetByName:n=>e.sheets[n]};
 e.request=(alsoSpend=true)=>{const c=e.ctx.loanSyncContext_(ss,'lon_test');return {version:1,ledgerId:'test-ledger',mutationId:'request_loan_000001',table:'LOAN_PAYMENTS',operation:'add',recordId:'pay_client_00000001',baseFingerprint:c.fingerprint,values:{loanId:'lon_test',date:'2026-10-22',amountMinor:50000,note:'First payment',alsoSpend,periodId:alsoSpend?'per_test':'',categoryId:alsoSpend?'cat_food':'',expectedPaidMinor:c.paidMinor,schedule:Array.from(c.schedule)}};};
 e.runLoan=r=>e.ctx.syncLoanPayment('123456',r);e.rows=table=>e.ctx.readTable_(ss,table,true);
 return e;
}
module.exports={environment,loanFixture};
