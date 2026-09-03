// Verify CanvasV V4.2 Lite compiles cleanly in the TradingView Pine Editor
// on a BTCUSDT M15 chart, then compare against the full V4.2 script.
// Usage: node verify-lite.mjs [lite|full]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CHROME_PATH, waitForHeader, dismissOverlays, screenshot } from "./tv.mjs";

const LOG = "verify-lite.log";
const log = (m) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
};
fs.writeFileSync(LOG, "");

const which = process.argv[2] || "lite";
const PINE = path.join(import.meta.dirname, "..", "TradingView", which === "lite" ? "CanvasV_V4_FAST_lite.pine" : "CanvasV_V4_FAST.pine");
const pineCode = fs.readFileSync(PINE, "utf8");
log(`loading ${path.basename(PINE)} (${pineCode.length} chars) — mode=${which}`);

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-proxy-server", "--hide-scrollbars", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--js-flags=--max-old-space-size=4096"],
});
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: "en-US" });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

const readPineConsole = () =>
  page.evaluate(() => {
    const root = document.querySelector("[data-name='pine-dialog'], .pine-js-editor, .pineDialog");
    const text = (root ? root.innerText : "") + "\n" + document.body.innerText;
    const err = text.match(/(\d+)\s*(?:error|warning)s?|Error at \d+:\d+|line \d+:.*(?:error|syntax|undeclared|already defined)|Compiling[^.]*\.?/gi);
    return {
      hasErrText: /error at \d+:\d+|syntax error|undeclared identifier|already defined|is already defined|does not have an argument/.test(text),
      errSnippet: err ? err.slice(0, 6) : null,
      snippet: text.slice(0, 600),
    };
  });

try {
  await page.goto("https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT&interval=15", { waitUntil: "domcontentloaded", timeout: 45000 });
  const ready = await waitForHeader(page, "BTCUSDT", 50000);
  log(`chart ready: ${ready}`);
  if (!ready) throw new Error("chart not ready");

  // Open Pine Editor
  for (let i = 0; i < 6; i++) {
    await dismissOverlays(page);
    try { await page.click('[data-name="pine-dialog-button"]', { timeout: 8000 }); log("pine dialog opened"); break; }
    catch { await page.waitForTimeout(2000); }
  }
  await page.waitForSelector(".monaco-editor", { timeout: 20000 });
  await page.waitForTimeout(2500);
  log("monaco visible");

  // Clear editor
  await page.click(".monaco-editor .view-lines", { timeout: 8000 }).catch(() => page.click(".monaco-editor"));
  await page.keyboard.press("Control+A");
  await page.waitForTimeout(300);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(500);
  log("editor cleared");

  // Insert via CDP (proven path for large files)
  const client = await ctx.newCDPSession(page);
  log("inserting text via CDP (~90s)...");
  const t0 = Date.now();
  await client.send("Input.insertText", { text: pineCode });
  log(`insertText completed in ${Date.now() - t0}ms`);
  await client.detach();
  log("waiting 60s for Monaco to process...");
  await page.waitForTimeout(60000);
  await dismissOverlays(page);

  const st = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    return { len: lines ? lines.textContent.length : 0, head: lines ? lines.textContent.slice(0, 60).replace(/\s+/g, " ") : "" };
  });
  log(`editor content length: ${st.len} | head: ${st.head}`);
  await screenshot(page, `verify-${which}-filled.png`);

  // Trigger compile + add to chart
  let added = false;
  for (let i = 0; i < 4; i++) {
    await dismissOverlays(page);
    try {
      const addBtn = page.locator('button:has-text("Add to chart")').first();
      if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addBtn.click({ timeout: 10000, force: true });
        log(`Add to chart clicked (attempt ${i + 1})`);
        added = true;
        break;
      } else {
        log(`Add to chart not visible (attempt ${i + 1})`);
      }
    } catch (e) {
      log(`add attempt ${i + 1}: ${e.message.split("\n")[0]}`);
    }
    await page.waitForTimeout(2500);
  }
  log("waiting 20s for compile...");
  await page.waitForTimeout(20000);

  const cons = await readPineConsole();
  log(`compile error text present: ${cons.hasErrText}`);
  if (cons.errSnippet) log(`status/error snippet: ${JSON.stringify(cons.errSnippet)}`);
  log(`page snippet: ${cons.snippet.replace(/\s+/g, " ").slice(0, 400)}`);

  // Attach check: legend + strategy tester + tables
  const attach = await page.evaluate(() => {
    const legends = Array.from(document.querySelectorAll("[data-name='legend']")).map((e) => e.textContent.trim().slice(0, 120));
    const tables = Array.from(document.querySelectorAll("table")).map((t) => t.textContent.trim().slice(0, 200));
    const hasTesterTab = Array.from(document.querySelectorAll("[role='tab'], button")).some((b) => /strategy tester/i.test((b.textContent || "") + (b.getAttribute("data-name") || "")));
    const loginDialog = /log in|sign up|create your free account/i.test(document.body.innerText.slice(0, 3000));
    return { legends, tables, hasTesterTab, loginDialog, legendCount: legends.length, tableCount: tables.length };
  });
  log(`legends: ${attach.legendCount} | tables: ${attach.tableCount} | tester-tab: ${attach.hasTesterTab} | login-dialog: ${attach.loginDialog}`);
  for (const l of attach.legends) log(`  legend: ${l}`);
  for (const t of attach.tables.slice(0, 6)) log(`  table: ${t}`);

  await screenshot(page, `verify-${which}-loaded.png`);

  // Open the strategy tester tab if present, capture its overview panel text
  if (attach.hasTesterTab) {
    try {
      await page.locator('[role="tab"]:has-text("Strategy Tester"), button:has-text("Strategy Tester")').first().click({ timeout: 6000 });
      await page.waitForTimeout(15000);
      const testerText = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('[data-name="bottom-toolbar"] *, [role="tabpanel"] *'));
        return tabs.map((e) => (e.textContent || "").trim()).filter((t) => t && t.length < 120).slice(0, 80);
      });
      log("tester panel text:");
      for (const t of testerText) log(`  ${t}`);
      await screenshot(page, `verify-${which}-tester.png`);
    } catch (e) {
      log(`tester open failed: ${e.message.split("\n")[0]}`);
    }
  } else if (attach.loginDialog) {
    log("NOTE: login dialog present — add-to-chart requires an account in this browser session.");
  }

  const pass = !cons.hasErrText;
  log(pass ? "RESULT: COMPILE OK" : "RESULT: COMPILE ERROR(S) FOUND");
} catch (e) {
  log(`FATAL: ${e.message.split("\n")[0]}`);
  await screenshot(page, `verify-${which}-error.png`).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  log("closed");
}
