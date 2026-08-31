import { launch, close } from "./tv.mjs";

const targets = [
  "https://www.google.com/",
  "https://www.npmjs.com/",
  "https://registry.npmjs.org/",
  "https://github.com/",
  "https://raw.githubusercontent.com/",
  "https://www.cloudflare.com/",
  "https://en.wikipedia.org/",
  "https://www.tradingview.com/",
];

const { browser, page } = await launch(true);
try {
  for (const t of targets) {
    try {
      const resp = await page.goto(t, { waitUntil: "domcontentloaded", timeout: 20000 });
      console.log(`OK   ${t} -> ${resp ? resp.status() : "no-resp"}`);
    } catch (e) {
      console.log(`FAIL ${t} -> ${String(e.message).split("\n")[0]}`);
    }
  }
} finally {
  await close(browser);
}
