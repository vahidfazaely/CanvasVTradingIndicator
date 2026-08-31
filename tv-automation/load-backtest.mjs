import fs from "node:fs";
import { chromium } from "playwright-core";
import { CHROME_PATH, gotoChart, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "backtest.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};
fs.writeFileSync(LOG, "");

const pinePath = process.argv[2] || "../TradingView/CanvasV_V4_BACKTEST.pine";
const pineCode = fs.readFileSync(pinePath, "utf8");
log(`loading ${pinePath} (${pineCode.length} chars)`);

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: [
    "--no-proxy-server",
    "--hide-scrollbars",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--js-flags=--max-old-space-size=4096",
  ],
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
  await page.goto("https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT&interval=15", { waitUntil: "domcontentloaded" });
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
    } catch { await page.waitForTimeout(2000); }
  }

  await page.waitForSelector(".monaco-editor", { timeout: 15000 });
  await page.waitForTimeout(2500);
  log("monaco visible");

  // Use page.fill() on Monaco textarea - this properly updates Monaco's state
  const ta = page.locator(".monaco-editor textarea").first();
  const taVisible = await ta.isVisible({ timeout: 5000 }).catch(() => false);
  log(`textarea visible: ${taVisible}`);

  if (taVisible) {
    log(`filling editor (${pineCode.length} chars)...`);
    const t0 = Date.now();
    await ta.fill(pineCode);
    log(`fill completed in ${Date.now() - t0}ms`);
  } else {
    // Fallback: keyboard approach
    await page.click(".monaco-editor .view-lines", { timeout: 5000 }).catch(() =>
      page.click(".monaco-editor", { timeout: 5000 })
    );
    await page.waitForTimeout(500);
    await page.keyboard.press("Control+A");
    await page.waitForTimeout(300);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(500);
    log("editor cleared (fallback)");
    log(`inserting text (${pineCode.length} chars)...`);
    const t0 = Date.now();
    await page.keyboard.insertText(pineCode);
    log(`insertText completed in ${Date.now() - t0}ms`);
  }

  // Wait for Monaco to process
  await page.waitForTimeout(5000);
  await dismissOverlays(page);

  // Verify content
  const st = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    return { len: lines ? lines.textContent.length : 0 };
  });
  log(`editor content length: ${st.len}`);
  await screenshot(page, "02-pine-filled.png");

  // Click Add to chart
  const addBtn = page.locator('button:has-text("Add to chart")').first();
  const vis = await addBtn.isVisible({ timeout: 8000 }).catch(() => false);
  log(`Add to chart visible: ${vis}`);

  if (vis) {
    await addBtn.click({ timeout: 15000, force: true });
    log("Add to chart clicked");
    await page.waitForTimeout(15000);

    // Check for errors
    const err = await page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/.{0,200}(failed to add|compile error|error on line|syntax error|undeclared identifier).{0,300}/i);
      return m ? m[0] : null;
    });
    if (err) log(`COMPILE ERROR: ${err}`);
    else log("NO COMPILE ERRORS");

    // Read legend
    const legend = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-name='legend']"))
        .map(e => e.textContent.trim().slice(0, 200))
    );
    log(`legend entries: ${legend.length}`);
    for (const l of legend) log(`  legend: ${l}`);

    await screenshot(page, "03-indicator-loaded.png");

    // Try to open Strategy Tester
    log("opening Strategy Tester...");
    const testerBtn = page.locator('button:has-text("Strategy Tester")').first();
    const testerVis = await testerBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (testerVis) {
      await testerBtn.click({ timeout: 10000 });
      await page.waitForTimeout(5000);
      log("Strategy Tester opened");

      // Extract performance data
      const perf = await page.evaluate(() => {
        const tables = document.querySelectorAll("table");
        const data = [];
        for (const t of tables) {
          const rows = t.querySelectorAll("tr");
          for (const r of rows) {
            const cells = r.querySelectorAll("td, th");
            const row = Array.from(cells).map(c => c.textContent.trim());
            if (row.length > 0) data.push(row.join(" | "));
          }
        }
        return data.slice(0, 50);
      });
      log(`Strategy Tester data: ${perf.length} rows`);
      for (const r of perf) log(`  ${r}`);

      await screenshot(page, "04-strategy-tester.png");
    } else {
      log("Strategy Tester button not visible");
      // Try bottom toolbar
      const bottomBar = page.locator('[data-name="bottom-toolbar"]');
      if (await bottomBar.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bottomBar.click();
        await page.waitForTimeout(2000);
        log("bottom toolbar clicked");
        await screenshot(page, "04-bottom-toolbar.png");
      }
    }

    log("SUCCESS - backtest loaded and tested");
  } else {
    log("Add to chart NOT visible");
    await screenshot(page, "02-no-btn.png");
  }
} catch (e) {
  log(`FATAL: ${e.message.split("\n")[0]}`);
  await screenshot(page, "error.png").catch(() => {});
} finally {
  await browser.close().catch(() => {});
  log("closed");
}
