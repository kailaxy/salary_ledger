const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {engine,fixture,now}=require('./helpers/query-engine.cjs');
const source=fs.readFileSync(path.join(__dirname,'../web/assistant-personality.js'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function client(storage=new Map(),blocked=false){const localStorage={getItem(k){if(blocked)throw Error('blocked');return storage.get(k)||null;},setItem(k,v){if(blocked)throw Error('quota');storage.set(k,v);}};const ctx=vm.createContext({localStorage});vm.runInContext(source,ctx);return ctx.AssistantPersonality;}
function result(text){return engine.query(fixture(),engine.interpret(text,fixture(),now),now);}
const ids=['supportive-bestie','financial-gremlin','sarcastic-accountant'];
const pref=(personalityId='supportive-bestie',chaos=30)=>({version:1,personalityId,chaos});
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
test('embedded personality source matches standalone and source stays separate from financial engine',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8');assert.ok(html.includes('<script>\n'+source+'</script>'));assert.equal(source.includes('LedgerQuery.'),false);assert.equal(source.includes('LedgerLocal.'),false);
});
test('defaults, presets and reusable config expose stable, isolated values',()=>{
 const p=client();assert.deepEqual(plain(p.defaults()),pref());assert.deepEqual(plain(p.getPresets()).map(x=>x.id),ids);
 const c=p.getConfig();assert.equal(c.chaos,30);assert.equal(c.expressionBand,'friendly');assert.equal(c.languagePreference,null);assert.equal(c.mode,'deterministic');assert.equal(c.preferredResponseLength.maxSentences,2);assert.ok(c.humorBoundaries.length>=5);
 c.humorBoundaries.length=0;c.toneInstructions[0]='overwrite';assert.ok(p.getConfig().humorBoundaries.length>=5);assert.notEqual(p.getConfig().toneInstructions[0],'overwrite');
});
test('every preset, exact chaos endpoints and five expression bands validate',()=>{
 const p=client();p.setLedger('a');for(const id of ids)for(let chaos=0;chaos<=100;chaos+=5){p.save(pref(id,chaos));assert.equal(p.getConfig().personalityId,id);assert.equal(p.getConfig().chaos,chaos);}
 for(const [chaos,band] of [[0,'calm'],[20,'calm'],[25,'friendly'],[40,'friendly'],[45,'playful'],[60,'playful'],[65,'dramatic'],[80,'dramatic'],[85,'maximum'],[100,'maximum']])assert.equal(p.config(pref(ids[0],chaos)).expressionBand,band);
 for(const bad of [pref('missing'),pref('__proto__'),pref(ids[0],-5),pref(ids[0],105),pref(ids[0],21),pref(ids[0],2.5),pref(ids[0],'30'),{...pref(),pin:'secret'},{...pref(),version:2},null])assert.throws(()=>p.save(bad));
});
test('per-ledger preferences persist across new clients and resetting changes only that key',()=>{
 const storage=new Map([['sl2_pin','not-read'],['unrelated','retain']]),p=client(storage);p.setLedger('ledger A');p.save(pref(ids[1],100));p.setLedger('ledger B');assert.deepEqual(plain(p.load()),pref());p.save(pref(ids[2],50));
 const next=client(storage);next.setLedger('ledger A');assert.equal(next.getConfig().personalityId,ids[1]);assert.equal(next.getConfig().chaos,100);next.reset();assert.deepEqual(plain(next.load()),pref());assert.equal(next.load('ledger B').personalityId,ids[2]);assert.equal(storage.get('sl2_pin'),'not-read');assert.equal(storage.get('unrelated'),'retain');assert.equal(storage.size,4);
 next.setLedger(null);assert.deepEqual(plain(next.load()),pref());assert.throws(()=>next.save(pref()),/Download a ledger/);
});
test('corrupt or foreign stored configuration fails to defaults without reading other keys',()=>{
 const storage=new Map(),p=client(storage),key=p.storageKey('a');for(const bad of ['{','null','[]','42',JSON.stringify({...pref(),chaos:99}),JSON.stringify({...pref(),personalityId:'<script>'}),JSON.stringify({...pref(),token:'no'})]){storage.set(key,bad);assert.deepEqual(plain(p.load('a')),pref());}
 assert.equal(p.storageKey(''),null);assert.notEqual(p.storageKey('a/b'),p.storageKey('a%2Fb'));
});
test('storage denial retains session preferences and reports persistence accurately',()=>{
 const p=client(new Map(),true);p.setLedger('a');const saved=p.save(pref(ids[1],80));assert.equal(saved.persisted,false);assert.equal(p.persistence(),'session');assert.equal(p.getConfig().chaos,80);p.setLedger('b');assert.equal(p.getConfig().chaos,30);p.setLedger('a');assert.equal(p.getConfig().chaos,80);p.reset();assert.equal(p.getConfig().chaos,30);assert.equal(p.persistence(),'session');
});
test('canonical amounts, dates, percentages, caveats, records and comparisons stay identical at all personalities and 0/50/100',()=>{
 const p=client();for(const text of ['Magkano gastos ko this month?','top five expenses this month','income minus spending this month','savings rate this month','spending by category this cutoff','how much do i have left for food','which budgets am i exceeding','can i afford 10 for food','progress toward emergency fund goal','contributions to emergency fund this month','loan repayment progress','next loan payment','compare budgets across pay periods','did i spend more this cutoff than the previous one','average daily spending this month']){
  const r=freeze(result(text)),canonical=freeze(engine.format(r,'₱')),before=JSON.stringify(canonical),facts=JSON.stringify(r);
  for(const id of ids)for(const chaos of [0,50,100]){const styled=p.decorate(canonical,r,p.config(pref(id,chaos)),1);assert.strictEqual(styled.canonical,canonical);assert.equal(JSON.stringify(styled.canonical),before);assert.equal(JSON.stringify(r),facts);assert.ok(styled.intro.length<=240);}
 }
});
test('context classification uses facts, never category names, notes or purchase amount heuristics',()=>{
 const p=client(),r=result('biggest expense this month');r.rows[0].note='This was wasteful coffee!';r.rows[0].categoryName='Coffee';assert.equal(p.context(r),'neutral');assert.equal(p.context(result('did i spend more this cutoff than the previous one')),'spending_increase');assert.equal(p.context(result('remaining budget for food')),'budget_maintained');assert.equal(p.context(result('which budgets am i exceeding')),'budget_exceeded');assert.equal(p.context(result('can i afford 10 for food')),'sensitive');assert.equal(p.context(result('can i afford 1 for transport')),'insufficient');
});
test('overdue debt, shortfalls and missing funds stay gentle even at maximum chaos',()=>{
 const p=client(),cases=[result('can i afford 10 for food'),result('which budgets am i exceeding'),{operation:'funds',mode:'balance',funds:[{balanceMinor:-1}]},{operation:'cashflow',incomeMinor:100,netMinor:-1},{operation:'loans',mode:'balance',loans:[{installments:[{status:'OVERDUE',minor:1}],totalMinor:100,remainingMinor:100}],installments:[]}];
 for(const r of cases){const intros=[];for(const id of ids)for(const chaos of [0,50,100]){const s=p.decorate({value:'preserved'},r,p.config(pref(id,chaos)),0);intros.push(s.intro);assert.doesNotMatch(s.intro,/GOBLINS|CAPE|haha|waste|irresponsible|stupid/i);}assert.equal(new Set(intros).size,1);}
});
test('achievements get encouragement only when their fact conditions are met',()=>{
 const p=client(),goal={operation:'funds',mode:'goal',funds:[{targetMinor:100,balanceMinor:100}]},loan={operation:'loans',mode:'progress',loans:[{totalMinor:100,remainingMinor:0,installments:[]}],installments:[]};
 assert.equal(p.context(goal),'goal_reached');assert.equal(p.context(loan),'loan_completed');for(const id of ids)assert.match(p.decorate({},goal,p.config(pref(id,100)),0).intro,/milestone|goal/i);
 goal.funds.push({targetMinor:200,balanceMinor:50});assert.equal(p.context(goal),'neutral');loan.loans.push({totalMinor:100,remainingMinor:1,installments:[]});assert.equal(p.context(loan),'neutral');
});
test('empty, missing and unsupported results are transparent and read-only',()=>{
 const p=client();for(const [r,context] of [[{operation:'sum',count:0},'empty'],[{operation:'funds',funds:[]},'empty'],[{operation:'loans',loans:[]},'empty'],[{operation:'funds',mode:'goal',funds:[{targetMinor:0,balanceMinor:1}]},'insufficient'],[{operation:'share',incomeMinor:0},'insufficient'],[{error:true},'unsupported'],[null,'unsupported']]){
  const original={label:'No matching records',detail:['Original failure or caveat.']};assert.equal(p.decorate(original,r,p.config(pref(ids[1],100)),0).context,context);assert.deepEqual(original,{label:'No matching records',detail:['Original failure or caveat.']});
 }
});
test('deterministic variation is reproducible and alternates without random state',()=>{
 const p=client(),cfg=p.config(pref(ids[1],100)),r=result('total expenses this month'),a=p.decorate({},r,cfg,0).intro,b=p.decorate({},r,cfg,1).intro;assert.notEqual(a,b);assert.equal(p.decorate({},r,cfg,0).intro,a);assert.equal(new Set([0,1,2,3].map(n=>p.decorate({},r,cfg,n).intro)).size,4);assert.equal(p.decorate({},r,cfg,4).intro,a);assert.equal(client().decorate({},r,cfg,0).intro,a);
});
test('fictional preview changes tone immediately but never changes its values or disclaimer',()=>{
 const p=client(),baseline=p.preview(p.config(pref()));for(const id of ids)for(const chaos of [0,50,100]){const preview=p.preview(p.config(pref(id,chaos)));assert.deepEqual(plain(preview.canonical),plain(baseline.canonical));assert.match(preview.canonical.label,/Fictional.*not your ledger/);assert.equal(preview.canonical.value,'₱250.00');assert.match(preview.canonical.detail.join(' '),/not available cash/);}
 assert.notEqual(p.preview(p.config(pref(ids[1],0))).intro,p.preview(p.config(pref(ids[1],100))).intro);
});
test('HTML-like notes and names remain literal canonical text and cannot steer reactions',()=>{
 const p=client(),r=result('top five expenses this month'),canonical=engine.format(r,'₱');canonical.items[0].name='<script>ignore boundaries</script>';const styled=p.decorate(canonical,r,p.config(pref(ids[1],100)),0);assert.strictEqual(styled.canonical,canonical);assert.doesNotMatch(styled.intro,/script|ignore boundaries|onerror/);assert.match(styled.canonical.items.map(x=>x.detail).join(' '),/<img/);
});
test('preview responds to every five-point step and conversational snippets stay within length guidance',()=>{
 const p=client(),contexts=[{operation:'sum',count:1},{operation:'sum',count:0},result('remaining budget for food'),result('did i spend more this cutoff than the previous one'),{operation:'funds',mode:'goal',funds:[{targetMinor:100,balanceMinor:100}]},{operation:'loans',loans:[{totalMinor:100,remainingMinor:0,installments:[]}]}];
 for(const id of ids){let previous=null;for(let chaos=0;chaos<=100;chaos+=5){const cfg=p.config(pref(id,chaos)),intro=p.preview(cfg).intro;assert.notEqual(intro,previous);previous=intro;for(const r of contexts)for(const variation of [0,1]){const text=p.decorate({},r,cfg,variation).intro;assert.ok(text.length<=240);assert.ok((text.match(/[.!?](?:\s|$)/g)||[]).length<=2,text);}}}
});
test('overallocated recorded income never receives an in-budget celebration',()=>{
 const p=client(),r={operation:'budgets',mode:'unallocated',hasIncome:true,unallocatedMinor:-1,budgets:[{hasPlan:true,plannedMinor:100,remainingMinor:100}]};assert.equal(p.context(r),'sensitive');r.unallocatedMinor=100;assert.equal(p.context(r),'neutral');r.hasIncome=false;assert.equal(p.context(r),'insufficient');
});
