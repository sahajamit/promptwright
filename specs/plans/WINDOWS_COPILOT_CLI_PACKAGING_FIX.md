# Windows Copilot CLI Packaging Fix

**Date:** 2026-02-19  
**Status:** ✅ Resolved  
**Scope:** Windows portable packaging + packaged runtime CLI resolution

## Summary

Windows users were seeing runtime failures after launching the portable build:

- "Copilot CLI not found at ...\\resources\\app.asar.unpacked\\node_modules\\@github\\copilot-win32-x64\\copilot.exe"

The app launched, prerequisite checks passed, but session initialization failed when starting Copilot SDK.

## Root Cause

A path-resolution mismatch existed between startup checks and runtime session initialization:

1. **Prerequisite checks** could pass using:
   - `copilotCliPath` override from config, or
   - `copilot` from system `PATH`
2. **Packaged runtime initialization** forced a single packaged binary path:
   - `resources/app.asar.unpacked/node_modules/@github/copilot-win32-x64/copilot.exe`
3. If that packaged binary path was missing in a distributed artifact, runtime failed immediately even when PATH/override was valid.

Additionally, the Windows packaging verification script did not explicitly validate the presence of the Copilot native binary, so incomplete artifacts could still be produced.

## What We Fixed

### 1) Unified Copilot CLI resolution logic

Added shared resolver utilities in:

- `packages/desktop/src/main/copilot-cli.ts`

This centralizes:
- PATH lookup (`where`/`which`)
- override path resolution (file or folder)
- packaged binary path construction

### 2) Added packaged runtime fallback strategy

Updated runtime initialization flows in:

- `packages/desktop/src/main/index.ts`

New runtime resolution order:

1. packaged native binary (if file exists)
2. configured override path (`copilotCliPath`)
3. system `PATH`

This removes the brittle single-path assumption in packaged mode and aligns behavior with prerequisite checks.

### 3) Reused the same resolver in prerequisite checks

Updated:

- `packages/desktop/src/main/prerequisites.ts`

Removed duplicate path-resolution implementation and imported the shared resolver.

### 4) Added build-time fail-fast validation

Updated:

- `scripts/build-win-portable.sh`

Build verification now explicitly checks:

- `resources/app.asar.unpacked/node_modules/@github/copilot-win32-x64/copilot.exe`

If missing, the build fails with a clear error instead of shipping a broken package.

## Why This Works

The fix addresses both failure classes:

- **Runtime robustness:** app no longer depends on only one packaged path.
- **Artifact integrity:** packaging now blocks release if required Copilot binary is absent.

So even if a packaging drift occurs later, runtime can still recover via override/PATH, and CI/manual packaging has a hard guardrail.

## Validation Performed

### Build and script checks

- `bash -n scripts/build-win-portable.sh`
- `pnpm --filter @jarvis-ai/desktop typecheck`
- `pnpm --filter @jarvis-ai/desktop build`
- `pnpm pkg:win`

### Packaging output confirmation

From build logs:

- ✅ `resources/app.asar.unpacked/node_modules/@github/copilot-win32-x64/copilot.exe` found and verified
- ✅ portable zip produced successfully

### User confirmation

Windows user validated:

- app launches successfully
- Copilot connects successfully
- prior "Copilot CLI not found" failure no longer occurs

## Regression Prevention

1. Keep shared CLI resolution logic in one place (`copilot-cli.ts`).
2. Keep Copilot binary check in Windows packaging verification.
3. Continue validating Windows portable artifacts before distribution.
4. Prefer fail-fast packaging checks over runtime discovery for required native binaries.

## Related Files

- `packages/desktop/src/main/copilot-cli.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/prerequisites.ts`
- `scripts/build-win-portable.sh`

## Notes

You may still see non-blocking electron-builder warning:

- deprecated `publisherName` field under `build.win`

This does not impact the Copilot packaging fix. It can be cleaned up separately by moving to `win.signtoolOptions` if desired.