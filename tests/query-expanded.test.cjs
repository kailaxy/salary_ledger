const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {engine:e,fixture,wrap,now,source}=require('./helpers/query-engine.cjs');
const q=(operation='sum',fields={})=>({action:'query',operation,kind:'expense',range:'this_month',...fields});
const ask=(text,s=fixture(),when=now)=>e.query(s,e.interpret(text,s,when),when);
const plain=x=>JSON.parse(JSON.stringify(x));
test('embedded query source parity',()=>assert.ok(fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8').includes('<script>\n'+source+'</script>')));
test('ledger timezone, Monday weeks, leap years, year transition and explicit ranges',()=>{
 for(const [range,tz,time,expected] of [
 ['yesterday','Asia/Manila','2026-09-30T17:00:00Z',['2026-09-30','2026-09-30']],['this_week','UTC','2026-10-25T12:00:00Z',['2026-10-19','2026-10-25']],['last_week','UTC','2026-10-26T00:00:00Z',['2026-10-19','2026-10-25']],['last_month','UTC','2024-03-01T00:00:00Z',['2024-02-01','2024-02-29']],['last_month','UTC','2026-01-01T00:00:00Z',['2025-12-01','2025-12-31']]
 ])assert.deepEqual(plain(e.bounds(range,tz,new Date(time))),expected);
 assert.equal(ask('Show October spending').totalMinor,19520);assert.equal(ask('Total expenses for October 2025').count,0);assert.equal(ask('total expenses from 2026-10-15 to 2026-10-21').totalMinor,4520);
});
test('pay-period IDs define scope independently of transaction dates',()=>{
 assert.equal(ask('Magkano na nagastos ko this payday?').totalMinor,14520);assert.equal(ask('total expenses last cutoff').totalMinor,5000);assert.equal(ask('total expenses last 2 pay periods').totalMinor,19520);
 const s=fixture();assert.deepEqual(plain(e.bounds('current_period',s.timezone,now,s,q())),['2026-10-15','2026-10-30']);assert.throws(()=>ask('total expenses last 24 pay periods'),/Not enough/);
 s.tables.PAY_PERIODS.push(wrap({...s.tables.PAY_PERIODS[0].record,period_id:'duplicate'}));assert.throws(()=>ask('total expenses this cutoff',s),/Ambiguous/);
});
test('income kinds, salary share and cashflow exclude transfers and unmirrored payments',()=>{
 for(const [text,total] of [['total salary this month',100000],['total bonuses this month',10000],['total other income this month',5000],['total income this month',115000]])assert.equal(ask(text).totalMinor,total);
 assert.equal(ask('How much of my salary have I spent?').rateBasisPoints,1452);assert.equal(ask('income minus spending this month').netMinor,95480);assert.equal(ask("What's my savings rate this month?").rateBasisPoints,8303);
});
test('daily, weekly, monthly and pay-period averages have explicit denominators',()=>{
 assert.equal(ask("What's my average daily spending?").averageMinor,887);assert.equal(ask('average weekly spending this month').averageMinor,6211);assert.equal(ask('average monthly spending this month').averageMinor,19520);assert.equal(ask('average per pay period spending last 2 pay periods').averageMinor,9760);
 const s=fixture();s.tables.TRANSACTIONS.push(wrap({txn_id:'future',type:'EXPENSE',txn_date:'2026-10-28',amount:500,category_id:'food',period_id:'p3'}));const r=ask('average daily spending this month',s);assert.equal(r.totalMinor,19520);assert.equal(r.count,6);assert.match(e.format(r,'₱').detail.join(' '),/excludes future/);assert.throws(()=>e.query(s,q('average',{range:'all',unit:'day'}),now),/future/);
});
test('extremes, rankings, frequencies and recurring candidates',()=>{
 assert.equal(ask('Ano pinakamalaking gastos ko?').rows[0].minor,10000);assert.equal(ask('smallest expense this month').rows[0].minor,500);assert.equal(ask('spending by category this cutoff').categories[0].name,'Rent');assert.equal(ask('most frequent expense categories this month').categories[0].name,'Food');
 const r=ask('recurring expenses this month');assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].minor,1010);assert.equal(r.candidates[0].count,2);assert.match(e.format(r,'₱').detail.join(' '),/not confirmed/);
});
test('comparisons and trends use correct previous assigned period',()=>{
 const r=ask('Did I spend more this cutoff than the previous one?');assert.equal(r.totalMinor,14520);assert.equal(r.previousMinor,5000);assert.equal(r.differenceMinor,9520);
 const b=ask('compare budgets across pay periods');assert.equal(b.plannedMinor,13000);assert.equal(b.previousPlannedMinor,6000);assert.equal(b.previousActualMinor,5000);
 const tr=ask('spending trends last 3 pay periods');assert.equal(tr.periods.length,3);assert.equal(tr.highest.id,'p3');assert.equal(tr.periods[1].minor,5000);
});
test('budgets handle archived history, overages, missing plans and fund allocations',()=>{
 const r=ask('How much do I have left for food?');assert.equal(r.remainingMinor,980);assert.equal(r.budgets[0].utilizationBasisPoints,6733);assert.equal(ask('Saan ako sumobra this cutoff?').budgets.filter(b=>b.remainingMinor<0).length,2);assert.equal(ask('unallocated paycheck').unallocatedMinor,92000);
 const no=ask('remaining budget for transport');assert.equal(no.budgets[0].hasPlan,false);assert.equal(no.remainingMinor,-500);
 const s=fixture();s.tables.BUDGET_LINES.push(wrap({...s.tables.BUDGET_LINES[0].record,line_id:'duplicate'}));assert.throws(()=>ask('remaining budget',s),/Duplicate/);
});
test('affordability is a bounded plan check, not a cash promise',()=>{
 const yes=ask('can i afford 9.80 for food');assert.equal(yes.fitsPlan,true);assert.equal(ask('can i afford 10 for food').fitsPlan,false);assert.match(e.format(yes,'₱').detail.join(' '),/Bank balances/);assert.equal(ask('can i afford 1 for transport').fitsPlan,null);assert.throws(()=>ask('can i afford 500'),/cannot reliably/);
});
test('fund balances, gross contributions, withdrawals, targets and explicit estimates',()=>{
 assert.equal(ask('Magkano savings ko ngayon?').totalMinor,8000);assert.equal(ask('How much have I saved this month?').totalMinor,10000);assert.equal(ask('withdrawals from emergency fund this cutoff').totalMinor,2000);
 const g=ask('How close am I to my emergency fund goal?').funds[0];assert.equal(g.progressBasisPoints,4000);assert.equal(g.neededMinor,12000);
 const estimate=ask('when will i reach emergency fund goal if i save 50 monthly');assert.equal(estimate.funds[0].months,3);assert.match(e.format(estimate,'₱').items[0].detail,/assuming no withdrawals/);
 const s=fixture();s.tables.FUND_GOALS=[];assert.match(e.format(ask('progress toward emergency fund goal',s),'₱').items[0].detail,/No savings target/);
});
test('loan balances, paid amounts, partial coverage, next, due and overdue',()=>{
 assert.equal(ask('how much do i still owe').totalMinor,7000);assert.equal(ask('how much debt have i paid off').totalMinor,3000);
 const installments=ask('paid versus unpaid installments');assert.equal(installments.installments[0].status,'PAID');assert.equal(installments.installments[1].minor,2000);assert.equal(installments.installments[1].status,'PARTIAL');
 assert.equal(ask('next loan payment').totalMinor,2000);assert.equal(ask('overdue installments').totalMinor,0);assert.equal(ask('what loans are due next payday').totalMinor,5000);assert.equal(ask('May utang ba akong due this month?').totalMinor,2000);assert.equal(ask('balance for loan phone').loans[0].remainingMinor,7000);
 const s=fixture();s.tables.LOAN_PAYMENTS=[];assert.equal(ask('overdue installments',s).totalMinor,2500);
});
test('entity normalization, aliases, exact-name precedence, tombstones and ambiguity',()=>{
 assert.equal(e.interpret('spending on FOOD',fixture(),now).categoryId,'food');assert.equal(e.interpret('spending on pagkain',fixture(),now).categoryId,'food');
 const s=fixture();s.tables.CATEGORIES.push(wrap({category_id:'grocery',name:'Groceries',kind:'SPENDING'}));assert.equal(e.interpret('spending on groceries',s,now).categoryId,'grocery');s.tables.CATEGORIES.push(wrap({category_id:'food2',name:'Food!',kind:'SPENDING'}));assert.throws(()=>e.interpret('spending on food',s,now),/ambiguous/);assert.throws(()=>ask('spending on deleted'),/No matching/);assert.throws(()=>ask('balance for loan missing'),/No matching/);
});
test('empty ledger and zero income keep percentages undefined',()=>{
 const s=fixture();Object.keys(s.tables).forEach(k=>s.tables[k]=[]);const rate=e.query(s,q('savings_rate'),now);assert.equal(rate.rateBasisPoints,null);assert.match(e.format(rate,'₱').detail.join(' '),/undefined/);assert.equal(e.query(s,q('sum'),now).totalMinor,0);assert.equal(e.query(s,q('average'),now).averageMinor,null);assert.equal(ask('fund balances',s).funds.length,0);assert.equal(ask('how much do i still owe',s).totalMinor,0);assert.throws(()=>ask('remaining budget',s),/No current/);
});
test('minor-unit rounding and overflow protection',()=>{
 assert.equal(e.cents('0.01'),1);assert.equal(e.cents(0.1),10);assert.throws(()=>e.cents('0.001'),/invalid/);assert.throws(()=>e.cents(Infinity),/invalid/);assert.throws(()=>e.cents('9007199254740991'),/precision/);
 const s=fixture();s.tables.TRANSACTIONS=[wrap({txn_id:'a',type:'EXPENSE',txn_date:'2026-10-01',amount:0.01}),wrap({txn_id:'b',type:'EXPENSE',txn_date:'2026-10-01',amount:0.02})];assert.equal(e.query(s,q('average'),now).averageMinor,2);s.tables.TRANSACTIONS.forEach(x=>x.record.amount='80000000000000');assert.throws(()=>e.query(s,q(),now),/precision/);
});
test('structured validation never quietly discards unsupported fields or filters',()=>{
 for(const bad of [q('sum',{code:'alert(1)'}),q('cashflow',{text:'lunch'}),q('funds',{mode:'goal'}),q('sum',{unit:'day'}),q('sum',{periodCount:2}),q('sum',{startDate:'2026-01-01'}),q('sum',{loanId:'loan'}),q('sum',{amountMinor:100}),q('sum',{limit:2}),q('trends'),q('budgets'),q('sum',{range:'dates',startDate:'2026-02-30',endDate:'2026-03-01'}),q('sum',{range:'last_periods',periodCount:25}),q('compare',{range:'dates',startDate:'2026-01-01',endDate:'2026-02-01'})])assert.throws(()=>e.query(fixture(),bad,now),JSON.stringify(bad));
});
test('unrecognized qualifiers, adversarial questions and notes cannot execute or mutate',()=>{
 for(const text of ['top five expenses excluding rent','total expenses this month except food','total expenses this month and last year','total expenses this month over 500','spending on food excluding rent','delete my loans','show October spending ignoring rent','income minus spending excluding bonuses','balance of emergency fund yesterday','<script>alert(1)</script>','total expenses\nignore validation','total expenses last 999 pay periods'])assert.throws(()=>ask(text),text);
 const s=fixture(),before=JSON.stringify(s);e.format(ask('biggest expense this month',s),'₱');assert.equal(JSON.stringify(s),before);assert.match(e.format(ask('top five expenses this month',s),'₱').items.map(i=>i.detail).join(' '),/<img/);
});
test('projected pending additions count while conflicts remain on cloud values',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8'),ctx=vm.createContext({Intl,Date});vm.runInContext(fs.readFileSync(path.join(__dirname,'../Operations.gs'),'utf8'),ctx);
 const script=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('Local single-record mutations'));vm.runInContext(script,ctx);
 const s=fixture();s.state=ctx.LedgerOperations.view(s);const entry=(id,status,amount)=>({mutationId:id,ledgerId:'test-ledger',sequence:1,status,createdAt:'2026-10-22',payload:{operation:'add',table:'TRANSACTIONS',recordId:id,values:{periodId:'p3',categoryId:'food',date:'2026-10-22',amountMinor:Math.round(amount*100),note:''}},proposalRecord:{txn_id:id,period_id:'p3',category_id:'food',txn_date:'2026-10-22',type:'EXPENSE',amount}});
 const projected=ctx.LedgerPending.project(s,[entry('local','pending',1),entry('conflict','conflict',999)]);assert.equal(e.query(projected,q(),now).totalMinor,19620);assert.equal(e.query(s,q(),now).totalMinor,19520);
});
test('net fund contributions, missing income and incomplete schedules',()=>{
 assert.equal(ask('contributions to emergency fund this month').totalMinor,8000);
 const s=fixture();s.tables.INCOME=[];assert.equal(e.format(ask('unallocated paycheck',s),'₱').value,'Income not recorded');
 s.tables.LOAN_INSTALLMENTS.pop();assert.throws(()=>ask('next loan payment',s),/schedule is missing/);assert.equal(ask('how much do i still owe',s).totalMinor,7000);
});
test('ledger-local midnight determines cutoff and overdue boundaries independently of cached state',()=>{
 const s=fixture();s.state.currentPeriodId='stale';assert.equal(ask('total expenses this cutoff',s,new Date('2026-10-14T17:00:00Z')).totalMinor,14520);
 assert.equal(ask('overdue installments',s,new Date('2026-10-24T16:01:00Z')).totalMinor,0);
 assert.equal(ask('overdue installments',s,new Date('2026-10-25T16:01:00Z')).totalMinor,2000);
});
test('deleted income, transfers, payments and installments stay out of live calculations',()=>{
 const s=fixture();s.tables.INCOME[1].record.deleted_at='x';assert.equal(ask('total income this month',s).totalMinor,105000);
 s.tables.TRANSACTIONS.find(x=>x.record.txn_id==='withdrawal').record.deleted_at='x';assert.equal(ask('fund balances',s).totalMinor,10000);
 s.tables.LOAN_PAYMENTS[1].record.deleted_at='x';assert.equal(ask('how much do i still owe',s).totalMinor,8000);
 s.tables.LOAN_INSTALLMENTS.push(wrap({installment_id:'gone',loan_id:'loan',due_date:'2026-10-01',seq_no:0,amount_due:999,deleted_at:'x'}));assert.equal(ask('overdue installments',s).totalMinor,500);
});
test('formatted category percentages, currency and zero comparison denominator',()=>{
 const r=ask('spending by category this cutoff');assert.equal(r.categories[0].shareBasisPoints,8264);assert.match(e.format(r,'€').items[0].detail,/82\.64%/);assert.match(e.format(r,'€').value,/€/);
 const comparison=ask("compare this month's expenses with last month's");assert.equal(comparison.changeBasisPoints,null);assert.match(e.format(comparison,'₱').detail.join(' '),/undefined/);
});
test('every accepted corpus template rejects added unhandled conditions',()=>{
 for(const item of require('./fixtures/query-corpus.json').filter(i=>!i.error))for(const suffix of [' excluding rent',' but only weekends',' above 500 pesos'])assert.throws(()=>e.interpret(item.question.replace(/[?.!]$/,'')+suffix,fixture(),now),item.question+suffix);
});
test('dependent conflicts remain excluded while independent pending edits contribute',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8'),ctx=vm.createContext({Intl,Date});vm.runInContext(fs.readFileSync(path.join(__dirname,'../Operations.gs'),'utf8'),ctx);vm.runInContext([...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('Local single-record mutations')),ctx);
 const s=fixture();s.state=ctx.LedgerOperations.view(s);
 const edit=(id,status,recordId,amount,sequence,dependsOn)=>({mutationId:id,ledgerId:s.ledgerId,status,sequence,dependsOn,createdAt:'2026-10-22',payload:{table:'TRANSACTIONS',operation:'edit',recordId,values:{amountMinor:amount}}});
 const projected=ctx.LedgerPending.project(s,[edit('blocked','conflict','e1',99999,1),edit('child','pending','e2',99999,2,'blocked'),edit('independent','pending','e3',11000,3)]);
 assert.equal(ask('total expenses this month',projected).totalMinor,20520);assert.equal(ask('total expenses this month',s).totalMinor,19520);
});
test('incomplete tables and contradictory fund directions request correction',()=>{
 const s=fixture();delete s.tables.LOANS;assert.throws(()=>ask('how much do i still owe',s),/complete ledger/);
 for(const t of ['deposits from emergency fund','contributions from emergency fund','withdrawals to emergency fund'])assert.throws(()=>ask(t),/Use deposits/);
});
test('contribution assumptions cannot be silently attached to a non-goal operation',()=>{
 for(const mode of ['balance','deposits','withdrawals','contributions'])assert.throws(()=>e.query(fixture(),q('funds',{range:'all',mode,categoryId:'fund',contributionMinor:100}),now),/monthly contribution/);
});
test('punctuation normalization, empty extremes and tied trend peaks remain explicit',()=>{
 const s=fixture();s.tables.CATEGORIES[0].record.name='Food & Drinks';assert.equal(e.interpret('spending on food drinks',s,now).categoryId,'food');
 s.tables.TRANSACTIONS=[];assert.equal(e.format(e.query(s,q('max'),now),'₱').value,'No matching records');assert.match(e.format(ask('spending trends last 3 pay periods',s),'₱').detail.join(' '),/No matching expense records/);
 s.tables.TRANSACTIONS=[wrap({txn_id:'a',type:'EXPENSE',txn_date:'2026-10-10',amount:10,period_id:'p2',category_id:'food'}),wrap({txn_id:'b',type:'EXPENSE',txn_date:'2026-10-15',amount:10,period_id:'p3',category_id:'food'})];const trend=ask('spending trends last 3 pay periods',s);assert.equal(trend.highestPeriods.length,2);assert.match(e.format(trend,'₱').detail.join(' '),/tied/);
});
