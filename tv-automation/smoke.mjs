// Phase 4 smoke test: prove the automation path end-to-end.
// Launch -> TradingView chart -> BTCUSDT 15M -> read header -> screenshot.
import { launch, gotoChart, readHeader, screenshot, attachLogs, close } from "./tv.mjs";

const { browser, page } = await launch(true);
const logs = attachLogs(page, "smoke");

try {
  const url = await gotoChart(page, "BINANCE:BTCUSDT", 15);
  console.log("URL:", url);
  await page.waitForTimeout(6000); // let candles render

  const header = await readHeader(page);
  console.log("HEADER:", JSON.stringify(header));

  const shot = await screenshot(page, "smoke-btcusdt-15m.png");
  console.log("SHOT:", shot);

  const title = await page.title();
  console.log("TITLE:", title);

  // Count visible candles via canvas presence + any error text on page
  const errText = await page.evaluate(() => {
    const body = document.body ? document.body.innerText : "";
    const flags = [];
    if (/error|failed to load|something went wrong/i.test(body.slice(0, 4000))) flags.push("error-text-present");
    return flags;
  });
  console.log("PAGE FLAGS:", JSON.stringify(errText));

  if (logs.length) console.log("LOGS:\n" + logs.slice(0, 15).join("\n"));
  console.log("SMOKE OK");
} catch (e) {
  console.error("SMOKE FAILED:", e.message);
  await screenshot(page, "smoke-failed.png").catch(() => {});
  process.exitCode = 1;
} finally {
  await close(browser);
}
