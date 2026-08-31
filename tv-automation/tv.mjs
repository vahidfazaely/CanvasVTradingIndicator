// CanvasV TradingView automation library (Playwright-core + installed Chrome).
// Drives the TradingView WEB app (functionally identical to Desktop for
// charts / Pine Editor / Strategy Tester). No MCP server needed: this is the
// automation layer we invoke directly.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

export const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const SHOT_DIR = path.join(import.meta.dirname, "shots");

export function ensureShots() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}

// Launch a private Chrome instance against the web app.
// Uses launch() + newContext() (NOT launchPersistentContext which hangs
// on this Windows/sandbox setup).
export async function launch(headless = true) {
  ensureShots();
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      // The sandbox WinINET proxy (begzar 127.0.0.1:2081) breaks Chrome;
      // direct egress works (verified for tradingview.com + google.com).
      "--no-proxy-server",
      "--hide-scrollbars",
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1680, height: 1050 },
    locale: "en-US",
    timezoneId: "UTC",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  return { browser, ctx, page };
}

export async function gotoChart(page, symbol, tf) {
  const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}&interval=${tf}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForChart(page);
  return url;
}

// Wait for the chart canvas + header to be present.
export async function waitForChart(page, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await page.evaluate(() => {
      const canvas = document.querySelectorAll("canvas").length;
      const header = document.querySelector('[data-name="header-symbol-search"]');
      return canvas >= 2 && !!header;
    });
    if (ok) return true;
    await page.waitForTimeout(1500);
  }
  // Dismiss cookie/signup overlays that block the UI.
  await dismissOverlays(page);
  return page.evaluate(() => {
    const canvas = document.querySelectorAll("canvas").length;
    const header = !!document.querySelector('[data-name="header-symbol-search"]');
    return canvas >= 2 && header;
  });
}

export async function dismissOverlays(page) {
  const dismissers = [
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
    'button:has-text("Got it")',
    'button:has-text("Continue without")',
    'button:has-text("Skip")',
    '[data-name="close"]',
  ];
  for (const sel of dismissers) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(800);
      }
    } catch {
      /* ignore */
    }
  }
}

// Read symbol + interval text from the header (resilient selectors + title fallback).
export async function readHeader(page) {
  return page.evaluate(() => {
    const q = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent.trim() : null;
    };
    let symbol = q('[data-name="header-symbol-search"]');
    let interval = q('[data-name="header-toolbar-intervals"]');
    if (!symbol) {
      const v = document.querySelector("span.value-eTD3FKHQ, [class*='symbolNameText']");
      symbol = v ? v.textContent.trim() : null;
    }
    if (!interval) {
      const v = document.querySelector("div.value-EzLGe8ai, [class*='menuBtn']");
      interval = v ? v.textContent.trim() : null;
    }
    if (!symbol) {
      const m = document.title.match(/^([A-Z0-9:._-]+)\s/);
      if (m) symbol = m[1];
    }
    return {
      symbol,
      interval,
      title: document.title,
      legend: Array.from(document.querySelectorAll('[data-name="legend"]')).map((e) =>
        e.textContent.trim().slice(0, 120)
      ),
    };
  });
}

// Wait until the header shows the expected symbol (or any symbol), then
// dismiss overlays. Returns true when the chart is interactive.
export async function waitForHeader(page, symbol = null, timeoutMs = 60000) {
  const needle = symbol ? symbol.split(":").pop().toUpperCase() : null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const h = await readHeader(page);
    if (h.symbol) {
      if (!needle || h.symbol.toUpperCase().includes(needle)) return true;
    }
    await dismissOverlays(page);
    await page.waitForTimeout(1500);
  }
  return false;
}

export async function screenshot(page, name) {
  ensureShots();
  const file = path.join(SHOT_DIR, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

// Console + failed-request capture helper.
export async function attachLogs(page, tag) {
  const logs = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") logs.push(`[${tag}] ${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => logs.push(`[${tag}] pageerror: ${String(e).slice(0, 300)}`));
  page.on("requestfailed", (r) => logs.push(`[${tag}] reqfail: ${r.url().slice(0, 200)} ${r.failure()?.errorText || ""}`));
  return logs;
}

export async function close(browser) {
  await browser.close().catch(() => {});
}

// Insert large text into a Monaco/CodeMirror editor via CDP.
// This is far more reliable than keyboard.insertText for 10K+ chars.
// Requires: open Pine dialog, click into editor first.
export async function cdpInsertText(ctx, page, text) {
  // Focus the editor
  await page.click(".monaco-editor .view-lines", { timeout: 8000 }).catch(() =>
    page.click(".monaco-editor", { timeout: 5000 })
  );
  await page.waitForTimeout(300);

  // Select all existing content
  await page.keyboard.press("Control+A");
  await page.waitForTimeout(300);

  // Use CDP Input.insertText for reliable large-text insertion
  const client = await ctx.newCDPSession(page);
  await client.send("Input.insertText", { text });
  await page.waitForTimeout(2000); // let Monaco process
  await client.detach();
}

// Read the current editor visible text length (for verification).
export async function editorState(page) {
  return page.evaluate(() => {
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
}
