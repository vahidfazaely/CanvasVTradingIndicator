import fs from "node:fs";
import { chromium } from "playwright-core";
import { CHROME_PATH, gotoChart, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "save.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};
fs.writeFileSync(LOG, "");

const pinePath = process.argv[2] || "../TradingView/CanvasV_V4_FAST.pine";
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

  // Check what the editor shows before save
  const beforeSave = await page.evaluate(() => {
    const dialog = document.querySelector('[data-name="pine-dialog"]');
    return dialog ? dialog.textContent.trim().slice(0, 200) : "no dialog";
  });
  log(`before save: ${beforeSave}`);

  // Try clicking Save button (the one with "SaveSave" text)
  const saveBtn = page.locator('button:has-text("Save")').first();
  const saveVis = await saveBtn.isVisible({ timeout: 5000 }).catch(() => false);
  log(`Save button visible: ${saveVis}`);

  if (saveVis) {
    await saveBtn.click({ timeout: 8000 });
    log("Save clicked");
    await page.waitForTimeout(5000);
    await dismissOverlays(page);

    // Check what the editor shows after save
    const afterSave = await page.evaluate(() => {
      const dialog = document.querySelector('[data-name="pine-dialog"]');
      return dialog ? dialog.textContent.trim().slice(0, 200) : "no dialog";
    });
    log(`after save: ${afterSave}`);
  }

  // Now click Add to chart
  for (let i = 0; i < 4; i++) {
    await dismissOverlays(page);
    try {
      await page.locator('button:has-text("Add to chart")').first().click({ timeout: 8000, force: true });
      log("Add to chart clicked");
      break;
    } catch { await page.waitForTimeout(2000); }
  }
  await page.waitForTimeout(15000);

  // Check result
  const result = await page.evaluate(() => {
    const dialog = document.querySelector('[data-name="pine-dialog"]');
    const legends = document.querySelectorAll("[data-name='legend']");
    return {
      dialogText: dialog ? dialog.textContent.trim().slice(0, 200) : "no dialog",
      legendCount: legends.length,
      legendText: Array.from(legends).map(l => l.textContent.trim().slice(0, 100)),
    };
  });
  log(`dialog: ${result.dialogText}`);
  log(`legends: ${result.legendCount}`);
  for (const l of result.legendText) log(`  legend: ${l}`);

  await screenshot(page, "save-result.png");

} catch (e) {
  log(`ERROR: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close().catch(() => {});
  log("closed");
}
