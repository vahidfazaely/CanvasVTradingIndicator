import { chromium } from "playwright-core";
import { CHROME_PATH } from "./tv.mjs";

async function run(extraArgs, label) {
  const ctx = await chromium.launchPersistentContext("./.chrome-profile-" + label.replace(/\W/g, ""), {
    executablePath: CHROME_PATH,
    headless: true,
    args: extraArgs,
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  for (const t of ["https://www.tradingview.com/", "https://www.google.com/"]) {
    try {
      const resp = await page.goto(t, { waitUntil: "domcontentloaded", timeout: 20000 });
      console.log(`${label}: OK   ${t} -> ${resp ? resp.status() : "no-resp"}`);
    } catch (e) {
      console.log(`${label}: FAIL ${t} -> ${String(e.message).split("\n")[0]}`);
    }
  }
  await ctx.close().catch(() => {});
}

await run(["--proxy-server=http://127.0.0.1:2081"], "with-proxy");
await run(["--no-proxy-server"], "direct");
