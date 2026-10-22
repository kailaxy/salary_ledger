#!/usr/bin/env bash
# Run once on a trusted computer, then keep this key for every development APK.
set -euo pipefail
umask 077
key_path="${1:-salary-ledger-debug.jks}"
encoded_path="${key_path}.b64"
if [[ -e "$key_path" || -e "$encoded_path" ]]; then
  echo 'Output already exists. Reuse your existing development key; choose a new path only for initial setup.' >&2
  exit 1
fi
keytool -genkeypair -noprompt -keystore "$key_path" -storetype JKS \
  -alias androiddebugkey -storepass android -keypass android \
  -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Salary Ledger Development'
base64 < "$key_path" > "$encoded_path"
echo "Created $key_path and $encoded_path. Keep both private and backed up."
echo 'Copy the .b64 file contents into the GitHub Actions repository secret LEDGER_DEBUG_KEYSTORE_BASE64.'
echo 'This is a development key only. Never replace the release signing secrets with it.'
