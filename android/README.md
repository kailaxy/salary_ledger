# Android offline frontend (0.2.0)

Minimum Android 8.0 / API 26; compile/target API 35. Requires an updated Android System WebView with `WEB_MESSAGE_LISTENER` support and a configured Android device screen lock. Java 17, Gradle 8.9, AGP 8.7.3, AndroidX WebKit 1.12.1. The WebKit artifact's minimum SDK is 21; runtime feature availability is checked separately. Devices without the secure messaging feature receive an update message rather than an unsafe JavaScript-interface fallback.

The APK now bundles `Index.html`, served through WebViewAssetLoader at `https://appassets.androidplatform.net/assets/Index.html`. It opens without downloading Apps Script HTML. External font links are removed at build time; system font fallbacks are intentional. Existing hosted mode remains available through the Apps Script deployment.

## Before replacing the old APK

Synchronize all pending changes in the current app and verify them in the Sheet first. The packaged page has a different origin from the former hosted WebView, so its IndexedDB and preferences start fresh. There is no automatic migration of unsynchronized records from the old origin. Do not clear app data or uninstall while any changes remain pending.

Actions currently produces a **debug-signed test APK**. Clean CI jobs can generate different debug keys; if Android reports a signature mismatch, stop and verify that all old data has synchronized before replacing the installation. Stable release signing is still required before relying on repeated production APK updates. Never commit a signing key or its passwords to the repository. This change does not silently erase or import old data.

## Apps Script installation and first connection

1. Update `Code.gs`, `Sync.gs` and `Index.html` in the bound Apps Script project. Add a new script file named **Transport** containing `Transport.gs`.
2. Save and deploy a **new version of the existing web app**, preserving the `/exec` URL, Execute as Me / Anyone settings and configured ledger PIN. If not done already, reload the Sheet and run Salary Ledger → Prepare reliable sync.
3. Run the GitHub Actions **Build Android APK** workflow on `main`. Download `salary-ledger-debug-apk`, unzip, and install `app-debug.apk`. The supplied `/exec` URL is the default; the optional repository variable `LEDGER_WEB_APP_URL` overrides it at build time. Do not put a PIN or pairing token in that variable.
4. Open the APK and authenticate using the phone's **Android device credential**, which also works offline. A device without a screen lock must set one before cached financial records can be opened.
5. In the Google Sheet menu choose **Salary Ledger → Pair Android device**. In the app open **Settings → Connect this device**, then enter the one-time code and the existing ledger PIN in the **native Android dialog**. Do not paste either into chat or source code. Pairing requires internet.
6. Let the first full download complete. Verify that Settings reports a cached ledger and, if prepared, local income/expense saving is available.

Pairing codes last ten minutes and can be used once. Generating a fresh code replaces the previous one. If a reply is lost after a code was consumed, generate a new code. At most ten devices can be paired; the Sheet menu can revoke all Android devices. Changing the ledger PIN also invalidates existing device tokens. Revocation stops new synchronization; it does not remotely erase cached records or undo requests already accepted. Reconnect in Settings to resume sync. Never discard a pending queue merely to repair authentication.

## Offline behavior and limits

After first synchronization, the APK can cold-open its bundled UI, restore the local ledger/outbox, answer supported local questions, and save confirmed income/ordinary expense additions and edits without internet. Sync runs on refresh, online events and authorized app resume; it is not an Android background worker. Funds, loans, plans, categories, settings and deletion remain online-only in this increment. The LLM is not integrated.

The native bridge accepts only main-frame messages from the exact local origin and packaged page. It cannot fetch arbitrary URLs or invoke owner menu functions. External navigation and network resources in WebView are blocked. Native HTTPS requests go only to the compiled Apps Script URL and its permitted Google ContentService redirect; credentials are never forwarded in the redirected GET. Platform TLS verification remains enabled.

The long-lived device token is AES-GCM encrypted with an Android Keystore key and bound locally to the deployment URL and ledger identity. No token or cloud PIN is returned to JavaScript or stored in its localStorage. Pairing uses the existing owner PIN only once in the native network request. Android device-credential authentication gates the local UI; IndexedDB itself is app-private, not separately encrypted by this implementation. Backup and device-transfer rules exclude local data/credentials. Moving to another phone requires synchronization and a fresh pairing.

## Builds and updates

From `android/`, with Java 17, Gradle 8.9 and SDK 35/build tools 34.0.0 installed:

```
gradle --no-daemon assembleDebug lintDebug testDebugUnitTest
```

`generateLedgerAssets` creates the bundled HTML from the root source; do not hand-edit generated assets. **Future frontend changes require a new APK**, as well as Apps Script deployment if the hosted interface should receive them. Server-only changes do not require an APK when the wire contract is unchanged. The workflow runs compilation, lint and JVM security-policy tests and uploads the APK/reports. It does not deploy Apps Script or run phone tests.

## Verification

Node tests: `npm ci && npm test` from `tests/`. Browser tests: `npm run test:browser`, optionally setting `CHROMIUM_PATH`. The packaged-browser test uses the generated asset when available and a mocked native adapter under the actual content security policy. It checks pairing UI integration, offline cold reload, cached queries, durable writes and reconnection, no hosted transport, no external asset requests and no frontend credentials. These tests do not execute Android Keystore, native WebView messaging or live Apps Script HTTP redirects.

Required phone checks: first pair/download; airplane-mode force-stop and reopen; device unlock; view all cached screens; query known totals; confirm and cancel an expense; edit the pending addition; force-stop/reopen with the queue; reconnect and verify one final Sheet row; background/resume authentication; rotate; Android Back on Settings and review dialogs; revoke a test device and confirm pending data survives denied sync. Use a separate test spreadsheet for conflict and interrupted-write experiments. Hardware and live deployment checks remain outstanding until performed on the phone.

References: [WebViewAssetLoader](https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader), [WebViewCompat messaging](https://developer.android.com/reference/androidx/webkit/WebViewCompat#addWebMessageListener(android.webkit.WebView,java.lang.String,java.util.Set,androidx.webkit.WebViewCompat.WebMessageListener)), [Apps Script Content Service redirects](https://developers.google.com/apps-script/guides/content).
