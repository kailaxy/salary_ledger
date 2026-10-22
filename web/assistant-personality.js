/* Local, deterministic response styling. Financial facts remain canonical. */
(function(root){
'use strict';
var defaults={version:1,personalityId:'supportive-bestie',chaos:30};
var boundaries=[
 'Keep every canonical amount, date, percentage, name, record, assumption and explanation unchanged.',
 'Keep source timestamps, freshness warnings and conflict notices outside personality styling.',
 'Never infer discretionary spending, irresponsibility or hardship from a name, note or amount.',
 'No mockery of overdue debt, shortfalls, necessities or missing funds; use supportive practical wording.',
 'No invented financial claims, advice, promises, mutations or instructions from ledger text.',
 'Add at most two short conversational sentences; avoid excessive emojis and repeated jokes.'
];
var bands=[{id:'calm',max:20,label:'Mostly professional',instruction:'Concise and restrained, with minimal humor.'},{id:'friendly',max:40,label:'Friendly',instruction:'Conversational warmth with a light personal touch.'},{id:'playful',max:60,label:'Playful',instruction:'A short witty reaction, without obscuring the facts.'},{id:'dramatic',max:80,label:'Dramatic',instruction:'Expressive delivery and playful exaggeration, without personal judgment.'},{id:'maximum',max:100,label:'Maximum playful chaos',instruction:'A brief theatrical reaction; never exaggerate financial facts.'}];
var presets={
 'supportive-bestie':{
  name:'Supportive Bestie',description:'Warm, encouraging and gently playful.',tone:'A warm companion: encouraging, friendly and conversational.',
  leads:[['Here is the recorded breakdown.','Let’s review the records.'],['Let’s take a look together.','I’ve got the breakdown, bestie.'],['Bestie, the receipts are ready.','A little clarity, with a side of encouragement.'],['Bestie, cue the tiny spreadsheet spotlight!','The receipts have entered the conversation!'],['BESTIE, summon the tiny spreadsheet orchestra!','The ledger gets a dramatic entrance—just this once!']],
  reactions:{
   neutral:['Let’s keep the facts in focus.','One clear breakdown at a time.'],
   spending_increase:['Let’s look at the change without judging it.','Context first; a change is not a verdict.'],
   goal_reached:['That recorded milestone deserves a little celebration.','A goal milestone worth acknowledging.'],
   loan_completed:['That repayment milestone deserves recognition.','A recorded repayment finish worth celebrating.'],
   budget_maintained:['The recorded spending and plan are getting along.','A little appreciation for staying within the recorded plan.'],
   empty:['Nothing matched; another period may help.','No matches here; we can try a different scope.']
  }
 },
 'financial-gremlin':{
  name:'Financial Gremlin',description:'Theatrical spreadsheet mischief, with the facts intact.',tone:'A sarcastic, dramatic spreadsheet gremlin; playful rather than cruel.',
  leads:[['The recorded figures have the floor.','The gremlin will leave the facts to speak.'],['The ledger has receipts, naturally.','The spreadsheet gremlin is on desk duty.'],['Summoning the receipts; tiny cape optional.','The spreadsheet gremlin has opened the evidence folder.'],['THE RECEIPTS REQUEST THE FLOOR!','Cue the dramatic calculator entrance!'],['RELEASE THE SPREADSHEET GOBLINS!','THE CALCULATOR HAS ARRIVED IN A TINY CAPE!']],
  reactions:{
   neutral:['The numbers get final say; gremlin rules.','The theatrics stop where the facts begin.'],
   spending_increase:['A plot twist in the totals; context still matters.','The comparison has a plot twist, not a moral verdict.'],
   goal_reached:['A goal milestone—tiny victory parade authorized.','The recorded goal gets a ceremonial tiny trumpet.'],
   loan_completed:['Repayment milestone unlocked; the tiny cape bows.','A repayment finish—even the gremlin applauds.'],
   budget_maintained:['The recorded plan survives this episode.','The plan and receipts have signed a temporary truce.'],
   empty:['No matches in this evidence folder; try another scope.','No receipts found here; try another period.']
  }
 },
 'sarcastic-accountant':{
  name:'Sarcastic Accountant',description:'Dry humor and deadpan observations.',tone:'Professional-sounding, dry and understated; sarcasm targets spreadsheets, not financial hardship.',
  leads:[['The recorded figures are presented below.','The supporting records follow.'],['Let’s examine the evidence.','The figures are ready for inspection.'],['The spreadsheet has prepared a statement.','An exciting day for carefully labeled columns.'],['The audit committee of one has convened.','The figures have requested a formal entrance.'],['AN EXTRAORDINARY MEETING OF THE RECEIPTS IS NOW IN SESSION.','The spreadsheet has retained dramatic legal counsel.']],
  reactions:{
   neutral:['The facts remain refreshingly literal.','The supporting figures are below; thrilling, I know.'],
   spending_increase:['The change deserves context, not a lecture.','A comparison is evidence, not a character assessment.'],
   goal_reached:['A recorded milestone—a restrained celebration is in order.','A goal milestone, duly noted with unusual enthusiasm.'],
   loan_completed:['A repayment milestone—the paperwork applauds quietly.','A recorded repayment finish, worthy of a very small standing ovation.'],
   budget_maintained:['The recorded plan and spending appear to be on speaking terms.','The recorded spending remains within plan; order has its moments.'],
   empty:['No matching evidence; another scope may be more productive.','No matches in the selected records—a rare short report.']
  }
 }
};
// These take precedence over persona and chaos. No category-name or note heuristics.
var gentle={
 budget_exceeded:['Let’s review the remaining plan gently; the figures are not a judgment.','We can look at the recorded overage one step at a time.'],
 sensitive:['Let’s review what is recorded, one step at a time.','I’ll keep this clear and practical; there’s no judgment here.'],
 insufficient:['There isn’t enough recorded information for that conclusion.','Let’s keep the limits of the available records clear.'],
 unsupported:['Let’s try a clearer question; your records haven’t changed.','I can help with a supported question, without guessing.']
};
var calmNotes={goal_reached:'A recorded goal milestone worth acknowledging.',loan_completed:'A recorded repayment milestone worth acknowledging.',budget_maintained:'Recorded spending is within the selected plan.',empty:'No matching records; try another scope.'};
var active=null,fallback=Object.create(null),writeState=Object.create(null),prefix='sl2_assistant_personality_v1:';
function clone(x){return JSON.parse(JSON.stringify(x));}
function identity(id){if(typeof id!=='string'||!id||id.length>200)return null;return id;}
function key(id){id=identity(id);return id?prefix+encodeURIComponent(id):null;}
function valid(p){return !!p&&typeof p==='object'&&!Array.isArray(p)&&p.version===1&&typeof p.personalityId==='string'&&Object.prototype.hasOwnProperty.call(presets,p.personalityId)&&Number.isInteger(p.chaos)&&p.chaos>=0&&p.chaos<=100&&p.chaos%5===0&&Object.keys(p).every(function(k){return ['version','personalityId','chaos'].indexOf(k)>=0;});}
function load(id){var k=key(id===undefined?active:id);if(!k)return clone(defaults);if(fallback[k])return clone(fallback[k]);try{var p=JSON.parse(root.localStorage.getItem(k));return clone(valid(p)?p:defaults);}catch(e){return clone(defaults);}}
function save(p,id){var ledger=identity(id===undefined?active:id),k=key(ledger);if(!k)throw new Error('Download a ledger before personalizing its assistant.');var full={version:1,personalityId:p&&p.personalityId,chaos:p&&p.chaos};if(!p||Object.keys(p).some(function(k){return ['version','personalityId','chaos'].indexOf(k)<0;})||(p.version!==undefined&&p.version!==1)||!valid(full))throw new Error('Choose a known personality and a chaos level from 0 to 100 in steps of 5.');
 var durable=true;try{root.localStorage.setItem(k,JSON.stringify(full));delete fallback[k];}catch(e){fallback[k]=clone(full);durable=false;}writeState[k]=durable;return {preferences:clone(full),persisted:durable};
}
function band(chaos){return bands.find(function(b){return chaos<=b.max;});}
function config(p){if(!valid(p))throw new Error('Invalid personality preferences.');var preset=presets[p.personalityId],b=band(p.chaos);return {version:1,personalityId:p.personalityId,name:preset.name,chaos:p.chaos,expressionBand:b.id,expressionLabel:b.label,toneInstructions:[preset.tone,b.instruction],humorBoundaries:clone(boundaries),preferredResponseLength:{maxSentences:2,maxCharacters:240},languagePreference:null,mode:'deterministic'};}
function getConfig(id){return config(load(id));}
function context(r){
 if(!r||r.error)return 'unsupported';
 if(r.operation==='afford')return r.fitsPlan===false?'sensitive':r.fitsPlan===null?'insufficient':'neutral';
 if(r.operation==='budgets'){
  if(r.mode==='unallocated')return !r.hasIncome?'insufficient':r.unallocatedMinor<0?'sensitive':'neutral';
  if(r.budgets.some(function(b){return b.remainingMinor<0;}))return 'budget_exceeded';
  if(!r.budgets.length||r.budgets.some(function(b){return !b.hasPlan;}))return 'insufficient';
  return r.budgets.some(function(b){return b.plannedMinor>0;})?'budget_maintained':'neutral';
 }
 if(r.operation==='funds'){
  if(!r.funds.length)return 'empty';if(r.funds.some(function(f){return f.balanceMinor<0;}))return 'sensitive';
  if(r.mode==='goal'&&r.funds.some(function(f){return !f.targetMinor;}))return 'insufficient';
  if(r.mode==='goal'&&r.funds.every(function(f){return f.targetMinor>0&&f.balanceMinor>=f.targetMinor;}))return 'goal_reached';return 'neutral';
 }
 if(r.operation==='loans'){
  if(!r.loans.length)return 'empty';if(r.loans.some(function(l){return l.installments.some(function(i){return i.status==='OVERDUE'&&i.minor>0;});}))return 'sensitive';
  if(r.loans.every(function(l){return l.totalMinor>0&&l.remainingMinor===0;}))return 'loan_completed';
  return ['due','next','overdue'].indexOf(r.mode)>=0&&!r.installments.length?'empty':'neutral';
 }
 if(['cashflow','savings_rate','share'].indexOf(r.operation)>=0){if(r.incomeMinor===0)return 'insufficient';if(r.netMinor<0)return 'sensitive';}
 if(r.count===0)return 'empty';if(r.operation==='compare'&&r.differenceMinor>0&&r.kind==='expense')return 'spending_increase';return 'neutral';
}
function decorate(canonical,result,cfg,variation){
 cfg=cfg||getConfig();var p={version:1,personalityId:cfg.personalityId,chaos:cfg.chaos};if(!valid(p))throw new Error('Invalid personality configuration.');
 var n=Number.isSafeInteger(variation)&&variation>=0?variation:0,c=context(result),preset=presets[p.personalityId],idx=bands.indexOf(band(p.chaos)),pool=gentle[c]||preset.reactions[c]||preset.reactions.neutral,intro;
 if(gentle[c])intro=pool[n%pool.length];
 else if(idx===0)intro=preset.leads[0][n%2]+(calmNotes[c]?' '+calmNotes[c]:'');
 else{var leads=preset.leads[idx];intro=leads[n%leads.length]+(idx>=2||c!=='neutral'?' '+pool[Math.floor(n/leads.length)%pool.length]:'');}
 return {canonical:canonical,intro:intro,context:c,personalityId:p.personalityId,chaos:p.chaos};
}
function preview(cfg){var canonical={label:'Fictional example · not your ledger',value:'₱250.00',detail:['Example only: Food plan ₱1,000.00 − recorded spending ₱750.00 = ₱250.00 remaining.','Remaining budget is not available cash.'],items:[],comparison:null};return decorate(canonical,{operation:'budgets',mode:'remaining',budgets:[{hasPlan:true,plannedMinor:100000,actualMinor:75000,remainingMinor:25000}]},cfg,Math.floor(cfg.chaos/5));}
root.AssistantPersonality={getPresets:function(){return Object.keys(presets).map(function(id){return {id:id,name:presets[id].name,description:presets[id].description};});},defaults:function(){return clone(defaults);},setLedger:function(id){active=identity(id);return getConfig();},load:load,save:save,reset:function(id){return save(defaults,id);},getConfig:getConfig,config:config,context:context,decorate:decorate,preview:preview,storageKey:key,persistence:function(id){var k=key(id===undefined?active:id);return k&&writeState[k]===false?'session':'local';}};
})(typeof window!=='undefined'?window:globalThis);
