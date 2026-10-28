const {waitFor}=require('./wait.cjs');
const {chromium}=require('playwright-core'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {loanFixture}=require('../helpers/loan-server.cjs');
async function queue(page,count){await waitFor(page,async n=>(await LedgerLocal.list('test-ledger')).length===n,count);}
(async()=>{
 for(const native of [false,true]){
 const server=loanFixture();for(const table of ['SETTINGS','BUDGET_LINES','FUND_GOALS'])server.put(table,{});
 server.ctx.Utilities.formatDate=(d,tz,pattern)=>pattern==='yyyy-MM-dd'?'2026-10-22':pattern==='yyyy'?'2026':'2026-10-22 10:00:00';
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':'/usr/bin/google-chrome'),args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:393,height:852}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 let loseReply=false;
 await page.exposeFunction('testRPC',async(method,args)=>{
   if(native)args=['123456',...args];
   let result;if(method==='getLedgerSnapshot')result=server.ctx.getLedgerSnapshot(...args);
   else if(method==='syncLoanPayment'){result=server.ctx.syncLoanPayment(...args);if(loseReply){loseReply=false;throw Error('Simulated lost loan response');}}
   else throw Error('Unexpected method '+method);
   return JSON.parse(JSON.stringify(result));
 });
 await page.addInitScript(({native})=>{
   if(!native)localStorage.setItem('sl2_pin','123456');Object.defineProperty(navigator,'onLine',{get:()=>sessionStorage.getItem('offline')!=='1'});
   if(native){window.LedgerAndroid={onmessage:null,postMessage(text){const request=JSON.parse(text);if(request.action==='frontendReady'){setTimeout(()=>LedgerAndroid.onmessage({data:JSON.stringify({id:request.id,ok:true,result:{ready:true}})}),0);return;}window.testRPC(request.method,request.args).then(result=>LedgerAndroid.onmessage({data:JSON.stringify({id:request.id,ok:true,result})}),error=>LedgerAndroid.onmessage({data:JSON.stringify({id:request.id,ok:false,error:error.message})}));}};return;}
   window.google={script:{}};Object.defineProperty(google.script,'run',{get(){let success,failure;const runner=new Proxy({withSuccessHandler(fn){success=fn;return runner;},withFailureHandler(fn){failure=fn;return runner;}},{get(target,name){return name in target?target[name]:(...args)=>{if(!navigator.onLine){failure(Error('offline'));return;}window.testRPC(name,args).then(success,failure);};}});return runner;}});
 },{native});
 const url=native?'https://appassets.androidplatform.net/assets/Index.html':'https://ledger.test/';
 let html=fs.readFileSync(path.join(__dirname,'../../Index.html'),'utf8');if(native)html=html.replace(/^<link[^>]*https:\/\/fonts\.(googleapis|gstatic)\.com[^>]*>\r?\n/gm,'').replace(/^<base[^>]*>\r?\n/gm,'');
 await page.route(url,r=>r.fulfill({contentType:'text/html',headers:native?{'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"}:{},body:html}));await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#assistantSource').textContent.includes('Updated'));
 await page.evaluate(()=>{sessionStorage.setItem('offline','1');dispatchEvent(new Event('offline'));});
 await page.locator('#tab-add').click();await page.locator('[data-act="addtype"][data-v="Loan"]').click();await page.locator('#fAmount').fill('500');await page.locator('#fNote').fill('Phone installment');await page.locator('#addGo').click();
 assert.match(await page.locator('#reviewBefore').innerText(),/1,000.00/);assert.match(await page.locator('#reviewAfter').innerText(),/Count as spending: Yes/);assert.match(await page.locator('#reviewAfter').innerText(),/Owed after: ₱500.00/);
 await page.locator('#reviewCancel').click();await queue(page,0);await page.locator('#addGo').click();await page.locator('#reviewConfirm').click();await queue(page,1);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#assistantSource').textContent.includes('cached')||document.querySelector('#assistantSource').textContent.includes('Updated'));await queue(page,1);
 const projected=await page.evaluate(async()=>{const v=await LedgerLocal.view();return LedgerPending.project(v.snapshot,v.entries);});assert.equal(projected.state.summary.spent,500);assert.equal(projected.state.loans[0].remaining,500);assert.equal(projected.state.recent.filter(r=>r.kind==='loanpay').length,1);assert.equal(projected.state.recent.filter(r=>r.kind==='txn').length,0);
 loseReply=true;await page.evaluate(()=>{sessionStorage.removeItem('offline');dispatchEvent(new Event('online'));});
 await waitFor(page,async()=>{const q=await LedgerLocal.list('test-ledger');return q.length===1&&q[0].error.includes('lost loan response');});
 await page.waitForFunction(()=>!document.querySelector('#refresh').classList.contains('spin'));
 await page.locator('#tab-home').click();await page.locator('#pendingPanel').evaluate(e=>e.open=true);await page.locator('[data-act="retrysync"]').click();await queue(page,0);
 assert.equal(server.rows('LOAN_PAYMENTS').length,1);assert.equal(server.rows('TRANSACTIONS').length,1);assert.equal(server.rows('LOAN_PAYMENTS')[0].installment_id,'ins_first');
 await page.waitForFunction(()=>!document.querySelector('#refresh').classList.contains('spin'));
 // Final unmirrored payment pays off the loan without another expense.
 await page.evaluate(()=>{sessionStorage.setItem('offline','1');dispatchEvent(new Event('offline'));});await page.locator('#tab-add').click();await page.locator('[data-act="addtype"][data-v="Loan"]').click();await page.locator('#fAlso').uncheck();await page.locator('#fAmount').fill('500');await page.locator('#addGo').click();assert.match(await page.locator('#reviewAfter').innerText(),/Count as spending: No/);await page.locator('#reviewConfirm').click();await queue(page,1);
 const final=await page.evaluate(async()=>{const v=await LedgerLocal.view();return LedgerPending.project(v.snapshot,v.entries).state;});assert.equal(final.loans[0].status,'PAID');assert.equal(final.summary.spent,500);
 // A payment from another device changes the debt while this proposal is queued.
 server.put('LOAN_PAYMENTS',{payment_id:'pay_other_device',loan_id:'lon_test',amount:100,paid_date:'2026-10-22',note:'Other device'});
 await page.evaluate(()=>{sessionStorage.removeItem('offline');dispatchEvent(new Event('online'));});await waitFor(page,async()=>(await LedgerLocal.list('test-ledger'))[0]?.status==='conflict');
 await page.locator('#tab-home').click();await page.locator('#pendingPanel').evaluate(e=>e.open=true);await page.locator('[data-act="resolvecloud"]').click();assert.match(await page.locator('#reviewAfter').innerText(),/Cloud amount owed: ₱400.00/);
 await page.locator('#reviewCancel').click();await queue(page,1);await page.locator('[data-act="resolvecloud"]').click();await page.locator('#reviewConfirm').click();await queue(page,0);
 await page.locator('#tab-add').click();await page.locator('[data-act="addtype"][data-v="Loan"]').click();await page.locator('#fAlso').uncheck();await page.locator('#fAmount').fill('400');await page.locator('#addGo').click();await page.locator('#reviewConfirm').click();await queue(page,0);
 await waitFor(page,async()=>{const s=await LedgerLocal.restore();return (await LedgerLocal.list('test-ledger')).length===0&&s.tables.LOAN_PAYMENTS.length===3&&s.state.loans[0].status==='PAID';});
 assert.equal(server.rows('LOANS')[0].status,'PAID');assert.equal(server.rows('LOAN_PAYMENTS').length,3);assert.equal(server.rows('TRANSACTIONS').length,1);
 assert.deepEqual(errors,[]);console.log('PASS ('+(native?'packaged native adapter':'hosted')+'): loan review/cancel, offline mirror, cold reload, lost-response retry, conflict review/cancel/discard, unmirrored final payment and paid status');
 }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1);});
