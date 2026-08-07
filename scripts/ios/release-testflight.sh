#!/usr/bin/env bash

# Archive and upload the native Custody Folio shell to App Store Connect.
# Xcode chooses an unused build number during upload, so a completed TestFlight
# build is never accidentally re-uploaded with the same version/build string.
# After upload, the App Store Connect API automatically carries the exact new
# build through external distribution and verifies that its status is Testing.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_DIR="$ROOT_DIR/ios/CustodyFolio"
PROJECT_PATH="$PROJECT_DIR/CustodyFolio.xcodeproj"
EXPORT_OPTIONS_PATH="$PROJECT_DIR/ExportOptions-TestFlight.plist"
OUTPUT_ROOT="${TESTFLIGHT_OUTPUT_DIR:-$ROOT_DIR/tmp/testflight}"
DRY_RUN=false
WHAT_TO_TEST=""

usage() {
  cat <<'EOF'
Usage: npm run ios:testflight [-- --dry-run] [--what-to-test TEXT]

Creates a Release archive, uploads it to App Store Connect, makes the exact new
build the only build in External Beta, submits it for Beta App Review, waits
until it is Testing, and verifies the public TestFlight and TesterBuddy links.

The command only runs from a clean checkout at exactly origin/main. It uses
the App Store Connect API key configured in .env.testflight for automatic
signing and upload, and lets Xcode choose the next unused build number.

Options:
  --dry-run  Verify the release checkout and Xcode configuration without
             archiving or uploading.
  --what-to-test TEXT
             Override the TestFlight What to Test notes for this build.
EOF
}

fail() {
  echo "error: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  argument="$1"
  case "$argument" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --what-to-test)
      [[ $# -ge 2 ]] || fail "--what-to-test requires a value."
      WHAT_TO_TEST="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unknown option: $argument"
      ;;
  esac
done

for command in git node xcodebuild xcrun; do
  command -v "$command" >/dev/null 2>&1 || fail "Required command is unavailable: $command"
done

[[ -d "$PROJECT_PATH" ]] || fail "Xcode project was not found at $PROJECT_PATH"
[[ -f "$EXPORT_OPTIONS_PATH" ]] || fail "Export options were not found at $EXPORT_OPTIONS_PATH"

[[ -z "$(git -C "$ROOT_DIR" status --porcelain)" ]] || fail "Release checkout has uncommitted changes. Commit or stash them before archiving."

git -C "$ROOT_DIR" fetch --quiet origin main || fail "Could not update origin/main. Check your network connection and GitHub access."

origin_main="$(git -C "$ROOT_DIR" rev-parse --verify origin/main 2>/dev/null)"
head_commit="$(git -C "$ROOT_DIR" rev-parse HEAD)"
[[ "$head_commit" == "$origin_main" ]] || fail "Release checkout is not at origin/main. Merge and push the release first, then update this checkout."

marketing_version="$(awk -F ' = ' '/MARKETING_VERSION = / {gsub(/;/, "", $2); print $2; exit}' "$PROJECT_PATH/project.pbxproj")"
configured_build="$(cd "$PROJECT_DIR" && xcrun agvtool what-version -terse | tail -n 1)"

[[ -n "$marketing_version" ]] || fail "Could not read MARKETING_VERSION from the Xcode project."

echo "Release source: $head_commit"
echo "App version: $marketing_version"
echo "Configured build: $configured_build"
echo "Upload policy: Xcode will manage the next unused App Store Connect build number."

echo "Checking App Store Connect API access and public beta configuration…"
node "$ROOT_DIR/scripts/ios/distribute-testflight-external.mjs" --preflight

load_asc_environment_value() {
  local variable_name="$1"
  node -e '
    const { existsSync } = require("node:fs");
    const [environmentPath, variableName] = process.argv.slice(1);
    if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
    const value = process.env[variableName]?.trim();
    if (!value) process.exit(1);
    process.stdout.write(value);
  ' "$ROOT_DIR/.env.testflight" "$variable_name"
}

asc_issuer_id="$(load_asc_environment_value ASC_ISSUER_ID)" || fail "ASC_ISSUER_ID is unavailable."
asc_key_id="$(load_asc_environment_value ASC_KEY_ID)" || fail "ASC_KEY_ID is unavailable."
asc_private_key_path="$(load_asc_environment_value ASC_PRIVATE_KEY_PATH)" || fail "ASC_PRIVATE_KEY_PATH is unavailable."
if [[ "$asc_private_key_path" != /* ]]; then
  asc_private_key_path="$ROOT_DIR/$asc_private_key_path"
fi
[[ -f "$asc_private_key_path" ]] || fail "The configured App Store Connect private key file does not exist."

xcodebuild_authentication=(
  -authenticationKeyPath "$asc_private_key_path"
  -authenticationKeyID "$asc_key_id"
  -authenticationKeyIssuerID "$asc_issuer_id"
)

if "$DRY_RUN"; then
  echo "Dry run passed, including App Store Connect API, Xcode authentication, and public-link checks. No archive or upload was created."
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
release_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
archive_path="$OUTPUT_ROOT/CustodyFolio-$timestamp.xcarchive"
derived_data_path="$OUTPUT_ROOT/DerivedData-$timestamp"
export_path="$OUTPUT_ROOT/Export-$timestamp"

mkdir -p "$OUTPUT_ROOT"

echo "Creating Release archive…"
xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme CustodyFolio \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$archive_path" \
  -derivedDataPath "$derived_data_path" \
  -allowProvisioningUpdates \
  "${xcodebuild_authentication[@]}" \
  archive

echo "Uploading archive to App Store Connect…"
xcodebuild \
  -exportArchive \
  -archivePath "$archive_path" \
  -exportPath "$export_path" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PATH" \
  -allowProvisioningUpdates \
  "${xcodebuild_authentication[@]}"

echo
echo "Upload submitted. Completing automatic external TestFlight distribution…"

distribution_arguments=(--uploaded-after "$release_started_at")
if [[ -n "$WHAT_TO_TEST" ]]; then
  distribution_arguments+=(--what-to-test "$WHAT_TO_TEST")
fi
node "$ROOT_DIR/scripts/ios/distribute-testflight-external.mjs" "${distribution_arguments[@]}"
