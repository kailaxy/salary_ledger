const {loanFixture}=require('./loan-server.cjs'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
let serial=0;
function fixture(){
 const e=loanFixture();for(const t of ['SETTINGS','BUDGET_LINES','FUND_GOALS'])e.put(t,{});
 for(const file of ['Operations.gs','OperationSync.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../..',file),'utf8'),e.ctx);
 e.ctx.Utilities.formatDate=(d,tz,pattern)=>pattern==='yyyy-MM-dd'?'2026-10-22':pattern==='yyyy'?'2026':'2026-10-22 10:00:00';
 e.snapshot=()=>JSON.parse(JSON.stringify(e.ctx.getLedgerSnapshot('123456')));
 e.propose=(action,args,snapshot=e.snapshot())=>({version:1,ledgerId:'test-ledger',mutationId:'request_operation_'+String(++serial).padStart(12,'0'),operation:'bundle',table:'OPERATIONS',recordId:'op_operation_'+String(serial).padStart(12,'0'),values:{action,args,expected:e.ctx.LedgerOperations.context(snapshot,action)}});
 e.runOp=p=>JSON.parse(JSON.stringify(e.ctx.syncOperation('123456',p)));
 return e;
}
module.exports={fixture};
