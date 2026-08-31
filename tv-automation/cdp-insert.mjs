import fs from "node:fs";
import { chromium } from "playwright-core";
import { CHROME_PATH, gotoChart, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "debug-cdp.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};

const pineCode = fs.readFileSync("../TradingView/CanvasV_V4_FAST.pine", "utf8");
log(`code length: ${pineCode.length}`);

// Fresh profile to avoid any locks
const profile = `./.cdp-profile-${Date.now()}`;
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-proxy-server", "--window-size=1680,1050"],
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = ctx.pages()[0] || (await ctx.newPage());
page.setDefaultTimeout(20000);
log("launched");

try {
  await gotoChart(page, "BINANCE:BTCUSDT", 15);
  const ok = await waitForHeader(page, "BTCUSDT", 45000);
  log(`header ready: ${ok}`);

  // Open Pine Editor
  for (let i = 0; i < 4; i++) {
    await dismissOverlays(page);
    try {
      await page.click('[data-name="pine-dialog-button"]', { timeout: 8000 });
      log("pine dialog opened");
      break;
    } catch (e) {
      log(`open attempt ${i + 1} failed`);
      await page.waitForTimeout(2000);
    }
  }

  await page.waitForSelector(".monaco-editor", { timeout: 15000 });
  log("monaco visible");

  // Focus the editor
  await page.click(".monaco-editor .view-lines", { timeout: 8000 }).catch(() =>
    page.click(".monaco-editor", { timeout: 5000 })
  );
  log("editor focused");

  // Select all existing text
  await page.keyboard.press("Control+A");
  await page.waitForTimeout(500);
  log("selected all");

  // Use CDP to insert text (much more reliable than keyboard.insertText for large text)
  const client = await ctx.newCDPSession(page);
  log("CDP session created");

  // Delete selection first
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);

  // Insert via CDP - this is the reliable path
  await client.send("Input.insertText", { text: pineCode });
  log(`CDP insertText completed (${pineCode.length} chars)`);

  await page.waitForTimeout(3000);
  log("waited for editor to process");

  // Read editor state
  const state = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    const txt = lines ? lines.textContent : "";
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes("Add to chart")
    );
    return {
      visibleLen: txt.length,
      head: txt.slice(0, 100),
      btnText: btn ? btn.textContent.trim().slice(0, 40) : "not-found",
      btnDisabled: btn ? btn.disabled : "not-found",
    };
  });
  log(`editor state: ${JSON.stringify(state)}`);
  await screenshot(page, "cdp-filled.png");

  if (state.btnDisabled === false || state.btnDisabled === "not-found") {
    // Try clicking Add to chart
    const addBtn = page.locator('button:has-text("Add to chart")').first();
    const addBtnVisible = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
    log(`addBtn visible: ${addBtnVisible}`);

    if (addBtnVisible) {
      await addBtn.click({ timeout: 12000 });
      log("add-to-chart clicked");
      await page.waitForTimeout(8000);

      const legend = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-name='legend']"))
          .map((e) => e.textContent.trim().slice(0, 120))
      );
      log(`legend: ${JSON.stringify(legend)}`);

      // Check for errors
      const errText = await page.evaluate(() => {
        const t = document.body.innerText;
        if (/failed to add|compile error|error on line/i.test(t))
          return t.match(/.{0,200}(failed to add|compile error|error on line).{0,200}/i)?.[0] || "error present";
        return null;
      });
      if (errText) log(`ERROR: ${errText}`);

      await screenshot(page, "pine-loaded.png");
      log("SUCCESS - indicator loaded on chart");
    }
  } else {
    log("add-btn not ready, trying anyway");
    const addBtn = page.locator('button:has-text("Add to chart")').first();
    await addBtn.click({ timeout: 12000 }).catch((e) => log(`addBtn click failed: ${e.message.split("\n")[0]}`));
    await page.waitForTimeout(8000);
    await screenshot(page, "pine-loaded-attempt.png");
    log("attempted load with non-ready button");
  }
} catch (e) {
  log(`ERROR: ${e.message.split("\n")[0]}`);
  await screenshot(page, "cdp-error.png").catch(() => {});
} finally {
  await ctx.close().catch(() => {});
  log("closed");
}
