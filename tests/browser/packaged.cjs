const {chromium}=require('playwright-core');const fs=require('node:fs');const path=require('node:path');
const ORIGIN='https://appassets.androidplatform.net';
async function countQueue(page,count){for(let i=0;i<100;i++){if(await page.evaluate(async()=> (await LedgerLocal.list('packaged-test')).length)===count)return;await page.waitForTimeout(50);}throw Error('Queue did not become '+count);}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':'/usr/bin/google-chrome'),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:393,height:852}}),page=await context.newPage(),errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));
 const tables={};for(const n of ['SETTINGS','PAY_PERIODS','INCOME','CATEGORIES','FUND_GOALS','BUDGET_LINES','TRANSACTIONS','LOANS','LOAN_INSTALLMENTS','LOAN_PAYMENTS'])tables[n]=[];
 const wrap=record=>({record,fingerprint:'a'.repeat(64)});tables.PAY_PERIODS=[wrap({period_id:'per_test',pay_date:'2026-10-15',label:'Oct 15'})];tables.CATEGORIES=[wrap({category_id:'cat_food',name:'Food',kind:'SPENDING',is_archived:false})];
 const snapshot={formatVersion:1,ledgerId:'packaged-test',capabilities:{recordSyncVersion:1},capturedAt:'2026-10-20T00:00:00.000Z',timezone:'Asia/Manila',currency:'₱',minorUnitScale:2,tables,state:{setupDone:true,app:{name:'Salary Ledger'},settings:{appName:'Salary Ledger',payDays:'15,EOM'},today:'2026-10-21',years:[2026],periods:[{id:'per_test',label:'Oct 15',date:'2026-10-15',hasIncome:false,income:0,spent:0,funds:0,planned:0,unassigned:0}],categories:[{id:'cat_food',name:'Food',kind:'SPENDING',actual:0,archived:false,planToDate:0,yearPlan:0,target:0,targetDate:''}],plan:{},byCat:{},loans:[],recent:[],currentPeriodId:'per_test',summary:{received:0,spent:0,inFunds:0,saved:0,unassigned:0,loanRemaining:0}}};
 await page.addInitScript(({snapshot})=>{
   window.__server=snapshot;window.__nativeCalls=[];window.__authError=false;
   // No google.script object exists. Only native messages can synchronize this page.
   Object.defineProperty(window,'google',{get(){throw Error('Hosted transport used from packaged app');}});
   window.LedgerAndroid={onmessage:null,postMessage(text){
     const request=JSON.parse(text);window.__nativeCalls.push(request);
     setTimeout(()=>{
       let response={id:request.id,ok:true,result:null};
       if(request.action==='pair'){sessionStorage.setItem('paired','1');response.result={paired:true};}
       else if(!sessionStorage.getItem('paired'))response={id:request.id,ok:false,error:'DEVICE_UNPAIRED'};
       else if(window.__authError){window.__authError=false;response={id:request.id,ok:false,error:'BAD_PIN'};}
       else if(!navigator.onLine)response={id:request.id,ok:false,error:'NETWORK_ERROR'};
       else if(request.method==='getLedgerSnapshot'){window.__server.capturedAt=new Date().toISOString();response.result=window.__server;}
       else if(request.method==='syncLedgerMutation'){
         const p=request.args[0],r={txn_id:p.recordId,period_id:p.values.periodId,category_id:p.values.categoryId,type:'EXPENSE',txn_date:p.values.date,amount:p.values.amountMinor/100,note:p.values.note,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),deleted_at:''};
         LedgerPending.applyRecord(window.__server,'TRANSACTIONS',r,'b'.repeat(64));response.result={status:'committed',mutationId:p.mutationId,recordId:p.recordId,record:r,fingerprint:'b'.repeat(64),committedAt:new Date().toISOString()};
       }else response={id:request.id,ok:false,error:'UNSUPPORTED_METHOD'};
       window.LedgerAndroid.onmessage({data:JSON.stringify(response)});
     },5);
   }};
 },{snapshot});
 const generated=path.join(__dirname,'../../android/app/build/generated/ledgerAssets/Index.html');
 const sourceFile=path.join(__dirname,'../../Index.html');
 let html=fs.existsSync(generated)&&fs.statSync(generated).mtimeMs>=fs.statSync(sourceFile).mtimeMs?fs.readFileSync(generated,'utf8'):fs.readFileSync(path.join(__dirname,'../../Index.html'),'utf8').replace(/^<link[^>]*https:\/\/fonts\.(googleapis|gstatic)\.com[^>]*>\r?\n/gm,'').replace(/^<base[^>]*>\r?\n/gm,'');
 if(/https:\/\/fonts\.(googleapis|gstatic)\.com/.test(html))throw Error('Packaged HTML has external font dependencies');
 await page.route('**/*',route=>{if(route.request().url()===ORIGIN+'/assets/Index.html')return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"},body:html});remote.push(route.request().url());return route.abort();});
 await page.goto(ORIGIN+'/assets/Index.html');await page.locator('#banner').filter({hasText:'Connect this device'}).waitFor();
 await page.locator('#settingsBtn').click();await page.locator('#settingsSync > summary').click();await page.locator('#connectDeviceBtn').click();await page.waitForFunction(()=>document.querySelector('#assistantSource').textContent.includes('Updated'));
 await page.locator('#setClose').click();await page.evaluate(()=>window.__authError=true);await page.locator('#refresh').click();
 await page.locator('#banner').filter({hasText:'Connect this device'}).waitFor();
 if(await page.locator('#lock').isVisible())throw Error('Packaged auth failure exposed the web PIN form');
 await page.locator('#refresh').click();await page.waitForFunction(()=>!document.querySelector('#refresh').classList.contains('spin'));
 await context.setOffline(true);
 await page.locator('#tab-add').click();await page.locator('#fAmount').fill('12.34');await page.locator('#addGo').click();await page.locator('#reviewConfirm').click();await countQueue(page,1);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#pendingSummary').textContent.includes('1 pending'));
 await page.locator('#tab-home').click();await page.locator('#assistantInput').fill('How much did I spend this month?');await page.locator('#assistantInput').press('Enter');await page.locator('.assistant-value').filter({hasText:'12.34'}).waitFor();
 if(await page.evaluate(()=>window.__nativeCalls.length)!==0)throw Error('Cold offline launch attempted network RPC');
 if(await page.evaluate(()=>localStorage.getItem('sl2_pin'))!==null)throw Error('Packaged client persisted a frontend PIN');
 await context.setOffline(false);await countQueue(page,0);
 const requests=await page.evaluate(()=>window.__nativeCalls);
 if(requests.some(r=>('pin' in r)||('deviceToken' in r)||r.args?.includes('native-device')))throw Error('Native bridge received credentials from frontend');
 if(remote.length)throw Error('External packaged resources requested: '+remote.join(', '));if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: packaged-origin pairing adapter, strict CSP, no hosted transport, cold offline page reload, cached queries, durable queued write, reconnect sync, no frontend credentials or remote assets');await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
