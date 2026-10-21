# Step 5: packaged Android startup and native synchronization

See `../android/README.md` for migration, pairing, builds, deployment and device checks.

Changes: bundled frontend generation; local WebView origin with CSP and resource/navigation restrictions; main-frame origin-restricted messaging; native worker-thread HTTPS transport; one-time owner pairing and revocable device credentials; AES-GCM/Keystore storage; Android screen-lock authentication; explicit backup/transfer exclusion; shared frontend transport adapter preserving hosted mode; APK build triggers on root Index.html changes.

New server file: `Transport.gs`. Update Code.gs/Sync.gs/Index.html and add Transport.gs before deploying a new Apps Script version. The new server menu offers Pair Android device and Revoke Android devices. No secret is embedded in the repository, APK or frontend.

Tests distinguish the actual Android build/JVM policy checks, mocked server tests, mocked packaged-browser tests and outstanding phone/live transport tests. Successful build and simulated offline reload do not establish that a user's live Apps Script deployment has been upgraded or paired. Offline startup on the real device still needs the documented airplane-mode test.

The old hosted origin's cache is not migrated. Synchronize its pending queue before replacing or clearing the old app. Debug signing remains for testing; production signing and safe APK updates remain a separate deployment requirement. Broader offline forms and the LLM remain outstanding, with the LLM last.

Validation completed in the cloud workspace: `assembleDebug lintDebug testDebugUnitTest` succeeded; three JVM policy tests passed with no failures or skips; lint reported zero errors (remaining warnings concern required JavaScript, English UI strings and optional icon/resource conventions). All 37 Node tests passed. Both hosted/outbox and packaged-origin browser checks passed. The APK was inspected to confirm its bundled HTML matches the current root Index.html after removing the remote font links and base tag. No phone or live Apps Script pairing claim is made.
