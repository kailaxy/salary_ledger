const {chromium}=require('playwright-core');const fs=require('fs');const path=require('node:path');
async function waitQueue(page,count){for(let i=0;i<100;i++){if(await page.evaluate(async()=> (await LedgerLocal.list('test-ledger')).length)===count)return;await page.waitForTimeout(50);}throw Error('Queue count did not become '+count);}
let debugPage;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':'/usr/bin/google-chrome'),headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:393,height:852}});debugPage=page;page.setDefaultTimeout(7000);page.setDefaultNavigationTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const tables={};for(const n of ['SETTINGS','PAY_PERIODS','INCOME','CATEGORIES','FUND_GOALS','BUDGET_LINES','TRANSACTIONS','LOANS','LOAN_INSTALLMENTS','LOAN_PAYMENTS'])tables[n]=[];
 const wrap=record=>({record,fingerprint:'a'.repeat(64)});
 tables.PAY_PERIODS=[wrap({period_id:'per_test',pay_date:'2026-10-15',label:'Oct 15'})];tables.CATEGORIES=[wrap({category_id:'cat_food',name:'Food',kind:'SPENDING',is_archived:false})];
 const state={setupDone:true,app:{name:'Salary Ledger'},settings:{appName:'Salary Ledger',payDays:'15,EOM'},today:'2026-10-21',years:[2026],periods:[{id:'per_test',label:'Oct 15',date:'2026-10-15',hasIncome:false,income:0,spent:0,funds:0,planned:0,unassigned:0}],categories:[{id:'cat_food',name:'Food',kind:'SPENDING',actual:0,archived:false,planToDate:0,yearPlan:0,target:0,targetDate:''}],plan:{},byCat:{},loans:[],recent:[],currentPeriodId:'per_test',summary:{received:0,spent:0,inFunds:0,saved:0,unassigned:0,loanRemaining:0}};
 tables.CATEGORIES.push(wrap({category_id:'cat_fund',name:'Emergency',kind:'FUND',is_archived:false}));state.categories.push({id:'cat_fund',name:'Emergency',kind:'FUND',actual:0,archived:false,planToDate:0,yearPlan:0,target:0,targetDate:''});
 const snapshot={formatVersion:1,ledgerId:'test-ledger',capabilities:{recordSyncVersion:1,fundSyncVersion:1},capturedAt:'2026-10-20T00:00:00.000Z',timezone:'Asia/Manila',currency:'₱',minorUnitScale:2,tables,state};
 await page.addInitScript(({snapshot})=>{
   localStorage.setItem('sl2_pin','123456');window.__online=sessionStorage.getItem('testOffline')!=='1';Object.defineProperty(navigator,'onLine',{get:()=>window.__online});window.__server=snapshot;window.__receipts={};window.__lost=false;window.__calls=[];
   window.google={script:{}};Object.defineProperty(window.google.script,'run',{get(){let success,failure;const runner={withSuccessHandler(fn){success=fn;return this},withFailureHandler(fn){failure=fn;return this},getLedgerSnapshot(){setTimeout(()=>{if(!window.__online)return failure(Error('offline'));window.__server.capturedAt=new Date().toISOString();success(JSON.parse(JSON.stringify(window.__server)));},5)},syncLedgerMutation(pin,p){setTimeout(()=>{
     if(!window.__online)return failure(Error('offline'));window.__calls.push(JSON.parse(JSON.stringify(p)));
     if(window.__receipts[p.mutationId])return success(window.__receipts[p.mutationId]);
     const key=p.table==='INCOME'?'income_id':'txn_id',old=window.__server.tables[p.table].find(x=>x.record[key]===p.recordId);
     if((p.operation==='add'&&old)||(p.operation==='edit'&&(!old||old.fingerprint!==p.baseFingerprint)))return success({status:'conflict',mutationId:p.mutationId,recordId:p.recordId,remote:old?old.record:null,fingerprint:old?old.fingerprint:null});
     const r=old?JSON.parse(JSON.stringify(old.record)):{[key]:p.recordId,created_at:new Date().toISOString(),deleted_at:'',type:p.table==='TRANSACTIONS'?'EXPENSE':undefined};r.updated_at=new Date().toISOString();
     const map={periodId:'period_id',date:p.table==='INCOME'?'received_date':'txn_date',categoryId:'category_id',note:'note',kind:'kind',source:'source',type:'type'};for(const k in map)if(p.values[k]!==undefined)r[map[k]]=p.values[k];if(p.values.amountMinor!==undefined)r.amount=p.values.amountMinor/100;
     const fingerprint=(p.operation==='add'?'b':'c').repeat(64);window.LedgerPending.applyRecord(window.__server,p.table,r,fingerprint);
     const receipt={status:'committed',mutationId:p.mutationId,recordId:p.recordId,record:r,fingerprint,committedAt:new Date().toISOString()};window.__receipts[p.mutationId]=receipt;
     if(window.__lost){window.__lost=false;failure(Error('Simulated lost response'));}else success(receipt);
   },5)}};return runner;}});
 },{snapshot});
 await page.route('https://ledger.test/',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../../Index.html'),'utf8')}));await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await page.goto('https://ledger.test/');await page.waitForFunction(()=>document.querySelector('#assistantSource').textContent.includes('Updated'));
 await page.evaluate(()=>{window.__online=false;sessionStorage.setItem('testOffline','1');dispatchEvent(new Event('offline'));});
 await page.locator('#tab-add').click();await page.locator('#fAmount').fill('500');await page.locator('#fNote').fill('Lunch');await page.locator('#addGo').click();await page.locator('#reviewCancel').click();
 if(await page.evaluate(async()=> (await LedgerLocal.list('test-ledger')).length)!==0)throw Error('Cancel enqueued a change');
 await page.locator('#addGo').click();await page.locator('#reviewConfirm').click();await waitQueue(page,1);
 await page.waitForFunction(()=>document.querySelector('#addGo').disabled===false);
 await page.locator('[data-act="editentry"]').click();await page.locator('#fAmount').fill('750');await page.locator('#addGo').click();await page.locator('#reviewConfirm').click();await waitQueue(page,2);
 await page.reload();await waitQueue(page,2);await page.waitForFunction(()=>!document.querySelector('#refresh').classList.contains('spin')&&!document.querySelector('#pendingPanel').hidden);
 // Reconnect after offline restoration, then exercise a lost server response.
 await page.evaluate(()=>{window.__lost=true;window.__online=true;sessionStorage.removeItem('testOffline');});await page.locator('#tab-home').click();await page.locator('#pendingPanel').evaluate(e=>e.open=true);await page.locator('[data-act="retrysync"]').click();
 await page.waitForFunction(()=>window.__calls.length>=1);
 await page.waitForFunction(()=>!document.querySelector('#refresh').classList.contains('spin'));
 await page.locator('[data-act="retrysync"]').click();await waitQueue(page,0);
 const result=await page.evaluate(()=>({rows:window.__server.tables.TRANSACTIONS.length,amount:window.__server.tables.TRANSACTIONS[0].record.amount}));if(result.rows!==1||result.amount!==750){console.log('Calls:',await page.evaluate(()=>window.__calls));}if(result.rows!==1||result.amount!==750)throw Error('Duplicate or wrong final amount '+JSON.stringify(result));
 await page.waitForFunction(()=>!document.querySelector('#refresh').classList.contains('spin'));
 await page.evaluate(()=>{window.__online=false;dispatchEvent(new Event('offline'));});
 await page.locator('#tab-add').click();await page.locator('[data-act="editentry"]').click();await page.locator('#fAmount').fill('800');await page.locator('#addGo').click();await page.locator('#reviewConfirm').click();await waitQueue(page,1);
 await page.evaluate(()=>{const r={...window.__server.tables.TRANSACTIONS[0].record,amount:900};LedgerPending.applyRecord(window.__server,'TRANSACTIONS',r,'d'.repeat(64));window.__online=true;dispatchEvent(new Event('online'));});
 for(let i=0;i<100;i++){if(await page.evaluate(async()=> (await LedgerLocal.list('test-ledger'))[0]?.status)==='conflict')break;await page.waitForTimeout(50);}
 await page.locator('#tab-home').click();await page.locator('#pendingPanel').evaluate(e=>e.open=true);await page.locator('[data-act="resolvecloud"]').click();
 if(!await page.locator('#reviewAfter').innerText().then(t=>t.includes('900.00')))throw Error('Conflict review omitted cloud amount');
 await page.locator('#reviewCancel').click();await waitQueue(page,1);await page.locator('[data-act="resolvecloud"]').click();await page.locator('#reviewConfirm').click();await waitQueue(page,0);
 if(await page.evaluate(async()=> (await LedgerLocal.restore()).tables.TRANSACTIONS[0].record.amount)!==900)throw Error('Cloud resolution failed');
 await page.waitForFunction(()=>!document.querySelector('#refresh').classList.contains('spin'));
 await page.evaluate(()=>{window.__online=false;dispatchEvent(new Event('offline'));});
 await page.locator('#tab-add').click();await page.locator('[data-act="addtype"][data-v="Fund"]').click();
 await page.locator('#fAmount').fill('100');await page.locator('#fDir').selectOption('IN');await page.locator('#addGo').click();
 if(!(await page.locator('#reviewAfter').innerText()).includes('Deposit to fund'))throw Error('Fund confirmation lacks direction');
 await page.locator('#reviewConfirm').click();await waitQueue(page,1);await page.waitForFunction(()=>!document.querySelector('#addGo').disabled);
 await page.locator('#fAmount').fill('60');await page.locator('#fDir').selectOption('OUT');await page.locator('#addGo').click();await page.locator('#reviewConfirm').click();await waitQueue(page,2);
 await page.waitForFunction(()=>!document.querySelector('#addGo').disabled);await page.locator('#fAmount').fill('41');await page.locator('#addGo').click();
 if(!(await page.locator('#addMsg').innerText()).includes('only holds'))throw Error('Fund overdraw was not blocked');
 const funds=await page.evaluate(async()=>{const v=await LedgerLocal.view();return LedgerPending.project(v.snapshot,v.entries).state.summary;});
 if(funds.inFunds!==40||funds.spent!==900)throw Error('Fund transfer affected wrong totals');
 await page.evaluate(()=>{window.__online=true;dispatchEvent(new Event('online'));});await waitQueue(page,0);
 const finalFunds=await page.evaluate(()=>window.__server.tables.TRANSACTIONS.filter(x=>x.record.type.startsWith('FUND_')).map(x=>x.record));
 if(finalFunds.length!==2||finalFunds[0].type!=='FUND_IN'||finalFunds[1].type!=='FUND_OUT')throw Error('Fund synchronization lost transfer direction');
 for(const width of [320,393,768]){await page.setViewportSize({width,height:852});if(await page.locator('body').evaluate(e=>e.scrollWidth>innerWidth))throw Error('Layout overflows at '+width);}
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS: cancel, offline add, edit pending addition, durable restart, lost-response retry, no duplicates, conflict review/cancel/keep-cloud, final amounts, offline fund deposit/withdrawal/overdraw checks');await browser.close();
})().catch(async e=>{console.error(e);if(debugPage)console.log(await debugPage.evaluate(async()=>({messages:document.querySelector('#addMsg').textContent,source:document.querySelector('#assistantSource').textContent,pending:await LedgerLocal.list('test-ledger'),calls:window.__calls,body:document.querySelector('#pendingBody').innerText})));process.exit(1)});
