import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CHROME_PATH, dismissOverlays, waitForHeader, gotoChart, screenshot } from "./tv.mjs";

const LOG = path.join(import.meta.dirname, "debug.log");
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};

const profile = path.join(import.meta.dirname, ".chrome-profile-" + Date.now());
const pineCode = fs.readFileSync("../TradingView/CanvasV_V4_FAST.pine", "utf8");
log(`code length: ${pineCode.length}`);

const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-proxy-server", "--window-size=1680,1050"],
});
const page = ctx.pages()[0] || (await ctx.newPage());
page.setDefaultTimeout(15000);
log("launched");

try {
  await gotoChart(page, "BINANCE:BTCUSDT", 15);
  log("gotoChart done");
  const ok = await waitForHeader(page, "BTCUSDT", 45000);
  log(`header ready: ${ok}`);

  let opened = false;
  for (let i = 0; i < 4 && !opened; i++) {
    await dismissOverlays(page);
    try {
      await page.click('[data-name="pine-dialog-button"]', { timeout: 7000 });
      opened = true;
    } catch (e) {
      log(`open attempt ${i + 1} failed: ${String(e.message).split("\n")[0]}`);
      await page.waitForTimeout(1500);
    }
  }
  log(`dialog opened: ${opened}`);
  await page.waitForSelector(".monaco-editor", { timeout: 15000 });
  log("monaco visible");

  await page.click(".monaco-editor .view-lines", { timeout: 8000 }).catch(() => {});
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(pineCode);
  log("insertText done");
  await page.waitForTimeout(2000);

  const state = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    const txt = lines ? lines.textContent : "";
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes("Add to chart")
    );
    return {
      visibleLen: txt.length,
      head: txt.slice(0, 50),
      btnDisabled: btn ? btn.disabled : "not-found",
    };
  });
  log(`editor state: ${JSON.stringify(state)}`);
  await screenshot(page, "pine-filled2.png");
  log("screenshot saved");

  if (state.visibleLen > 100 && !state.btnDisabled) {
    const btn = page.locator('button:has-text("Add to chart")').first();
    await btn.click({ timeout: 12000 });
    log("add-to-chart clicked");
    await page.waitForTimeout(8000);
    const legend = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-name='legend']")).map((e) => e.textContent.trim().slice(0, 120))
    );
    log(`legend: ${JSON.stringify(legend)}`);
    await screenshot(page, "pine-after-add.png");
    log("final screenshot saved");
  } else {
    log("SKIP add-to-chart (content or button state unexpected)");
  }
} catch (e) {
  log(`ERROR: ${String(e.message).split("\n")[0]}`);
} finally {
  await ctx.close().catch(() => {});
  log("closed");
}
