const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const code=[...fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('Native transport only activates'));
function create(origin){const calls=[];const bridge={postMessage:text=>calls.push(JSON.parse(text))};const window={location:{origin},LedgerAndroid:bridge};vm.runInNewContext(code,{window,setTimeout,clearTimeout});return {client:window.LedgerNative,bridge,calls};}
test('a similarly named bridge on a hosted or foreign origin stays disabled',async()=>{
 for(const origin of ['https://script.google.com','https://appassets.androidplatform.net.evil.test','http://appassets.androidplatform.net']){
  const e=create(origin);assert.equal(e.client.available,false);await assert.rejects(e.client.rpc('getLedgerSnapshot',[]),/NATIVE_UNAVAILABLE/);assert.equal(e.calls.length,0);
 }
});
test('native RPC replies are correlated and expose only the requested data',async()=>{
 const e=create('https://appassets.androidplatform.net');const result=e.client.rpc('getLedgerSnapshot',[]);const request=e.calls[0];assert.equal(request.action,'rpc');assert.equal(request.args.length,0);assert.equal('pin' in request,false);
 e.bridge.onmessage({data:JSON.stringify({id:'unknown',ok:true,result:'ignored'})});
 e.bridge.onmessage({data:JSON.stringify({id:request.id,ok:true,result:{ledgerId:'test'}})});assert.equal((await result).ledgerId,'test');
});
test('pairing launches a native operation with no frontend credential fields',async()=>{
 const e=create('https://appassets.androidplatform.net'),result=e.client.pair(),request=e.calls[0];assert.deepEqual(Object.keys(request).sort(),['action','id','version']);
 e.bridge.onmessage({data:JSON.stringify({id:request.id,ok:false,error:'PAIR_CANCELLED'})});await assert.rejects(result,/PAIR_CANCELLED/);
});


test('frontend readiness is a native-only signal without ledger credentials',async()=>{
 const e=create('https://appassets.androidplatform.net'),result=e.client.ready(),request=e.calls[0];
 assert.equal(request.action,'frontendReady');assert.deepEqual(Object.keys(request).sort(),['action','id','version']);
 e.bridge.onmessage({data:JSON.stringify({id:request.id,ok:true,result:{ready:true}})});assert.equal((await result).ready,true);
});


for(const [method,action] of [['checkUpdates','checkFrontendUpdates'],['restoreFrontend','restoreFrontend']]){
 test(method+' cannot select a download URL or pass credentials',async()=>{
  const e=create('https://appassets.androidplatform.net'),result=e.client[method](),request=e.calls[0];
  assert.equal(request.action,action);assert.deepEqual(Object.keys(request).sort(),['action','id','version']);
  e.bridge.onmessage({data:JSON.stringify({id:request.id,ok:true,result:'Test status'})});assert.equal(await result,'Test status');
 });
}
