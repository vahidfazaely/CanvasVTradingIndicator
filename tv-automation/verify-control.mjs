// Control test for Pine compile verification in TradingView (guest session).
// Phase A: insert a script with a KNOWN compile error → expect detection.
// Phase B: insert the real Lite script → expect NO errors.
// Usage: node verify-control.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CHROME_PATH, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "verify-control.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};
fs.writeFileSync(LOG, "");

const BROKEN = `//@version=5
indicator("Broken control")
x = close + 
plot(x)
`;
const LITE = path.join(import.meta.dirname, "..", "TradingView", "CanvasV_V4_FAST_lite.pine");

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-proxy-server", "--hide-scrollbars", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--js-flags=--max-old-space-size=4096"],
});
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: "en-US" });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

const pineConsoleText = () =>
  page.evaluate(() => {
    const all = document.body.innerText;
    // Pine console entries live near the editor; grab lines that look like diagnostics
    const lines = all.split("\n").map((l) => l.trim()).filter(Boolean);
    const diag = lines.filter((l) => /error at \d+:\d+|line \d+|syntax|undeclared|already defined|not found|expected|argument|Compiling/i.test(l));
    return { diag: diag.slice(0, 20), all: all.slice(0, 1500) };
  });

async function clearAndInsert(text, tag) {
  await page.click(".monaco-editor .view-lines", { timeout: 8000 }).catch(() => page.click(".monaco-editor"));
  await page.keyboard.press("Control+A");
  await page.waitForTimeout(300);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(500);
  const client = await ctx.newCDPSession(page);
  log(`${tag}: inserting ${text.length} chars...`);
  await client.send("Input.insertText", { text });
  await client.detach();
  log(`${tag}: insert done, waiting 45s for Monaco...`);
  await page.waitForTimeout(45000);
  await dismissOverlays(page);
}

async function triggerCompile(tag) {
  // Add to chart compiles in the Pine editor (guest may block attach, but the
  // console still reports compile diagnostics before any login wall).
  let clicked = false;
  for (let i = 0; i < 3; i++) {
    try {
      const btn = page.locator('button:has-text("Add to chart")').first();
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click({ timeout: 8000, force: true });
        clicked = true;
        break;
      }
    } catch { /* retry */ }
    await page.waitForTimeout(2000);
  }
  log(`${tag}: add clicked=${clicked}; waiting 15s for compile...`);
  await page.waitForTimeout(15000);
  const c = await pineConsoleText();
  return c;
}

try {
  await page.goto("https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT&interval=15", { waitUntil: "domcontentloaded", timeout: 45000 });
  const ready = await waitForHeader(page, "BTCUSDT", 50000);
  log(`chart ready: ${ready}`);
  if (!ready) throw new Error("chart not ready");

  for (let i = 0; i < 6; i++) {
    await dismissOverlays(page);
    try { await page.click('[data-name="pine-dialog-button"]', { timeout: 8000 }); break; } catch { await page.waitForTimeout(2000); }
  }
  await page.waitForSelector(".monaco-editor", { timeout: 20000 });
  await page.waitForTimeout(2500);
  log("monaco visible");

  // ---- Phase A: broken script ----
  await clearAndInsert(BROKEN, "BROKEN");
  const ca = await triggerCompile("BROKEN");
  log(`BROKEN diag lines: ${JSON.stringify(ca.diag)}`);
  const detectedBroken = ca.diag.length > 0 || /syntax|error/i.test(ca.diag.join(" "));
  log(`BROKEN error detected: ${detectedBroken}`);
  await screenshot(page, "control-broken.png");

  // ---- Phase B: real Lite ----
  const liteCode = fs.readFileSync(LITE, "utf8");
  await clearAndInsert(liteCode, "LITE");
  const cb = await triggerCompile("LITE");
  log(`LITE diag lines: ${JSON.stringify(cb.diag)}`);
  const liteHasErrors = /error at \d+:\d+|syntax error|undeclared identifier|is already defined|does not have an argument/.test(cb.diag.join(" "));
  log(`LITE errors detected: ${liteHasErrors}`);
  await screenshot(page, "control-lite.png");

  const pass = detectedBroken && !liteHasErrors;
  log(pass ? "CONTROL PASS: broken script caught + Lite clean" : "CONTROL FAIL");
} catch (e) {
  log(`FATAL: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close().catch(() => {});
  log("closed");
}
