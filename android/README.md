# Android wrapper: first increment

Android 8.0 / API 26 minimum; target and compile API 35. Java 17, Gradle 8.9, Android Gradle Plugin 8.7.3. Uses the system WebView, with no native JavaScript bridge. Keep Android System WebView updated.

This first increment opens the existing deployed Apps Script UI, including Settings → Guide. It requires internet and is **not** the offline assistant. No model is selected or bundled. Local packaged assets, authenticated sync, local database and assistant remain follow-up work described in `../docs/offline-assistant-plan.md`.

## GitHub Actions

1. Add these project files to the GitHub repository.
2. The supplied deployment URL is already configured as the default. To override it, in repository Settings → Secrets and variables → Actions → Variables, add `LEDGER_WEB_APP_URL` containing the deployed `https://script.google.com/macros/s/DEPLOYMENT_ID/exec` URL. This URL is configuration, not authentication; the PIN still protects the hosted app. Never put the PIN into this variable or source code.
3. Open Actions → Build Android APK → Run workflow.
4. Download the `salary-ledger-debug-apk` artifact, unzip it, and install `app-debug.apk` on the phone. Android may require permission to install from that source.

The workflow builds and runs Android lint; no device test runs yet. An unset or empty URL variable uses the configured default deployment. Debug signing is only for testing: clean CI jobs may generate different debug signing keys, so subsequent APKs might require uninstalling the prior build, which removes its app data. Stable release signing and backups must be established before storing unsynchronized financial data in this wrapper.

For local builds install Java 17, Gradle 8.9 and SDK platform 35/build tools 34.0.0. From `android/`, set `LEDGER_WEB_APP_URL` and run `gradle assembleDebug lintDebug`. No Gradle wrapper binary is committed in this increment; Actions supplies the exact Gradle version.

## Device checks

Open the APK with internet and confirm the PIN screen, unlock, all existing tabs, Settings → Guide, refresh and a test-ledger write. Rotate and background/resume the app. Check Android Back navigation and verify external navigation cannot open in the privileged app view. Disable connectivity and verify retry feedback after a fresh launch. That failure is expected in this hosted increment, not offline readiness.

Do not treat the deployed page's cached localStorage data as durable offline support. Existing PIN persistence remains unchanged in the hosted UI. No authentication secrets or PINs are embedded in the APK. Apps Script runs as the owner with Anyone access and PIN configured, as confirmed by the owner; a secure packaged-client transport is still required for offline synchronization.
