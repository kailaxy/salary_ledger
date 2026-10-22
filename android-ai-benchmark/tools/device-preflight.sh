#!/usr/bin/env bash
# Run once per physical phone. Does not read Salary Ledger or alter system settings.
set -euo pipefail
if [[ $# -lt 2 ]]; then echo 'Usage: device-preflight.sh APK_PATH ADB_SERIAL' >&2; exit 1; fi
apk_path="$1"
phone_serial="$2"
phone_adb=(adb -s "$phone_serial")
abi_list="$("${phone_adb[@]}" shell getprop ro.product.cpu.abilist | tr -d '\r')"
if [[ "$abi_list" != *arm64-v8a* ]]; then
  echo 'This Android userspace does not report arm64-v8a. The benchmark APK cannot run here.' >&2
  exit 1
fi
"${phone_adb[@]}" shell getprop ro.product.model
"${phone_adb[@]}" shell getprop ro.build.version.release
"${phone_adb[@]}" shell getprop ro.hardware
"${phone_adb[@]}" shell cat /proc/meminfo
"${phone_adb[@]}" install -r "$apk_path"
"${phone_adb[@]}" shell am start -n com.kailaxy.salaryledger.aibench/.BenchmarkActivity
printf '%s\n' 'Follow the same import, warm-up, suite, airplane-mode, cancellation and export procedure in README.md on both phones.'
