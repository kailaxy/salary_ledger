# Android offline frontend (0.4.0)

Minimum Android 8.0 / API 26; compile/target API 35. Requires an updated Android System WebView with `WEB_MESSAGE_LISTENER` support and a configured Android device screen lock. Java 17, Gradle 8.9, AGP 8.7.3, AndroidX WebKit 1.12.1. The WebKit artifact's minimum SDK is 21; runtime feature availability is checked separately. Devices without the secure messaging feature receive an update message rather than an unsafe JavaScript-interface fallback.

The APK now bundles `Index.html`, served through WebViewAssetLoader at `https://appassets.androidplatform.net/assets/Index.html`. It opens without downloading Apps Script HTML. External font links are removed at build time; system font fallbacks are intentional. Existing hosted mode remains available through the Apps Script deployment.

## Before replacing the old APK

Synchronize all pending changes in the current app and verify them in the Sheet first. The packaged page has a different origin from the former hosted WebView, so its IndexedDB and preferences start fresh. There is no automatic migration of unsynchronized records from the old origin. Do not clear app data or uninstall while any changes remain pending.

Build variants use separate Android packages and local storage:

| Variant | Launcher name | Application ID | Signing |
| --- | --- | --- | --- |
| Release | Salary Ledger | `com.kailaxy.salaryledger` | Existing release secrets |
| Development | Salary Ledger Dev | `com.kailaxy.salaryledger.debug` | Persistent debug secret on main |
| PR/branch preview | Salary Ledger Preview | `com.kailaxy.salaryledger.debug.preview` | Temporary runner debug key |

Development installs alongside release, preserving its installation and private data. Pair the development app separately; it starts with its own cache/outbox and Keystore credentials. By default both apps connect to the same Sheet: development writes still affect that Sheet. Use a separate test deployment when testing changes that should not reach your real ledger. There is no cross-app migration of pending records. Old debug APKs used the release application ID; synchronize their pending data before any replacement, and do not uninstall the working release to install the new Dev app.

## Set up persistent development signing once

On a trusted computer with Java keytool and base64 available, run from the repository root:

```
bash android/tools/create-debug-keystore.sh
```

This creates `salary-ledger-debug.jks` and `salary-ledger-debug.jks.b64` with private file permissions. Existing files are never overwritten. Keep the key backed up; both files are ignored by Git. In **Settings → Secrets and variables → Actions**, add repository secret **LEDGER_DEBUG_KEYSTORE_BASE64** containing the complete `.b64` file contents. Its standard debug alias/password are `androiddebugkey` / `android`; the private key itself must remain private. Do not reuse the release key or modify any release secrets.

Automatic pushes on main and manual main runs with release disabled produce **salary-ledger-debug-apk**, signed with this same key. Missing/invalid debug secrets fail the development build instead of silently changing its signature. New builds can update the installed Dev app as version codes increase. Adding a secret does not trigger a workflow; manually run main with release disabled for the first build if needed. For local Dev updates, set `LEDGER_DEBUG_KEYSTORE_PATH` to this same key and use a newer `LEDGER_VERSION_CODE`; without it Gradle uses the local machine's normal debug key.

Pull requests and non-main debug runs receive no signing secrets and build a separate Preview package. Preview signing is temporary, so these artifacts are disposable and may not update a previous preview. Manual release runs skip development/preview builds completely: they use only the existing release secrets and upload **salary-ledger-release-apk**. Missing debug secrets cannot block a release run.

## Set up stable release signing once

Generate the key on your own trusted computer with Java's `keytool`. It prompts for passwords; do not put passwords in commands, chat or source:

```
keytool -genkeypair -keystore salary-ledger-release.jks -alias salary-ledger -keyalg RSA -keysize 3072 -validity 10000
```

Back up this file and its passwords securely outside GitHub. Losing the key prevents installing future updates over this app. In the repository's **Settings → Secrets and variables → Actions**, create four repository secrets:

- `LEDGER_KEYSTORE_BASE64`: base64 encoding of the complete keystore file (use your local base64 tool; paste into the secret field only).
- `LEDGER_KEYSTORE_PASSWORD`: the keystore password.
- `LEDGER_KEY_ALIAS`: `salary-ledger` (or the alias you chose).
- `LEDGER_KEY_PASSWORD`: the key password (usually the same password for the default PKCS12 format).

Run **Build Android APK** manually on **main**, enable **release**, then download **salary-ledger-release-apk** and install `app-release.apk`. Main pushes produce the separate Dev artifact after debug-secret setup. Release signing is available only through manual runs on main, never pull requests. Missing secrets fail the release step; it never substitutes a debug key. The temporary key is removed after the step, and signature verification runs before upload. Keep the displayed certificate SHA-256 fingerprint as an update reference; it is public metadata.

CI assigns an increasing version code from the workflow run number. Reruns have the same code; use a new workflow run for the next update. Local builds default to version code 3; set `LEDGER_VERSION_CODE` to a higher integer for local updates. Local release builds also require `LEDGER_KEYSTORE_PATH`, `LEDGER_KEYSTORE_PASSWORD`, `LEDGER_KEY_ALIAS`, and `LEDGER_KEY_PASSWORD` in the process environment. Do not commit signing properties or keys. GitHub secret setup and the first real signed-device update must be completed by the owner; no production signing key is generated in this workspace.

## Apps Script installation and first connection

1. Update `Code.gs`, `Sync.gs`, `Transport.gs` and `Index.html` in the bound Apps Script project. Add script files named **Operations** and **OperationSync** containing `Operations.gs` and `OperationSync.gs`, and **LoanSync** containing `LoanSync.gs` (and **Transport** containing `Transport.gs` if absent).
2. Save and deploy a **new version of the existing web app**, preserving the `/exec` URL, Execute as Me / Anyone settings and configured ledger PIN. If not done already, reload the Sheet and run Salary Ledger → Prepare reliable sync.
3. Run the GitHub Actions **Build Android APK** workflow on `main`. For regular use, configure release signing above, enable **release**, download `salary-ledger-release-apk`, unzip, and install `app-release.apk`. The debug artifact is for testing. The APK has no built-in ledger URL. Each new installation asks the user for their own `/exec` deployment URL; the former `LEDGER_WEB_APP_URL` build variable is no longer used.
4. On first launch, paste **your own** `https://script.google.com/macros/s/…/exec` deployment URL and tap Continue. Use the URL from your Sheet’s Apps Script deployment, not a Sheet link, `/dev` URL or link with extra parameters. The app then asks for the phone’s **Android device credential**, which also works offline after setup. A device without a screen lock must set one before financial records can be opened.
5. In the Google Sheet menu choose **Salary Ledger → Pair Android device**. The app offers pairing automatically on a new device; afterward, use **Settings → Connect this device**, then enter the one-time code and the existing ledger PIN in the **native Android dialog**. Do not paste either into chat or source code. Pairing requires internet.
6. Let the first full download complete. Verify that Settings reports a cached ledger and, if prepared, local income/expense saving is available.

Pairing codes last ten minutes and can be used once. Generating a fresh code replaces the previous one. If a reply is lost after a code was consumed, generate a new code. At most ten devices can be paired; the Sheet menu can revoke all Android devices. Changing the ledger PIN also invalidates existing device tokens. Revocation stops new synchronization; it does not remotely erase cached records or undo requests already accepted. Reconnect in Settings to resume sync. Never discard a pending queue merely to repair authentication.

## Offline behavior and limits

After the first complete download, all existing ledger forms can save confirmed changes offline: income/expenses, fund transfers and edits, loan setup/renaming and payment edits, categories and goals, budgets (including later open periods), deletion, settings and pay-period generation. The complete deployed script set is Code.gs, Sync.gs, LoanSync.gs, Operations.gs, OperationSync.gs and Transport.gs, plus Index.html. Deploy the new server version, install the rebuilt APK and refresh online to enable operationSyncVersion=1. Reliable sync must already be prepared; no new table/header migration is needed.

New categories and loans retain permanent IDs, so dependent budgets, expenses and loan payments can be queued before reconnecting. Multi-row actions use the same durable journal and are recovered under the lock before app reads/writes. The local queue preserves confirmed changes and failed proposals across restarts. Explicit conflict review can discard a proposal with an audit copy; dependent proposals then become reviewable conflicts instead of silently applying against missing prerequisites. Dependencies are conservative: planning changes may serialize otherwise separate entries. A loan permits one pending new payment at a time. Existing loan schedules remain fixed; name and lender are editable. Large bundles are bounded to 150 affected rows / 45,000 journal characters and must be split when larger. Details: ../docs/offline-step-8.md.

Add → Find an older entry searches the entire saved income, expense, fund and payment history, beyond the 40 recent rows. Query answers continue to use full saved tables, with funds excluded from spending and mirrored loan expenses counted once. All screens recompute from current ledger timezone and pending data. Settings/category/loan drafts survive ledger renders; review dialogs appear above Settings and Android Back/Escape dismisses the review first.

Synchronization runs on refresh, online events and authorized app resume; it is not an Android background worker. Initial setup, cloud PIN management and device pairing/revocation require owner access and internet. LLM integration is deliberately excluded pending a separate model/runtime discussion.

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

Required phone checks: first pair/download; airplane-mode force-stop and reopen; device unlock; view all cached screens; query known totals; confirm and cancel an expense; edit the pending addition; force-stop/reopen with the queue; reconnect and verify one final Sheet row; background/resume authentication; rotate; Android Back on Settings and review dialogs; revoke a test device and confirm pending data survives denied sync. Also test a loan payment with and without counted spending, cold reopening with it pending, reconnecting without duplicates, and conflict review after another device makes a payment. Use a separate test spreadsheet for conflict and interrupted-write experiments. Hardware and live deployment checks remain outstanding until performed on the phone.

References: [WebViewAssetLoader](https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader), [WebViewCompat messaging](https://developer.android.com/reference/androidx/webkit/WebViewCompat#addWebMessageListener(android.webkit.WebView,java.lang.String,java.util.Set,androidx.webkit.WebViewCompat.WebMessageListener)), [Apps Script Content Service redirects](https://developers.google.com/apps-script/guides/content).

See [device validation checklist](../docs/device-validation.md) for the remaining phone/live deployment checks. Passing automated mocks/builds does not establish that those checks were performed.


## Per-user deployment onboarding

Fresh installations have no default endpoint and make no ledger requests before a user supplies a valid canonical HTTPS Apps Script `/exec` URL. URL validation is local; it does not prove ownership, deployment compatibility or PIN setup. The subsequent one-time code + ledger PIN pairing checks the deployment, and the existing snapshot validation checks downloaded data. Set the ledger PIN in your own Sheet, not in another owner’s ledger. No PIN is created by entering a URL.

The URL is stored in native private preferences, with device tokens remaining encrypted in Android Keystore-backed storage. No endpoint, PIN or device token is accepted from WebView messages. Before initial pairing, the native pairing dialog allows URL correction. After pairing, the URL is read-only and device RPCs require an exact match to the endpoint stored with the credentials. Only the owner-entered Google Apps Script endpoint is contacted, using the existing Google-only redirect rules.

Existing paired installations migrate their endpoint from the sealed credential record; no re-pairing, cache reset or outbox deletion is intended. The paired endpoint takes precedence over a different configured endpoint. If Keystore credentials cannot be read, an already configured endpoint remains available for explicit re-pairing; a legacy installation without a readable endpoint may need to enter its existing URL again. Ledger identity is retained and pairing to another ledger remains blocked. Switching paired ledgers is deliberately not implemented: it requires a separate flow that protects unsynchronized data. Development and release applications still have separate private storage and signing configurations.

Phone checks for the new APK: fresh install shows URL entry; invalid/foreign/query-bearing URLs are rejected; Continue leads to device unlock and native pairing; wrong URL can be corrected before first pairing; wrong PIN/code cannot connect; successful pairing downloads that user’s Sheet; cold offline reopening uses the same endpoint/cache; upgrade an already-paired installation without losing pending changes; reconnect/re-pair to the same ledger; verify that a different ledger cannot replace an existing pairing. No hosted Apps Script redeployment is required solely for this native onboarding update.

## Loading feedback and motion

Device unlock shows a native indeterminate indicator; first-page startup keeps the loading gate visible until the packaged page finishes loading, then fades the ledger in over 180 ms when the system animator scale permits it. Pairing has its own indeterminate progress bar and retry feedback. No fake completion percentage or minimum network delay is introduced.

The frontend shows immediate Unlocking/Connecting/Working button states, blocks duplicate PIN submissions, and displays a temporary refresh status without shifting the main content. Buttons, modal sheets, settings sections, answers and toasts have short entrance/press feedback. CSS reduced-motion preferences disable animations/transitions, including spinner pseudo-elements and press scaling. Errors restore the relevant controls. Browser checks cover delayed unlock, duplicate submissions, refresh failures and reduced motion; native loading transitions still need a device check in the new APK.
