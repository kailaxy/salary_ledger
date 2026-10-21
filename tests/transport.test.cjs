const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const crypto=require('node:crypto');
function environment(){
 const properties=new Map([['DASHBOARD_PIN','123456']]),cache=new Map();let dialog='',calls=0;
 const props={getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),deleteProperty:k=>properties.delete(k),getProperties:()=>Object.fromEntries(properties)};
 const ui={alert:(title,text)=>{dialog=text||title;},ButtonSet:{OK:'OK'}};
 const ctx=vm.createContext({console});
 ctx.PropertiesService={getScriptProperties:()=>props};ctx.CacheService={getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})};
 ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
 ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getId:()=> 'test-ledger'}),getUi:()=>ui};
 ctx.Utilities={getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()]};
 ctx.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})};
 for(const file of ['Code.gs','Transport.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
 ctx.getLedgerSnapshot=pin=>{assert.equal(pin,'123456');calls++;return {ledgerId:'test-ledger'};};
 return {ctx,properties,calls:()=>calls,code(){ctx.createAndroidPairing_();return dialog.match(/[a-f0-9]{64}/)[0];},pair(){return ctx.transportHandle_({version:1,action:'pair',code:this.code(),pin:'123456',name:'Test phone'});}};
}
function rpc(credentials,extra={}){return {version:1,action:'rpc',method:'getLedgerSnapshot',args:[],deviceId:credentials.deviceId,deviceToken:credentials.deviceToken,...extra};}
test('pairing needs a current one-time owner code and the ledger PIN',()=>{
 const e=environment(),code=e.code();
 assert.throws(()=>e.ctx.transportHandle_({version:1,action:'pair',code,pin:'000000'}),/BAD_PIN/);
 const credentials=e.ctx.transportHandle_({version:1,action:'pair',code,pin:'123456'});
 assert.match(credentials.deviceToken,/^[a-f0-9]{64}$/);
 assert.throws(()=>e.ctx.transportHandle_({version:1,action:'pair',code,pin:'123456'}),/PAIR_EXPIRED_OR_INVALID/);
 assert.equal([...e.properties.values()].some(v=>v.includes(code)||v.includes(credentials.deviceToken)),false);
 assert.equal(e.calls(),0);
});
test('unpaired or revoked devices cannot read and cannot reach RPC dispatch',()=>{
 const e=environment(),credentials=e.pair();
 assert.throws(()=>e.ctx.transportHandle_(rpc({...credentials,deviceToken:'a'.repeat(64)})),/DEVICE_REVOKED/);
 assert.equal(e.calls(),0);assert.equal(e.ctx.transportHandle_(rpc(credentials)).ledgerId,'test-ledger');
 e.properties.delete('LEDGER_DEVICE_'+credentials.deviceId);
 assert.throws(()=>e.ctx.transportHandle_(rpc(credentials)),/DEVICE_REVOKED/);assert.equal(e.calls(),1);
});
test('changing the owner PIN invalidates previously issued device tokens',()=>{
 const e=environment(),credentials=e.pair();e.properties.set('DASHBOARD_PIN','654321');
 assert.throws(()=>e.ctx.transportHandle_(rpc(credentials)),/DEVICE_REVOKED/);assert.equal(e.calls(),0);
});
test('transport allowlist rejects owner methods, arbitrary dispatch and invalid argument counts',()=>{
 const e=environment(),credentials=e.pair();
 for(const method of ['setupLedger','createAndroidPairing_','getPin_','eval','constructor','__proto__'])assert.throws(()=>e.ctx.transportHandle_(rpc(credentials,{method})),/UNSUPPORTED_METHOD/);
 assert.throws(()=>e.ctx.transportHandle_(rpc(credentials,{args:['unexpected']})),/UNSUPPORTED_METHOD/);
 assert.throws(()=>e.ctx.transportHandle_(rpc(credentials,{url:'https://example.com'})),/INVALID_REQUEST/);
 assert.equal(e.calls(),0);
});
test('expired/replaced codes and device count limits are enforced',()=>{
 const e=environment(),old=e.code(),fresh=e.code();
 assert.throws(()=>e.ctx.transportHandle_({version:1,action:'pair',code:old,pin:'123456'}),/PAIR_EXPIRED_OR_INVALID/);
 const saved=JSON.parse(e.properties.get('LEDGER_PAIRING'));saved.expiresAt=1;e.properties.set('LEDGER_PAIRING',JSON.stringify(saved));
 assert.throws(()=>e.ctx.transportHandle_({version:1,action:'pair',code:fresh,pin:'123456'}),/PAIR_EXPIRED_OR_INVALID/);
 for(let i=0;i<10;i++)e.properties.set('LEDGER_DEVICE_'+i,'{}');
 assert.throws(()=>e.pair(),/DEVICE_LIMIT/);
});
test('POST envelopes never disclose parser or internal server errors',()=>{
 const e=environment();const parsed=JSON.parse(e.ctx.doPost({postData:{contents:'not JSON'}}).text);assert.equal(parsed.ok,false);assert.equal(parsed.error,'SERVER_ERROR');
 const large=JSON.parse(e.ctx.doPost({postData:{contents:'x'.repeat(65537)}}).text);assert.equal(large.error,'INVALID_REQUEST');assert.equal(e.calls(),0);
});
