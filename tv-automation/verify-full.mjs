// Verify the FULL CanvasV V4.2 script compiles clean in a fresh TradingView
// session (same harness as verify-lite2.mjs). Usage: node verify-full.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CHROME_PATH, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "verify-full.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};
fs.writeFileSync(LOG, "");

const FULL = path.join(import.meta.dirname, "..", "TradingView", "CanvasV_V4_FAST.pine");
const fullCode = fs.readFileSync(FULL, "utf8");
log(`loading FULL (${fullCode.length} chars)`);

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-proxy-server", "--hide-scrollbars", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--js-flags=--max-old-space-size=4096"],
});
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: "en-US" });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

async function focusEditor() {
  try {
    const ta = page.locator(".monaco-editor textarea").first();
    await ta.click({ timeout: 8000, force: true });
    return true;
  } catch { /* fall through */ }
  try {
    await page.click(".monaco-editor .view-lines", { timeout: 6000 });
    return true;
  } catch { /* fall through */ }
  return false;
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
  await page.waitForTimeout(3000);
  log("monaco visible");

  const focused = await focusEditor();
  log(`editor focused: ${focused}`);
  await page.keyboard.press("Control+A");
  await page.waitForTimeout(400);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(800);

  const client = await ctx.newCDPSession(page);
  log("inserting FULL via CDP...");
  const t0 = Date.now();
  await client.send("Input.insertText", { text: fullCode });
  await client.detach();
  log(`insert done in ${Date.now() - t0}ms; waiting 75s for Monaco...`);
  await page.waitForTimeout(75000);
  await dismissOverlays(page);

  const st = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    return { len: lines ? lines.textContent.length : 0 };
  });
  log(`editor len: ${st.len}`);
  await screenshot(page, "full-filled.png");

  let clicked = false;
  for (let i = 0; i < 3; i++) {
    try {
      const btn = page.locator('button:has-text("Add to chart")').first();
      if (await btn.isVisible({ timeout: 6000 }).catch(() => false)) {
        await btn.click({ timeout: 10000, force: true });
        clicked = true;
        break;
      }
    } catch { /* retry */ }
    await page.waitForTimeout(2000);
  }
  log(`add-to-chart clicked: ${clicked}; forcing compile via editor Ctrl+S, then polling log trail...`);
  // Ground truth = the Pine editor console trail the user sees manually:
  //   fail:   "X" opened / Compiling... / Error at L:C ...
  //   pass:   "X" opened / Compiling... / "X" saved.
  // The plain Add-to-chart click can silently no-op in headless sessions;
  // Ctrl+S inside the editor triggers the same compile+save path a human uses.
  async function forceCompile() {
    try {
      const ta = page.locator(".monaco-editor textarea").first();
      await ta.click({ timeout: 5000, force: true });
      await page.keyboard.press("Control+s");
      log("  forceCompile: Ctrl+S sent");
      return true;
    } catch { log("  forceCompile: editor focus failed"); return false; }
  }
  await forceCompile();
  let verdict = "INCONCLUSIVE_TIMEOUT";
  let diag = [];
  let sig = { sawCompiling: false, saved: false, legendC: 0, opened: false };
  const pollDeadline = Date.now() + 300000; // 5 min max
  let polls = 0;
  while (Date.now() < pollDeadline) {
    await page.waitForTimeout(5000);
    polls++;
    try {
      const dlg = page.locator('button:has-text("Save"), button:has-text("OK")').first();
      if (await dlg.isVisible({ timeout: 500 }).catch(() => false)) await dlg.click({ timeout: 2000, force: true });
    } catch { /* no dialog */ }
    const s = await page.evaluate(() => {
      const all = document.body.innerText;
      const errM = all.match(/Error at \d+:\d+[^\\n]*/);
      const legends = Array.from(document.querySelectorAll("[data-name='legend']")).map((e) => e.textContent || "");
      return {
        err: errM ? errM[0].slice(0, 160) : null,
        compiling: /Compiling/i.test(all),
        saved: /"[^"\\n]{0,60}" saved/i.test(all),
        opened: /"[^"\\n]{0,60}" opened/i.test(all),
        legendC: legends.length,
        legendHit: legends.some((t) => /CanvasV/i.test(t)),
      };
    });
    sig = { sawCompiling: s.compiling, saved: s.saved, legendC: s.legendC, opened: s.opened };
    if (s.err) { diag = [s.err]; verdict = "COMPILE_ERROR"; log(`  poll ${polls}: ERROR -> ${s.err}`); break; }
    log(`  poll ${polls}: compiling=${s.compiling} saved=${s.saved} opened=${s.opened} legends=${s.legendC} legendHit=${s.legendHit}`);
    // If the editor never even acknowledged the script, re-send Ctrl+S twice.
    if (!s.compiling && !s.opened && (polls === 12 || polls === 24)) await forceCompile();
    if (s.compiling && (s.saved || s.legendHit)) {
      // confirm stability once more before declaring clean
      await page.waitForTimeout(8000);
      const s2 = await page.evaluate(() => ({ err: /Error at \d+:\d+/.test(document.body.innerText) }));
      if (!s2.err) { verdict = "COMPILES_CLEAN"; break; }
    }
  }
  const c = { diag, hasErr: verdict === "COMPILE_ERROR" };
  log(`FULL diag lines: ${JSON.stringify(c.diag)}`);
  log(`FULL verdict: ${verdict} | last signals: ${JSON.stringify(sig)}`);
  if (verdict === "INCONCLUSIVE_TIMEOUT") log(`FULL signals at timeout: compiling=${sig.sawCompiling} saved=${sig.saved} opened=${sig.opened} legends=${sig.legendC}`);
  await screenshot(page, "full-loaded.png");
  log(verdict === "COMPILE_ERROR" ? "RESULT: FULL COMPILE ERROR(S)" : verdict === "COMPILES_CLEAN" ? "RESULT: FULL COMPILES CLEAN" : "RESULT: FULL INCONCLUSIVE (no error seen, no legend seen)");
} catch (e) {
  log(`FATAL: ${e.message.split("\n")[0]}`);
  await screenshot(page, "full-error.png").catch(() => {});
} finally {
  await browser.close().catch(() => {});
  log("closed");
}
