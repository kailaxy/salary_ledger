/** Durable, recoverable bundles for offline planning, edits, deletion and settings. */
function operationSyncVersion_(){return typeof LedgerOperations!=='undefined'&&typeof loanSyncRow_==='function'&&typeof syncJournal_==='function'?1:0;}
function operationSnapshot_(ss){
 const tables={};Object.keys(TABLES).forEach(t=>{tables[t]=readTable_(ss,t,true).map(record=>({record:syncCleanRecord_(t,record),fingerprint:syncHash_(t,record),rowNumber:record._row}));});
 return {tables:tables,state:{today:todayIso_(new Date()),settings:{payDays:getSettings_(ss).pay_days}},ledgerId:ss.getId()};
}
function operationRequest_(r){
 syncFields_(r,['version','ledgerId','mutationId','operation','table','recordId','values']);
 if(r.version!==1||r.operation!=='bundle'||r.table!=='OPERATIONS'||typeof r.ledgerId!=='string'||!r.ledgerId||r.ledgerId.length>200||typeof r.mutationId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/.test(r.mutationId)||typeof r.recordId!=='string'||!/^op_[A-Za-z0-9_-]{8,76}$/.test(r.recordId))fail_('Invalid operation envelope.');
 syncFields_(r.values,['action','args','expected']);if(typeof r.values.action!=='string'||!Array.isArray(r.values.args)||typeof r.values.expected!=='string'||!/^[a-f0-9]{64}$/.test(r.values.expected))fail_('Invalid operation context.');
 return {version:1,ledgerId:r.ledgerId,mutationId:r.mutationId,operation:'bundle',table:'OPERATIONS',recordId:r.recordId,values:{action:r.values.action,args:r.values.args,expected:r.values.expected}};
}
function operationConflict_(r){return {status:'conflict',mutationId:r.mutationId,recordId:r.recordId,reason:'OPERATION_CONTEXT_CHANGED',remote:null,fingerprint:null};}
function operationWriteBatch_(ss,targets){
 Object.keys(TABLES).forEach(table=>{
  const changes=targets.filter(t=>t.change.table===table&&t.currentHash!==t.afterHash);if(!changes.length)return;
  const existing=changes.filter(t=>t.current).sort((a,b)=>a.current.rowNumber-b.current.rowNumber),cols=colsOf_(table),sheet=ss.getSheetByName(table);
  let group=[];
  function write(){if(!group.length)return;sheet.getRange(group[0].current.rowNumber,1,group.length,cols.length).setNumberFormats(group.map(()=>cols.map(colFmt_))).setValues(group.map(t=>cols.map(k=>t.change.after[k])));SpreadsheetApp.flush();group=[];}
  existing.forEach(t=>{if(group.length&&t.current.rowNumber!==group[group.length-1].current.rowNumber+1)write();group.push(t);});write();
  const additions=changes.filter(t=>!t.current).map(t=>t.change.after);if(additions.length){appendRows_(ss,table,additions);SpreadsheetApp.flush();}
 });
}
function recoverOperationEntry_(ss,journal,entry){
 const r=JSON.parse(entry.row[1]),changes=JSON.parse(entry.row[6]),snapshot=operationSnapshot_(ss);let applied=false,valid=true;
 const targets=changes.map(c=>{
  const current=snapshot.tables[c.table].find(x=>x.record[colsOf_(c.table)[0]]===c.after[colsOf_(c.table)[0]]),currentHash=current?current.fingerprint:null,beforeHash=c.before?syncHash_(c.table,c.before):null,afterHash=syncHash_(c.table,c.after);
  if(currentHash===afterHash){applied=true;const rows=snapshot.tables[c.table],i=rows.indexOf(current);if(c.before)rows[i]={record:c.before,fingerprint:beforeHash,rowNumber:current.rowNumber};else rows.splice(i,1);}
  else if(currentHash!==beforeHash){valid=false;applied=true;}
  return {change:c,current:current,currentHash:currentHash,afterHash:afterHash};
 });
 const matching=valid&&LedgerOperations.context(snapshot,r.values.action)===r.values.expected;
 if(!matching){if(!applied)return syncFinish_(journal,entry.number,'CONFLICT',operationConflict_(r));throw new Error('SYNC_OPERATION_RECOVERY_REQUIRED: A partially applied operation was edited directly in Sheets. Preserve SYNC_JOURNAL and restore its recorded before/after values before retrying.');}
 operationWriteBatch_(ss,targets);
 const persisted=operationSnapshot_(ss),receiptChanges=changes.map(c=>{const row=persisted.tables[c.table].find(x=>x.record[colsOf_(c.table)[0]]===c.after[colsOf_(c.table)[0]]);if(!row||row.fingerprint!==syncHash_(c.table,c.after))throw new Error('SYNC_OPERATION_RECOVERY_REQUIRED');return {table:c.table,record:row.record,fingerprint:row.fingerprint};});
 return syncFinish_(journal,entry.number,'COMMITTED',{status:'committed',committedAt:new Date().toISOString(),mutationId:r.mutationId,recordId:r.recordId,changes:receiptChanges});
}
/** Invoked under the same lock before any application read/write. */
function recoverPendingOperations_(ss){
 const sheet=ss.getSheetByName('SYNC_JOURNAL');if(!sheet||sheet.getLastRow()<2)return;TZ_=ss.getSpreadsheetTimeZone();const journal=syncJournal_(ss);
 journal.getRange(2,1,journal.getLastRow()-1,SYNC_HEADERS.length).getValues().forEach((row,i)=>{if(row[2]==='PREPARED'&&row[3]==='OPERATIONS')recoverOperationEntry_(ss,journal,{row:row,number:i+2});});
}
function syncOperation(pin,input){
 requirePinForWrite_(pin);const r=operationRequest_(input),json=JSON.stringify(r);
 return withLock_(function(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();TZ_=ss.getSpreadsheetTimeZone();if(r.ledgerId!==ss.getId())throw new Error('SYNC_WRONG_LEDGER');
  const journal=syncJournal_(ss),count=journal.getLastRow(),rows=count>1?journal.getRange(2,1,count-1,SYNC_HEADERS.length).getValues():[],matches=rows.map((row,i)=>({row:row,number:i+2})).filter(x=>x.row[0]===r.mutationId);
  if(matches.length>1)throw new Error('SYNC_DUPLICATE_MUTATION_ID');if(matches.length){const e=matches[0];if(e.row[1]!==json)throw new Error('SYNC_KEY_REUSED');if(e.row[2]!=='COMMITTED'&&e.row[2]!=='CONFLICT')throw new Error('SYNC_JOURNAL_CORRUPT');return JSON.parse(e.row[7]);}
  const snapshot=operationSnapshot_(ss);if(LedgerOperations.context(snapshot,r.values.action)!==r.values.expected)return operationConflict_(r);
  let proposal;try{proposal=LedgerOperations.plan(snapshot,r.values.action,r.values.args,r.mutationId,stamp_());}catch(error){fail_(String(error.message));}
  const row=[r.mutationId,json,'PREPARED','OPERATIONS',r.recordId,JSON.stringify(proposal.changes.map(c=>({table:c.table,record:c.before}))),JSON.stringify(proposal.changes),'',stamp_()],number=journal.getLastRow()+1;
  if(journal.getMaxRows()<number)journal.insertRowsAfter(journal.getMaxRows(),100);journal.getRange(number,1,1,row.length).setNumberFormat('@').setValues([row]);SpreadsheetApp.flush();
  return recoverOperationEntry_(ss,journal,{row:row,number:number});
 });
}
