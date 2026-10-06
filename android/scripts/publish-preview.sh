#!/usr/bin/env bash
set -euo pipefail

# Only the Android version controls Android prereleases. Never mark one as desktop latest.
version="$(node -e "const fs=require('node:fs');const m=fs.readFileSync('android/app/build.gradle','utf8').match(/versionName '([0-9]+\\.[0-9]+-preview)'/);if(!m)process.exit(1);process.stdout.write(m[1]);")"
tag="android-v${version}"
asset="${RUNNER_TEMP}/lijianxue-android-${version}.apk"
existing_draft=false
if gh release view "$tag" --json isDraft --jq '.isDraft' > "${RUNNER_TEMP}/android-release-draft" 2>/dev/null; then
    if [[ "$(cat "${RUNNER_TEMP}/android-release-draft")" == "false" ]]; then
        echo "Android ${version} has already been published; keeping the existing release."
        exit 0
    fi
    existing_draft=true
fi

# Never fall back to a newly generated debug key for public updates.
if [[ -z "${ANDROID_SIGNED_APK:-}" || ! -f "$ANDROID_SIGNED_APK" ]]; then
    echo 'Fixed signing is not configured; no new public APK was published.' >&2
    exit 1
fi
cp "$ANDROID_SIGNED_APK" "$asset"
if [[ "$existing_draft" == "true" ]]; then
    gh release upload "$tag" "$asset" --clobber
else
    gh release create "$tag" "$asset" --target "$GITHUB_SHA" --draft --prerelease --latest=false \
        --title "梨间雪桌宠 · Android ${version}" --notes-file android/RELEASE_NOTES.md
fi
gh release edit "$tag" --draft=false --prerelease --latest=false
