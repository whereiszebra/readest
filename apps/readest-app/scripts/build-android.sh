#!/bin/bash
set -e

export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/30.0.14904198"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/36.1.0:$PATH"

UNSIGNED="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
SIGNED="src-tauri/gen/android/app/build/outputs/apk/universal/release/readest-debug.apk"
KEYSTORE="$HOME/.android/debug.keystore"

# Build
all_proxy=socks5://127.0.0.1:7890 \
  pnpm tauri android build -t aarch64 -- --features devtools

# Sign
apksigner sign \
  --ks "$KEYSTORE" --ks-key-alias androiddebugkey \
  --ks-pass pass:android --key-pass pass:android \
  --out "$SIGNED" "$UNSIGNED" 2>/dev/null

echo "✓ APK signed: $SIGNED"

# Install if device connected
if adb devices | grep -q "device$"; then
  adb kill-server && adb start-server
  adb install -r --no-incremental "$SIGNED" && echo "✓ Installed on device" || echo "✗ Install failed (check phone for dialog)"
else
  echo "No device connected — APK ready at: $SIGNED"
fi
