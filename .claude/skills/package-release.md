---
name: package-release
description: Increment version, build, and package release artifacts
user_invocable: true
---

# Package Release

Increment the version, build all packages, and create release artifacts.

## Steps

1. Run `pnpm version:increment` (increments patch in root package.json, syncs to all packages, builds, and packages)
2. Verify the new version: `node -p "require('./package.json').version"`
3. Check release artifacts exist in `release/` directory
4. Report the new version and artifact locations
