# Step 1: complete snapshot and durable read cache

Replace the Apps Script project's `Code.gs` and `Index.html` with the complete files in the repository. Save, then open Deploy → Manage deployments → Edit the existing web-app deployment → select New version → Deploy. Keep the existing deployment ID, Execute as Me / Anyone settings, and configured PIN. No table migration or setup rerun is needed. GitHub pushes and APK builds do not deploy Apps Script.

Open the current app online and unlock. Open Settings: successful local saving reports “Full ledger cached” with a timestamp. The server snapshot requires a configured valid PIN, includes all ten tables and deleted rows, and never truncates historical records to the recent 40. Row fingerprints reflect content changes even without timestamp changes. The currency symbol and spreadsheet timezone are exported; the existing currency scale remains two decimal places.

The client atomically stores the snapshot and its ledger identity in IndexedDB. A newly loaded hosted frontend can display that stored dashboard while attempting refresh. Local storage errors are visible; a cloud load alone is not reported as a successful local save. Legacy localStorage dashboard cache is removed after a successful IndexedDB save. The PIN's existing hosted storage behavior has not changed. Local records are not encrypted by this increment; device-level access control and packaged-app unlock are pending.

After a normal cloud write, refresh to update the full snapshot. This increment preserves the existing online forms. It does not accept offline writes, implement sync conflict resolution, expose a chat, run a model, or make the APK launch offline. The outbox store is reserved but unused. The UI must still load from Apps Script, so it needs internet after a cold launch.

Run automated tests: from `tests/`, run `npm ci` then `npm test`. Tests cover a 65-record export, tombstones, cache recovery using a new connection, invalid snapshot rejection, PIN enforcement with mocked Apps Script services, and content fingerprints after an amount changes. Real Apps Script RPCs and device IndexedDB have not been tested here.

Device validation: deploy both files, refresh and check the cached timestamp. Create a test entry, refresh, verify it in the Sheet and snapshot. Disable connectivity while the app is open and verify the cached view remains and refresh reports failure. Reconnect and refresh. Airplane-mode cold startup remains a later acceptance gate.
