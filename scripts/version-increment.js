#!/usr/bin/env node
// scripts/version-increment.js
// Increments the patch version in root package.json, syncs subpackages, then rebuilds and repackages.
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pkgPath = resolve(root, "package.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;

pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Bumped version: ${pkg.version} → ${newVersion}`);

// Sync to all subpackages
execSync("node scripts/sync-versions.js", { cwd: root, stdio: "inherit" });

// Rebuild and repackage
execSync("pnpm build", { cwd: root, stdio: "inherit" });
execSync("pnpm pkg:all", { cwd: root, stdio: "inherit" });

console.log(`\nVersion ${newVersion} built and packaged successfully.`);
