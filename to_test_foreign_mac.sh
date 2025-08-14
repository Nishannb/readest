#!/bin/bash

# Path to your built .app or .dmg
APP_PATH="/Users/nishanbaral/Desktop/devops/readest/target/aarch64-apple-darwin/release/bundle/dmg/Fumiko_AI_0.9.71_aarch64.dmg"

echo "=== Simulating foreign Mac Gatekeeper check ==="

# 1. Remove any existing quarantine attribute
xattr -d com.apple.quarantine "$APP_PATH" 2>/dev/null

# 2. Apply quarantine attribute (simulate downloaded from internet)
xattr -w com.apple.quarantine "0081;$(printf '%x' $(date +%s));Safari;" "$APP_PATH"

# 3. Show current quarantine status
echo "Quarantine attribute now set to:"
xattr -l "$APP_PATH" | grep com.apple.quarantine

# 4. Run Gatekeeper check
echo
echo "Running Gatekeeper assessment..."
spctl --assess --type execute --verbose "$APP_PATH"

# 5. Also verify code signature (deep check)
echo
echo "Checking code signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
