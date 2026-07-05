// Slim the packaged app by deleting native binaries for platforms other than
// the one being built. @github/copilot ships prebuilt binaries for EVERY
// os-arch (prebuilds/, ripgrep/bin/, tgrep/bin/ ~8 each; mxc-bin/ by arch),
// but the runtime only ever loads the current `${platform}-${arch}` copy.
// Stripping the rest cuts ~350 MB off each build with zero runtime impact.
const fs = require("fs");
const path = require("path");

// electron-builder Arch enum: ia32=0, x64=1, armv7l=2, arm64=3, universal=4
const ARCH = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64", 4: "universal" };

function dirSize(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return st.size;
  let total = 0;
  for (const e of fs.readdirSync(p)) total += dirSize(path.join(p, e));
  return total;
}

exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName, arch } = context;
  const archName = ARCH[arch] || "x64";
  const keepOsArch = `${electronPlatformName === "win32" ? "win32" : electronPlatformName}-${archName}`;

  const resourcesDir =
    electronPlatformName === "darwin"
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(appOutDir, "resources");
  const copilot = path.join(resourcesDir, "app.asar.unpacked", "node_modules", "@github", "copilot");
  if (!fs.existsSync(copilot)) {
    console.log(`[afterPack] @github/copilot not found at ${copilot} — skipping trim`);
    return;
  }

  let freed = 0;
  const rm = (p) => {
    try {
      freed += dirSize(p);
      fs.rmSync(p, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[afterPack] could not remove ${p}: ${e.message}`);
    }
  };

  // Directories split by `${os}-${arch}` — keep only the current one.
  for (const sub of ["prebuilds", path.join("ripgrep", "bin"), path.join("tgrep", "bin")]) {
    const dir = path.join(copilot, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name !== keepOsArch) rm(path.join(dir, name));
    }
  }

  // mxc-bin/ is split by arch only — keep the current arch.
  const mxc = path.join(copilot, "mxc-bin");
  if (fs.existsSync(mxc)) {
    for (const name of fs.readdirSync(mxc)) {
      if (name !== archName) rm(path.join(mxc, name));
    }
  }

  console.log(`[afterPack] kept ${keepOsArch}; freed ~${(freed / 1048576).toFixed(0)} MB of cross-platform binaries`);
};
