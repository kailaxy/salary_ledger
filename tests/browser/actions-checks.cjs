const assert=require('node:assert/strict');
module.exports=async function({page,native}){
 await page.locator('#tab-home').click();
 await page.evaluate(()=>{window.__online=false;dispatchEvent(new Event('offline'));window.__assistantWrites=0;const enqueue=LedgerLocal.enqueue;LedgerLocal.enqueue=function(...args){window.__assistantWrites++;return enqueue.apply(this,args);};});
 async function ask(text){await page.locator('#assistantInput').fill(text);await page.locator('#assistantInput').press('Enter');return page.locator('.assistant-answer').last();}
 const current=()=>page.locator('.assistant-answer').last();
 async function count(){return page.evaluate(async()=>({attempts:window.__assistantWrites,entries:(await LedgerLocal.list('test-ledger')).length}));}
 await ask('What can you do?');assert.ok(await current().getByRole('button').count()>20);await current().getByRole('searchbox').fill('loan');assert.match(await current().innerText(),/loan/i);
 await ask('Add 250 pesos for lunch today');assert.match(await current().innerText(),/Which category/);assert.equal((await count()).entries,0);
 // Reply in the conversation instead of opening a form.
 await ask('Food');assert.match(await current().innerText(),/Which existing pay period/);
 await current().getByRole('button',{name:'2026-10-15 · 2026-10-15',exact:true}).click();
 assert.match(await current().innerText(),/Confirm and save/);assert.match(await current().innerText(),/₱250.00/);assert.equal((await count()).entries,0);
 await ask('yes');assert.match(await current().innerText(),/chat reply cannot save/);assert.equal((await count()).entries,0);
 await current().getByRole('button',{name:'Cancel',exact:true}).click();assert.match(await current().innerText(),/Nothing saved/);assert.equal((await count()).entries,0);
 await ask('Add 250 food today');await current().getByRole('button',{name:'2026-10-15 · 2026-10-15',exact:true}).click();
 await current().getByRole('button',{name:'Add or change note'}).click();await current().getByRole('textbox',{name:'Note',exact:true}).fill('<img src=x onerror=alert(1)>');await current().getByRole('button',{name:'Use note',exact:true}).click();assert.equal(await current().locator('img').count(),0);
 for(const width of [320,393,768]){await page.setViewportSize({width,height:852});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await current().evaluate(el=>el.scrollWidth>el.clientWidth),false);}
 await current().getByRole('button',{name:'Confirm and save',exact:true}).evaluate(b=>{b.click();b.click();});
 await page.waitForFunction(()=>document.querySelector('.assistant-save-status')?.textContent.includes('Saved on this device'));
 assert.deepEqual(await count(),{attempts:1,entries:1});assert.match(await current().innerText(),/Pending synchronization/);assert.equal(await current().locator('.assistant-reaction').count(),1);assert.equal(await current().locator('img').count(),0);
 let records=await page.evaluate(async()=>await LedgerLocal.list('test-ledger'));assert.equal(records[0].payload.values.amountMinor,25000);assert.equal(records[0].payload.values.note,'<img src=x onerror=alert(1)>');
 await ask('Add salary income of 15000 today');await current().getByRole('button',{name:'2026-10-15 · 2026-10-15',exact:true}).click();await current().getByRole('button',{name:'Confirm and save',exact:true}).click();await page.waitForFunction(async()=>{return (await LedgerLocal.list('test-ledger')).length===2;});
 await ask('Deposit 1000 into Emergency Fund today');await current().getByRole('button',{name:'2026-10-15 · 2026-10-15',exact:true}).click();await current().getByRole('button',{name:'Confirm and save',exact:true}).click();await page.waitForFunction(async()=>{return (await LedgerLocal.list('test-ledger')).length===3;});
 records=await page.evaluate(async()=>await LedgerLocal.list('test-ledger'));assert.equal(records[1].payload.table,'INCOME');assert.equal(records[2].payload.values.type,'FUND_IN');
 await ask('Add 250 food today without saving it');assert.equal(await current().getByRole('button',{name:'Confirm and save',exact:true}).count(),0);assert.equal((await count()).entries,3);
 await ask('Add 250 food today');await current().getByRole('button',{name:'2026-10-15 · 2026-10-15',exact:true}).click();
 // Atomically fail the existing save workflow. There must be no reaction or duplicate retry.
 await page.evaluate(()=>{window.__enqueueReal=LedgerLocal.enqueue;LedgerLocal.enqueue=()=>Promise.reject(new Error('TEST_STORAGE_FAILURE'));});
 await current().getByRole('button',{name:'Confirm and save',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('.assistant-save-status')).some(e=>e.textContent.includes('TEST_STORAGE_FAILURE')));assert.match(await current().innerText(),/Save failed/);assert.equal(await current().locator('.assistant-reaction').count(),0);assert.equal((await count()).entries,3);await page.evaluate(()=>{LedgerLocal.enqueue=window.__enqueueReal;});
 await ask('Delete my last expense');assert.match(await current().innerText(),/existing review/);assert.equal(await current().getByRole('button',{name:'Confirm and save',exact:true}).count(),0);assert.equal((await count()).entries,3);
 // Exercise actual queue acknowledgement and canonical status updates with an isolated receipt transport.
 await page.evaluate(async native=>{
   window.__assistantServer=JSON.parse(JSON.stringify(await LedgerLocal.restore()));
   async function response(method,args){
     if(method==='getLedgerSnapshot')return window.__assistantServer;
     if(method!=='syncLedgerMutation')throw Error('UNSUPPORTED_TEST_METHOD');
     const payload=args[args.length-1],entry=(await LedgerLocal.list('test-ledger')).find(e=>e.mutationId===payload.mutationId);
     if(payload.values.type==='FUND_IN')return {status:'conflict',mutationId:payload.mutationId,recordId:payload.recordId,remote:null,fingerprint:null};
     const record=entry.proposalRecord,fingerprint='b'.repeat(64);LedgerPending.applyRecord(window.__assistantServer,payload.table,record,fingerprint);
     return {status:'committed',mutationId:payload.mutationId,recordId:payload.recordId,record,fingerprint,committedAt:new Date().toISOString()};
   }
   if(native)LedgerAndroid.postMessage=raw=>{const r=JSON.parse(raw);response(r.method,r.args).then(result=>LedgerAndroid.onmessage({data:JSON.stringify({id:r.id,ok:true,result})}));};
   else Object.defineProperty(google.script,'run',{configurable:true,get(){let ok,bad;return {withSuccessHandler(f){ok=f;return this;},withFailureHandler(f){bad=f;return this;},getLedgerSnapshot(...args){response('getLedgerSnapshot',args).then(ok,bad);},syncLedgerMutation(...args){response('syncLedgerMutation',args).then(ok,bad);}};}});
   window.__online=true;dispatchEvent(new Event('online'));
 },native);
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.assistant-save-status')).some(e=>e.textContent==='Synchronized successfully.'));
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.assistant-save-status')).some(e=>e.textContent.includes('Conflict requiring review')));
 assert.equal((await count()).entries,1);
 await ask('Add 250 food today');
 await page.evaluate(()=>{window.__assistantServer.capturedAt='2026-10-23T00:00:00.000Z';dispatchEvent(new Event('online'));});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.assistant-answer')).at(-1).textContent.includes('ledger changed'));
 assert.equal(await current().getByRole('button',{name:'Confirm and save',exact:true}).count(),0);assert.equal((await count()).entries,1);
 await page.evaluate(()=>{window.__online=false;dispatchEvent(new Event('offline'));});
 await ask('Add 250 food today');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
 assert.match(await current().innerText(),/background/);assert.equal((await count()).entries,1);
 // Reload proves durable entry creation; the draft itself is not persisted.
 await ask('Add 250 food today');await page.reload();await page.waitForFunction(()=>document.querySelector('#assistantSource').textContent.includes('Updated'));assert.equal((await page.evaluate(async()=>await LedgerLocal.list('test-ledger'))).length,1);assert.equal(await page.locator('#chatHistory .assistant-preview').count(),0);
 console.log('PASS ('+(native?'packaged native adapter':'hosted')+'): guided actions, explicit confirmation, cancellation, no yes bypass, duplicate prevention, atomic-save failure, safe notes, durable offline expense/income/fund entries and mobile previews');
};
