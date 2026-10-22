/* Read-only calendar projection. Stored ISO dates are ledger dates, never UTC-shifted timestamps. */
(function(root){
'use strict';
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='2000-01-01'&&value<='2100-12-31'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function month(value){if(!/^\d{4}-\d{2}$/.test(value)||!validDate(value+'-01'))throw Error('Choose a valid calendar month.');var year=+value.slice(0,4),m=+value.slice(5),days=new Date(Date.UTC(year,m,0)).getUTCDate(),offset=(new Date(value+'-01T00:00:00Z').getUTCDay()+6)%7;return {label:new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T00:00:00Z')),offset:offset,dates:Array.from({length:days},function(_,i){return value+'-'+String(i+1).padStart(2,'0');})};}
function shift(value,delta){if(!validDate(value)||!Number.isInteger(delta))throw Error('Invalid calendar date.');var date=new Date(value+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+delta);var result=date.toISOString().slice(0,10);return validDate(result)?result:value;}
function records(snapshot,entries){
 if(!snapshot||!snapshot.tables)return [];var t=snapshot.tables;
 function live(table){return (t[table]||[]).map(function(x){return x.record;}).filter(function(r){return !r.deleted_at;});}
 var categories=live('CATEGORIES'),loans=live('LOANS'),payments=live('LOAN_PAYMENTS'),mirrors={},status={};payments.forEach(function(p){if(p.txn_id)mirrors[p.txn_id]=true;});
 (entries||[]).forEach(function(e){var changes=e.payload.table==='OPERATIONS'&&e.proposalRecord?e.proposalRecord.changes||[]:[{table:e.payload.table,after:e.proposalRecord}];changes.forEach(function(c){var r=c.after;if(!r)return;var id=c.table==='INCOME'?r.income_id:c.table==='LOAN_PAYMENTS'?r.payment_id:r.txn_id;if(id)status[c.table+':'+id]=e.status==='conflict'?'Conflict · review on Home':'Pending sync';});});
 var result=[];['INCOME','TRANSACTIONS','LOAN_PAYMENTS'].forEach(function(table){live(table).forEach(function(r){if(table==='TRANSACTIONS'&&mirrors[r.txn_id])return;var income=table==='INCOME',payment=table==='LOAN_PAYMENTS',category=categories.find(function(c){return c.category_id===r.category_id;}),loan=loans.find(function(l){return l.loan_id===r.loan_id;}),date=income?r.received_date:payment?r.paid_date:r.txn_date,id=income?r.income_id:payment?r.payment_id:r.txn_id;
 if(!validDate(date))return;result.push({table:table,id:id,date:date,amount:r.amount,note:r.note||'',name:income?r.source||r.kind:payment?loan?loan.name:'Loan payment':category?category.name:'Uncategorized',kind:income?'Income':payment?'Loan payment':r.type==='FUND_IN'?'Fund deposit':r.type==='FUND_OUT'?'Fund withdrawal':'Expense',status:status[table+':'+id]||'',linked:!!r.period_id,alsoSpend:payment&&!!r.txn_id});});});return result.sort(function(a,b){return b.date.localeCompare(a.date)||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id);});
}
root.RecordCalendar={validDate:validDate,month:month,shift:shift,records:records};
})(typeof window!=='undefined'?window:globalThis);
