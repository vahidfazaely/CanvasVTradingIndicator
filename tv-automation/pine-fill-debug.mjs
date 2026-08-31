import fs from "node:fs";
import { launch, gotoChart, close, dismissOverlays, waitForHeader, screenshot } from "./tv.mjs";

const pineCode = fs.readFileSync("../TradingView/CanvasV_V4_FAST.pine", "utf8");
const { browser, page } = await launch(true);
try {
  await gotoChart(page, "BINANCE:BTCUSDT", 15);
  await waitForHeader(page, "BTCUSDT");
  for (let i = 0; i < 4; i++) {
    await dismissOverlays(page);
    try {
      await page.click('[data-name="pine-dialog-button"]', { timeout: 8000 });
      break;
    } catch {
      await page.waitForTimeout(2000);
    }
  }
  await page.waitForSelector(".monaco-editor", { timeout: 20000 });
  await page.waitForTimeout(2500);

  // Try execCommand insertText path
  const res = await page.evaluate((text) => {
    const ta = document.querySelector(".monaco-editor textarea");
    if (!ta) return { ok: false, reason: "no textarea" };
    ta.focus();
    const selAll = document.execCommand("selectAll");
    const ins = document.execCommand("insertText", false, text);
    return { ok: true, selAll, ins, len: ta.value ? ta.value.length : -1 };
  }, pineCode);
  console.log("INSERT RESULT:", JSON.stringify(res));
  await page.waitForTimeout(2000);

  // Read back visible editor text length
  const visible = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    const txt = lines ? lines.textContent : "";
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes("Add to chart")
    );
    return { visibleLen: txt.length, visibleHead: txt.slice(0, 60), btnDisabled: btn ? btn.disabled : "not-found" };
  });
  console.log("EDITOR STATE:", JSON.stringify(visible));
  await screenshot(page, "pine-filled.png");
} finally {
  await close(browser);
}
