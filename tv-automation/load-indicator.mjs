// Load a local Pine file into TradingView and add it to the chart.
// Usage: node load-indicator.mjs <path-to-pine> [symbol] [tf]
import fs from "node:fs";
import { launch, gotoChart, close, dismissOverlays, screenshot, readHeader, waitForHeader } from "./tv.mjs";

const pinePath = process.argv[2];
if (!pinePath) {
  console.error("usage: node load-indicator.mjs <path-to-pine> [symbol] [tf]");
  process.exit(2);
}
const symbol = process.argv[3] || "BINANCE:BTCUSDT";
const tf = Number(process.argv[4] || 15);
const pineCode = fs.readFileSync(pinePath, "utf8");

const { browser, page } = await launch(true);
try {
  await gotoChart(page, symbol, tf);
  const ready = await waitForHeader(page, symbol);
  console.log("CHART READY:", ready, JSON.stringify(await readHeader(page)));

  // --- Open Pine Editor dialog (retry: overlays may appear late)
  let opened = false;
  for (let i = 0; i < 4 && !opened; i++) {
    await dismissOverlays(page);
    try {
      await page.click('[data-name="pine-dialog-button"]', { timeout: 8000 });
      opened = true;
    } catch {
      await page.waitForTimeout(2000);
    }
  }
  if (!opened) throw new Error("could not open Pine Editor dialog");
  await page.waitForSelector(".monaco-editor", { timeout: 20000 });
  await page.waitForTimeout(2500);

  // --- Replace editor content (Monaco: click, select all, insert)
  await page.click(".monaco-editor .view-lines", { timeout: 10000 }).catch(() =>
    page.click(".monaco-editor", { timeout: 10000 })
  );
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(pineCode);
  await page.waitForTimeout(1500);

  // --- Add to chart
  const addBtn = page.locator('button:has-text("Add to chart")').first();
  await addBtn.click({ timeout: 15000 });
  await page.waitForTimeout(6000);

  // --- Capture errors / results
  const state = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const err = [];
    if (/failed to add|compile error|error on line|syntax error|undeclared/i.test(bodyText)) {
      err.push(bodyText.match(/.{0,120}(failed to add|compile error|error on line|syntax error|undeclared).{0,200}/i)?.[0] || "error text present");
    }
    const legend = Array.from(document.querySelectorAll("[data-name='legend']"))
      .map((e) => e.textContent.trim().slice(0, 150));
    return { legend, err: err.slice(0, 3) };
  });
  console.log("LEGEND:", JSON.stringify(state.legend));
  console.log("ERRORS:", JSON.stringify(state.err));

  const shot = await screenshot(page, `loaded-${symbol.replace(":", "")}-${tf}m.png`);
  console.log("SHOT:", shot);
} catch (e) {
  console.error("LOAD FAILED:", e.message.split("\n")[0]);
  await screenshot(page, "load-failed.png").catch(() => {});
  process.exitCode = 1;
} finally {
  await close(browser);
}
