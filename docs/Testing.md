# Testing — CanvasV V4 FAST

How to verify the strategy in TradingView and locally. Current baseline: **v4.3.4** (behavior identical to v4.3.0).

---

## 1. TradingView checks

### 1a. Load the script

1. Open the Pine Editor and paste `TradingView/CanvasV_V4_FAST.pine`.
2. It must compile with no errors or warnings. Add to a **15m** chart (any symbol; crypto 15m is the researched baseline).
3. If TradingView reports compile limits, use `TradingView/CanvasV_V4_FAST_lite.pine` instead — it is signal-identical (§13 of Strategy.md).

### 1b. Smoke test (NORMAL mode)

- A regime-colored trend line (green/red/gray), ▲/▼ markers, and Entry/SL/TP dotted lines are visible.
- The `CANVASV V4` panel (top-right) shows the version, timeframe, trend, last signal, position, trigger, levels, and W/L counts.
- Open the **Strategy Tester** tab: trades exist, and the list of entries matches the on-chart ▲/▼ markers bar-for-bar.

### 1c. DEBUG mode

1. Set `Visual Mode = DEBUG`. The raw EMA 9/21/50 set, the 15-row research panel, and the `— DECISIONS —` log appear.
2. Toggle back to `NORMAL`: markers, levels, and Strategy Tester results are **unchanged** (visual mode must never affect signals).
3. Reject a candidate mentally: the log's rejection reasons (`REJECT: EXTENDED`, `CANDLE BODY`, `RISK TOO WIDE`, `HV BLOCKED`, …) should agree with the visible bar.

### 1d. Repaint check (hard requirement)

1. Entries print only on **closed** candles — on the realtime bar, no marker may appear before the close.
2. Reload the chart / change timeframe away and back: every historical marker must be in exactly the same place.
3. Scroll far back in history: no marker may shift, vanish, or appear compared to before.
4. Rationale: entries require `barstate.isconfirmed`, swings/ranges exclude the signal bar via `[1]`, and there are no `request.security` / `lookahead_on` calls.

### 1e. Config-error check

Set `Trigger EMA ≥ Direction EMA` (e.g. 21/21). All entries must stop (`cfgOk` false); restore 9/21/50 afterwards.

### 1f. Alerts check

Enable `Enable entry alerts`, create an alert using the `CanvasV V4 BUY` / `CanvasV V4 SELL` condition, and confirm one alert per signal bar (`freq_once_per_bar_close`). Keep diagnostic `V4LOG/V4OUT` alerts off unless collecting data (format in `logs/README.md`).

---

## 2. Local checks (Node.js, no install needed)

Run from `backtest/` (or use `CanvasV-Test.cmd` on Windows):

```bash
cd backtest
node simple-test.mjs BTCUSDT                 # baseline smoke test
node simple-test.mjs BTCUSDT --halves        # 90/90 stability split
node run.mjs --symbol BTCUSDT                # full report + SL-failure analysis

cd ..                                        # repo root for the Pine checks
node scripts/check-pine-structure.mjs TradingView/CanvasV_V4_FAST.pine
node scripts/check-pine-structure.mjs TradingView/CanvasV_V4_FAST_lite.pine
node scripts/check-pine-parity.mjs           # full-vs-lite signal parity
```

Expected production baselines (full window, v4.3.4 defaults — behavior identical to v4.3.0): **BTC 48t / +8.06R · ETH 46t / +7.33R · SOL 38t / +6.58R**. Small differences after data refresh are normal; large ones mean a logic or data change — investigate before trusting results.

Other harnesses:

- `node web-test.mjs --open` — Web Test Lab dashboard (also `CanvasV-Web.cmd`).
- `node sweep.mjs`, `node compare.mjs` — parameter sweep / before-after comparison.
- `node pine-holdout90.mjs`, `node pine-marker-parity.mjs` — Lite numeric parity protocols.
- `node audit-ablation.mjs`, `node quality-latency.mjs`, `node interaction.mjs`, `node hv-validation.mjs`, `node r1-*.mjs`, `node slow-dip-*.mjs`, `node atrstop-ab.mjs` — research/audit scripts; each writes its report to `engine/output/`.
- `node fetch-data.mjs --symbol ETHUSDT --interval 15m --days 180` — refresh Binance 15m data.
- `node serve.mjs` + `chart-viewer.html` — visual trade review.

### 2a. tv-automation (optional)

`tv-automation/` holds Playwright helpers that load the Pine into TradingView and verify markers/Tester output (`verify-*.mjs`, `load-*.mjs`). Needs `npm install` in that folder and a local Chrome profile. This area is experimental — see the folder's scripts directly; treat it as a helper, not a gate.

---

## 3. Release checklist (before bumping the version)

1. `check-pine-structure` passes on **both** `.pine` files.
2. `check-pine-parity` passes (full vs lite).
3. `simple-test` baselines reproduced on all three symbols (or deltas explained in the new report).
4. `pine-holdout90` passes when the Lite file changed.
5. TradingView §1b–§1d done by eye on a 15m chart.
6. `docs/Changelog.md` entry added; `VERSION` strings and `docs/Strategy.md` updated if logic changed.
