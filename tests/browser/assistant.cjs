const {chromium}=require('playwright-core'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture,now}=require('../helpers/query-engine.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':'/usr/bin/google-chrome'),args:['--no-sandbox']});
 try{for(const native of [false,true]){
  const ctx=vm.createContext({Intl,Date});vm.runInContext(fs.readFileSync(path.join(__dirname,'../../Operations.gs'),'utf8'),ctx);
  const snapshot=fixture();snapshot.capabilities={recordSyncVersion:1,fundSyncVersion:1,loanSyncVersion:1,operationSyncVersion:1};snapshot.state=ctx.LedgerOperations.view(snapshot);snapshot.state.setupDone=true;
  const context=await browser.newContext({viewport:{width:393,height:852}}),page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({snapshot,native,time})=>{
   const RealDate=Date;class Clock extends RealDate{constructor(...a){super(...(a.length?a:[time]));}static now(){return new RealDate(time).getTime();}}window.Date=Clock;
   window.__snapshot=snapshot;window.__online=sessionStorage.getItem('assistantOffline')!=='1';Object.defineProperty(navigator,'onLine',{get:()=>window.__online});window.__calls=[];
   if(native){window.LedgerAndroid={onmessage:null,postMessage(raw){const r=JSON.parse(raw);window.__calls.push(r.method);setTimeout(()=>LedgerAndroid.onmessage({data:JSON.stringify({id:r.id,ok:r.method==='getLedgerSnapshot',result:window.__snapshot,error:'READ_ONLY_TEST'})}),5);}};Object.defineProperty(window,'google',{get(){throw Error('Hosted adapter accessed in native mode');}});}
   else{localStorage.setItem('sl2_pin','123456');window.google={script:{}};Object.defineProperty(google.script,'run',{get(){let ok,bad;return {withSuccessHandler(fn){ok=fn;return this;},withFailureHandler(fn){bad=fn;return this;},getLedgerSnapshot(){window.__calls.push('getLedgerSnapshot');setTimeout(()=>ok(window.__snapshot),5);}};}});}
  },{snapshot,native,time:now.toISOString()});
  const origin=native?'https://appassets.androidplatform.net':'https://ledger.test',url=origin+(native?'/assets/Index.html':'/');
  const html=fs.readFileSync(path.join(__dirname,'../../Index.html'),'utf8').replace(/^<link[^>]*https:\/\/fonts\.(googleapis|gstatic)\.com[^>]*>\r?\n/gm,'').replace(/^<base[^>]*>\r?\n/gm,'');
  await page.route('**/*',r=>{if(r.request().url()===url)return r.fulfill({contentType:'text/html',headers:native?{'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"}:{},body:html});requests.push(r.request().url());return r.abort();});
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#assistantSource').textContent.includes('Updated'));
  assert.equal(await page.locator('.ledger-assistant').evaluate(e=>e.classList.contains('is-expanded')),false);
  await page.locator('#assistantInput').focus();await page.waitForFunction(()=>document.querySelector('.ledger-assistant').classList.contains('is-expanded'));
  async function ask(text){await page.locator('#assistantInput').fill(text);await page.locator('#assistantInput').press('Enter');return page.locator('.assistant-answer').last().innerText();}
  assert.match(await ask('Magkano gastos ko this month?'),/195\.20/);
  assert.match(await ask('How much do I have left for food?'),/9\.80/);
  assert.match(await ask('can i afford 10 for food'),/exceeds.*remaining category plan/);
  assert.match(await ask('How close am I to my emergency fund goal?'),/40\.00%/);
  assert.match(await ask('May utang ba akong due this month?'),/20\.00/);
  assert.match(await ask('Did I spend more this cutoff than the previous one?'),/95\.20.*more/);
  assert.equal(await page.locator('.assistant-comparison').count(),1);
  assert.match(await ask('average daily spending this month'),/8\.87/);
  assert.match(await ask('top five expenses this month'),/<img src=x onerror=alert\(1\)>/);
  assert.equal(await page.locator('.assistant-answer img').count(),0);
  assert.match(await ask('top five expenses excluding rent'),/cannot reliably/);
  await page.evaluate(()=>{window.__online=false;dispatchEvent(new Event('offline'));});assert.match(await ask('fund balances'),/80\.00/);
  await page.locator('#assistantInput').fill('keep my draft');await page.locator('[data-act="collapseassistant"]').click();assert.equal(await page.locator('#assistantInput').inputValue(),'keep my draft');assert.equal(await page.locator('.assistant-turn').count(),10);
  await page.locator('#settingsBtn').click();await page.waitForFunction(()=>document.activeElement.id==='setClose');await page.locator('#setClose').click();await page.locator('#assistantInput').focus();
  for(const width of [320,393,768]){await page.setViewportSize({width,height:852});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page overflow at '+width);assert.equal(await page.locator('.assistant-answer').last().evaluate(e=>e.scrollWidth>e.clientWidth),false,'answer overflow at '+width);}
  await page.evaluate(()=>{window.__online=true;dispatchEvent(new Event('online'));});await page.waitForFunction(()=>!document.querySelector('#refresh').classList.contains('spin'));
  assert.equal(await page.locator('#assistantInput').inputValue(),'keep my draft');assert.ok((await page.evaluate(()=>window.__calls)).every(m=>m==='getLedgerSnapshot'));
  await require('./personality-checks.cjs')({page,native,snapshot});
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  if(!native)await page.screenshot({path:'/tmp/salary-ledger-assistant.png',fullPage:true});
  console.log('PASS ('+(native?'packaged native adapter':'hosted')+'): expanded assistant, financial breakdowns, Taglish, offline queries, safe notes, strict qualifiers, preserved draft, Settings focus, mobile layouts and read-only transport');await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
