/* Deterministic capability allowlist. No transport, storage, model or dynamic dispatch. */
(function(root){
'use strict';
var entries=[];
function register(id,title,screen,handler,example,required){entries.push({id:id,title:title,screen:screen,handler:handler,example:example,mode:handler==='entry'?'write':handler==='query'?'read':'guided',access:handler==='entry'||/\.(create|update|delete|rename|archive|restore|set|update_goal|record_payment|payment_update|payment_delete|generate|edit)$/.test(id)?'write':'read',required:required||[],optional:handler==='entry'?(id==='income.create'?['periodId','note','source']:id==='expense.create'?['categoryId','periodId','note']:['periodId','note']):[],confirmation:handler==='entry'?'explicit-button':handler==='query'?'none':'existing-workflow',offline:screen!=='sync',authorization:'Authorized ledger; writes require unlock and existing sync capability',parameters:handler==='entry'?(id==='income.create'?['amountMinor','kind','date','periodId','note','source']:['amountMinor','categoryId','date','periodId','note']):[]});}
register('ledger.query','Ask about saved finances','home','query','How much did I spend this month?');
register('expense.create','Record an expense','add','entry','Add 250 pesos for lunch today',['amountMinor','date']);
register('income.create','Record income','add','entry','Add salary income of 15000 today',['amountMinor','kind','date']);
register('fund.deposit','Deposit to a fund','funds','entry','Deposit 1000 into Emergency Fund today',['amountMinor','categoryId','date']);
register('fund.withdraw','Withdraw from a fund','funds','entry','Withdraw 100 from Emergency Fund today',['amountMinor','categoryId','date']);
[
 ['expense.update','Edit an expense','history','Change my last expense'],['expense.delete','Delete a precisely identified expense','history','Delete my last expense'],
 ['income.update','Edit income','history','Edit income'],['income.delete','Delete income','history','Delete income'],
 ['ledger.search','Search record history','records','Show my transaction history'],['ledger.summary','Overview','home','Open home'],
 ['category.create','Create a spending category','newcategory','Create a category'],['category.rename','Rename a category','plan','Rename my Transport category'],
 ['category.archive','Archive a category','plan','Archive a category'],['category.restore','Restore an archived category','plan','Restore a category'],['category.delete','Delete an unused category','plan','Delete an unused category'],
 ['budget.view','Review plans','plan','Open my budgets'],['budget.set','Change a plan allocation','plan','Edit my food budget'],['budget.compare','Compare plans and actuals','plan','Take me to budget planning'],
 ['fund.view','Review fund balances and goals','funds','Show my savings funds'],['fund.create','Create a fund','newfund','Create a fund'],['fund.update_goal','Change a fund goal','plan','Update my Emergency Fund goal'],
 ['fund.update','Edit a fund movement','history','Edit a fund movement'],['fund.delete','Delete a fund movement','history','Delete a fund movement'],
 ['loan.view','Review loans and schedules','loans','Open my loans'],['loan.create','Set up a loan','newloan','Create a loan'],['loan.update','Edit a loan','loans','Edit a loan'],['loan.delete','Delete an unpaid loan setup','loans','Delete a loan'],
 ['loan.record_payment','Review and record a loan payment','loanpayment','Record my loan payment'],['loan.payment_update','Edit a linked loan payment','history','Edit a loan payment'],['loan.payment_delete','Delete a linked loan payment','loans','Delete a loan payment'],['loan.view_schedule','Review loan schedules','loans','Show loan schedules'],
 ['period.view','Review existing pay periods','plan','Show pay periods'],['period.compare','Compare pay periods','home','Compare pay periods'],['period.generate','Add a year of pay periods','settings','Add pay periods'],
 ['settings.edit','App name and pay days','settings','Open settings'],['ledger.sync_status','Pending changes and sync status','home','Show sync status'],['ledger.sync','Refresh and retry synchronization','sync','Open synchronization'],['guide.open','Read the app guide','guide','Open guide']
].forEach(function(x){register(x[0],x[1],x[2],'route',x[3]);});
function get(id){var found=entries.find(function(e){return e.id===id;});if(!found)throw Error('Unknown assistant capability.');return JSON.parse(JSON.stringify(found));}
function validate(id,p){var c=get(id);if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(function(k){return ['__proto__','constructor','prototype'].indexOf(k)>=0;}))throw Error('Invalid action parameters.');Object.keys(p).forEach(function(k){if(c.parameters.indexOf(k)<0)throw Error('Unexpected parameter: '+k);});if(c.handler!=='entry')return p;
 if(p.amountMinor!==undefined&&(!Number.isSafeInteger(p.amountMinor)||p.amountMinor<=0))throw Error('Enter a positive amount with at most two decimal places.');
 ['categoryId','periodId'].forEach(function(k){if(p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>150))throw Error('Choose an existing '+k+'.');});
 if(p.kind!==undefined&&['SALARY','BONUS','OTHER'].indexOf(p.kind)<0)throw Error('Choose salary, bonus or other income.');
 if(p.date!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date+'T00:00:00Z'))||new Date(p.date+'T00:00:00Z').toISOString().slice(0,10)!==p.date))throw Error('Choose a valid date.');
 ['note','source'].forEach(function(k){if(p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>(k==='note'?200:60)||/[\x00-\x1f]/.test(p[k])))throw Error('Invalid '+k+'.');});return p;
}
function normalize(s){return String(s).normalize('NFKC').toLowerCase().replace(/[’]/g,"'").replace(/\s+/g,' ').trim().replace(/[?.!]$/,'');}
function rows(snapshot,table){return snapshot&&snapshot.tables&&snapshot.tables[table]?snapshot.tables[table].map(function(x){return x.record;}).filter(function(r){return !r.deleted_at;}):[];}
function choices(id,field,snapshot,params){
 var optional=snapshot&&snapshot.capabilities&&snapshot.capabilities.optionalPlanningVersion===1;
 if(field==='categoryId')return (optional&&id==='expense.create'?[{value:'',label:'Uncategorized'}]:[]).concat(rows(snapshot,'CATEGORIES').filter(function(c){return !c.is_archived&&c.kind===(id.indexOf('fund.')===0?'FUND':'SPENDING');}).map(function(c){return {value:c.category_id,label:c.name};}));
 if(field==='periodId')return (optional?[{value:'',label:id==='expense.create'?'No plan linked':'Automatic reporting by date'}]:[]).concat(rows(snapshot,'PAY_PERIODS').filter(function(p){return !optional||id!=='expense.create'||rows(snapshot,'BUDGET_LINES').some(function(b){return b.period_id===p.period_id&&b.category_id===(params&&params.categoryId);});}).map(function(p){return {value:p.period_id,label:p.label+' · '+p.pay_date};}));
 if(field==='kind')return [{value:'SALARY',label:'Salary'},{value:'BONUS',label:'Bonus'},{value:'OTHER',label:'Other'}];return [];
}
function resolve(id,p,snapshot){validate(id,p);p=Object.assign({},p);var optional=snapshot&&snapshot.capabilities&&snapshot.capabilities.optionalPlanningVersion===1;if(optional){if(p.periodId===undefined)p.periodId='';if(id==='expense.create'&&p.categoryId===undefined)p.categoryId='';}
 ['categoryId','periodId','kind'].forEach(function(k){if(p[k]!==undefined&&p[k]!==''&&!choices(id,k,snapshot,p).some(function(c){return c.value===p[k];}))throw Error('That selection is no longer available.');});var required=get(id).required.slice();if(!optional){if(id==='expense.create')required.splice(1,0,'categoryId');required.push('periodId');}return {params:p,missing:required.filter(function(k){return p[k]===undefined;})};}
var forbidden=/\b(don't|dont|do not|not|without|except|excluding|all|every|bulk|two|both|unless|huwag|wag|lahat|maliban|pero|but)\b/;
function interpret(text,snapshot,now){
 var s=normalize(text);if(/^\d+(?:\.\d{1,2})?\s+[a-z]/.test(s))s='add '+s;if(!s||s.length>600)return {type:'unsupported',message:'Try one short question or action at a time.'};
 if(/^(what can you do|help|show available commands|paano kita gamitin|available commands)$/.test(s))return {type:'help'};
 var help=s.match(/^(?:help me manage|what can i ask about) (?:my )?(loans|expenses|funds|budgets|income)$/);if(help)return {type:'help',group:help[1]};
 s=s.replace(/^(?:please|can you|could you|paki)\s+/,'');
 var exact=entries.find(function(e){return e.handler==='route'&&normalize(e.example)===s;});if(exact)return {type:'route',id:exact.id};
 if(/^(?:open|show|take me to|ipakita mo)(?: my| mga)? (loans|utang ko|settings|funds|savings funds|home|budgets|transaction history|budget planning)$/.test(s)){
  var route=/settings/.test(s)?'settings.edit':/loans|utang/.test(s)?'loan.view':/fund/.test(s)?'fund.view':/history/.test(s)?'ledger.search':/budget/.test(s)?'budget.view':'ledger.summary';return {type:'route',id:route};
 }
 var action=s.match(/^(add|record|mag-add|deposit|withdraw|maghulog)\b/);
 if(!action){if(/^(delete|remove|edit|change|update|rename|archive|restore|burahin|palitan|move)\b/.test(s))return {type:'unsupported',message:'I cannot reliably interpret that as a precise change. I can help you find the exact item first. Open its existing review workflow; no changes have been made.',screen:/loan|utang|payment/.test(s)?'loans':/category|budget|goal/.test(s)?'plan':'history'};return {type:'query'};}
 if(!snapshot)return {type:'unsupported',message:'Download and unlock a ledger before preparing an entry.'};
 if(forbidden.test(s)||/\b(and|then|at|plus)\b/.test(s))return {type:'unsupported',message:'Please request one action without exclusions or conditions. Nothing has been saved.',screen:'add'};
 var id=/^(deposit|maghulog)/.test(s)?'fund.deposit':/^withdraw/.test(s)?'fund.withdraw':/\bincome\b/.test(s)?'income.create':'expense.create';
 if(/\b(loan|payment|utang|bayad)\b/.test(s))return {type:'route',id:'loan.record_payment'};
 var rest=s.slice(action[0].length).trim(),p={},note=rest.match(/\bnote\s+(.+)$/);if(note){p.note=note[1];rest=rest.slice(0,note.index).trim();}
 var date=rest.match(/\b\d{4}-\d{2}-\d{2}\b/);if(date){p.date=date[0];rest=rest.replace(date[0],' ');}
 if(/\btoday\b/.test(rest)){if(p.date)return {type:'unsupported',message:'Use one date per action.'};p.date=root.LedgerQuery.bounds('today',snapshot.timezone,now)[0];rest=rest.replace(/\btoday\b/,' ');}
 if(/[$€£¥]|\b(usd|dollars?|eur|euros?|yen)\b/.test(rest))return {type:'unsupported',message:'Use a peso amount; currency conversion is not supported.'};
 if(/[+-]\s*(?:₱\s*)?\d/.test(rest))return {type:'unsupported',message:'Use a positive amount without a sign.'};
 var amount=rest.match(/(?:₱\s*)?(?:\d[\d,.]*)/);if(amount){if(amount.index+amount[0].length<rest.length&&!/\s/.test(rest[amount.index+amount[0].length]))return {type:'unsupported',message:'Separate the peso amount from the description; shorthand amounts are not supported.'};var a=amount[0].replace(/₱|\s/g,'');if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(a))return {type:'unsupported',message:'Use a positive peso amount with at most two decimal places.'};p.amountMinor=root.LedgerQuery.cents(a.replace(/,/g,''));rest=rest.replace(amount[0],' ');}
 if(id==='income.create'){var kind=rest.match(/\b(salary|bonus|other)\b/);if(kind){p.kind=kind[0].toUpperCase();rest=rest.replace(kind[0],' ');}}
 var alias={pagkain:'food',pamasahe:'transport',transportation:'transport'};
 var possible=choices(id,'categoryId',snapshot),matches=[];
 possible.forEach(function(c){var names=[normalize(c.label)];Object.keys(alias).forEach(function(a){if(alias[a]===normalize(c.label))names.push(a);});if(names.some(function(name){var at=rest.indexOf(name);return at>=0&&(at===0||/\s/.test(rest[at-1]))&&(at+name.length===rest.length||/\s/.test(rest[at+name.length]));}))matches.push(c);});
 if(matches.length===1){p.categoryId=matches[0].value;var names=[normalize(matches[0].label)];Object.keys(alias).forEach(function(a){if(alias[a]===normalize(matches[0].label))names.push(a);});names.sort(function(a,b){return b.length-a.length;}).some(function(n){if(rest.indexOf(n)>=0){rest=rest.replace(n,' ');return true;}return false;});}
 else if(matches.length>1){return {type:'unsupported',message:'More than one category matches. Choose one in the existing entry workflow.',screen:'add'};}
 var lunch=rest.match(/\b(?:for\s+)?lunch\b/);if(lunch){if(!p.note)p.note='Lunch';rest=rest.replace(lunch[0],' ');}
 if(id.indexOf('fund.')===0)rest=rest.replace(/\b(savings|fund)\b/g,' ');
 rest=rest.replace(/\b(pesos?|expense|gastos|income|ng|na|sa|of|for|into|from|in|on|to|an|a)\b/g,' ').replace(/₱/g,' ').trim();
 if(rest&&id==='expense.create'&&snapshot.capabilities&&snapshot.capabilities.optionalPlanningVersion===1&&!/\b(tomorrow|yesterday|weekly|daily|monthly|before|after|until|instead|split|recurring|each|per|tom|bukas|kahapon)\b/.test(rest)&&!/[\d]/.test(rest)&&!p.note){p.note=rest;rest='';}
 if(rest)return {type:'unsupported',message:'I could not safely resolve “'+rest+'”. Choose the exact category or use the existing entry workflow.',screen:'add'};
 if(snapshot.capabilities&&snapshot.capabilities.optionalPlanningVersion===1&&!p.date)p.date=root.LedgerQuery.bounds('today',snapshot.timezone,now)[0];
 try{validate(id,p);return {type:'draft',id:id,params:p};}catch(e){return {type:'unsupported',message:e.message,screen:'add'};}
}
root.AssistantActions={list:function(){return JSON.parse(JSON.stringify(entries));},get:get,validate:validate,resolve:resolve,choices:choices,interpret:interpret,normalize:normalize};
})(typeof window!=='undefined'?window:globalThis);
