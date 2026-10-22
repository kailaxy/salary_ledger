const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../web/ledger-query.js'),'utf8');
const ctx=vm.createContext({Intl,Date});vm.runInContext(source,ctx);
const wrap=record=>({record,fingerprint:'a'.repeat(64)}),now=new Date('2026-10-22T03:00:00Z');
function fixture(){const tables={};for(const t of ['SETTINGS','PAY_PERIODS','INCOME','CATEGORIES','FUND_GOALS','BUDGET_LINES','TRANSACTIONS','LOANS','LOAN_INSTALLMENTS','LOAN_PAYMENTS'])tables[t]=[];
const put=(t,rows)=>tables[t]=rows.map(wrap);
put('PAY_PERIODS',[['p1','2026-09-15'],['p2','2026-09-30'],['p3','2026-10-15'],['p4','2026-10-31'],['p5','2026-11-15']].map(([period_id,pay_date])=>({period_id,pay_date,start_date:pay_date,label:pay_date})));
put('CATEGORIES',[{category_id:'food',name:'Food',kind:'SPENDING'},{category_id:'rent',name:'Rent',kind:'SPENDING'},{category_id:'transport',name:'Transport',kind:'SPENDING',is_archived:true},{category_id:'fund',name:'Emergency Fund',kind:'FUND'},{category_id:'deleted',name:'Deleted',kind:'SPENDING',deleted_at:'x'}]);
put('INCOME',[{income_id:'i1',period_id:'p3',received_date:'2026-10-15',amount:1000,kind:'SALARY'},{income_id:'i2',period_id:'p3',received_date:'2026-10-16',amount:100,kind:'BONUS'},{income_id:'i3',period_id:'p2',received_date:'2026-09-30',amount:900,kind:'SALARY'},{income_id:'i4',period_id:'p3',received_date:'2026-10-18',amount:50,kind:'OTHER'}]);
put('TRANSACTIONS',[
{txn_id:'e1',period_id:'p3',txn_date:'2026-10-15',category_id:'food',type:'EXPENSE',amount:10.10,note:'<img src=x onerror=alert(1)>'},
{txn_id:'e2',period_id:'p3',txn_date:'2026-10-21',category_id:'food',type:'EXPENSE',amount:10.10},
{txn_id:'e3',period_id:'p3',txn_date:'2026-10-22',category_id:'rent',type:'EXPENSE',amount:100},
{txn_id:'old',period_id:'p2',txn_date:'2026-10-01',category_id:'food',type:'EXPENSE',amount:50},
{txn_id:'mirror',period_id:'p3',txn_date:'2026-10-20',category_id:'rent',type:'EXPENSE',amount:20},
{txn_id:'archived',period_id:'p3',txn_date:'2026-10-20',category_id:'transport',type:'EXPENSE',amount:5},
{txn_id:'deposit',period_id:'p3',txn_date:'2026-10-15',category_id:'fund',type:'FUND_IN',amount:100},
{txn_id:'withdrawal',period_id:'p3',txn_date:'2026-10-16',category_id:'fund',type:'FUND_OUT',amount:20},
{txn_id:'gone',period_id:'p3',txn_date:'2026-10-16',category_id:'food',type:'EXPENSE',amount:999,deleted_at:'x'}]);
put('FUND_GOALS',[{category_id:'fund',target_amount:200,target_date:'2027-01-01'}]);
put('BUDGET_LINES',[{line_id:'b1',period_id:'p3',category_id:'food',planned_amount:30},{line_id:'b2',period_id:'p3',category_id:'rent',planned_amount:100},{line_id:'b3',period_id:'p3',category_id:'fund',planned_amount:100},{line_id:'b4',period_id:'p2',category_id:'food',planned_amount:60}]);
put('LOANS',[{loan_id:'loan',name:'Phone',total_payable:100,principal:100,status:'ACTIVE'}]);
put('LOAN_PAYMENTS',[{payment_id:'pay',loan_id:'loan',paid_date:'2026-10-20',amount:20,txn_id:'mirror'},{payment_id:'pay2',loan_id:'loan',paid_date:'2026-10-21',amount:10,txn_id:''}]);
put('LOAN_INSTALLMENTS',[{installment_id:'ins1',loan_id:'loan',due_date:'2026-10-20',seq_no:1,amount_due:25},{installment_id:'ins2',loan_id:'loan',due_date:'2026-10-25',seq_no:2,amount_due:25},{installment_id:'ins3',loan_id:'loan',due_date:'2026-11-01',seq_no:3,amount_due:50}]);
return {formatVersion:1,ledgerId:'test-ledger',capturedAt:now.toISOString(),timezone:'Asia/Manila',currency:'₱',minorUnitScale:2,tables,state:{}};}
module.exports={engine:ctx.LedgerQuery,fixture,wrap,now,source};
