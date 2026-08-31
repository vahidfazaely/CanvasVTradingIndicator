#!/usr/bin/env node
// End-to-end test: load CanvasV V4 into TradingView via Pine Editor + CDP text insertion.
// Usage: node load-v4.mjs [pine-file] [symbol] [tf]
import fs from "node:fs";
import { launch, gotoChart, waitForHeader, dismissOverlays, screenshot,
         cdpInsertText, editorState, close } from "./tv.mjs";

const LOG = "e2e.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};

fs.writeFileSync(LOG, ""); // clear log
const pinePath = process.argv[2] || "../TradingView/CanvasV_V4_FAST.pine";
const symbol = process.argv[3] || "BINANCE:BTCUSDT";
const tf = process.argv[4] || "15";
const pineCode = fs.readFileSync(pinePath, "utf8");
log(`pine: ${pinePath} (${pineCode.length} chars), symbol: ${symbol}, tf: ${tf}`);

const { browser, ctx, page } = await launch(true);
log("browser launched");

try {
  // Phase 1: Navigate to TradingView chart
  const url = await gotoChart(page, symbol, tf);
  log(`navigated: ${url}`);
  const ready = await waitForHeader(page, symbol, 45000);
  log(`chart ready: ${ready}`);
  const hdr = await readHeaderSafe(page);
  log(`header: ${JSON.stringify(hdr)}`);

  // Phase 2: Open Pine Editor
  for (let i = 0; i < 5; i++) {
    await dismissOverlays(page);
    try {
      await page.click('[data-name="pine-dialog-button"]', { timeout: 8000 });
      log(`pine dialog opened (attempt ${i + 1})`);
      break;
    } catch (e) {
      log(`open attempt ${i + 1} failed: ${e.message.split("\n")[0]}`);
      await page.waitForTimeout(2000);
    }
  }

  // Wait for Monaco editor
  await page.waitForSelector(".monaco-editor", { timeout: 15000 });
  log("monaco editor visible");
  await page.waitForTimeout(2000);

  // Phase 3: Insert code via CDP
  await cdpInsertText(ctx, page, pineCode);
  log("code inserted via CDP");

  const st = await editorState(page);
  log(`editor state: ${JSON.stringify(st)}`);
  await screenshot(page, "before-add.png");

  // Phase 4: Click "Add to chart"
  const addBtn = page.locator('button:has-text("Add to chart")').first();
  const visible = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
  log(`Add to chart visible: ${visible}`);

  if (visible) {
    await addBtn.click({ timeout: 12000 });
    log("Add to chart clicked");
    await page.waitForTimeout(10000);

    // Check for compile errors
    const err = await page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/.{0,150}(failed to add|compile error|error on line|syntax error|undeclared identifier).{0,250}/i);
      return m ? m[0] : null;
    });
    if (err) {
      log(`COMPILE ERROR: ${err}`);
      await screenshot(page, "compile-error.png");
    } else {
      log("No compile errors detected");
    }

    // Read legend
    const legend = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-name='legend']"))
        .map(e => e.textContent.trim().slice(0, 150))
    );
    log(`legend: ${JSON.stringify(legend)}`);

    // Read indicator table if present (V4 panel)
    const tableText = await page.evaluate(() => {
      const tables = document.querySelectorAll("table");
      return Array.from(tables).slice(0, 3).map(t => t.textContent.trim().slice(0, 200));
    });
    log(`tables: ${JSON.stringify(tableText)}`);

    await screenshot(page, "indicator-loaded.png");
    log("SCREENSHOT: indicator-loaded.png");
  } else {
    log("Add to chart button NOT visible");
    await screenshot(page, "no-add-btn.png");
  }

  log("=== PHASE 4 DONE ===");

} catch (e) {
  log(`FATAL: ${e.message.split("\n")[0]}`);
  await screenshot(page, "fatal-error.png").catch(() => {});
} finally {
  await close(browser);
  log("browser closed");
}

// Safe header read that won't crash
async function readHeaderSafe(page) {
  return page.evaluate(() => {
    let symbol = null, interval = null;
    const v = document.querySelector("span[class*='symbolNameText']");
    if (v) symbol = v.textContent.trim();
    if (!symbol) {
      const m = document.title.match(/^([A-Z0-9:._-]+)\s/);
      if (m) symbol = m[1];
    }
    const iv = document.querySelector("div[class*='menuBtn']");
    if (iv) interval = iv.textContent.trim();
    return { symbol, interval, title: document.title };
  });
}
