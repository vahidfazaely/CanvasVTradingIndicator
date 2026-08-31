import { launch, close } from "./tv.mjs";

const targets = [
  "https://www.google.com/",
  "https://example.com/",
  "https://www.tradingview.com/",
  "https://www.binance.com/",
  "https://api.ipify.org/",
];

const { browser, page } = await launch(true);
try {
  for (const t of targets) {
    try {
      const resp = await page.goto(t, { waitUntil: "domcontentloaded", timeout: 25000 });
      console.log(`OK   ${t} -> ${resp ? resp.status() : "no-resp"}`);
    } catch (e) {
      console.log(`FAIL ${t} -> ${String(e.message).split("\n")[0]}`);
    }
  }
  // Where do we end up?
  console.log("FINAL URL:", page.url());
} finally {
  await close(browser);
}
