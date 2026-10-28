# Signed frontend updates

This updater replaces only the packaged HTML/CSS/JavaScript interface. It does not install APKs, change signing identities, update Apps Script, switch Sheets, or clear/migrate ledger storage. An initial updater APK must be built with the owner's OTA public key and installed over the existing app using its existing APK signing key. Older APKs cannot acquire an updater through Apps Script deployment.

## One-time owner setup

On the owner's Linux Mint computer, with Python 3, OpenSSL and optionally GitHub CLI installed:

```bash
cd ~/Projects/salary_ledger
git status --short
# Preserve tracked local changes before pulling.
git pull --ff-only origin main
python3 tools/ota/setup.py
```

The script creates a **separate RSA-3072 OTA key** in ignored `.ota-keys/`, or reuses it if present. Back up `frontend-private.pem` securely. Never commit/share it or use it as the APK signing key. The public key cannot sign updates.

In GitHub → repository Settings → Secrets and variables → Actions, configure:

| Type | Name | Value |
|---|---|---|
| Secret | `LEDGER_OTA_PRIVATE_KEY` | Complete contents of `.ota-keys/frontend-private.pem` |
| Repository variable | `LEDGER_OTA_PUBLIC_KEY` | Contents of `.ota-keys/frontend-public.b64` |

Alternatively, with GitHub CLI already signed in with permission to manage this repository:

```bash
python3 tools/ota/setup.py --configure-github
```

Only this optional command configures GitHub. The key is passed to `gh secret set` through stdin, never as a command-line argument or log output. No production key was generated, committed or configured in the cloud workspace. Test keys are temporary and cannot authorize production updates.

**Configure both values before building the updater APK.** Run **Build Android APK** manually on main, selecting release if updating your release installation; otherwise use the usual Dev build. Install it using the same application ID and APK signing key as before. The update public key is included at build time. APKs built without it keep working offline but have OTA disabled, even if the repository variable is added later; they need one further APK build/install to include it. Existing release/debug signing configuration is unchanged.

The default update source is the public release assets of `kailaxy/salary_ledger`. These downloads must be readable **without GitHub login**. If the repository is private, this endpoint will not work until an appropriate public update source is arranged; do not put a GitHub token in the app. Frontend artifacts contain application code, not your Sheet URL, PIN, credentials or records. A different public GitHub repository requires coordinated changes to the publisher source and the APK's pinned `LEDGER_OTA_BASE` before building it.

## Normal updates after that

1. Edit `Index.html`, commit and push to main.
2. **Publish signed frontend** validates the source, runs Node/browser/signing tests, then publishes both `dev` and `stable` channels. Preview/PR APKs do not accept OTA.
3. The installed app checks in the background after unlock, at most once per six hours after successful checks. It can also check through Settings → App updates → Check for updates.
4. A verified update downloads into private app storage. It does **not** reload a page while someone is editing or saving.
5. Fully close and reopen the app to activate the candidate. Merely backgrounding/resuming the same Activity keeps its current interface. No APK reinstall is required.

Manual republishing is available through **Publish signed frontend** → Run workflow → choose `stable` or `dev`. Already-published or older revisions are not overwritten. Missing signing configuration skips automatic publishing with an explanatory notice; manual publication fails clearly until configured. No unsigned update is published. HTML-only pushes no longer trigger automatic APK builds; Android source changes still do, and the Android workflow can always be run manually.

**Native Java/permissions/bridge changes still need a new APK. Backend `.gs` changes still need each owner's Apps Script deployment updated.** Frontend OTA cannot grant new native capabilities or upgrade another user's Sheet project. Keep new UI features compatible with older backends and their capability checks.

## Trust and transport

- The app embeds an RSA SubjectPublicKeyInfo key and verifies `SHA256withRSA` signatures before trusting a manifest. Keys below 3072 bits are rejected.
- Signed fields bind channel, monotonic revision, minimum native API, HTML SHA-256, exact byte length and canonical release-asset URL. Changed HTML, metadata, channel, destination or signatures are rejected.
- Downloads use native HTTPS with platform certificate checks, Google-Sheets-independent destination policy and no ledger credentials. Redirects are limited to GitHub/release-assets/object hosts, with bounded responses and timeouts. Checks use a separate executor rather than blocking ledger synchronization.
- Manifests are limited to 8 KiB, HTML to 4 MiB, and redirects to four. A shared download deadline is checked throughout the transfer; a final socket read can run until its bounded read timeout. There are no unbounded queues or automatic update retries inside a check.
- The app rejects revisions at/below its bundled source revision or its highest accepted signed revision. The revision is the **full Git history count**; do not rewrite/reset main history or reuse a revision with different bytes. Workflows fetch full history. Building from an archive/shallow checkout with OTA enabled requires an explicitly correct `LEDGER_FRONTEND_REVISION`.
- The first protocol is native API 1. Future UI requiring new bridge capabilities must raise the manifest minimum API (publisher `--minimum-api`) and ship a supporting APK first. The default automated publisher remains API 1 until deliberately changed.
- Signed bundle requests cannot choose their host/path arbitrarily. WebView messages cannot supply update URLs, public keys or signatures. Manual check/restore are native-local actions, not Sheet RPCs.
- Only verified, complete bytes are served at the existing `https://appassets.androidplatform.net/assets/Index.html` URL. The original CSP, frame restrictions, origin-restricted main-frame bridge and local IndexedDB origin remain intact. There is no remote-page navigation, arbitrary file serving or permissive CORS.

A signed frontend has the same trusted application privileges as bundled JavaScript. Protect the publishing key and main branch accordingly. Signature verification does not establish that signed code is free of bugs or that its financial behavior is correct.

## Activation, fallback and recovery

Files are written through synced temporary files and atomic replacement. A download never replaces an active interface midway through a session. Before serving a cached version, the app rechecks its manifest signature, compatibility, size and digest, including offline.

The app retains a last-good version, previous version and pending candidate. A candidate is marked as a trial before loading. It must send a native startup acknowledgement after its local bootstrap settles; it does not have to reach Apps Script. The native loading gate stays visible until that trial is ready. A 45-second foreground startup timeout restores the last-good/bundled UI. If the process exits before acknowledgement, the next launch rolls back instead of repeatedly attempting the failed candidate. The rejected revision remains below the monotonic acceptance threshold; publish a new revision to fix it.

The acknowledgement is **a startup health check, not a full functional test**. It cannot prove every page works or undo data writes. This updater introduces no IndexedDB migrations: future OTA code must preserve backward-readable storage and outbox formats. UI rollback does not reverse ledger mutations already explicitly saved/synchronized.

For manual recovery:

- In Settings → App updates, choose **Restore built-in interface** and confirm the native dialog.
- If the frontend cannot open, cancel the phone's device-unlock prompt. The native gate also offers **Restore built-in interface**.
- Recovery removes only update selection/cache, keeps the ledger/credentials/outbox, and pauses automatic interface updates. **Check for updates** explicitly resumes them; previously accepted/rejected revisions are not redownloaded. Publish a newer signed revision after recovery.

A new APK's bundled revision takes precedence over older OTA cache. Losing the OTA private key requires a new key and APK with its public key. Key rotation and APK signing-key rotation are separate operations; no downloaded frontend can silently replace the pinned update key.

## Publishing format

`manifest.txt` is eight ASCII lines plus a final newline. The signature covers the exact first seven lines, including their newlines:

```text
SALARY_LEDGER_FRONTEND_V1
dev-or-stable
positive-revision
minimum-native-api
64-lowercase-hex-sha256
html-byte-count
https://github.com/kailaxy/salary_ledger/releases/download/frontend-CHANNEL/frontend-REVISION.html
base64-rsa-signature
```

Revisioned HTML is uploaded first, then the signed channel manifest. Interrupted publication can be retried: an existing revision asset must match byte-for-byte before the manifest can be updated. A verified existing manifest prevents older/concurrent jobs overwriting a newer pointer. Release assets are hosted as prereleases so they do not replace the latest native APK release. GitHub Release publishing access remains an owner-controlled repository permission.

`tools/ota/bundle.py` strips the same external font/base tags as packaged assets, requires the startup handshake, signs the manifest and verifies its own output against the configured public key. It refuses to overwrite an existing output directory. Never build a release by printing a private key into logs or committing it as a file.

## Validation and device checks

Automated checks cover signatures, framing, digest/size tampering, wrong keys/channels, weak keys, replay rejection, native compatibility floors, candidate acknowledgements, interrupted trials, cached corruption, rollback, cache bounds, manual recovery/pause and ledger-file separation. Python/OpenSSL-produced bundles are cross-verified by the actual Java manifest verifier. Browser tests cover native-only Settings controls, credential-free bridge messages and existing ledger/offline flows. See `frontend-ota-validation.md` for the exact cloud checks.

Still validate on a phone with a **test Sheet** and the real configured updater APK:

1. Pair/download; save an offline pending record. Install the updater APK over that same app without clearing storage.
2. Publish a later, real cosmetic HTML commit; check for updates, fully restart, and verify the change while keeping the same cache and pending record.
3. Disable internet and reopen the updated UI. Confirm existing offline actions and later sync still work without duplicate records.
4. Exercise built-in recovery, canceled recovery, pause and explicit resume; verify credentials/outbox stay intact.
5. In a development channel, publish a signed startup-broken test candidate; verify timeout/process-restart rollback. Do not test this against a real-money ledger or the stable channel.
6. Upgrade to a newer APK; verify older cached OTA cannot override its bundled frontend. Test invalid/unsigned releases and missing GitHub access: they must leave the installed UI usable.

The cloud workspace has not performed these real GitHub/signing-secret/device/network rollout checks. No live update was claimed to be published or installed by merely committing the implementation.
