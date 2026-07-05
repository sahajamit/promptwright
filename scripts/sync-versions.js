#!/usr/bin/env node
// scripts/sync-versions.js
// Reads version from root package.json and writes it to all subpackage package.json files.
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const rootPkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
const { version } = rootPkg;

const packages = ["packages/core", "packages/cli", "packages/desktop"];
for (const pkg of packages) {
  const pkgPath = resolve(root, pkg, "package.json");
  const pkgJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkgJson.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n");
  console.log(`Synced ${pkg}/package.json → v${version}`);
}
console.log("Version sync complete.");
