import { launch, gotoChart, close, dismissOverlays } from "./tv.mjs";

const { browser, page } = await launch(true);
try {
  await gotoChart(page, "BINANCE:BTCUSDT", 15);
  await page.waitForTimeout(4000);
  await dismissOverlays(page);

  // Open Pine Editor via the right-toolbar dialog button
  await page.click('[data-name="pine-dialog-button"]').catch(async (e) => {
    console.log("pine-dialog-button click failed:", String(e.message).split("\n")[0]);
    // fallback: bottom toolbar text
    await page.getByText("Pine Editor", { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
  });
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const out = { buttons: [], textareas: [], codemirror: [] };
    for (const el of document.querySelectorAll("button")) {
      const t = (el.textContent || "").trim();
      if (t && t.length < 40) out.buttons.push({ text: t, cls: (el.className || "").toString().slice(0, 70) });
    }
    for (const el of document.querySelectorAll("textarea")) {
      out.textareas.push({ cls: (el.className || "").toString().slice(0, 70), ph: el.placeholder || "" });
    }
    for (const el of document.querySelectorAll(".cm-content, .monaco-editor, textarea[spellcheck]")) {
      out.codemirror.push((el.className || "").toString().slice(0, 80));
    }
    return out;
  });
  console.log("DIALOG BUTTONS:", JSON.stringify(info.buttons.slice(0, 30), null, 1));
  console.log("TEXTAREAS:", JSON.stringify(info.textareas));
  console.log("CM:", JSON.stringify(info.codemirror.slice(0, 5)));
} finally {
  await close(browser);
}
