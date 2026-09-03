// Phase B standalone: verify the Lite script compiles clean in a fresh
// TradingView session (clean state avoids the post-error-console click issue).
// Usage: node verify-lite2.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CHROME_PATH, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "verify-lite2.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};
fs.writeFileSync(LOG, "");

const LITE = path.join(import.meta.dirname, "..", "TradingView", "CanvasV_V4_FAST_lite.pine");
const liteCode = fs.readFileSync(LITE, "utf8");
log(`loading Lite (${liteCode.length} chars)`);

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-proxy-server", "--hide-scrollbars", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--js-flags=--max-old-space-size=4096"],
});
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: "en-US" });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

async function focusEditor() {
  // Try clicking the Monaco textarea directly first (most reliable target).
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
  log("inserting Lite via CDP...");
  const t0 = Date.now();
  await client.send("Input.insertText", { text: liteCode });
  await client.detach();
  log(`insert done in ${Date.now() - t0}ms; waiting 60s for Monaco...`);
  await page.waitForTimeout(60000);
  await dismissOverlays(page);

  const st = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    return { len: lines ? lines.textContent.length : 0, head: lines ? lines.textContent.slice(0, 80) : "" };
  });
  log(`editor len: ${st.len}`);
  await screenshot(page, "lite2-filled.png");

  // Compile: try Add to chart, then read the pine dialog area text for diagnostics.
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
  log(`add-to-chart clicked: ${clicked}; waiting 25s...`);
  await page.waitForTimeout(25000);

  const c = await page.evaluate(() => {
    const all = document.body.innerText;
    const lines = all.split("\n").map((l) => l.trim()).filter(Boolean);
    const diag = lines.filter((l) => /error at \d+:\d+|line \d+.*(?:error|syntax|undeclared|already defined|expected|argument)|syntax error|undeclared identifier|does not have an argument|Compiling/i.test(l));
    const hasErr = /error at \d+:\d+|syntax error|undeclared identifier|is already defined|does not have an argument/.test(all);
    return { diag: diag.slice(0, 20), hasErr, head: all.slice(0, 400) };
  });
  log(`LITE diag lines: ${JSON.stringify(c.diag)}`);
  log(`LITE has compile error: ${c.hasErr}`);
  log(`page head: ${c.head.replace(/\s+/g, " ").slice(0, 300)}`);

  const attach = await page.evaluate(() => {
    const legends = Array.from(document.querySelectorAll("[data-name='legend']")).map((e) => e.textContent.trim().slice(0, 150));
    const tables = Array.from(document.querySelectorAll("table")).map((t) => t.textContent.trim().slice(0, 250));
    return { legendCount: legends.length, tableCount: tables.length, legends, tables: tables.slice(0, 8) };
  });
  log(`legends: ${attach.legendCount} | tables: ${attach.tableCount}`);
  for (const l of attach.legends) log(`  legend: ${l}`);
  for (const t of attach.tables) log(`  table: ${t}`);

  await screenshot(page, "lite2-loaded.png");
  log(c.hasErr ? "RESULT: LITE COMPILE ERROR(S)" : "RESULT: LITE COMPILES CLEAN");
} catch (e) {
  log(`FATAL: ${e.message.split("\n")[0]}`);
  await screenshot(page, "lite2-error.png").catch(() => {});
} finally {
  await browser.close().catch(() => {});
  log("closed");
}
