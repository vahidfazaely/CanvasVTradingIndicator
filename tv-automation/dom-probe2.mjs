import { launch, gotoChart, close } from "./tv.mjs";

const { browser, page } = await launch(true);
try {
  await gotoChart(page, "BINANCE:BTCUSDT", 15);
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("[data-name]")) {
      out.push(el.getAttribute("data-name"));
    }
    // bottom-ish elements with pine/editor/tester text
    const byText = [];
    for (const el of document.querySelectorAll("button, div, span")) {
      if (el.children.length <= 2) {
        const t = (el.textContent || "").trim();
        if (t && t.length < 30 && /pine|editor|tester|replay|alerts|watchlist|screener/i.test(t)) {
          byText.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 90), text: t });
        }
      }
    }
    return { dataNames: [...new Set(out)], byText: byText.slice(0, 20) };
  });
  console.log("DATA-NAMES:", JSON.stringify(info.dataNames));
  console.log("PINE/TESTER TEXT:", JSON.stringify(info.byText, null, 1));
} finally {
  await close(browser);
}
