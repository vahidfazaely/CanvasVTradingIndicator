import { launch, gotoChart, close, attachLogs } from "./tv.mjs";

const { browser, page } = await launch(true);
try {
  await gotoChart(page, "BINANCE:BTCUSDT", 15);
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const out = { buttons: [], texts: [], dataNames: [] };
    // Elements whose text contains BTCUSDT or interval-ish strings
    const walk = (root, depth) => {
      if (depth > 6) return;
      for (const el of root.querySelectorAll("*")) {
        if (el.children.length === 0) {
          const t = (el.textContent || "").trim();
          if (t && t.length < 40 && /BTCUSDT|^\d+[mMhHdDwW]$|^15$/.test(t)) {
            out.texts.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 80), text: t });
          }
        }
      }
    };
    walk(document, 0);
    for (const el of document.querySelectorAll("[data-name]")) {
      const n = el.getAttribute("data-name");
      const t = (el.textContent || "").trim().slice(0, 30);
      out.dataNames.push({ name: n, text: t });
    }
    return out;
  });
  console.log("TEXTS:", JSON.stringify(info.texts.slice(0, 15), null, 1));
  console.log("DATA-NAMES:", JSON.stringify(info.dataNames.slice(0, 40), null, 1));
} finally {
  await close(browser);
}
