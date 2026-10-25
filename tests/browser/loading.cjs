const {chromium}=require('playwright-core'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture}=require('../helpers/operations-server.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const server=fixture(),page=await browser.newPage({viewport:{width:393,height:852}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let waiting=null,count=0,onRequest=null;
  await page.exposeFunction('testRPC',(method,args)=>{
   if(method==='getLedgerSnapshot'){
    if(args[0]!=='123456')return Promise.reject(Error(args[0]?'BAD_PIN':'PIN_REQUIRED'));
    count++;return new Promise((resolve,reject)=>{waiting={resolve,reject};if(onRequest){onRequest();onRequest=null;}});
   }
   return JSON.parse(JSON.stringify(server.ctx[method](...args)));
  });
  await page.addInitScript(()=>{window.google={script:{}};Object.defineProperty(google.script,'run',{get(){let success,failure;const runner=new Proxy({withSuccessHandler(f){success=f;return runner},withFailureHandler(f){failure=f;return runner}},{get(t,k){return k in t?t[k]:(...args)=>testRPC(k,args).then(success,failure);}});return runner;}});});
  await page.route('https://ledger.test/',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../../Index.html'),'utf8')}));
  await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());await page.goto('https://ledger.test/');
  await page.locator('#lock').waitFor({state:'visible'});await page.locator('#pin').fill('123456');await page.locator('#pinUnlock').click();
  await page.waitForFunction(()=>document.querySelector('#pinUnlock').disabled);
  assert.match(await page.locator('#pinUnlock').innerText(),/Unlocking/);
  assert.equal(await page.locator('#lock').getAttribute('aria-busy'),'true');
  await page.evaluate(()=>document.querySelector('#lock').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(count,1);
  waiting.resolve(server.snapshot());
  await page.locator('#lock').waitFor({state:'hidden'});await page.locator('#activityStatus').waitFor({state:'hidden'});
  const requested=new Promise(resolve=>{onRequest=resolve;});await page.locator('#refresh').click();await requested;await page.waitForFunction(()=>document.querySelector('#refresh').getAttribute('aria-busy')==='true');
  assert.match(await page.locator('#activityStatus').innerText(),/Refreshing/);
  waiting.reject(Error('Network unavailable'));
  await page.locator('#activityStatus').waitFor({state:'hidden'});assert.equal(await page.locator('#refresh').getAttribute('aria-busy'),'false');
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#tab-more').click();
  assert.equal(await page.locator('#panel-plan').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await page.locator('#activityStatus').evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
  assert.deepEqual(errors,[]);console.log('PASS: unlock feedback, duplicate-submit guard, refresh/error cleanup and reduced motion');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
