import fs from "node:fs";
import { chromium } from "playwright-core";
import { CHROME_PATH, gotoChart, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "full-load.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};
fs.writeFileSync(LOG, "");

const pinePath = process.argv[2] || "../TradingView/CanvasV_V4_FAST.pine";
const pineCode = fs.readFileSync(pinePath, "utf8");
log(`loading ${pinePath} (${pineCode.length} chars)`);

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-proxy-server", "--hide-scrollbars"],
});
const ctx = await browser.newContext({
  viewport: { width: 1680, height: 1050 },
  locale: "en-US",
});
const page = await ctx.newPage();
page.setDefaultTimeout(25000);
log("browser launched");

try {
  // Navigate to TradingView
  const url = "https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT&interval=15";
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const ready = await waitForHeader(page, "BTCUSDT", 50000);
  log(`chart ready: ${ready}`);
  await screenshot(page, "01-chart.png");

  // Open Pine Editor
  for (let i = 0; i < 6; i++) {
    await dismissOverlays(page);
    try {
      await page.click('[data-name="pine-dialog-button"]', { timeout: 8000 });
      log("pine dialog opened");
      break;
    } catch (e) {
      log(`attempt ${i + 1} failed`);
      await page.waitForTimeout(2000);
    }
  }

  await page.waitForSelector(".monaco-editor", { timeout: 15000 });
  await page.waitForTimeout(2500);
  log("monaco visible");

  // Fill editor with page.fill() — proven to work
  const ta = page.locator(".monaco-editor textarea").first();
  await ta.fill(pineCode);
  log("code filled into editor");
  await page.waitForTimeout(3000); // let Monaco compile

  // Verify editor has content
  const st = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    return { len: lines ? lines.textContent.length : 0 };
  });
  log(`editor content length: ${st.len}`);

  await screenshot(page, "02-pine-filled.png");

  // Click "Add to chart"
  const addBtn = page.locator('button:has-text("Add to chart")').first();
  const vis = await addBtn.isVisible({ timeout: 8000 }).catch(() => false);
  log(`Add to chart visible: ${vis}`);

  if (vis) {
    await addBtn.click({ timeout: 15000 });
    log("Add to chart clicked");
    await page.waitForTimeout(12000); // wait for compilation + indicator render

    // Check for errors
    const err = await page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/.{0,200}(failed to add|compile error|error on line|syntax error|undeclared identifier).{0,300}/i);
      return m ? m[0] : null;
    });
    if (err) {
      log(`COMPILE ERROR: ${err}`);
    } else {
      log("NO COMPILE ERRORS");
    }

    // Read legend
    const legend = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-name='legend']"))
        .map(e => e.textContent.trim().slice(0, 200))
    );
    log(`legend entries: ${legend.length}`);
    for (const l of legend) log(`  legend: ${l}`);

    // Read any tables (V4 panel in NORMAL mode shows a compact table)
    const tables = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("table")).map(t =>
        t.textContent.trim().slice(0, 300)
      );
    });
    log(`tables found: ${tables.length}`);
    for (const t of tables) log(`  table: ${t}`);

    await screenshot(page, "03-indicator-loaded.png");
    log("SCREENSHOT: 03-indicator-loaded.png");
  } else {
    log("Add to chart NOT visible");
    await screenshot(page, "02-no-add-btn.png");
  }
} catch (e) {
  log(`FATAL: ${e.message.split("\n")[0]}`);
  await screenshot(page, "error.png").catch(() => {});
} finally {
  await browser.close().catch(() => {});
  log("browser closed");
}
