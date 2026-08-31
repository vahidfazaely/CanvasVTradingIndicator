import fs from "node:fs";
import { chromium } from "playwright-core";
import { CHROME_PATH, gotoChart, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "tester.log";
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

  // Open Pine Editor, fill, add to chart
  for (let i = 0; i < 6; i++) {
    await dismissOverlays(page);
    try { await page.click('[data-name="pine-dialog-button"]', { timeout: 8000 }); log("pine opened"); break; }
    catch { await page.waitForTimeout(2000); }
  }
  await page.waitForSelector(".monaco-editor", { timeout: 15000 });
  await page.waitForTimeout(2500);

  const ta = page.locator(".monaco-editor textarea").first();
  await ta.fill(pineCode);
  log("code filled");
  await page.waitForTimeout(5000);

  // Click Add to chart
  for (let i = 0; i < 4; i++) {
    await dismissOverlays(page);
    try {
      await page.locator('button:has-text("Add to chart")').first().click({ timeout: 8000, force: true });
      log("Add to chart clicked");
      break;
    } catch { await page.waitForTimeout(2000); }
  }
  await page.waitForTimeout(10000);

  // Close Pine Editor (click the pine-dialog-button again to toggle)
  await page.click('[data-name="pine-dialog-button"]', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3000);
  log("pine editor closed");

  // Now check bottom toolbar for Strategy Tester
  const bottomInfo = await page.evaluate(() => {
    const bottom = document.querySelector('[data-name="bottom-toolbar"]');
    const allBtns = Array.from(document.querySelectorAll("button")).map(b => b.textContent.trim()).filter(t => t.length > 0 && t.length < 30);
    return {
      bottomExists: !!bottom,
      bottomText: bottom ? bottom.textContent.trim().slice(0, 200) : "not found",
      buttons: allBtns.slice(0, 50),
    };
  });
  log(`bottom toolbar: ${bottomInfo.bottomExists}`);
  log(`bottom text: ${bottomInfo.bottomText}`);
  log(`buttons: ${JSON.stringify(bottomInfo.buttons)}`);

  // Check for Strategy Tester specifically
  const testerCheck = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button, [role='tab'], [data-name]"));
    const tester = btns.filter(b => {
      const text = (b.textContent || "").toLowerCase();
      const name = b.getAttribute("data-name") || "";
      return text.includes("strategy") || text.includes("tester") || text.includes("backtest") ||
             name.includes("strategy") || name.includes("tester");
    });
    return tester.map(b => ({
      tag: b.tagName,
      text: b.textContent.trim().slice(0, 50),
      name: b.getAttribute("data-name") || "",
      visible: b.offsetParent !== null,
    }));
  });
  log(`strategy/tester elements: ${JSON.stringify(testerCheck)}`);

  await screenshot(page, "tester-check.png");

  // Check for any strategy-related text on the entire page
  const stratText = await page.evaluate(() => {
    const body = document.body.innerText;
    const lines = body.split("\n").filter(l => /strategy|backtest|tester|net profit|win rate|drawdown/i.test(l));
    return lines.slice(0, 20);
  });
  log(`strategy text found: ${stratText.length} lines`);
  for (const l of stratText) log(`  ${l}`);

} catch (e) {
  log(`ERROR: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close().catch(() => {});
  log("closed");
}
