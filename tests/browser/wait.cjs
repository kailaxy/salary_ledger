// Explicitly await the browser predicate: some runner polling implementations treat a Promise as truthy.
async function waitFor(page,predicate,arg,timeout=10000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){if(await page.evaluate(predicate,arg))return;await page.waitForTimeout(30);}
 throw new Error('Browser condition did not become true: '+predicate.toString().slice(0,180));
}
module.exports={waitFor};
