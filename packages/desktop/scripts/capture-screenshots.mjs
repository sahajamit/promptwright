// Regenerate the README screenshots against the current (coral/dark) UI.
// Launches the built Electron app with a BYOK (Moonshot) session and captures
// each view to assets/screenshots/. Run: node scripts/capture-screenshots.mjs
import { _electron as electron } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(__dirname, "..");
const SHOTS = path.resolve(DESKTOP, "../../assets/screenshots");
const MAIN = path.join(DESKTOP, "dist/main/index.js");

const shot = async (win, name) => {
  const p = path.join(SHOTS, name);
  await win.screenshot({ path: p });
  console.log(`  ✓ ${name}`);
};
const wait = (win, ms) => win.waitForTimeout(ms);

const app = await electron.launch({
  args: [MAIN],
  cwd: DESKTOP,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PROMPTWRIGHT_PROVIDER_TYPE: "openai",
    PROMPTWRIGHT_PROVIDER_BASE_URL: "https://api.moonshot.ai/v1",
    PROMPTWRIGHT_PROVIDER_MODEL: "kimi-k2.5",
    PROMPTWRIGHT_PROVIDER_API_KEY: process.env.MOONSHOT_API_KEY || "",
  },
});

try {
  const win = await app.firstWindow();
  win.on("console", (m) => { if (m.type() === "error") console.error(`[renderer] ${m.text()}`); });
  await win.waitForLoadState("domcontentloaded");

  // Roomy, crisp window
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { w.setSize(1440, 900); w.center(); }
  });

  const textarea = win.locator('textarea[placeholder="Describe your testing task..."]');
  // First launch after a build can take a while to connect the BYOK session.
  await textarea.first().waitFor({ state: "visible", timeout: 150000 });
  await win.locator("text=Connected").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  await wait(win, 3000); // let fonts + connection settle

  // 1 — HOME (idle composer)
  await shot(win, "app-home.png");

  // 2 — EXAMPLES (modal over home) — must close it, or it intercepts later clicks
  try {
    await win.getByRole("button", { name: "Examples" }).first().click({ timeout: 8000 });
    const modal = win.locator("div.z-50", { hasText: "Example Tasks" });
    await modal.waitFor({ state: "visible", timeout: 8000 });
    await wait(win, 700);
    await shot(win, "examples.png");
    await modal.getByRole("button").first().click({ timeout: 5000 }); // header X
    await modal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await wait(win, 600);
  } catch (e) { console.error("examples:", e.message); }

  // 3 — SETTINGS (BYOK)
  try {
    await win.locator('button[title="Settings"]').click({ timeout: 8000 });
    await wait(win, 1200);
    await shot(win, "settings-byok.png");
  } catch (e) { console.error("settings:", e.message); }

  // 4 — RECORD / workflow observer
  try {
    await win.locator('button[title="Record"]').click({ timeout: 8000 });
    await wait(win, 1200);
    await shot(win, "workflow-observer.png");
  } catch (e) { console.error("record:", e.message); }

  // 5 — EXECUTION (run a tiny task, capture the IDE workspace)
  try {
    await win.locator('button[title="Chat"]').click({ timeout: 8000 }).catch(() => {});
    await wait(win, 800);
    await textarea.waitFor({ state: "visible", timeout: 20000 });
    await textarea.fill("Open https://example.com and tell me the H1 heading text");
    await win.getByRole("button", { name: "Run Test" }).click({ timeout: 8000 });
    // wait for a verdict, else capture whatever the workspace shows
    const verdict = win.locator("text=/Test Passed|Test Failed|TEST (PASSED|FAILED)/i");
    await verdict.first().waitFor({ state: "visible", timeout: 150000 }).catch(() => console.error("  (no verdict in time — capturing mid-run)"));
    await wait(win, 2000);
    await shot(win, "execution.png");
  } catch (e) { console.error("execution:", e.message); }

  console.log("done.");
} finally {
  await app.close().catch(() => {});
}
