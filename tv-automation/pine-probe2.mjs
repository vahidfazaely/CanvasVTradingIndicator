import { launch, gotoChart, close, dismissOverlays, screenshot } from "./tv.mjs";

const { browser, page } = await launch(true);
try {
  await gotoChart(page, "BINANCE:BTCUSDT", 15);
  await page.waitForTimeout(4000);
  await dismissOverlays(page);

  await page.click('[data-name="pine-dialog-button"]').catch(() => {});
  await page.waitForTimeout(5000);

  // Search all frames for editor-ish elements
  const frames = page.frames();
  console.log("FRAMES:", frames.map((f) => f.url().slice(0, 100)));
  for (const f of frames) {
    try {
      const res = await f.evaluate(() => {
        const out = { cm: 0, monaco: 0, textarea: 0, contenteditable: 0, buttons: [] };
        out.cm = document.querySelectorAll(".cm-editor, .cm-content").length;
        out.monaco = document.querySelectorAll(".monaco-editor").length;
        out.textarea = document.querySelectorAll("textarea").length;
        out.contenteditable = document.querySelectorAll('[contenteditable="true"]').length;
        for (const el of document.querySelectorAll("button")) {
          const t = (el.textContent || "").trim();
          if (/add to chart|compile|save/i.test(t) && t.length < 40) out.buttons.push(t);
        }
        return out;
      });
      console.log("FRAME", f.url().slice(0, 60), JSON.stringify(res));
    } catch {
      /* cross-origin */
    }
  }

  const shot = await screenshot(page, "pine-open.png");
  console.log("SHOT:", shot);
} finally {
  await close(browser);
}
