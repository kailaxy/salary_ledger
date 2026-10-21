/** Native HTTPS transport. Device credentials are issued only through owner-generated pairing. */
const DEVICE_PREFIX_ = 'LEDGER_DEVICE_';
const PAIR_KEY_ = 'LEDGER_PAIRING';
const DEVICE_LIMIT_ = 10;

function transportHash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function transportRandom_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function transportEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Private to server-side code; cannot be invoked by google.script.run. */
function createAndroidPairing_() {
  if (!getPin_()) throw new Error('Set the ledger PIN before pairing a device.');
  const code = transportRandom_();
  withLock_(function () {
    PropertiesService.getScriptProperties().setProperty(PAIR_KEY_, JSON.stringify({hash:transportHash_(code),expiresAt:Date.now() + 10 * 60 * 1000}));
  });
  SpreadsheetApp.getUi().alert('Pair Android device',
    'In the Android app, open Settings → Connect this device. Enter this one-time code and your ledger PIN.\n\n' + code +
    '\n\nExpires in 10 minutes. Keep this code private. Generating another code replaces this one.', SpreadsheetApp.getUi().ButtonSet.OK);
}
function revokeAndroidDevices_() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Revoke Android devices?', 'Paired devices will need a new code to sync. Their offline caches and pending changes remain on those devices.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  withLock_(function () {
    const properties = PropertiesService.getScriptProperties();
    Object.keys(properties.getProperties()).filter(k => k.indexOf(DEVICE_PREFIX_) === 0).forEach(k => properties.deleteProperty(k));
    properties.deleteProperty(PAIR_KEY_);
  });
  ui.alert('Android sync access revoked.');
}
function transportFields_(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => allowed.indexOf(k) < 0)) throw new Error('INVALID_REQUEST');
}
function transportPair_(body) {
  transportFields_(body, ['version','action','code','pin','name']);
  if (typeof body.code !== 'string' || !/^[a-f0-9]{64}$/.test(body.code) || typeof body.pin !== 'string' || !/^\d{6,12}$/.test(body.pin)) throw new Error('PAIR_INVALID');
  return withLock_(function () {
    const properties = PropertiesService.getScriptProperties();
    const pairing = JSON.parse(properties.getProperty(PAIR_KEY_) || 'null');
    if (!pairing || pairing.expiresAt <= Date.now() || !transportEqual_(pairing.hash, transportHash_(body.code))) throw new Error('PAIR_EXPIRED_OR_INVALID');
    requirePinForWrite_(body.pin);
    if (Object.keys(properties.getProperties()).filter(k => k.indexOf(DEVICE_PREFIX_) === 0).length >= DEVICE_LIMIT_) throw new Error('DEVICE_LIMIT');
    const token = transportRandom_(), deviceId = Utilities.getUuid().replace(/-/g, '');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    properties.setProperty(DEVICE_PREFIX_ + deviceId, JSON.stringify({tokenHash:transportHash_(token),pinContext:transportHash_('ledger-pin:' + getPin_()),ledgerId:ss.getId(),createdAt:new Date().toISOString(),name:text_(body.name || 'Android',60,false,'Device name')}));
    properties.deleteProperty(PAIR_KEY_);
    return {deviceId:deviceId,deviceToken:token,ledgerId:ss.getId()};
  });
}
function transportAuthenticate_(body) {
  if (typeof body.deviceId !== 'string' || !/^[a-f0-9]{32}$/.test(body.deviceId) || typeof body.deviceToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.deviceToken)) throw new Error('DEVICE_REVOKED');
  const stored = JSON.parse(PropertiesService.getScriptProperties().getProperty(DEVICE_PREFIX_ + body.deviceId) || 'null');
  if (!stored || !getPin_() || !transportEqual_(stored.tokenHash, transportHash_(body.deviceToken)) ||
      !transportEqual_(stored.pinContext, transportHash_('ledger-pin:' + getPin_())) || stored.ledgerId !== SpreadsheetApp.getActiveSpreadsheet().getId()) throw new Error('DEVICE_REVOKED');
}
function transportInvoke_(method, args) {
  if (typeof method !== 'string' || !Array.isArray(args)) throw new Error('INVALID_REQUEST');
  const pin = getPin_();
  // Explicit dispatch: no global lookup, eval, setup calls, or owner-only menu functions.
  if (method === 'getLedgerSnapshot' && args.length === 0) return getLedgerSnapshot(pin);
  if (method === 'syncLoanPayment' && args.length === 1) return syncLoanPayment(pin,args[0]);
  if (method === 'syncLedgerMutation' && args.length === 1) return syncLedgerMutation(pin,args[0]);
  if (method === 'addTransaction' && args.length === 1) return addTransaction(pin,args[0]);
  if (method === 'saveCategory' && args.length === 1) return saveCategory(pin,args[0]);
  if (method === 'deleteCategory' && args.length === 1) return deleteCategory(pin,args[0]);
  if (method === 'setBudget' && args.length === 1) return setBudget(pin,args[0]);
  if (method === 'saveLoan' && args.length === 1) return saveLoan(pin,args[0]);
  if (method === 'deleteLoan' && args.length === 1) return deleteLoan(pin,args[0]);
  if (method === 'addLoanPayment' && args.length === 1) return addLoanPayment(pin,args[0]);
  if (method === 'deleteRecord' && args.length === 2) return deleteRecord(pin,args[0],args[1]);
  if (method === 'saveSettings' && args.length === 1) return saveSettings(pin,args[0]);
  if (method === 'generatePeriods' && args.length === 1) return generatePeriods(pin,args[0]);
  throw new Error('UNSUPPORTED_METHOD');
}
function transportHandle_(body) {
  if (!body || body.version !== 1) throw new Error('INVALID_REQUEST');
  if (body.action === 'pair') return transportPair_(body);
  transportFields_(body,['version','action','method','args','deviceId','deviceToken']);
  if (body.action !== 'rpc') throw new Error('INVALID_REQUEST');
  transportAuthenticate_(body);
  return transportInvoke_(body.method,body.args);
}
function doPost(e) {
  let response;
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string' || e.postData.contents.length > 65536) throw new Error('INVALID_REQUEST');
    response = {ok:true,result:transportHandle_(JSON.parse(e.postData.contents))};
  } catch (error) {
    const message = String(error && error.message || error);
    const known = /^(INVALID: |INVALID_REQUEST$|PAIR_|DEVICE_|PIN_|BAD_PIN$|LOCKED$|SYNC_|NOT_SETUP$|BUSY$|UNSUPPORTED_METHOD$)/.test(message);
    response = {ok:false,error:known ? message.slice(0,300).replace(/[\u0000-\u001f]/g,' ') : 'SERVER_ERROR'};
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
