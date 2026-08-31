import fs from "node:fs";
import { chromium } from "playwright-core";
import { CHROME_PATH, gotoChart, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "check.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};
fs.writeFileSync(LOG, "");

const pinePath = process.argv[2] || "../TradingView/CanvasV_V4_BACKTEST.pine";
const pineCode = fs.readFileSync(pinePath, "utf8");

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-proxy-server", "--hide-scrollbars", "--disable-dev-shm-usage", "--disable-gpu"],
});
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: "en-US" });
const page = await ctx.newPage();
page.setDefaultTimeout(25000);

try {
  await page.goto("https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT&interval=15", { waitUntil: "domcontentloaded" });
  await waitForHeader(page, "BTCUSDT", 50000);
  log("chart ready");

  // Open Pine Editor
  for (let i = 0; i < 6; i++) {
    await dismissOverlays(page);
    try { await page.click('[data-name="pine-dialog-button"]', { timeout: 8000 }); log("pine opened"); break; }
    catch { await page.waitForTimeout(2000); }
  }
  await page.waitForSelector(".monaco-editor", { timeout: 15000 });
  await page.waitForTimeout(2500);

  // Fill editor
  const ta = page.locator(".monaco-editor textarea").first();
  await ta.fill(pineCode);
  log("code filled");
  await page.waitForTimeout(5000);

  // Click Add to chart (with retries)
  for (let i = 0; i < 4; i++) {
    await dismissOverlays(page);
    try {
      const addBtn = page.locator('button:has-text("Add to chart")').first();
      await addBtn.click({ timeout: 8000, force: true });
      log(`Add to chart clicked (attempt ${i + 1})`);
      break;
    } catch (e) {
      log(`attempt ${i + 1} failed: ${e.message.split("\n")[0]}`);
      await page.waitForTimeout(2000);
    }
  }
  await page.waitForTimeout(15000);

  // Check ALL text on page for strategy-related content
  const pageText = await page.evaluate(() => {
    const body = document.body.innerText;
    const lines = body.split("\n").filter(l => l.trim().length > 0);
    return lines.slice(0, 100);
  });
  log("PAGE TEXT (first 100 lines):");
  for (const l of pageText) log(`  ${l}`);

  // Check for specific elements
  const checks = await page.evaluate(() => {
    return {
      canvases: document.querySelectorAll("canvas").length,
      legends: document.querySelectorAll("[data-name='legend']").length,
      strategyTab: !!document.querySelector('[data-name="bottom-toolbar"]'),
      tables: document.querySelectorAll("table").length,
      triangles: document.querySelectorAll("path, polygon").length,
      bodyText: document.body.innerText.slice(0, 500),
    };
  });
  log(`CANVASES: ${checks.canvases}`);
  log(`LEGENDS: ${checks.legends}`);
  log(`STRATEGY TAB: ${checks.strategyTab}`);
  log(`TABLES: ${checks.tables}`);
  log(`TRIANGLES/POLYGONS: ${checks.triangles}`);
  log(`BODY TEXT: ${checks.bodyText}`);

  await screenshot(page, "chart-check.png");
} catch (e) {
  log(`ERROR: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close().catch(() => {});
  log("closed");
}
