/* Deterministic cached-ledger query engine; no network or generated code. */
(function(root){
'use strict';
function fail(s){throw new Error(s);}
function cents(value){var m=/^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));if(!m)fail('A record has an invalid currency amount. Refresh or correct it in the sheet.');return safe(Number(m[1])*100+Number((m[2]||'').padEnd(2,'0')));}
function safe(n){if(!Number.isSafeInteger(n))fail('Amount or total exceeds supported precision.');return n;}
function add(a,b){return safe(a+b);}
function total(a,key){return a.reduce(function(n,r){return add(n,r[key||'minor']);},0);}
function rounded(n,d){if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||d<=0)fail('Invalid calculation denominator.');var sign=n<0?-1:1;n=Math.abs(n);var whole=Math.floor(n/d),rem=n%d;return sign*add(whole,rem>=Math.ceil(d/2)?1:0);}
// Multiply a ratio without an unsafe intermediate monetary product.
function ratio(n,d,factor){if(!d)return null;var sign=n<0?-1:1;n=Math.abs(n);return sign*add(safe(Math.floor(n/d)*factor),rounded(safe((n%d)*factor),d));}
function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||+s.slice(0,4)<2000||+s.slice(0,4)>2100)return false;var d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
function date(s){if(!validDate(s))fail('A ledger record has an invalid date. Correct it before querying.');return s;}
function iso(d){return d.toISOString().slice(0,10);}
function shift(s,n){return iso(new Date(Date.parse(s+'T00:00:00Z')+n*86400000));}
function today(tz,now){var p={};new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now||new Date()).forEach(function(x){p[x.type]=x.value;});return p.year+'-'+p.month+'-'+p.day;}
function live(s,t){return ((s.tables||{})[t]||[]).map(function(x){return x.record;}).filter(function(r){return !r.deleted_at;});}
function periods(s){var p=live(s,'PAY_PERIODS').slice().sort(function(a,b){return a.pay_date.localeCompare(b.pay_date)||a.period_id.localeCompare(b.period_id);});p.forEach(function(x,i){date(x.pay_date);if(i&&x.pay_date===p[i-1].pay_date)fail('Ambiguous pay periods: duplicate pay dates. Correct the Sheet.');});return p;}
function periodSelection(s,q,now){var p=periods(s),t=today(s.timezone,now),at=-1;p.forEach(function(x,i){if(x.pay_date<=t)at=i;});if(q.range==='period'){var hit=p.find(function(x){return x.period_id===q.periodId;});if(!hit)fail('Unknown pay period.');return [hit];}if(q.range==='next_period'){if(!p[at+1])fail('No next pay period is recorded. Add periods first.');return [p[at+1]];}if(at<0)fail('No current pay period is recorded.');if(q.range==='previous_period'){if(at<1)fail('No previous pay period is recorded.');return [p[at-1]];}if(q.range==='last_periods'){var n=q.periodCount;if(at+1<n)fail('Not enough recorded pay periods for that request.');return p.slice(at-n+1,at+1);}return [p[at]];}
var periodRanges=['current_period','previous_period','next_period','last_periods','period'];
function bounds(range,tz,now,s,q){var t=today(tz,now),y=+t.slice(0,4),m=+t.slice(5,7),d=new Date(t+'T00:00:00Z');q=q||{};
 if(range==='all')return null;if(range==='today')return [t,t];if(range==='yesterday')return [shift(t,-1),shift(t,-1)];
 if(range==='this_week'||range==='last_week'){var start=shift(t,-((d.getUTCDay()+6)%7)-(range==='last_week'?7:0));return [start,shift(start,6)];}
 if(range==='this_year')return [y+'-01-01',y+'-12-31'];
 if(range==='this_month'||range==='last_month'){if(range==='last_month')m--;return [iso(new Date(Date.UTC(y,m-1,1))),iso(new Date(Date.UTC(y,m,0)))];}
 if(range==='dates')return [q.startDate,q.endDate];
 if(periodRanges.indexOf(range)>=0){if(!s)fail('A complete ledger is needed for pay periods.');var chosen=periodSelection(s,q,now),all=periods(s),last=chosen[chosen.length-1],idx=all.indexOf(last),end=all[idx+1]?shift(all[idx+1].pay_date,-1):t;if(end<last.pay_date)fail('The next pay period has no recorded end boundary. Add another pay period.');return [chosen[0].pay_date,end];}
 fail('Unsupported date range.');
}
var operations=['sum','average','min','max','top','count','list','categories','compare','cashflow','share','budgets','funds','loans','trends','frequency','recurring','savings_rate','afford'];
function validate(q){
 var allowed=['action','operation','kind','range','categoryId','incomeKind','minMinor','maxMinor','text','entryId','limit','startDate','endDate','periodId','periodCount','unit','mode','loanId','amountMinor','contributionMinor','incomeBasis'];
 if(!q||typeof q!=='object'||Array.isArray(q)||Object.keys(q).some(function(k){return allowed.indexOf(k)<0;}))fail('Unsupported query fields.');
 if(q.action!=='query'||operations.indexOf(q.operation)<0)fail('Unsupported query operation.');
 if(['expense','income'].indexOf(q.kind)<0||['all','today','yesterday','this_week','last_week','this_month','last_month','this_year','dates'].concat(periodRanges).indexOf(q.range)<0)fail('Choose an explicit record type and date range.');
 ['categoryId','text','entryId','loanId','periodId'].forEach(function(k){if(q[k]!==undefined&&(typeof q[k]!=='string'||!q[k]||q[k].length>200))fail('Invalid '+k);});
 ['minMinor','maxMinor','amountMinor','contributionMinor'].forEach(function(k){if(q[k]!==undefined&&(!Number.isSafeInteger(q[k])||q[k]<0))fail('Invalid amount filter.');});
 if(q.minMinor!==undefined&&q.maxMinor!==undefined&&q.minMinor>q.maxMinor)fail('Invalid amount range.');
 if(q.incomeBasis!==undefined&&(q.operation!=='share'||['salary','all'].indexOf(q.incomeBasis)<0))fail('Income basis only applies to spending share.');
 if(q.incomeKind!==undefined&&['SALARY','BONUS','OTHER'].indexOf(q.incomeKind)<0)fail('Invalid income kind.');
 if(q.limit!==undefined&&(!Number.isInteger(q.limit)||q.limit<1||q.limit>50||['top','list','categories','frequency','recurring'].indexOf(q.operation)<0))fail('Limit must be between 1 and 50 for a ranked query.');
 if(q.range==='dates'){if(!validDate(q.startDate)||!validDate(q.endDate)||q.startDate>q.endDate)fail('Use a valid, ordered ISO date range.');}else if(q.startDate!==undefined||q.endDate!==undefined)fail('Dates require an explicit date range.');
 if((q.range==='period')!==(q.periodId!==undefined))fail('Period ID requires the period range.');
 if(q.range==='last_periods'){if(!Number.isInteger(q.periodCount)||q.periodCount<1||q.periodCount>24)fail('Choose 1–24 pay periods.');}else if(q.periodCount!==undefined)fail('Period count requires last pay periods.');
 if(q.incomeKind&&q.kind!=='income')fail('Filter does not match record type.');
 if(q.categoryId&&q.kind!=='expense')fail('Filter does not match record type.');
 if(q.unit!==undefined&&(q.operation!=='average'||['day','week','month','period','entry'].indexOf(q.unit)<0))fail('Unsupported average unit.');
 if(q.loanId!==undefined&&q.operation!=='loans')fail('Loan filter requires a loan query.');
 if(q.amountMinor!==undefined&&q.operation!=='afford')fail('Amount requires an affordability query.');
 if(q.operation==='afford'&&(!q.amountMinor||!q.categoryId))fail('Specify an amount and spending category to check the remaining plan.');
 if(q.contributionMinor!==undefined&&(q.operation!=='funds'||(q.mode||'balance')!=='goal'||!q.categoryId||!q.contributionMinor))fail('Specify a fund and positive monthly contribution.');
 var modes={budgets:['remaining','over','utilization','unallocated','compare'],funds:['balance','goal','deposits','withdrawals','contributions'],loans:['balance','paid','progress','installments','due','overdue','next']};
 if(q.mode!==undefined&&(!modes[q.operation]||modes[q.operation].indexOf(q.mode)<0))fail('Unsupported query mode.');
 if(['categories','frequency','recurring','budgets','funds','loans','afford','savings_rate','share','trends'].indexOf(q.operation)>=0&&q.kind!=='expense')fail('This operation requires the expense basis.');
 if(['sum','average','min','max','top','count','list','categories','compare','frequency','recurring'].indexOf(q.operation)<0&&(q.minMinor!==undefined||q.maxMinor!==undefined||q.text||q.entryId||q.incomeKind))fail('This operation does not support those filters.');
 if(['cashflow','savings_rate','loans','trends'].indexOf(q.operation)>=0&&q.categoryId)fail('This operation does not support a category filter.');
 if(q.operation==='budgets'&&q.mode==='unallocated'&&q.categoryId)fail('Unallocated income is a whole-pay-period calculation, not a category balance.');
 if(q.operation==='share'&&q.categoryId)fail('Income share does not support a category filter.');
 if((q.operation==='compare'||(q.operation==='budgets'&&q.mode==='compare'))&&['this_month','current_period'].indexOf(q.range)<0)fail('Compare this month or current pay period with its previous period.');
 if(['budgets','afford'].indexOf(q.operation)>=0&&periodRanges.indexOf(q.range)<0)fail('Budget questions require recorded pay periods, not calendar date ranges.');
 if(q.operation==='average'&&q.unit==='period'&&periodRanges.indexOf(q.range)<0)fail('A per-pay-period average requires a pay-period range.');
 if(q.operation==='trends'&&q.range!=='last_periods')fail('Trends require last N pay periods.');
 if(q.operation==='funds'&&['balance','goal'].indexOf(q.mode||'balance')>=0&&q.range!=='all')fail('Fund balances and goals are all-time; ask deposits or withdrawals for a period.');
 if(q.operation==='loans'&&['balance','progress','installments'].indexOf(q.mode||'balance')>=0&&q.range!=='all')fail('Loan balances and installment coverage are all-time. Use due or paid for a date range.');
 if(q.operation==='loans'&&q.mode==='next'&&q.range!=='all')fail('Next obligation uses all unpaid installments.');
 if(q.operation==='loans'&&q.mode==='overdue'&&q.range!=='all')fail('Overdue means all unpaid installments before today.');
 return q;
}
function query(s,q,now){validate(q);if(!s||!s.tables||!s.timezone)fail('Refresh online once to download a complete ledger.');
 var required={budgets:['BUDGET_LINES','PAY_PERIODS','CATEGORIES','TRANSACTIONS','INCOME'],afford:['BUDGET_LINES','PAY_PERIODS','CATEGORIES','TRANSACTIONS','INCOME'],funds:['CATEGORIES','TRANSACTIONS','FUND_GOALS'],loans:['LOANS','LOAN_PAYMENTS','LOAN_INSTALLMENTS'],trends:['PAY_PERIODS','TRANSACTIONS']}[q.operation]||[];if(required.some(function(name){return !Array.isArray(s.tables[name]);}))fail('A complete ledger is needed for this question. Refresh online to download the missing tables.');
 var cats=live(s,'CATEGORIES'),chosen=q.categoryId&&cats.find(function(c){return c.category_id===q.categoryId;});if(q.categoryId&&!chosen)fail('Unknown category.');
 if(chosen&&chosen.kind!==(q.operation==='funds'?'FUND':'SPENDING'))fail('Choose a matching spending category or fund.');
 var t=today(s.timezone,now),dates=bounds(q.range,s.timezone,now,s,q),selected=periodRanges.indexOf(q.range)>=0?periodSelection(s,q,now):null;
 function reportPeriod(r,when){if(r.period_id)return r.period_id;var found='';live(s,'PAY_PERIODS').sort(function(a,b){return a.pay_date.localeCompare(b.pay_date);}).forEach(function(p){if(p.pay_date<=when)found=p.period_id;});return found;}
 function contains(r,dt,sel){return sel?sel.some(function(p){return p.period_id===r.period_id;}):!dt||(r.date>=dt[0]&&r.date<=dt[1]);}
 function records(kind,range,filters){var qq=Object.assign({},q,{range:range}),dt=bounds(range,s.timezone,now,s,qq),sel=periodRanges.indexOf(range)>=0?periodSelection(s,qq,now):null;
  return live(s,kind==='income'?'INCOME':'TRANSACTIONS').filter(function(r){return kind==='income'||r.type==='EXPENSE';}).map(function(r){return {id:kind==='income'?r.income_id:r.txn_id,date:date(kind==='income'?r.received_date:r.txn_date),minor:cents(r.amount),categoryId:r.category_id||'',period_id:reportPeriod(r,kind==='income'?r.received_date:r.txn_date),planPeriodId:r.period_id||'',incomeKind:r.kind||'',note:r.note||'',source:r.source||''};}).filter(function(r){return contains(r,dt,sel)&&(!filters||((!q.categoryId||r.categoryId===q.categoryId)&&(!q.incomeKind||r.incomeKind===q.incomeKind)&&(q.minMinor===undefined||r.minor>=q.minMinor)&&(q.maxMinor===undefined||r.minor<=q.maxMinor)&&(!q.text||(r.note+' '+r.source).toLowerCase().indexOf(q.text.toLowerCase())>=0)&&(!q.entryId||r.id===q.entryId)));});
 }
 var rows=records(q.kind,q.range,true);rows.forEach(function(x){var c=cats.find(function(c){return c.category_id===x.categoryId;});x.categoryName=c?c.name:x.categoryId?'Unknown category ('+x.categoryId+')':'Uncategorized';});var r={operation:q.operation,count:rows.length,totalMinor:total(rows),range:q.range,kind:q.kind,incomeKind:q.incomeKind,rows:[],dates:dates,timezone:s.timezone,items:[],messages:[],categoryName:chosen&&chosen.name};
 if(selected)r.periodLabels=selected.map(function(p){return p.label+' ('+p.pay_date+')';});
 function catName(id){var c=cats.find(function(c){return c.category_id===id;});return c?c.name:id?'Unknown category ('+id+')':'Uncategorized';}
 function income(){return total(records('income',q.range,false));}function spending(){return total(records('expense',q.range,false));}
 if(q.operation==='average'){
  var unit=q.unit||'entry',den=rows.length,num=r.totalMinor;
  if(unit==='period')den=selected.length;
  if(['day','week','month'].indexOf(unit)>=0){var start=dates?dates[0]:rows.length?rows.reduce(function(a,b){return a<b.date?a:b.date;},rows[0].date):t,end=dates?dates[1]:t;
   if(['this_week','this_month','this_year','current_period','last_periods'].indexOf(q.range)>=0&&end>t){end=t;rows=rows.filter(function(x){return x.date<=t;});num=total(rows);r.count=rows.length;r.totalMinor=num;r.messages.push('Average excludes future-dated records; elapsed days include days with no spending.');}
   if(!dates&&rows.some(function(x){return x.date>t;}))fail('All-time averages with future-dated records need an explicit date range.');
   den=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;if(den<1)fail('Average range has not started.');
   if(unit==='month')den=(+end.slice(0,4)-+start.slice(0,4))*12+(+end.slice(5,7)-+start.slice(5,7))+1;
   r.averageDates=[start,end];if(selected)r.messages.push('Records use assigned pay periods; the daily denominator uses their pay-date window. Backdated assignments remain included.');
  }r.averageMinor=den?(unit==='week'?ratio(num,den,7):rounded(num,den)):null;r.denominator=den;r.unit=unit;
 }
 if(['min','max','top','list'].indexOf(q.operation)>=0){rows.sort(function(a,b){return q.operation==='list'?b.date.localeCompare(a.date)||a.id.localeCompare(b.id):(q.operation==='min'?a.minor-b.minor:b.minor-a.minor)||a.id.localeCompare(b.id);});r.rows=rows.slice(0,['min','max'].indexOf(q.operation)>=0?1:q.limit||5);}
 if(q.operation==='categories'||q.operation==='frequency'){
  var groups=Object.create(null);rows.forEach(function(x){if(!groups[x.categoryId])groups[x.categoryId]={id:x.categoryId,name:catName(x.categoryId),minor:0,count:0};var g=groups[x.categoryId];g.minor=add(g.minor,x.minor);g.count++;});
  r.categoryCount=Object.keys(groups).length;r.categories=Object.keys(groups).map(function(k){var g=groups[k];g.shareBasisPoints=ratio(g.minor,r.totalMinor,10000);return g;}).sort(function(a,b){return q.operation==='frequency'?b.count-a.count||a.id.localeCompare(b.id):b.minor-a.minor||a.id.localeCompare(b.id);}).slice(0,q.limit||50);if(r.categories.length<r.categoryCount)r.messages.push('Showing '+r.categories.length+' of '+r.categoryCount+' categories.');
 }
 if(q.operation==='compare'){var prevRange=q.range==='current_period'?'previous_period':'last_month',prev=records(q.kind,prevRange,true);r.previousMinor=total(prev);r.previousCount=prev.length;r.differenceMinor=add(r.totalMinor,-r.previousMinor);r.changeBasisPoints=ratio(r.differenceMinor,r.previousMinor,10000);r.previousDates=bounds(prevRange,s.timezone,now,s,q);}
 if(['cashflow','savings_rate','share'].indexOf(q.operation)>=0){r.incomeBasis=q.incomeBasis||'all';r.incomeMinor=q.operation==='share'&&q.incomeBasis==='salary'?total(records('income',q.range,false).filter(function(x){return x.incomeKind==='SALARY';})):income();r.expenseMinor=spending();r.netMinor=add(r.incomeMinor,-r.expenseMinor);r.rateBasisPoints=ratio(q.operation==='share'?r.expenseMinor:r.netMinor,r.incomeMinor,10000);r.count=records('income',q.range,false).length+records('expense',q.range,false).length;}
 function budget(sel){var lines=live(s,'BUDGET_LINES').filter(function(b){return sel.some(function(p){return p.period_id===b.period_id;})&&(!chosen||b.category_id===chosen.category_id);}),seen=Object.create(null),groups=Object.create(null);
  lines.forEach(function(b){var key=b.period_id+'|'+b.category_id;if(seen[key])fail('Duplicate budget lines. Correct the Sheet before querying.');seen[key]=true;var c=cats.find(function(c){return c.category_id===b.category_id;});if(!c)fail('A budget refers to a missing or deleted category. Correct the Sheet before querying plans.');if(c.kind!=='SPENDING')return;var g=groups[b.category_id]||(groups[b.category_id]={id:b.category_id,name:c.name,plannedMinor:0,actualMinor:0,hasPlan:true});g.plannedMinor=add(g.plannedMinor,cents(b.planned_amount));});
  records('expense','all',false).filter(function(x){return sel.some(function(p){return p.period_id===x.planPeriodId;})&&(!chosen||x.categoryId===chosen.category_id);}).forEach(function(x){var g=groups[x.categoryId]||(groups[x.categoryId]={id:x.categoryId,name:catName(x.categoryId),plannedMinor:0,actualMinor:0,hasPlan:false});g.actualMinor=add(g.actualMinor,x.minor);});
  if(chosen&&!groups[chosen.category_id])groups[chosen.category_id]={id:chosen.category_id,name:chosen.name,plannedMinor:0,actualMinor:0,hasPlan:false};
  return Object.keys(groups).map(function(k){var g=groups[k];g.remainingMinor=add(g.plannedMinor,-g.actualMinor);g.utilizationBasisPoints=ratio(g.actualMinor,g.plannedMinor,10000);return g;}).sort(function(a,b){return a.name.localeCompare(b.name)||a.id.localeCompare(b.id);});
 }
 if(q.operation==='budgets'||q.operation==='afford'){
  r.budgets=budget(selected);r.plannedMinor=total(r.budgets,'plannedMinor');r.actualMinor=total(r.budgets,'actualMinor');r.remainingMinor=add(r.plannedMinor,-r.actualMinor);r.mode=q.mode||'remaining';r.incomeMinor=income();r.hasIncome=records('income',q.range,false).length>0;
  r.allocationMinor=total(live(s,'BUDGET_LINES').filter(function(b){return selected.some(function(p){return p.period_id===b.period_id;});}).map(function(b){return {minor:cents(b.planned_amount)};}));r.unallocatedMinor=add(r.incomeMinor,-r.allocationMinor);
  if(q.mode==='compare'){var previous=periodSelection(s,{range:'previous_period'},now);r.previousBudgets=budget(previous);r.previousPlannedMinor=total(r.previousBudgets,'plannedMinor');r.previousActualMinor=total(r.previousBudgets,'actualMinor');}
  if(q.operation==='afford'){r.amountMinor=q.amountMinor;r.fitsPlan=r.budgets[0].hasPlan?q.amountMinor<=r.remainingMinor:null;}
 }
 if(q.operation==='funds'){
  r.mode=q.mode||'balance';r.funds=cats.filter(function(c){return c.kind==='FUND'&&(!chosen||c.category_id===chosen.category_id);}).map(function(c){
   var tx=live(s,'TRANSACTIONS').filter(function(x){return x.category_id===c.category_id&&['FUND_IN','FUND_OUT'].indexOf(x.type)>=0;}),balance=0,deposits=0,withdrawals=0,count=0;
   tx.forEach(function(x){var amount=cents(x.amount),dt=date(x.txn_date);balance=add(balance,x.type==='FUND_IN'?amount:-amount);if(contains({date:dt,period_id:reportPeriod(x,x.txn_date)},dates,selected)){if(x.type==='FUND_IN')deposits=add(deposits,amount);else withdrawals=add(withdrawals,amount);count++;}});
   var goals=live(s,'FUND_GOALS').filter(function(g){return g.category_id===c.category_id;});if(goals.length>1)fail('Duplicate fund goals. Correct the Sheet.');var target=goals.length?cents(goals[0].target_amount):0;
   return {id:c.category_id,name:c.name,balanceMinor:balance,depositsMinor:deposits,withdrawalsMinor:withdrawals,count:count,contributionsMinor:add(deposits,-withdrawals),targetMinor:target,neededMinor:Math.max(0,add(target,-balance)),progressBasisPoints:target?ratio(balance,target,10000):null,months:q.contributionMinor?Math.ceil(Math.max(0,add(target,-balance))/q.contributionMinor):null};
  });r.totalMinor=total(r.funds,r.mode==='deposits'?'depositsMinor':r.mode==='withdrawals'?'withdrawalsMinor':r.mode==='contributions'?'contributionsMinor':'balanceMinor');r.contributionMinor=q.contributionMinor;
 }
 if(q.operation==='loans'){
  r.mode=q.mode||'balance';var loans=live(s,'LOANS');if(q.loanId){loans=loans.filter(function(l){return l.loan_id===q.loanId;});if(!loans.length)fail('Unknown loan.');}
  r.loans=loans.map(function(l){var allPayments=live(s,'LOAN_PAYMENTS').filter(function(p){return p.loan_id===l.loan_id;}),paid=total(allPayments.map(function(p){date(p.paid_date);return {minor:cents(p.amount)};})),due=cents(l.total_payable),pool=paid;
   var ins=live(s,'LOAN_INSTALLMENTS').filter(function(i){return i.loan_id===l.loan_id;}).sort(function(a,b){return a.seq_no-b.seq_no||a.due_date.localeCompare(b.due_date)||a.installment_id.localeCompare(b.installment_id);}).map(function(i){var amount=cents(i.amount_due),covered=Math.min(pool,amount);pool=add(pool,-covered);return {id:i.installment_id,name:l.name,date:date(i.due_date),minor:add(amount,-covered),coveredMinor:covered,status:amount===covered?'PAID':i.due_date<t?'OVERDUE':covered?'PARTIAL':'UPCOMING'};});
   if(paid>due)fail('Recorded loan payments exceed total payable. Correct the Sheet.');return {id:l.loan_id,name:l.name,totalMinor:due,paidMinor:paid,remainingMinor:add(due,-paid),rangePaidMinor:total(allPayments.filter(function(p){return !dates||p.paid_date>=dates[0]&&p.paid_date<=dates[1];}).map(function(p){return {minor:cents(p.amount)};})),progressBasisPoints:ratio(paid,due,10000),scheduleComplete:add(total(ins,'minor'),total(ins,'coveredMinor'))===due,installments:ins};
  });if(['due','overdue','next','installments'].indexOf(r.mode)>=0&&r.loans.some(function(l){return !l.scheduleComplete;}))fail('A loan installment schedule is missing or does not match total payable. Due amounts cannot be determined reliably.');
  r.installments=[];r.loans.forEach(function(l){r.installments=r.installments.concat(l.installments);});r.installments.sort(function(a,b){return a.date.localeCompare(b.date)||a.id.localeCompare(b.id);});
  if(['due','overdue','next'].indexOf(r.mode)>=0){r.installments=r.installments.filter(function(i){return i.minor>0&&(r.mode==='overdue'?i.date<t:r.mode==='next'?true:!dates||i.date>=dates[0]&&i.date<=dates[1]);});if(r.mode==='next'&&r.installments.length){var first=r.installments[0].date;r.installments=r.installments.filter(function(i){return i.date===first;});}}
  r.totalMinor=total(r.loans,r.mode==='paid'?'rangePaidMinor':r.mode==='progress'?'paidMinor':'remainingMinor');if(['due','overdue','next'].indexOf(r.mode)>=0)r.totalMinor=total(r.installments);
 }
 if(q.operation==='trends'){
  r.periods=selected.map(function(p){var expense=records('expense',q.range,false).filter(function(x){return x.period_id===p.period_id;});return {id:p.period_id,name:p.label+' ('+p.pay_date+')',minor:total(expense),count:expense.length};});r.highest=r.periods.slice().sort(function(a,b){return b.minor-a.minor||a.id.localeCompare(b.id);})[0];r.highestPeriods=r.highest?r.periods.filter(function(p){return p.minor===r.highest.minor;}):[];if(!r.count)r.highest=null;
 }
 if(q.operation==='recurring'){
  var repeated=Object.create(null);rows.forEach(function(x){var key=JSON.stringify([x.categoryId,x.minor]);if(!repeated[key])repeated[key]={name:catName(x.categoryId),minor:x.minor,count:0,dates:[]};var g=repeated[key];g.count++;if(g.dates.indexOf(x.date)<0)g.dates.push(x.date);});r.candidates=Object.keys(repeated).map(function(k){return repeated[k];}).filter(function(g){return g.count>=2&&g.dates.length>=2;}).sort(function(a,b){return b.count-a.count||b.minor-a.minor||a.name.localeCompare(b.name);}).slice(0,q.limit||5);
 }
 return r;
}
function normalize(text){if(typeof text!=='string'||text.length>500||/[\u0000-\u001f<>]/.test(text))fail('Use a short, plain-text ledger question.');return text.toLowerCase().replace(/[’‘]/g,"'").trim().replace(/[?!.]+$/,'').replace(/\s+/g,' ');}
function entityKey(s){return s.toLowerCase().replace(/[\s\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e\u2000-\u206f]+/g,' ').trim().replace(/\s+/g,' ');}
var aliases={food:['pagkain','groceries','grocery'],transport:['pamasahe','transportation','commute'],salary:['sahod','sweldo'],savings:['ipon']};
function resolve(s,type,name){if(!s||!s.tables)fail('Refresh online once to download names.');var key=entityKey(name),table=type==='loan'?'LOANS':'CATEGORIES',rows=live(s,table).filter(function(x){return type==='loan'||x.kind===(type==='fund'?'FUND':'SPENDING');});
 var matches=rows.filter(function(x){return entityKey(x.name)===key;});
 if(!matches.length){var canonical=Object.keys(aliases).filter(function(k){return aliases[k].indexOf(key)>=0;});matches=rows.filter(function(x){return canonical.indexOf(entityKey(x.name))>=0;});}
 if(matches.length!==1)fail(matches.length?'That name is ambiguous. Rename duplicate categories or loans to distinguish them.':'No matching '+type+' named "'+name+'". Use its name from your ledger.');return matches[0][type==='loan'?'loan_id':'category_id'];
}
var months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function parseTime(text,s,now){var q={},t=text,terms=[['today|ngayon','today'],['yesterday|kahapon','yesterday'],['this week','this_week'],['last week','last_week'],['this month|ngayong buwan','this_month'],['last month|nakaraang buwan','last_month'],['this year','this_year'],['this cutoff|this payday|this pay period|current pay period|ngayong cutoff','current_period'],['last cutoff|previous cutoff|last pay period|previous pay period','previous_period'],['next payday|next cutoff|next pay period','next_period'],['all time|all recorded dates','all']];
 function suffix(pattern){return new RegExp('(?: (?:for|in|during|on))? ('+pattern+')$').exec(t);}
 var range=/(?: (?:from|between))? (\d{4}-\d{2}-\d{2}) (?:to|through|and) (\d{4}-\d{2}-\d{2})$/.exec(t);
 if(range){q.range='dates';q.startDate=range[1];q.endDate=range[2];return {text:t.slice(0,range.index),fields:q};}
 var n=suffix('last (\\d+) (?:pay periods|cutoffs)');if(n){q.range='last_periods';q.periodCount=Number(n[2]);return {text:t.slice(0,n.index),fields:q};}
 for(var i=0;i<terms.length;i++){var m=suffix(terms[i][0]);if(m){q.range=terms[i][1];return {text:t.slice(0,m.index),fields:q};}}
 var mon=new RegExp('(?: (?:for|in|during))? ('+months.map(function(x){return x+'|'+x.slice(0,3);}).join('|')+')(?: (\\d{4}))?$').exec(t);
 if(mon){var month=months.findIndex(function(x){return x===mon[1]||x.slice(0,3)===mon[1];}),year=mon[2]?+mon[2]:+(s?today(s.timezone,now):'').slice(0,4);if(!year)fail('A saved ledger timezone is needed to choose the year.');q.range='dates';q.startDate=iso(new Date(Date.UTC(year,month,1)));q.endDate=iso(new Date(Date.UTC(year,month+1,0)));return {text:t.slice(0,mon.index),fields:q};}
 // Calendar name at the start of a deliberately bounded "show October spending" template.
 var front=new RegExp('^show ('+months.join('|')+')(?: (\\d{4}))? (spending|expenses)$').exec(t);
 if(front)return parseTime('total expenses '+front[1]+(front[2]?' '+front[2]:''),s,now);
 return {text:t,fields:q};
}
function interpret(text,s,now){var original=normalize(text),q={action:'query',operation:'sum',kind:'expense',range:'all'};
 // Comparisons consume the entire sentence before general time extraction.
 if(/^(?:compare this month's expenses with last month's|did i spend more this month than last month)$/.test(original))return validate(Object.assign(q,{operation:'compare',range:'this_month'}));
 if(/^(?:did i spend more this cutoff than the previous one|compare (?:gastos ko|spending) last cutoff|compare this (?:cutoff|pay period) (?:with|to) (?:the )?(?:previous|last) (?:one|cutoff|pay period))$/.test(original))return validate(Object.assign(q,{operation:'compare',range:'current_period'}));
 if(/^(?:compare (?:spending|expenses) this month (?:with|to) last month)$/.test(original))return validate(Object.assign(q,{operation:'compare',range:'this_month'}));
 if(/^compare budgets (?:across pay periods|this cutoff with last cutoff)$/.test(original))return validate(Object.assign(q,{operation:'budgets',mode:'compare',range:'current_period'}));
 var parsed=parseTime(original,s,now),t=parsed.text;Object.assign(q,parsed.fields);
 function done(fields,defaultRange){if(defaultRange&&!parsed.fields.range)q.range=defaultRange;return validate(Object.assign(q,fields));}
 function cat(name,type){return resolve(s,type||'category',name);}
 var m;
 if(/^(?:how much (?:money )?did i spend|how much have i spent|total expenses|my spending|my expenses|show (?:my )?(?:spending|expenses)|what were my expenses|magkano (?:gastos|nagastos)(?: ko)?|magkano na nagastos ko)$/.test(t))return done({});
 if((m=/^(?:how much (?:money )?did i spend on|spending on|expenses for|magkano gastos ko sa) (.+)$/.exec(t)))return done({categoryId:cat(m[1])});
 if((m=/^(?:how much )?(salary|bonuses|bonus|other income|income)(?: did i receive| have i received)?$/.exec(t))|| (m=/^total (salary|bonuses|bonus|other income|income)$/.exec(t))){var kind={salary:'SALARY',bonuses:'BONUS',bonus:'BONUS','other income':'OTHER'}[m[1]];var f={kind:'income'};if(kind)f.incomeKind=kind;return done(f);}
 if(/^(?:magkano (?:sahod|sweldo) ko|sahod ko)$/.test(t))return done({kind:'income',incomeKind:'SALARY'});
 if((m=/^(?:what(?:'s| is) my |show my )?(biggest|largest|smallest) expense$/.exec(t)))return done({operation:m[1]==='smallest'?'min':'max'});
 if(/^ano pinakamalaking gastos ko$/.test(t))return done({operation:'max'});
 if((m=/^(?:what are my |show my )?top (\d+|five) expenses$/.exec(t)))return done({operation:'top',limit:m[1]==='five'?5:+m[1]});
 if((m=/^(?:what(?:'s| is) my |show my )?average (daily|weekly|monthly|per-pay-period|per pay period|per transaction) spending$/.exec(t)))return done({operation:'average',unit:{daily:'day',weekly:'week',monthly:'month','per-pay-period':'period','per pay period':'period','per transaction':'entry'}[m[1]]},m[1].indexOf('pay')>=0?'current_period':'this_month');
 if(/^(?:which category accounts for most of my spending|spending by category|top spending categories|which category ate most of my paycheck|saan napunta sahod ko)$/.test(t))return done({operation:'categories'},/paycheck|sahod/.test(t)?'current_period':null);
 if(/^(?:most frequently used expense categories|most frequent expense categories)$/.test(t))return done({operation:'frequency'});
 if(/^(?:repeated transactions|recurring expenses|recurring expense candidates)$/.test(t))return done({operation:'recurring'});
 if(/^(?:spending trends|highest spending periods|highest-spending periods)$/.test(t)){if(!parsed.fields.range){q.range='last_periods';q.periodCount=3;}return done({operation:'trends'});}
 if(/^(?:how much money came in versus went out|income minus spending|net recorded income)$/.test(t))return done({operation:'cashflow'});
 if(/^(?:how much of my salary have i spent|spending as a percentage of recorded income|what percentage of my income have i spent)$/.test(t))return done({operation:'share',incomeBasis:/salary/.test(t)?'salary':'all'},'current_period');
 if(/^(?:what(?:'s| is) my savings rate|savings rate)$/.test(t))return done({operation:'savings_rate'},'this_month');
 if(/^(?:which budgets am i exceeding|am i still within my budget|saan ako sumobra|over budget categories)$/.test(t))return done({operation:'budgets',mode:'over'},'current_period');
 if(/^(?:magkano natira sa budget ko|remaining budget|planned budget versus actual expenses|budget utilization)$/.test(t))return done({operation:'budgets',mode:t==='budget utilization'?'utilization':'remaining'},'current_period');
 if(/^(?:unallocated paycheck|how much is left to allocate|how much of my paycheck is unallocated)$/.test(t))return done({operation:'budgets',mode:'unallocated'},'current_period');
 if((m=/^(?:how much do i have left for|remaining budget for|budget for) (.+)$/.exec(t)))return done({operation:'budgets',categoryId:cat(m[1]),mode:'remaining'},'current_period');
 if((m=/^can i afford (?:₱|php )?(\d+(?:\.\d{1,2})?) (?:for|on) (.+)$/.exec(t)))return done({operation:'afford',amountMinor:cents(m[1]),categoryId:cat(m[2])},'current_period');
 if(/^(?:fund balances|how much have i saved|magkano (?:na laman ng savings|savings|ipon) ko)$/.test(t)){
  if(q.range==='today'&&/ngayon$/.test(original))return done({operation:'funds',mode:'balance',range:'all'});
  return done({operation:'funds',mode:parsed.fields.range?'deposits':'balance'});
 }
 if((m=/^(?:balance of|fund balance for|how much is in|magkano laman ng) (.+)$/.exec(t)))return done({operation:'funds',mode:'balance',categoryId:cat(m[1],'fund')});
 if((m=/^(?:how close am i to my|progress toward|how much more do i need for my) (.+?)(?: goal| target)$/.exec(t)))return done({operation:'funds',mode:'goal',categoryId:cat(m[1],'fund')});
 if((m=/^(?:fund )?(deposits|withdrawals|contributions)(?: (to|from|for) (.+))?$/.exec(t))){if(m[2]&&((m[1]==='withdrawals'&&m[2]==='to')||(m[1]!=='withdrawals'&&m[2]==='from')))fail('Use deposits/contributions to a fund, or withdrawals from a fund.');return done(Object.assign({operation:'funds',mode:m[1]},m[3]?{categoryId:cat(m[3],'fund')}:{}));}
 if((m=/^when will i reach (.+?) (?:goal|target) (?:if i (?:save|deposit)|saving) (?:₱|php )?(\d+(?:\.\d{1,2})?) (?:per month|monthly)$/.exec(t)))return done({operation:'funds',mode:'goal',categoryId:cat(m[1],'fund'),contributionMinor:cents(m[2])});
 if(/^(?:how much do i still owe|outstanding loan balances|total debt|magkano utang ko)$/.test(t))return done({operation:'loans',mode:'balance'});
 if(/^(?:how much debt have i paid off|loan payments|debt repaid)$/.test(t))return done({operation:'loans',mode:'paid'});
 if(/^(?:loan repayment progress|loan progress)$/.test(t))return done({operation:'loans',mode:'progress'});
 if(/^(?:paid versus unpaid installments|loan installments)$/.test(t))return done({operation:'loans',mode:'installments'});
 if(/^(?:overdue installments|overdue loans)$/.test(t))return done({operation:'loans',mode:'overdue'});
 if(/^(?:next payment obligations|next loan payment)$/.test(t))return done({operation:'loans',mode:'next'});
 if(/^(?:what loans are due|loans due|may utang ba akong due|may due ba akong loans|may due ba akong loans na)$/.test(t))return done({operation:'loans',mode:'due'},'this_month');
 if((m=/^(balance|progress|payments|installments|due dates) (?:for|of) loan (.+)$/.exec(t)))return done({operation:'loans',mode:{balance:'balance',progress:'progress',payments:'paid',installments:'installments','due dates':'due'}[m[1]],loanId:resolve(s,'loan',m[2])});
 fail('I cannot reliably interpret that yet. Try a supported question with an exact ledger name. Extra conditions, exclusions and chat-based changes are not supported.');
}
// Presentation consumes verified facts; it has no access to records, synchronization or mutations.
function format(r,currency){var nf=new Intl.NumberFormat('en',{minimumFractionDigits:2,maximumFractionDigits:2});function money(n){return (n<0?'−':'')+(currency||'₱')+nf.format(Math.abs(n)/100);}function pc(n){return n===null?'Not defined':(n/100).toFixed(2)+'%';}
 var out={label:r.dates?r.dates[0]+' – '+r.dates[1]+' · '+r.timezone:'All recorded dates',value:null,detail:[],items:[],comparison:null};
 var titles={sum:r.kind==='income'?'Recorded '+(r.incomeKind?r.incomeKind.toLowerCase()+' income':'income'):'Recorded spending',average:'Average '+r.kind,min:'Smallest '+r.kind,max:'Largest '+r.kind,top:'Top '+r.kind+' records',categories:'Spending by category',frequency:'Expense category frequency',cashflow:'Income minus spending',share:'Spending share',savings_rate:'Recorded savings rate',budgets:'Budget analysis',afford:'Remaining plan check',funds:r.mode==='goal'?'Savings goal progress':r.mode==='deposits'?'Fund deposits':r.mode==='withdrawals'?'Fund withdrawals':r.mode==='contributions'?'Net fund contributions':'Fund balances',loans:r.mode==='paid'?'Recorded debt repayments':r.mode==='due'?'Unpaid installments due':r.mode==='next'?'Next unpaid obligations':r.mode==='overdue'?'Overdue installments':'Loan balances and coverage',trends:'Spending by pay period',recurring:'Repeated expense candidates',compare:'Period comparison'};
 out.label=(titles[r.operation]||'Matching records')+' · '+out.label;
 if(r.categoryName)out.detail.push(r.categoryName+'.');
 if(r.periodLabels)out.detail.push('Assigned to '+r.periodLabels.join(', ')+'.');
 r.messages.forEach(function(m){out.detail.push(m);});
 if(r.averageDates)out.detail.push('Average coverage: '+r.averageDates.join(' – ')+'.');
 function item(name,value,detail){out.items.push({name:name,value:value,detail:detail||''});}
 if(r.operation==='compare'){out.comparison=[['Selected period',r.totalMinor],['Previous period',r.previousMinor]];out.detail.push(money(Math.abs(r.differenceMinor))+(r.differenceMinor>0?' more':r.differenceMinor<0?' less':' change')+' '+(r.kind==='income'?'income':'spending')+'; '+(r.changeBasisPoints===null?'percentage change is undefined with no previous total.':pc(r.changeBasisPoints)+' change.')+' '+r.count+' selected and '+r.previousCount+' previous records.');out.detail.push('Previous dates: '+r.previousDates.join(' – ')+'. Current periods may be incomplete; these are recorded totals, not equal elapsed-day windows.');}
 else if(['cashflow','savings_rate','share'].indexOf(r.operation)>=0){out.value=r.operation==='cashflow'?money(r.netMinor):pc(r.rateBasisPoints);out.detail.push('Recorded income '+money(r.incomeMinor)+' − recorded expenses '+money(r.expenseMinor)+' = '+money(r.netMinor)+'.');out.detail.push(r.operation==='share'?(r.incomeBasis==='salary'?'Spending ÷ recorded SALARY income × 100; bonuses and other income excluded.':'Spending ÷ all recorded income × 100; includes salary, bonuses and other income.'):r.operation==='savings_rate'?'Savings rate = (recorded income − recorded expenses) ÷ recorded income × 100.':'Income minus recorded spending; this is not a bank balance.');out.detail.push('Fund transfers excluded. Loan repayments count as spending only through their mirrored expense.');if(r.rateBasisPoints===null&&r.operation!=='cashflow')out.detail.push('No recorded income: the percentage is undefined.');}
 else if(r.operation==='budgets'||r.operation==='afford'){
  out.value=r.mode==='unallocated'&&!r.hasIncome?'Income not recorded':money(r.mode==='unallocated'?r.unallocatedMinor:r.mode==='over'?total(r.budgets.filter(function(b){return b.remainingMinor<0;}).map(function(b){return {minor:-b.remainingMinor};})):r.remainingMinor);
  out.detail.push(r.mode==='unallocated'?'Recorded income '+money(r.incomeMinor)+' − all budget allocations '+money(r.allocationMinor)+' (including fund plans).':'Remaining spending plan: planned '+money(r.plannedMinor)+' − recorded expenses '+money(r.actualMinor)+'.');
  var bs=r.mode==='over'?r.budgets.filter(function(b){return b.remainingMinor<0;}):r.budgets;
  bs.forEach(function(b){item(b.name,money(b.remainingMinor)+' remaining',(b.hasPlan?'Planned '+money(b.plannedMinor):'No recorded plan')+' · spent '+money(b.actualMinor)+' · utilization '+pc(b.utilizationBasisPoints));});
  if(r.mode==='unallocated'&&!r.hasIncome)out.detail.push('Record income for the selected pay periods before determining unallocated income.');
  if(r.mode==='over')out.detail.push('The highlighted total is spending above individual category plans, including spending with no plan.');
  if(r.mode==='over'&&!bs.length)out.detail.push('No recorded spending exceeds the selected spending plans.');
  if(r.mode==='compare'){out.comparison=[['Current plan',r.plannedMinor],['Previous plan',r.previousPlannedMinor]];out.detail.push('Actual spending: current '+money(r.actualMinor)+'; previous '+money(r.previousActualMinor)+'.');}
  if(r.operation==='afford')out.detail.push(r.fitsPlan===null?'No category plan is recorded, so affordability cannot be checked.':money(r.amountMinor)+(r.fitsPlan?' fits':' exceeds')+' the remaining category plan.');
  out.detail.push('Budget allocations are not available cash. This check does not subtract loan obligations or fund transfers. Bank balances and complete future obligations are not known.');
 }
 else if(r.operation==='funds'){
  out.value=money(r.totalMinor);r.funds.forEach(function(f){var mode=r.mode,detail=mode==='goal'?f.targetMinor?'Target '+money(f.targetMinor)+' · '+pc(f.progressBasisPoints)+' · '+money(f.neededMinor)+' still needed.':'No savings target is recorded.':mode==='balance'?'All recorded deposits minus withdrawals.':f.count+' fund transfer records in the selected range.';
   if(r.contributionMinor&&f.targetMinor)detail+=' Estimate: '+f.months+' monthly contributions of '+money(r.contributionMinor)+', assuming no withdrawals, interest or other deposits; not a guaranteed completion date.';
   item(f.name,money(mode==='deposits'?f.depositsMinor:mode==='withdrawals'?f.withdrawalsMinor:mode==='contributions'?f.contributionsMinor:f.balanceMinor),detail);
  });out.detail.push(r.mode==='deposits'?'Saved here means gross fund deposits, not income minus expenses.':r.mode==='withdrawals'?'Fund withdrawals are transfers, not income.':r.mode==='contributions'?'Net contributions = selected deposits minus withdrawals; these are transfers, not income or expenses.':'Fund balances are recorded allocations, not verified bank balances.');if(!r.funds.length)out.detail.push('No matching funds are recorded.');
 }
 else if(r.operation==='loans'){
  out.value=money(r.totalMinor);if(['due','overdue','next','installments'].indexOf(r.mode)>=0){r.installments.forEach(function(i){item(i.name,money(i.minor)+' unpaid',i.date+' · '+i.status+' · covered '+money(i.coveredMinor));});if(!r.installments.length)out.detail.push('No matching installments.');}
  else r.loans.forEach(function(l){item(l.name,money(r.mode==='paid'?l.rangePaidMinor:r.mode==='progress'?l.paidMinor:l.remainingMinor),money(l.paidMinor)+' paid of '+money(l.totalMinor)+' · '+pc(l.progressBasisPoints)+' repaid.');});
  out.detail.push('Installment coverage applies recorded payments oldest first; unpaid amounts are based on current coverage, not a historical balance.');if(!r.loans.length)out.detail.push('No matching loans are recorded.');
 }
 else if(r.operation==='trends'){r.periods.forEach(function(p){item(p.name,money(p.minor),p.count+' recorded expenses.');});if(r.highest)out.detail.push('Highest recorded spending'+(r.highestPeriods.length>1?' (tied)':'')+': '+r.highestPeriods.map(function(p){return p.name;}).join(', ')+' ('+money(r.highest.minor)+'). Current periods may be incomplete.');else out.detail.push('No matching expense records in these periods.');}
 else if(r.operation==='recurring'){r.candidates.forEach(function(c){item(c.name,money(c.minor)+' each',c.count+' occurrences on '+c.dates.slice().sort().join(', '));});out.detail.push(r.candidates.length?'Candidates share a category and exact amount across distinct dates. They are not confirmed subscriptions or duplicate errors.':'No repeated category/amount combinations on distinct dates.');}
 else if(r.categories){r.categories.forEach(function(c){item(c.name,money(c.minor),pc(c.shareBasisPoints)+' of selected spending · '+c.count+' expenses.');out.items[out.items.length-1].basisPoints=c.shareBasisPoints;});out.value=money(r.totalMinor);}
 else if(r.rows.length){r.rows.forEach(function(x){item(x.source||x.incomeKind||x.categoryName||'Expense',money(x.minor),x.date+(x.note?' · '+x.note:'')+' · '+x.id);});if(r.rows.length===1)out.value=money(r.rows[0].minor);out.detail.push('Showing '+r.rows.length+' of '+r.count+' matching '+r.kind+' records.');}
 else {out.value=r.operation==='count'?String(r.count):r.operation==='average'?(r.averageMinor===null?'No matching records':money(r.averageMinor)):money(r.totalMinor);out.detail.push(r.operation==='average'?'Average per '+r.unit+'; '+r.denominator+' '+(r.unit==='week'?'calendar days, scaled to a seven-day week':r.unit==='day'?'calendar days, including zero-spend days':r.unit==='month'?'calendar months touched':r.unit==='period'?'recorded pay periods':'matching entries')+'.':'Across '+r.count+' '+(r.kind==='income'?'income':'expense')+' entries.');}
 if(!r.count&&['sum','average','min','max','top','count','list','categories','frequency'].indexOf(r.operation)>=0){if(['sum','count'].indexOf(r.operation)<0)out.value='No matching records';out.detail.push('No matching records in the saved ledger.');}
 return out;
}
root.LedgerQuery={query:query,validate:validate,interpret:interpret,cents:cents,bounds:bounds,format:format,normalize:normalize};
})(typeof window!=='undefined'?window:globalThis);
