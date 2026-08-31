import fs from "node:fs";
import { chromium } from "playwright-core";
import { CHROME_PATH, gotoChart, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "fill-test.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};
fs.writeFileSync(LOG, "");

// Use a SMALL test snippet first (not the full 47K file)
const TEST_CODE = `//@version=5
indicator("Test Load", overlay=true)
plot(close, "Close", color=color.blue)`;

const { browser, ctx, page } = await launchSimple();
log("browser launched");

try {
  await gotoChart(page, "BINANCE:BTCUSDT", 15);
  const ok = await waitForHeader(page, "BTCUSDT", 45000);
  log(`chart ready: ${ok}`);

  // Open Pine Editor
  await dismissOverlays(page);
  for (let i = 0; i < 5; i++) {
    try {
      await page.click('[data-name="pine-dialog-button"]', { timeout: 8000 });
      log("pine dialog opened");
      break;
    } catch { await page.waitForTimeout(2000); }
  }

  await page.waitForSelector(".monaco-editor", { timeout: 15000 });
  await page.waitForTimeout(2000);
  log("monaco visible");

  // Approach 1: page.fill() on the Monaco textarea
  const ta = page.locator(".monaco-editor textarea").first();
  const taVisible = await ta.isVisible({ timeout: 3000 }).catch(() => false);
  log(`textarea visible: ${taVisible}`);

  if (taVisible) {
    await ta.fill(TEST_CODE);
    log("fill() completed");
    await page.waitForTimeout(2000);

    const st = await page.evaluate(() => {
      const lines = document.querySelector(".monaco-editor .view-lines");
      return { visibleLen: lines ? lines.textContent.length : 0, head: lines ? lines.textContent.slice(0, 80) : "" };
    });
    log(`editor state after fill: ${JSON.stringify(st)}`);
  }

  // Approach 2: If fill didn't work, try focus + execCommand
  if (true) {
    await page.evaluate((text) => {
      const ta = document.querySelector(".monaco-editor textarea");
      if (ta) ta.focus();
      document.execCommand("selectAll");
      document.execCommand("insertText", false, text);
    }, TEST_CODE);
    log("execCommand insertText done");
    await page.waitForTimeout(1000);

    const st2 = await page.evaluate(() => {
      const lines = document.querySelector(".monaco-editor .view-lines");
      return { visibleLen: lines ? lines.textContent.length : 0 };
    });
    log(`editor state after execCommand: ${JSON.stringify(st2)}`);
  }

  // Approach 3: keyboard approach (select all + type small text)
  await page.click(".monaco-editor .view-lines", { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("Control+A");
  await page.waitForTimeout(300);
  await page.keyboard.type(TEST_CODE, { delay: 0 });
  log("keyboard.type done");
  await page.waitForTimeout(1000);

  const st3 = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    return { visibleLen: lines ? lines.textContent.length : 0, head: lines ? lines.textContent.slice(0, 80) : "" };
  });
  log(`editor state after keyboard.type: ${JSON.stringify(st3)}`);

  await screenshot(page, "fill-test.png");

  // Now try Add to chart
  const addBtn = page.locator('button:has-text("Add to chart")').first();
  const vis = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
  log(`Add to chart visible: ${vis}`);
  if (vis) {
    await addBtn.click({ timeout: 10000 });
    log("clicked Add to chart");
    await page.waitForTimeout(8000);

    const err = await page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/.{0,150}(failed to add|compile error|error on line|syntax error).{0,200}/i);
      return m ? m[0] : null;
    });
    if (err) log(`ERROR: ${err}`);
    else log("No errors");

    const legend = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-name='legend']")).map(e => e.textContent.trim().slice(0, 120))
    );
    log(`legend: ${JSON.stringify(legend)}`);
    await screenshot(page, "test-loaded.png");
    log("DONE - test indicator loaded");
  }
} catch (e) {
  log(`FATAL: ${e.message.split("\n")[0]}`);
  await screenshot(page, "fill-error.png").catch(() => {});
} finally {
  await browser.close().catch(() => {});
  log("closed");
}

async function launchSimple() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-proxy-server", "--hide-scrollbars"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1680, height: 1050 },
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  return { browser, ctx, page };
}
