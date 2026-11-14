const {waitFor}=require('./wait.cjs');
const {chromium}=require('playwright-core'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture}=require('../helpers/operations-server.cjs');
async function queue(page,count){await waitFor(page,async n=>(await LedgerLocal.list('test-ledger')).length===n,count);await page.waitForFunction(()=>document.querySelector('#addGo')?.disabled===false||!document.querySelector('#addGo')||!document.querySelector('#addNeed').hidden);await page.evaluate(()=>new Promise(requestAnimationFrame));}
async function confirm(page){await page.locator('#reviewConfirm').click();}
(async()=>{for(const native of [false,true]){
 const server=fixture();server.put('PAY_PERIODS',{period_id:'per_future',label:'Nov 15',pay_date:'2026-11-15'});
 server.put('BUDGET_LINES',{line_id:'line_food',period_id:'per_test',category_id:'cat_food',planned_amount:1000});
 server.put('CATEGORIES',{category_id:'cat_fund',name:'Emergency',kind:'FUND'});server.put('INCOME',{income_id:'inc_modal',received_date:'2026-10-20',amount:100,kind:'OTHER',source:'Work',note:'Modal income'});server.put('TRANSACTIONS',{txn_id:'txn_modal',txn_date:'2026-10-20',amount:50,type:'FUND_IN',category_id:'cat_fund',note:'Modal fund'});server.put('LOAN_PAYMENTS',{payment_id:'pay_modal',loan_id:'lon_test',paid_date:'2026-10-20',amount:50,note:'Modal loan'});
 server.put('LOANS',{loan_id:'lon_paid_ui',name:'Completed phone',principal:100,total_payable:100,installment_amount:100,installment_count:1,frequency:'MONTHLY',start_date:'2026-10-19',status:'PAID'});server.put('LOAN_INSTALLMENTS',{installment_id:'ins_paid_ui',loan_id:'lon_paid_ui',seq_no:1,due_date:'2026-10-19',amount_due:100});server.put('LOAN_PAYMENTS',{payment_id:'pay_paid_ui',loan_id:'lon_paid_ui',paid_date:'2026-10-19',amount:100,txn_id:'txn_paid_ui',note:'Completed payment'});server.put('TRANSACTIONS',{txn_id:'txn_paid_ui',txn_date:'2026-10-19',type:'EXPENSE',amount:100,note:'Completed payment'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':'/usr/bin/google-chrome'),args:['--no-sandbox']});
 let page;try{
 page=await browser.newPage({viewport:{width:393,height:852}});await page.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let lost=false;
 await page.exposeFunction('testRPC',async(method,args)=>{if(native)args=['123456',...args];if(!['getLedgerSnapshot','syncOperation','syncLedgerMutation','syncLoanPayment'].includes(method))throw Error('Unexpected method '+method);const r=server.ctx[method](...args);if(method==='syncOperation'&&lost){lost=false;throw Error('Simulated lost operation reply');}return JSON.parse(JSON.stringify(r));});
 await page.addInitScript(({native})=>{
  if(!native)localStorage.setItem('sl2_pin','123456');Object.defineProperty(navigator,'onLine',{get:()=>sessionStorage.getItem('offline')!=='1'});
  if(native){window.LedgerAndroid={onmessage:null,postMessage(text){const r=JSON.parse(text);if(r.action==='frontendReady'){setTimeout(()=>LedgerAndroid.onmessage({data:JSON.stringify({id:r.id,ok:true,result:{ready:true}})}),0);return;}if(!navigator.onLine){setTimeout(()=>LedgerAndroid.onmessage({data:JSON.stringify({id:r.id,ok:false,error:'offline'})}),1);return;}window.testRPC(r.method,r.args).then(result=>LedgerAndroid.onmessage({data:JSON.stringify({id:r.id,ok:true,result})}),e=>LedgerAndroid.onmessage({data:JSON.stringify({id:r.id,ok:false,error:e.message})}));}};return;}
  window.google={script:{}};Object.defineProperty(google.script,'run',{get(){let success,failure;const runner=new Proxy({withSuccessHandler(f){success=f;return runner},withFailureHandler(f){failure=f;return runner}},{get(t,k){return k in t?t[k]:(...a)=>{if(!navigator.onLine){failure(Error('offline'));return;}testRPC(k,a).then(success,failure)};}});return runner;}});
 },{native});
 const url=native?'https://appassets.androidplatform.net/assets/Index.html':'https://ledger.test/';let html=fs.readFileSync(path.join(__dirname,'../../Index.html'),'utf8');if(native)html=html.replace(/^<link[^>]*https:\/\/fonts\.(googleapis|gstatic)\.com[^>]*>\r?\n/gm,'').replace(/^<base[^>]*>\r?\n/gm,'');
 await page.route(url,r=>r.fulfill({contentType:'text/html',headers:native?{'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"}:{},body:html}));await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());await page.goto(url);await page.waitForFunction(()=>document.querySelector('#assistantSource').textContent.includes('Updated'));
 await page.evaluate(()=>{sessionStorage.setItem('offline','1');dispatchEvent(new Event('offline'));});

 await page.locator('#tab-records').click();await page.locator('#calendarJump').fill('2026-10-20');await page.locator('#calendarJump').dispatchEvent('change');
 let count=0;
 for(const [label,title] of [['Modal income','Edit income'],['Modal fund','Edit fund entry'],['Modal loan','Edit loan payment']]){
  await page.locator('#calendarRecords > button').filter({hasText:label}).click();
  assert.equal(await page.locator('#recordEditTitle').innerText(),title);
  assert.equal(await page.locator('#tab-records').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#addForm').count(),1);
  await page.locator('#fNote').fill(label+' edited');
  if(!native&&count===1)await page.screenshot({path:'/tmp/ledger-calendar-edit-modal.png',fullPage:true,animations:'disabled'});
  await page.locator('#addGo').click();await confirm(page);await queue(page,++count);
  assert.equal(await page.locator('#recordEditModal').isVisible(),false);
  assert.match(await page.locator('#calendarRecords').innerText(),new RegExp(label+' edited'));
 }
 await page.locator('#tab-more').click();await page.locator('#tab-loans').click();assert.equal(await page.locator('#paidLoans').evaluate(el=>el.open),false);assert.equal(await page.locator('#paidLoans [data-act="editloan"]').isVisible(),false);await page.locator('#paidLoans > summary').click();await page.locator('#paidLoans details > summary').filter({hasText:'Payments ('}).click();await page.locator('#paidLoans [data-act="editentry"]').click();assert.match(await page.locator('#recordDeleteHelp').innerText(),/linked spending/);
 const before=await page.evaluate(async()=>{const v=await LedgerLocal.view();return LedgerOperations.view(LedgerPending.project(v.snapshot,v.entries)).summary;});
 await page.locator('#recordDelete').click();assert.equal(await page.locator('#reviewConfirm').innerText(),'Confirm deletion');await page.locator('#reviewCancel').click();await queue(page,count);assert.equal(await page.locator('#recordEditModal').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'recordDelete');
 await page.locator('#recordDelete').click();await page.evaluate(()=>{document.querySelector('#reviewConfirm').click();document.querySelector('#reviewConfirm').click();});await queue(page,++count);assert.equal(await page.locator('#recordEditModal').isVisible(),false);assert.equal(await page.locator('#paidLoans').count(),0);
 const after=await page.evaluate(async()=>{const v=await LedgerLocal.view();return LedgerOperations.view(LedgerPending.project(v.snapshot,v.entries)).summary;});assert.equal(after.spent,before.spent-100);assert.equal(after.loanRemaining,before.loanRemaining+100);
 await page.locator('#tab-records').click();await page.locator('#calendarJump').fill('2026-10-20');await page.locator('#calendarJump').dispatchEvent('change');
 for(const label of ['Modal income','Modal fund','Modal loan']){await page.locator('#calendarRecords > button').filter({hasText:label}).click();await page.locator('#recordDelete').click();await confirm(page);await queue(page,++count);assert.equal(await page.locator('#calendarRecords > button').filter({hasText:label}).count(),0);}
 await page.evaluate(()=>{sessionStorage.removeItem('offline');dispatchEvent(new Event('online'));});await queue(page,0);
 const synced=server.snapshot();assert(synced.tables.LOAN_PAYMENTS.find(x=>x.record.payment_id==='pay_paid_ui').record.deleted_at);assert(synced.tables.TRANSACTIONS.find(x=>x.record.txn_id==='txn_paid_ui').record.deleted_at);assert.equal(synced.state.loans.find(l=>l.id==='lon_paid_ui').status,'ACTIVE');
 assert.deepEqual(errors,[]);console.log('PASS ('+(native?'packaged':'hosted')+'): modal edits/deletes, cancellation, duplicate confirmation, linked spending cleanup, paid-loan folding/reactivation and sync');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
