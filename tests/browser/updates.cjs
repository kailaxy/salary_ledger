const {chromium}=require('playwright-core'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture}=require('../helpers/operations-server.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':'/usr/bin/google-chrome'),args:['--no-sandbox']});
 try{for(const native of [false,true]){
  const page=await browser.newPage({viewport:{width:393,height:852}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({native,snapshot})=>{
   localStorage.setItem('sl2_pin','123456');window.__messages=[];
   if(native){window.LedgerAndroid={onmessage:null,postMessage(raw){const request=JSON.parse(raw);window.__messages.push(request);
    const reply=result=>setTimeout(()=>LedgerAndroid.onmessage({data:JSON.stringify({id:request.id,ok:true,result})}),0);
    if(request.action==='frontendReady')reply({ready:true});
    else if(request.action==='checkFrontendUpdates')window.__updateId=request.id;
    else if(request.action==='restoreFrontend')reply('Restore canceled.');
    else reply(snapshot);
   }};return;}
   window.google={script:{}};Object.defineProperty(google.script,'run',{get(){let success;const runner=new Proxy({withSuccessHandler(f){success=f;return runner},withFailureHandler(){return runner}},{get(t,k){return k in t?t[k]:()=>setTimeout(()=>success(snapshot),0);}});return runner;}});
  },{native,snapshot:fixture().snapshot()});
  let html=fs.readFileSync(path.join(__dirname,'../../Index.html'),'utf8').replace(/^<link[^>]*https:\/\/fonts\.(googleapis|gstatic)\.com[^>]*>\r?\n/gm,'').replace(/^<base[^>]*>\r?\n/gm,'');
  const url=native?'https://appassets.androidplatform.net/assets/Index.html':'https://ledger.test/';
  await page.route(url,r=>r.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"},body:html}));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#assistantSource').textContent.includes('Updated'));
  await page.locator('#settingsBtn').click();assert.equal(await page.locator('#settingsUpdates').isVisible(),native);
  if(native){
   await page.locator('#settingsUpdates > summary').click();await page.locator('#checkUpdatesBtn').click();
   assert.equal(await page.locator('#checkUpdatesBtn').isDisabled(),true);
   await page.waitForFunction(()=>window.__updateId);
   const messages=await page.evaluate(()=>__messages.filter(r=>r.action==='checkFrontendUpdates'));
   assert.equal(messages.length,1);assert.deepEqual(Object.keys(messages[0]).sort(),['action','id','version']);
   await page.evaluate(()=>LedgerAndroid.onmessage({data:JSON.stringify({id:__updateId,ok:true,result:'Interface update downloaded. Close and reopen the app to apply it.'})}));
   await page.waitForFunction(()=>!document.querySelector('#checkUpdatesBtn').disabled);
   assert.match(await page.locator('#updateStatus').innerText(),/downloaded/);
   await page.locator('[data-act="restorefrontend"]').click();await page.waitForFunction(()=>document.querySelector('#updateStatus').textContent==='Restore canceled.');
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: native-only update settings, asynchronous check feedback and credential-free recovery requests');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
