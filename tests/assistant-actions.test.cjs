const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {fixture,now,source}=require('./helpers/query-engine.cjs');
const ctx=vm.createContext({Intl,Date});vm.runInContext(source,ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/assistant-actions.js'),'utf8'),ctx);const a=ctx.AssistantActions;
const plain=x=>JSON.parse(JSON.stringify(x));
for(const c of a.list())test('capability allowlist: '+c.id,()=>{
 assert.ok(['entry','query','route'].includes(c.handler));assert.ok(['explicit-button','existing-workflow','none'].includes(c.confirmation));assert.ok(c.authorization);assert.throws(()=>a.validate(c.id,{arbitrary:'ignored'}),/Unexpected/);
 const result=a.interpret(c.example,fixture(),now);assert.ok(['draft','route','query'].includes(result.type),JSON.stringify(result));if(c.handler==='route')assert.equal(result.id,c.id);if(c.handler==='entry')assert.equal(result.id,c.id);
});
test('unknown IDs, unexpected fields and invalid typed parameters fail closed',()=>{
 assert.throws(()=>a.get('eval'));assert.throws(()=>a.validate('expense.create',{source:'wrong'}));
 for(const amountMinor of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'250'])assert.throws(()=>a.validate('expense.create',{amountMinor}));
 for(const date of ['2026-02-30','2026-13-01','x'])assert.throws(()=>a.validate('expense.create',{date}));assert.throws(()=>a.validate('income.create',{kind:'WAGES'}));assert.throws(()=>a.validate('expense.create',{note:'x'.repeat(201)}));
});
test('English/Taglish entries extract cents and do not invent missing category/date/period',()=>{
 let r=a.interpret('Add 250 pesos for lunch today',fixture(),now);assert.equal(r.type,'draft');assert.deepEqual(plain(r.params),{date:'2026-10-22',amountMinor:25000,note:'Lunch'});
 r=a.interpret('Mag-add ng 150 sa food',fixture(),now);assert.equal(r.type,'draft');assert.deepEqual(plain(r.params),{amountMinor:15000,categoryId:'food'});assert.deepEqual(plain(a.resolve(r.id,r.params,fixture()).missing),['date','periodId']);
 r=a.interpret('Mag-add ng gastos na 250',fixture(),now);assert.equal(r.type,'draft');assert.equal(r.params.amountMinor,25000);
 r=a.interpret('Record ₱500 transportation expense',fixture(),now);assert.equal(r.type,'unsupported'); // archived Transport is not silently reused
});
test('income and fund flows use distinct capabilities and actual existing IDs',()=>{
 assert.equal(a.interpret('Add salary income of 15000',fixture(),now).params.kind,'SALARY');
 for(const [text,id] of [['Deposit 1000 into Emergency Fund','fund.deposit'],['Withdraw 100 from Emergency Fund today','fund.withdraw']]){const r=a.interpret(text,fixture(),now);assert.equal(r.id,id);assert.equal(r.params.categoryId,'fund');}
 assert.equal(a.interpret('Record my loan payment',fixture(),now).id,'loan.record_payment');
 const guided=a.interpret('Maghulog ng 500 sa savings',fixture(),now);assert.equal(guided.type,'draft');assert.equal(guided.id,'fund.deposit');assert.equal(guided.params.categoryId,undefined);assert.equal(a.interpret('Can you add 250 food today',fixture(),now).type,'draft');
});
test('conditions, multi-actions, malformed amounts and unknown entities never produce writable drafts',()=>{
 for(const text of ['Add 250 without saving it','Add all food expenses','Add 250 except yesterday','Add 250 and deposit 100','Add -250 for food','Add 1,00 for food','Add 1.234 for food','Add 250 for unknown','Add 250 tomorrow','Add 250 food 2026-02-30'])assert.notEqual(a.interpret(text,fixture(),now).type,'draft',text);
 for(const text of ["Don't delete the transaction",'Delete all food expenses except yesterday','Change my last two payments','Edit the one from last week','Move all my money into savings'])assert.notEqual(a.interpret(text,fixture(),now).type,'draft',text);
});
test('duplicates, archived entities and missing records never pick an arbitrary target',()=>{
 const s=fixture();s.tables.CATEGORIES.push({record:{category_id:'other-food',name:'Food',kind:'SPENDING',is_archived:false}});assert.notEqual(a.interpret('Add 250 food today',s,now).type,'draft');assert.throws(()=>a.resolve('expense.create',{categoryId:'missing'},s));assert.throws(()=>a.resolve('expense.create',{categoryId:'transport'},s));assert.throws(()=>a.resolve('expense.create',{periodId:'missing'},s));
});
test('help, navigation and query fallback preserve existing financial interpretation',()=>{
 for(const text of ['What can you do?','Paano kita gamitin?','Help me manage my loans'])assert.equal(a.interpret(text,fixture(),now).type,'help');
 assert.equal(a.interpret('Ipakita mo mga utang ko',fixture(),now).id,'loan.view');
 for(const text of ['How much did I spend this month?','Magkano balance ng emergency fund?'])assert.equal(a.interpret(text,fixture(),now).type,'query');
});
test('action/personality sources are embedded exactly and isolated from native AI',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8'),src=fs.readFileSync(path.join(__dirname,'../web/assistant-actions.js'),'utf8');assert.ok(html.includes('<!-- ACTIONS:START -->\n<script>\n'+src+'</script>'));assert.doesNotMatch(src,/llama|Qwen|fetch\(|eval\(|new Function|LedgerAndroid|google\.script/);
});
test('save reactions respect preset/chaos, contain no authoritative values or save status, and stay gentle for sensitive entries',()=>{
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/assistant-personality.js'),'utf8'),ctx);const p=ctx.AssistantPersonality,outputs=new Set();
 for(const id of ['supportive-bestie','financial-gremlin','sarcastic-accountant'])for(const chaos of [0,50,100]){
  const cfg=p.config({version:1,personalityId:id,chaos}),s=p.actionReaction({capability:'income.create'},cfg,0);outputs.add(s);assert.doesNotMatch(s,/₱|\d|saved|sync|pending|failed|success|balance|owe/i);
  assert.equal(p.actionReaction({capability:'expense.create',sensitive:true},cfg,0),'One clear step at a time.');
 }
 assert.ok(outputs.size>=6);assert.throws(()=>p.actionReaction({capability:'deleteEverything'},p.getConfig()));
});
test('production Android remains free of model runtime and unrestricted AI bridge additions',()=>{
 const gradle=fs.readFileSync(path.join(__dirname,'../android/app/build.gradle'),'utf8');assert.doesNotMatch(gradle,/llama|gguf|onnx|mediapipe|externalNativeBuild/i);
 const main=fs.readFileSync(path.join(__dirname,'../android/app/src/main/java/com/kailaxy/salaryledger/MainActivity.java'),'utf8');assert.doesNotMatch(main,/NativeEngine|loadModel|generateNative/);
});
