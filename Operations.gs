/* Shared deterministic operation planner. Embedded verbatim in Index.html; no network or model. */
var LedgerOperations = (function(){
'use strict';
var schemas={SETTINGS:['key','value'],PAY_PERIODS:['period_id','label','start_date','pay_date','is_closed'],INCOME:['income_id','period_id','received_date','amount','kind','source','note'],CATEGORIES:['category_id','name','kind','group_name','sort_order','is_archived'],FUND_GOALS:['category_id','target_amount','target_date'],BUDGET_LINES:['line_id','period_id','category_id','planned_amount'],TRANSACTIONS:['txn_id','period_id','category_id','type','txn_date','amount','note'],LOANS:['loan_id','name','lender','principal','total_payable','start_date','installment_amount','frequency','installment_count','status'],LOAN_INSTALLMENTS:['installment_id','loan_id','seq_no','due_date','amount_due'],LOAN_PAYMENTS:['payment_id','loan_id','installment_id','txn_id','paid_date','amount','note']};
var guards={saveCategory:['CATEGORIES','FUND_GOALS','TRANSACTIONS','BUDGET_LINES'],deleteCategory:['CATEGORIES','FUND_GOALS','TRANSACTIONS','BUDGET_LINES'],setBudget:['PAY_PERIODS','CATEGORIES','BUDGET_LINES'],saveLoan:['LOANS','LOAN_INSTALLMENTS','LOAN_PAYMENTS'],deleteLoan:['LOANS','LOAN_INSTALLMENTS','LOAN_PAYMENTS'],editRecord:['INCOME','TRANSACTIONS','LOAN_PAYMENTS','LOANS','LOAN_INSTALLMENTS','CATEGORIES','PAY_PERIODS'],deleteRecord:['INCOME','TRANSACTIONS','LOAN_PAYMENTS','LOANS','LOAN_INSTALLMENTS','CATEGORIES','PAY_PERIODS'],saveSettings:['SETTINGS'],generatePeriods:['SETTINGS','PAY_PERIODS']};
function copy(x){return JSON.parse(JSON.stringify(x));}
function fail(message){throw new Error(message);}
function fields(x,allowed){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(function(k){return allowed.indexOf(k)<0;}))fail('Unsupported operation fields.');}
function text(x,max,required){if(typeof x!=='string')fail('Enter valid text.');var s=x.replace(/\s+/g,' ').trim();if((required&&!s)||s.length>max||/[\u0000-\u001f\u007f]/.test(x)||/^[=+@-]/.test(s))fail('Invalid text; avoid formula markers and control characters.');return s;}
function money(x,zero){if(typeof x!=='number'&&typeof x!=='string')fail('Enter a valid amount.');var s=String(x);if(!/^\d+(\.\d{1,2})?$/.test(s))fail('Use an amount with at most two decimals.');var n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n)||n<(zero?0:1)||n>1000000000)fail('Amount is outside the supported range.');return n;}
function date(s,optional){if(optional&&s==='')return '';if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))fail('Enter a valid date.');var d=new Date(s+'T00:00:00Z');if(isNaN(d)||d.toISOString().slice(0,10)!==s||+s.slice(0,4)<2000||+s.slice(0,4)>2100)fail('Enter a real date from 2000 through 2100.');return s;}
function pk(t){if(!schemas[t])fail('Unsupported table.');return schemas[t][0];}
function live(s,t){return s.tables[t].map(function(x){return x.record;}).filter(function(r){return !r.deleted_at;}).sort(function(a,b){return String(a[pk(t)])<String(b[pk(t)])?-1:String(a[pk(t)])>String(b[pk(t)])?1:0;});}
function find(s,t,id,deleted){var matches=s.tables[t].filter(function(x){return x.record[pk(t)]===id;});if(matches.length>1)fail('Duplicate record IDs in '+t+'. Correct the Sheet first.');var x=matches[0];return x&&(deleted||!x.record.deleted_at)?x.record:null;}
function need(s,t,id){var r=find(s,t,id);if(!r)fail('The selected record is no longer available.');return r;}
function domain(t,r){if(!r)return null;return schemas[t].map(function(k){return r[k];}).concat(t==='SETTINGS'?[]:[!!r.deleted_at]);}
// SHA-256 of canonical UTF-8 context; independently checked against Node crypto in tests.
function hash(input){
 var bytes=unescape(encodeURIComponent(input)),words=[],length=bytes.length*8,i,j;
 for(i=0;i<bytes.length;i++)words[i>>2]=(words[i>>2]||0)|bytes.charCodeAt(i)<<(24-(i%4)*8);
 words[bytes.length>>2]=(words[bytes.length>>2]||0)|0x80<<(24-(bytes.length%4)*8);words[(((bytes.length+8)>>6)+1)*16-1]=length;
 var h=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];
 var k=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
 function ro(x,n){return x>>>n|x<<(32-n);}
 for(i=0;i<words.length;i+=16){var w=[],a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],v=h[7];for(j=0;j<64;j++){if(j<16)w[j]=words[i+j]|0;else{var p=w[j-15],q=w[j-2];w[j]=((ro(p,7)^ro(p,18)^p>>>3)+w[j-16]+(ro(q,17)^ro(q,19)^q>>>10)+w[j-7])|0;}var t1=(v+(ro(e,6)^ro(e,11)^ro(e,25))+(e&f^~e&g)+k[j]+w[j])|0,t2=((ro(a,2)^ro(a,13)^ro(a,22))+(a&b^a&c^b&c))|0;v=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}[a,b,c,d,e,f,g,v].forEach(function(x,n){h[n]=(h[n]+x)|0;});}
 return h.map(function(x){return ('00000000'+(x>>>0).toString(16)).slice(-8);}).join('');
}
function context(s,action){if(!guards[action])fail('Unsupported offline action.');return hash(JSON.stringify(guards[action].map(function(t){return [t,s.tables[t].map(function(x){return domain(t,x.record);}).sort(function(a,b){return String(a[0])<String(b[0])?-1:String(a[0])>String(b[0])?1:0;})];})));}
function fundBalance(s,id){return live(s,'TRANSACTIONS').filter(function(r){return r.category_id===id;}).reduce(function(n,r){return n+(r.type==='FUND_OUT'?-1:1)*money(r.amount,true);},0);}
function payDays(value){var s=text(value,40,true).toUpperCase(),parts=s.split(',').map(function(p){return p.trim();});if(parts.length>4||parts.some(function(p){return p!=='EOM'&&(!/^\d{1,2}$/.test(p)||+p<1||+p>28);}))fail('Use 1–4 pay days such as 15,EOM.');return parts.map(function(p){return p==='EOM'?p:String(+p);}).filter(function(p,i,a){return a.indexOf(p)===i;}).join(',');}
function plan(snapshot,action,args,mutationId,stamp){
 if(!guards[action]||!Array.isArray(args)||!/^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/.test(mutationId))fail('Invalid offline operation.');
 var s=copy(snapshot),changes=[],index=0,suffix=hash(mutationId).slice(0,32),title=action;
 function id(prefix){var value=prefix+'_'+suffix+'_'+(++index);if(Object.keys(s.tables).some(function(t){return s.tables[t].some(function(x){return x.record[pk(t)]===value;});}))fail('Generated ID already exists. Refresh and retry with a new proposal.');return value;}
 function set(t,record){var key=pk(t),before=find(s,t,record[key],true),r=copy(record);if(t!=='SETTINGS'){r.created_at=before?before.created_at:stamp;r.deleted_at=r.deleted_at||'';}r.updated_at=stamp;
   if(Object.keys(r).some(function(k){return typeof r[k]==='string'&&/^[=+@-]/.test(r[k].trim());}))fail('A saved text field begins with a formula marker. Edit that text before this change.');
   var item={table:t,before:before?copy(before):null,after:r},old=changes.findIndex(function(x){return x.table===t&&x.after[key]===r[key];});if(old>=0){item.before=changes[old].before;changes[old]=item;}else changes.push(item);
   var rows=s.tables[t],at=rows.findIndex(function(x){return x.record[key]===r[key];});var wrap={record:r,fingerprint:at>=0?rows[at].fingerprint:'0'.repeat(64)};if(at<0)rows.push(wrap);else rows[at]=wrap;return r;
 }
 function remove(t,r){var n=copy(r);n.deleted_at=stamp;set(t,n);}
 function activeCategory(cid,kind,previous){if(cid===''&&kind==='SPENDING')return null;var c=need(s,'CATEGORIES',cid);if((c.is_archived&&cid!==previous)||(kind&&c.kind!==kind))fail('Choose an active matching category.');return c;}
 function period(pid,optional){if(pid===''&&optional)return null;return need(s,'PAY_PERIODS',pid);}
 function loanStatus(loanId){var l=copy(need(s,'LOANS',loanId)),paid=live(s,'LOAN_PAYMENTS').filter(function(p){return p.loan_id===loanId;}).reduce(function(n,p){return n+money(p.amount,true);},0);if(paid>money(l.total_payable,true))fail('Payment exceeds the amount still owed.');l.status=paid>=money(l.total_payable,true)?'PAID':'ACTIVE';set('LOANS',l);}
 function unique(t,name,existing){if(live(s,t).some(function(r){return r.name.toLowerCase()===name.toLowerCase()&&r[pk(t)]!==existing;}))fail('That name is already used.');}
 function checkFunds(){live(s,'CATEGORIES').filter(function(c){return c.kind==='FUND';}).forEach(function(c){var balance=fundBalance(s,c.category_id);if(balance<0)fail('This change would overdraw '+c.name+'.');if(c.is_archived&&balance!==0)fail('Withdraw the balance before archiving a fund.');});}
 var r=args[0];
 if(action==='saveCategory'){
  if(args.length!==1)fail('Invalid arguments.');fields(r,['id','name','kind','group','archived','target','targetDate']);var old=r.id?need(s,'CATEGORIES',r.id):null,name=text(r.name,40,true),kind=old?old.kind:r.kind;
  if(['SPENDING','FUND'].indexOf(kind)<0||(old&&r.kind&&r.kind!==old.kind)||typeof r.archived!=='boolean')fail('Invalid category type or archive flag.');unique('CATEGORIES',name,r.id);
  var cat=old?copy(old):{category_id:id('cat'),kind:kind,sort_order:live(s,'CATEGORIES').reduce(function(n,c){return Math.max(n,c.sort_order);},0)+1};cat.name=name;cat.group_name=text(r.group||'',30,false);cat.is_archived=r.archived;set('CATEGORIES',cat);
  if(kind==='FUND'){var goal=find(s,'FUND_GOALS',cat.category_id,true)||{category_id:cat.category_id};goal=copy(goal);goal.deleted_at='';goal.target_amount=money(r.target===''||r.target==null?0:r.target,true)/100;goal.target_date=date(r.targetDate||'',true);set('FUND_GOALS',goal);}checkFunds();title=(old?'Update ':'Create ')+(kind==='FUND'?'fund: ':'category: ')+name;
 }else if(action==='setBudget'){
  if(args.length!==1)fail('Invalid arguments.');fields(r,['periodId','categoryId','amount','applyToFuture']);var per=period(r.periodId),cat=activeCategory(r.categoryId),amount=money(r.amount===''?0:r.amount,true)/100;if(typeof r.applyToFuture!=='boolean')fail('Invalid future-period option.');
  live(s,'PAY_PERIODS').filter(function(p){return p.period_id===per.period_id||(r.applyToFuture&&p.pay_date>per.pay_date&&!p.is_closed);}).forEach(function(p){var hits=live(s,'BUDGET_LINES').filter(function(b){return b.period_id===p.period_id&&b.category_id===cat.category_id;});if(hits.length>1)fail('Duplicate budget lines. Correct the Sheet first.');var line=hits[0];if(line||amount>0){line=copy(line||{line_id:id('bud'),period_id:p.period_id,category_id:cat.category_id});line.planned_amount=amount;set('BUDGET_LINES',line);}});title='Plan '+cat.name+(r.applyToFuture?' · selected and later open periods':' · '+per.label);
 }else if(action==='saveLoan'){
  if(args.length!==1)fail('Invalid arguments.');fields(r,['id','name','lender','principal','total','count','frequency','firstDue']);var name=text(r.name,40,true),lender=text(r.lender||'',40,false);unique('LOANS',name,r.id);
  if(r.id){var loan=copy(need(s,'LOANS',r.id));if(['principal','total','count','frequency','firstDue'].some(function(k){return r[k]!==undefined;}))fail('An existing loan schedule cannot be changed.');loan.name=name;loan.lender=lender;set('LOANS',loan);title='Rename loan: '+name;}
  else{var principal=money(r.principal,false),total=r.total===''||r.total==null?principal:money(r.total,false),count=Number(r.count);if(total<principal||!/^\d+$/.test(String(r.count))||count<1||count>120||['WEEKLY','BIWEEKLY','SEMI_MONTHLY','MONTHLY'].indexOf(r.frequency)<0)fail('Check loan total, installment count and frequency.');var first=date(r.firstDue),dues=dueDates_(first,r.frequency,count);dues.forEach(function(d){date(d);});var amounts=splitAmounts_(total/100,count),loanId=id('lon');set('LOANS',{loan_id:loanId,name:name,lender:lender,principal:principal/100,total_payable:total/100,start_date:first,installment_amount:amounts[0],frequency:r.frequency,installment_count:count,status:'ACTIVE'});amounts.forEach(function(a,i){set('LOAN_INSTALLMENTS',{installment_id:id('ins'),loan_id:loanId,seq_no:i+1,due_date:dues[i],amount_due:a});});title='Create loan and '+count+' installments: '+name;}
 }else if(action==='deleteCategory'){
  if(args.length!==1||typeof r!=='string')fail('Invalid category.');var c=need(s,'CATEGORIES',r);if(live(s,'TRANSACTIONS').some(function(t){return t.category_id===r;}))fail('This category has history. Archive it instead.');['BUDGET_LINES','FUND_GOALS'].forEach(function(t){live(s,t).filter(function(x){return x.category_id===r;}).forEach(function(x){remove(t,x);});});remove('CATEGORIES',c);title='Delete unused category: '+c.name;
 }else if(action==='deleteLoan'){
  if(args.length!==1||typeof r!=='string')fail('Invalid loan.');var l=need(s,'LOANS',r);if(live(s,'LOAN_PAYMENTS').some(function(p){return p.loan_id===r;}))fail('Delete this loan’s payments first.');live(s,'LOAN_INSTALLMENTS').filter(function(i){return i.loan_id===r;}).forEach(function(i){remove('LOAN_INSTALLMENTS',i);});remove('LOANS',l);title='Delete loan and schedule: '+l.name;
 }else if(action==='deleteRecord'){
  if(args.length!==2||['income','txn','loanpay'].indexOf(r)<0||typeof args[1]!=='string')fail('Invalid record.');var kind=r,recordId=args[1];
  if(kind==='income')remove('INCOME',need(s,'INCOME',recordId));else{var payment=live(s,'LOAN_PAYMENTS').find(function(p){return kind==='loanpay'?p.payment_id===recordId:p.txn_id===recordId;}),txn=kind==='txn'?need(s,'TRANSACTIONS',recordId):payment&&payment.txn_id?need(s,'TRANSACTIONS',payment.txn_id):null;if(!payment&&!txn)fail('Record no longer exists.');if(txn)remove('TRANSACTIONS',txn);if(payment){remove('LOAN_PAYMENTS',payment);loanStatus(payment.loan_id);}checkFunds();}title='Delete '+kind+' record and any linked spending';
 }else if(action==='editRecord'){
  if(args.length!==1)fail('Invalid arguments.');fields(r,['table','id','date','amount','note','periodId','categoryId','alsoSpend']);if(['TRANSACTIONS','LOAN_PAYMENTS'].indexOf(r.table)<0)fail('Unsupported edit.');var current=copy(need(s,r.table,r.id)),amount=money(r.amount,false)/100,when=date(r.date),note=text(r.note,200,false);
  if(r.table==='TRANSACTIONS'){if(live(s,'LOAN_PAYMENTS').some(function(p){return p.txn_id===r.id;}))fail('Edit the linked loan payment instead.');period(r.periodId,true);activeCategory(r.categoryId,current.type==='EXPENSE'?'SPENDING':'FUND',current.category_id);current.period_id=r.periodId;current.category_id=r.categoryId;current.txn_date=when;current.amount=amount;current.note=note;set('TRANSACTIONS',current);checkFunds();}
  else{if(typeof r.alsoSpend!=='boolean')fail('Choose whether to count spending.');var previous=current.txn_id?need(s,'TRANSACTIONS',current.txn_id):null;current.paid_date=when;current.amount=amount;current.note=note;if(r.alsoSpend){period(r.periodId,true);activeCategory(r.categoryId,'SPENDING',previous&&previous.category_id);var txn=previous?copy(previous):{txn_id:id('txn'),type:'EXPENSE'};txn.period_id=r.periodId;txn.category_id=r.categoryId;txn.txn_date=when;txn.amount=amount;txn.note=note||'Loan: '+need(s,'LOANS',current.loan_id).name;set('TRANSACTIONS',txn);current.txn_id=txn.txn_id;}else{if(previous)remove('TRANSACTIONS',previous);current.txn_id='';}set('LOAN_PAYMENTS',current);loanStatus(current.loan_id);}title='Edit '+(r.table==='LOAN_PAYMENTS'?'loan payment':'fund or expense entry');
 }else if(action==='saveSettings'){
  if(args.length!==1)fail('Invalid arguments.');fields(r,['appName','payDays']);var settings={app_name:text(r.appName,30,true),pay_days:payDays(r.payDays)};Object.keys(settings).forEach(function(key){set('SETTINGS',{key:key,value:settings[key]});});title='Update app name and pay days';
 }else if(action==='generatePeriods'){
  if(args.length!==1||!/^\d{4}$/.test(String(r))||+r<2000||+r>2100)fail('Enter a year from 2000 through 2100.');var setting=find(s,'SETTINGS','pay_days'),days=payDays(setting?setting.value:s.state.settings.payDays).split(','),have={};s.tables.PAY_PERIODS.forEach(function(x){have[x.record.pay_date]=true;});for(var m=1;m<=12;m++){var last=new Date(Date.UTC(+r,m,0)).getUTCDate();days.forEach(function(day){var when=isoOf_(+r,m,day==='EOM'?last:+day);if(!have[when]){have[when]=true;set('PAY_PERIODS',{period_id:id('per'),label:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]+' '+(+when.slice(-2)),start_date:when,pay_date:when,is_closed:false});}});}title='Generate pay periods for '+r;
 }
 changes=changes.filter(function(c){return JSON.stringify(domain(c.table,c.before))!==JSON.stringify(domain(c.table,c.after));});
 if(changes.length>150||JSON.stringify(changes).length>45000)fail('This change is too large for one save. Use fewer periods or records.');
 return {title:title,changes:changes};
}
function apply(s,changes){changes.forEach(function(c){var record=c.after||c.record,key=pk(c.table),rows=s.tables[c.table],i=rows.findIndex(function(x){return x.record[key]===record[key];}),wrap={record:copy(record),fingerprint:c.fingerprint||(i>=0?rows[i].fingerprint:'0'.repeat(64))};if(i<0)rows.push(wrap);else rows[i]=wrap;});s.state=view(s);return s;}
function receipt(entry,r){if(!Array.isArray(r.changes)||!Number.isFinite(Date.parse(r.committedAt))||r.changes.length!==entry.proposalRecord.changes.length)fail('Invalid complete operation receipt.');entry.proposalRecord.changes.forEach(function(c,i){var x=r.changes[i];if(!x||x.table!==c.table||!x.record||!/^[a-f0-9]{64}$/.test(x.fingerprint)||JSON.stringify(domain(c.table,c.after))!==JSON.stringify(domain(x.table,x.record)))fail('Incomplete or changed operation receipt.');});}
function addDays_(iso, n) {
  const p = iso.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return isoOf_(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function addMonths_(iso, n, day) {
  const p = iso.split('-').map(Number), t = p[1] - 1 + n;
  const y = p[0] + Math.floor(t / 12), m = ((t % 12) + 12) % 12;
  return isoOf_(y, m + 1, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()));
}
function dueDates_(first, freq, n) {
  const out = [first], day0 = +first.split('-')[2];
  for (let i = 1; i < n; i++) {
    const prev = out[i - 1];
    if (freq === 'WEEKLY') out.push(addDays_(prev, 7));
    else if (freq === 'BIWEEKLY') out.push(addDays_(prev, 14));
    else if (freq === 'MONTHLY') out.push(addMonths_(first, i, day0));
    else { // SEMI_MONTHLY: alternate between the 15th and the last day
      const p = prev.split('-').map(Number), eom = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
      if (p[2] < 15) out.push(isoOf_(p[0], p[1], 15));
      else if (p[2] < eom) out.push(isoOf_(p[0], p[1], eom));
      else out.push(addMonths_(isoOf_(p[0], p[1], 1), 1, 15));
    }
  }
  return out;
}
function splitAmounts_(total, n) {
  const each = Math.floor(total / n * 100) / 100, out = [];
  for (let i = 0; i < n - 1; i++) out.push(each);
  out.push(r2_(total - each * (n - 1))); // last one absorbs the rounding
  return out;
}

/** Pure: how much of each installment is covered, oldest first, given everything paid so far. */
function loanMetrics_(loan, insts, pays, today) {
  const sorted = insts.slice().sort((a, b) => a.seq_no - b.seq_no);
  const paid = r2_(pays.reduce((s, p) => s + p.amount, 0));
  let pool = paid;
  const items = sorted.map(i => {
    const covered = r2_(Math.min(pool, i.amount_due));
    pool = r2_(pool - covered);
    const left = r2_(i.amount_due - covered);
    const status = left <= 0.005 ? 'PAID' : (i.due_date < today ? 'OVERDUE' : (covered > 0 ? 'PARTIAL' : 'UPCOMING'));
    return { id: i.installment_id, seq: i.seq_no, due: i.due_date, amount: i.amount_due, covered: covered, left: left, status: status };
  });
  const remaining = Math.max(0, r2_(loan.total_payable - paid));
  const next = items.find(i => i.status !== 'PAID') || null;
  return {
    paid: paid, remaining: remaining,
    pct: loan.total_payable ? Math.min(100, paid / loan.total_payable * 100) : 0,
    items: items, next: next,
    overdue: items.filter(i => i.status === 'OVERDUE').length,
    paymentsLeft: items.filter(i => i.status !== 'PAID').length,
  };
}

function r2_(x){return Math.round((x+Number.EPSILON)*100)/100;}
function isoOf_(y,m,d){return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function reportPeriod(periods,r,date){if(r.period_id)return r.period_id;var found='';periods.slice().sort(function(a,b){return a.pay_date.localeCompare(b.pay_date);}).forEach(function(p){if(p.pay_date<=date)found=p.period_id;});return found;}
function view(snapshot) {
  const today = snapshot.state.today;
  const set = Object.assign({app_name:'Salary Ledger',pay_days:'15,EOM'},Object.fromEntries(live(snapshot,'SETTINGS').map(function(r){return [r.key,r.value];})));
  const periodsRaw = live(snapshot, 'PAY_PERIODS').sort((a, b) => a.pay_date < b.pay_date ? -1 : 1);
  const cats = live(snapshot, 'CATEGORIES').sort((a, b) => a.sort_order - b.sort_order);
  const goals = {}; live(snapshot, 'FUND_GOALS').forEach(g => { goals[g.category_id] = g; });
  const budget = live(snapshot, 'BUDGET_LINES');
  const income = live(snapshot, 'INCOME');
  const txns = live(snapshot, 'TRANSACTIONS');
  const loansRaw = live(snapshot, 'LOANS');
  const insts = live(snapshot, 'LOAN_INSTALLMENTS');
  const pays = live(snapshot, 'LOAN_PAYMENTS');

  const catById = {}; cats.forEach(c => { catById[c.category_id] = c; });
  const perById = {}; periodsRaw.forEach(p => { perById[p.period_id] = p; });

  const plan = {}; // periodId -> categoryId -> planned
  budget.forEach(b => { (plan[b.period_id] = plan[b.period_id] || {})[b.category_id] = b.planned_amount; });
  const byCat = {}; // periodId -> categoryId -> actual (funds net of withdrawals)
  const spentBy = {}, fundBy = {}, incomeBy = {}, hasInc = {};
  txns.forEach(t => {
    const m = (byCat[t.period_id] = byCat[t.period_id] || {});
    const sign = t.type === 'FUND_OUT' ? -1 : 1;
    m[t.category_id] = r2_((m[t.category_id] || 0) + sign * t.amount);
    const report=reportPeriod(periodsRaw,t,t.txn_date);
    if (t.type === 'EXPENSE') spentBy[report] = (spentBy[report] || 0) + t.amount;
    else fundBy[report] = (fundBy[report] || 0) + sign * t.amount;
  });
  income.forEach(i => { const report=reportPeriod(periodsRaw,i,i.received_date);incomeBy[report] = (incomeBy[report] || 0) + i.amount; hasInc[report] = true; });

  let current = null;
  periodsRaw.forEach(p => { if (p.pay_date <= today) current = p.period_id; });
  if (!current && periodsRaw.length) current = periodsRaw[0].period_id;

  const periods = periodsRaw.map(p => {
    const inc = r2_(incomeBy[p.period_id] || 0), sp = r2_(spentBy[p.period_id] || 0), fd = r2_(fundBy[p.period_id] || 0);
    const planned = r2_(Object.keys(plan[p.period_id] || {}).reduce((s, k) => s + plan[p.period_id][k], 0));
    return { id: p.period_id, label: p.label, date: p.pay_date, closed: p.is_closed, isCurrent: p.period_id === current,
      hasIncome: !!hasInc[p.period_id], income: inc, spent: sp, funds: fd, planned: planned,
      unassigned: hasInc[p.period_id] ? r2_(inc - sp - fd) : 0 };
  });

  const totals = {}; // categoryId -> all-time actual
  const toDate = {}; // categoryId -> planned up to today
  Object.keys(byCat).forEach(pid => Object.keys(byCat[pid]).forEach(cid => { totals[cid] = (totals[cid] || 0) + byCat[pid][cid]; }));
  Object.keys(plan).forEach(pid => {
    if (!perById[pid] || perById[pid].pay_date > today) return;
    Object.keys(plan[pid]).forEach(cid => { toDate[cid] = (toDate[cid] || 0) + plan[pid][cid]; });
  });
  const yearPlan = {};
  Object.keys(plan).forEach(pid => Object.keys(plan[pid]).forEach(cid => { yearPlan[cid] = (yearPlan[cid] || 0) + plan[pid][cid]; }));

  const categories = cats.map(c => {
    const g = goals[c.category_id];
    return { id: c.category_id, name: c.name, kind: c.kind, group: c.group_name, archived: c.is_archived,
      actual: r2_(totals[c.category_id] || 0), planToDate: r2_(toDate[c.category_id] || 0), yearPlan: r2_(yearPlan[c.category_id] || 0),
      target: g ? g.target_amount : 0, targetDate: g ? g.target_date : '' };
  });

  const loans = loansRaw.map(l => {
    const li = insts.filter(i => i.loan_id === l.loan_id), lp = pays.filter(p => p.loan_id === l.loan_id);
    const m = loanMetrics_(l, li, lp, today);
    return { id: l.loan_id, name: l.name, lender: l.lender, principal: l.principal, total: l.total_payable,
      firstDue: l.start_date, frequency: l.frequency, count: l.installment_count, installment: l.installment_amount,
      status: m.remaining <= 0.005 ? 'PAID' : 'ACTIVE', paid: m.paid, remaining: m.remaining, pct: m.pct,
      installments: m.items, next: m.next, overdue: m.overdue, paymentsLeft: m.paymentsLeft,
      payments: lp.map(p => ({ id: p.payment_id, date: p.paid_date, amount: p.amount, note: p.note, counted: !!p.txn_id }))
        .sort((a, b) => a.date < b.date ? 1 : -1) };
  });

  const mirrored = {}; pays.forEach(p => { if (p.txn_id) mirrored[p.txn_id] = true; });
  const loanName = {}; loansRaw.forEach(l => { loanName[l.loan_id] = l.name; });
  const recent = [];
  income.forEach(i => recent.push({ kind: 'income', id: i.income_id, date: i.received_date, at: i.created_at,
    title: i.source || (i.kind.charAt(0) + i.kind.slice(1).toLowerCase()), amount: i.amount, dir: 'in',
    sub: ['Income', i.kind.toLowerCase(), perById[i.period_id] ? 'for ' + perById[i.period_id].label : '', i.note].filter(Boolean).join(' · ') }));
  txns.forEach(t => {
    if (mirrored[t.txn_id]) return;
    const c = catById[t.category_id];
    recent.push({ kind: 'txn', id: t.txn_id, date: t.txn_date, at: t.created_at, title: c ? c.name : (t.category_id?'(deleted category)':'Uncategorized'), amount: t.amount,
      dir: t.type === 'FUND_OUT' ? 'in' : 'out',
      sub: [t.type === 'EXPENSE' ? 'Expense' : t.type === 'FUND_IN' ? 'Fund deposit' : 'Fund withdrawal',
        perById[t.period_id] ? 'for ' + perById[t.period_id].label : '', t.note].filter(Boolean).join(' · ') });
  });
  pays.forEach(p => recent.push({ kind: 'loanpay', id: p.payment_id, date: p.paid_date, at: p.created_at, title: loanName[p.loan_id] || '(deleted loan)',
    amount: p.amount, dir: 'out', sub: ['Loan payment', p.txn_id ? 'also counted as spending' : '', p.note].filter(Boolean).join(' · ') }));
  recent.sort((a, b) => a.at < b.at ? 1 : a.at > b.at ? -1 : (a.date < b.date ? 1 : -1));

  const received = r2_(income.reduce((s, i) => s + i.amount, 0));
  const spent = r2_(txns.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0));
  const inFunds = r2_(categories.filter(c => c.kind === 'FUND').reduce((s, c) => s + c.actual, 0));
  return {
    setupDone: true, generatedAt: snapshot.state.generatedAt||'', today: today,
    app: { name: set.app_name || 'Salary Ledger' },
    settings: { appName: set.app_name || 'Salary Ledger', payDays: set.pay_days },
    years: periodsRaw.map(p => +p.pay_date.slice(0, 4)).filter((v, i, a) => a.indexOf(v) === i),
    currentPeriodId: current, periods: periods, categories: categories, plan: plan, byCat: byCat, loans: loans,
    summary: { received: received, spent: spent, inFunds: inFunds, saved: r2_(received - spent), unassigned: r2_(received - spent - inFunds),
      loanRemaining: r2_(loans.reduce((s, l) => s + l.remaining, 0)) },
    recent: recent.slice(0, 40),
  };
}

return {optionalPlanningVersion:1,schemas:schemas,hash:hash,domain:domain,context:context,plan:plan,apply:apply,view:view,reportPeriod:reportPeriod,receipt:receipt,pk:pk};
})();
