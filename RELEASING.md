# Releasing Promptwright

Binaries are published to **GitHub Releases** (not npm). A version tag triggers
`.github/workflows/release.yml`, which builds the desktop app on native runners
(macOS arm64, Windows x64, Linux AppImage) and uploads the artifacts to a
**draft** Release via electron-builder's GitHub publisher.

## Cut a release

1. **Bump the version** (root is the source of truth; the helper syncs subpackages):
   ```bash
   # edit "version" in ./package.json, then:
   node scripts/sync-versions.js
   git commit -am "Release vX.Y.Z"
   git push
   ```

2. **Tag and push** — this is what triggers the build:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

3. **Watch the build** in the repo's **Actions** tab. Three jobs run in parallel
   and publish to the same draft Release.

4. **Publish the draft** — open **Releases**, review the draft `vX.Y.Z`, add
   notes, and click **Publish release**. `releases/latest` then points to it and
   the README download links resolve.

## Artifacts produced

| Platform | Files |
|----------|-------|
| macOS (arm64) | `Promptwright-X.Y.Z-arm64.dmg`, `Promptwright-X.Y.Z-arm64-mac.zip` |
| Windows (x64) | `Promptwright-Setup-X.Y.Z.exe` (NSIS), portable `.zip` |
| Linux | `Promptwright-X.Y.Z.AppImage` |

## Dry run (no publish)

- **Manual CI run:** Actions tab → *Release* → **Run workflow** (`workflow_dispatch`),
  or push a pre-release tag like `v0.0.1-rc.1`. It builds and creates a draft you
  can inspect and delete.
- **Local, current platform only:**
  ```bash
  pnpm build
  pnpm --filter @promptwright/desktop exec electron-builder --mac --publish never
  # artifacts land in packages/desktop/release/
  ```

## Notes

- **Unsigned.** Builds are not code-signed/notarized yet, so end users see a
  Gatekeeper (macOS) / SmartScreen (Windows) warning on first launch — the README
  documents the one-time workaround. Signing is future work.
- **Native runners are required** — the app bundles platform-specific binaries
  (`@github/copilot-*`, `@playwright/cli`) that only install on their own OS, so
  each platform must build on its matching runner. Do not cross-compile.
- The `scripts/*zscaler*`, `*chunk*`, and `build-win-portable.sh` helpers are for
  Amit's local corporate-proxy machine and an old git-committed-binary workaround.
  CI does not use them.
