const {test}=require('node:test'),assert=require('node:assert/strict');
const {engine,fixture,now}=require('./helpers/query-engine.cjs');
for(const item of require('./fixtures/query-corpus.json'))test('question corpus: '+item.question,()=>{
 if(item.error)assert.throws(()=>engine.interpret(item.question,fixture(),now));
 else assert.deepEqual(JSON.parse(JSON.stringify(engine.interpret(item.question,fixture(),now))),item.query);
});
