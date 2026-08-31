import fs from "node:fs";
import { chromium } from "playwright-core";
import { CHROME_PATH, gotoChart, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "cdp-fast.log";
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
  await page.goto("https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT&interval=15", { waitUntil: "domcontentloaded" });
  const ready = await waitForHeader(page, "BTCUSDT", 50000);
  log(`chart ready: ${ready}`);

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

  // Focus the editor
  await page.click(".monaco-editor .view-lines", { timeout: 5000 }).catch(() =>
    page.click(".monaco-editor", { timeout: 5000 })
  );
  await page.waitForTimeout(500);

  // Select all and delete first
  await page.keyboard.press("Control+A");
  await page.waitForTimeout(300);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(500);
  log("editor cleared");

  // Use CDP Input.insertText — this sends a single beforeinput event
  // Get the CDP session via page's internal connection
  const client = await page.context().newCDPSession(page);
  log("CDP session created");

  const t0 = Date.now();
  await client.send("Input.insertText", { text: pineCode });
  log(`CDP Input.insertText completed in ${Date.now() - t0}ms`);

  // Detach CDP session cleanly
  await client.send("Page.enable").catch(() => {}); // no-op to test connection
  await client.detach();
  log("CDP session detached");

  // Let Monaco process and dismiss any overlays that appeared
  await page.waitForTimeout(10000);
  await dismissOverlays(page);
  log("waited + dismissed overlays");

  // Verify content
  const st = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    return { len: lines ? lines.textContent.length : 0 };
  });
  log(`editor content length: ${st.len}`);

  await screenshot(page, "cdp-filled.png");

  // Click Add to chart (with force in case of overlays)
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

    // Check for tables (V4 panel)
    const tables = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("table")).map(t => t.textContent.trim().slice(0, 300));
    });
    log(`tables: ${tables.length}`);
    for (const t of tables) log(`  table: ${t}`);

    await screenshot(page, "cdp-loaded.png");
    log("SUCCESS - indicator loaded");
  } else {
    log("Add to chart NOT visible");
    await screenshot(page, "cdp-no-btn.png");
  }
} catch (e) {
  log(`FATAL: ${e.message.split("\n")[0]}`);
  await screenshot(page, "cdp-error.png").catch(() => {});
} finally {
  await browser.close().catch(() => {});
  log("closed");
}
