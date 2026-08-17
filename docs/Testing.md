# Testing — CanvasV MTF Signal (TradingView)

How we verify the indicator behaves correctly in TradingView.

---

## 1. Compilation

1. Open the Pine Editor and paste `TradingView/MyBuySellIndicator.pine`.
2. Click **Save** — the script must compile with **zero errors**.
3. Click **Add to chart**.

If a compile error appears, note the line number and message; fixes are made in the canonical source and re-tested.

## 2. Timeframe matrix (signal-engine policy)

The signal engine is a **3-timeframe system: 15m / 1H / 4H**. Attach the indicator to each timeframe and verify the matrix exactly:

| Chart TF | Signal engine | Panel TIMEFRAME | Panel STATUS |
|---|---|---|---|
| 1m | **BLOCKED** | `1m` | `SIGNALS DISABLED` (red) + reason `Use 15m / 1H / 4H` |
| 3m | **BLOCKED** | `3m` | `SIGNALS DISABLED` (red) + reason |
| 5m | **BLOCKED** | `5m` | `SIGNALS DISABLED` (red) + reason |
| 15m | **ENABLED** | `15M SIGNAL` | `SIGNAL ENGINE ENABLED` (green) |
| 30m | **BLOCKED** | `30m` | `SIGNALS DISABLED` (red) + reason |
| 1H | **ENABLED** | `1H SIGNAL` | `SIGNAL ENGINE ENABLED` (green) |
| 2H | **BLOCKED** | `2H` | `SIGNALS DISABLED` (red) + reason |
| 4H | **ENABLED** | `4H SIGNAL` | `SIGNAL ENGINE ENABLED` (green) |
| 6H | **BLOCKED** | `6H` | `SIGNALS DISABLED` (red) + reason |
| 12H | **BLOCKED** | `12H` | `SIGNALS DISABLED` (red) + reason |
| 1D | **BLOCKED** | `1D` | `SIGNALS DISABLED` (red) + reason |
| 1W | **BLOCKED** | `1W` | `SIGNALS DISABLED` (red) + reason |

For every **BLOCKED** timeframe verify:

- **No BUY/SELL markers** appear, in history or live (the `isSupportedSignalTF` gate disables the engine in code, not just visually).
- **No Entry/SL/TP1/TP2 level lines or labels** are created.
- **No `Score …` signal label** is created.
- **No alerts fire**, and no alert can be triggered from the Alerts dialog on signals (the alert conditions require `buySig`/`sellSig`, which require the gate).
- The panel shows `SIGNALS DISABLED` and `Use 15m / 1H / 4H`.
- With `Signal Audit Mode` on, the audit table shows `SIGNAL TF <chart TF>`, `SIGNAL MODE DISABLED`, and `REASON Use 15m / 1H / 4H` — and nothing else.

For every **ENABLED** timeframe (15m / 1H / 4H) verify:

- BUY/SELL/STRONG markers fire on **confirmed closed candles** only.
- On 15m: the 4H trend and 1H confirmation come from `request.security`; ADX/ATR are 15m values.
- On 1H: the `1H CONF` row uses the chart series; the 4H trend comes from `request.security`.
- On 4H: the trend uses the chart series (self mode) — signals fire only at candle close, the panel reads the trend with `[1]`, and the **forming 4H candle never produces a signal**.
- Signals appear only on closed candles (see §4).

## 2a. Gate-by-gate test matrix (Phase 1, v2.5.0)

Each gate must be verifiable independently. With `Signal Audit Mode` on, a rejected candidate shows the **first failed gate** in the `REASON` row.

| # | Test | How | Expected |
|---|---|---|---|
| 1 | 5m blocked | Attach to 5m | `SIGNALS DISABLED` + reason; no markers/levels/labels/alerts |
| 2 | 15m enabled | Attach to 15m | `SIGNAL ENGINE ENABLED`; signals fire |
| 3 | 1H enabled | Attach to 1H | `SIGNAL ENGINE ENABLED`; signals fire |
| 4 | 4H enabled | Attach to 4H | `SIGNAL ENGINE ENABLED`; signals only at candle close |
| 5 | Flat 4H slope | Observe a 4H candle where EMA50 ≈ EMA50[prev] (or set Min separation = 99%) | Regime `NEUTRAL`; no signal; reason `4H REGIME` |
| 6 | Insufficient 4H separation | Set `Min 4H regime separation` above the current value | No signal; reason `4H REGIME` |
| 7 | Weak 1H momentum | Watch a 1H pullback (1H close below 1H EMA21 during an up-move) | No signal; reason `1H MOMENTUM` |
| 8 | Invalid EMA structure | Observe a bar where close < EMA9 while EMA9 > EMA21 | No signal; reason `ENTRY STRUCTURE` |
| 9 | No fresh crossover | Any bar without a cross | No signal; no REASON (no candidate) |
| 10 | Bearish BUY candle | A BUY-candidate bar that closes below its open | No signal; reason `CANDLE QUALITY` |
| 11 | Body < 50% | Set `Min candle body` = 99% | No signal; reason `CANDLE QUALITY` |
| 12 | ADX < 18 | Set `ADX Minimum` = 99 | No signal; reason `ADX` |
| 13 | ATR% < 0.05% | Set `Min volatility` = 99 | No signal; reason `VOLATILITY` |
| 14 | Price > 1.5 ATR from EMA9 | Set `Max entry distance` = 0.1 | No signal; reason `CHASING` |
| 15 | Valid setup, score decides | Restore defaults; on a candidate that passes all gates but scores < 75 | No signal; reason `SCORE TOO LOW`; a fully passing candidate produces a normal signal |

Restore defaults after each test (panel shows `v3.2.0`).

## 2c. Signal diagnostic / outcome logger tests (v3.2.0)

Diagnostic Mode is observational only — it must never change signal behavior. The `Diagnostics` input group: `Signal Diagnostic Mode` (off), `Diagnostic history size` (25/50/100), `Outcome tracking bars` (10/20/40), `Enable diagnostic CVLOG alerts` (off).

| # | Test | How | Expected |
|---|---|---|---|
| A | Diagnostic OFF | Default settings; compare against v3.1.0 | **No behavioral change**: same signals, no extra labels/tables/arrows; the `Diagnostics` inputs are the only additions |
| B | Diagnostic ON | Enable `Signal Diagnostic Mode` on 15m | `CANVASV DIAGNOSTICS` summary table + `— LAST DIAGNOSTIC —` detail table appear; events accumulate |
| C | Accepted signal | Wait for/scroll to a BUY or SELL | Event row `… SIGNAL <score> · E … · R …A · RR …`; detail `EVENT` reads `SIGNAL`; score/position rows match the panel and on-chart levels exactly |
| D | Rejected candidate | Force a gate failure (e.g. `ADX Minimum` = 99) | Event row `… REJECTED · ADX`; detail `REASON` = `ADX` with the actual value (`ADX 14.2 ✗ (min 99)`); first failed gate only |
| E | Score equality | On any event, compare detail `SCORE` with the panel score | Diagnostic score/max/breakdown **equal** the signal engine's `buyScore`/`sellScore`/`maxScore` (same variables, no recalculation) |
| F | Position equality | Compare detail `POSITION`/`RISK/RR` with the on-chart Entry/SL/TP lines and panel | Entry/SL/TP1/TP2/Risk/R:R identical to the displayed values |
| G | MFE/MAE start after signal | Note the signal bar; watch the `TRACK` row | No `TRACK` update on the signal bar itself — counting and MFE/MAE begin on the bar AFTER the signal candle |
| H | SL/TP ambiguity | Find a signal whose candle touches both SL and any TP | `OUTCOME` = `AMBIGUOUS` (order unknowable from OHLC); no invented intrabar ordering |
| I | Reload determinism | Reload the chart with Diagnostic Mode on | The same historical events reappear in the same order with identical values (replayed from the same confirmed data) |
| J | Supported TFs | Repeat B–H on 15m, 1H, 4H | Same behavior; `TRACK` counts entry-TF bars |
| K | Blocked TF | Enable Diagnostic Mode on 5m/30m/2H | No events (0 events header), no REASON rows — the disabled engine generates no diagnostics; tables show empty state |

## 2b. Position / risk engine tests (Phase 2, v3.1.0)

| # | Test | How | Expected |
|---|---|---|---|
| A | BUY structural SL | On a valid BUY signal, compare the chart SL line | `SL = lowest(low, 10)[1] − 0.5×ATR` (swing of the 10 bars *before* the signal candle) |
| B | SELL structural SL | On a valid SELL signal, compare the chart SL line | `SL = highest(high, 10)[1] + 0.5×ATR` |
| C | Current-candle exclusion | After a BUY signal, inspect the SL formula in Audit Mode (`STRUCT SL` row); mentally recompute with the signal candle's own low | Changing the signal candle's low/high cannot change the structural SL — the `[1]` excludes it |
| D | Minimum-risk fallback | Force a tight structure (e.g. set `Structure buffer` high, or find a signal whose swing is within the buffer) | SL falls back to `Entry ∓ 1.5×ATR`; Audit Mode `SL MODE` = `ATR FALLBACK`; signal still fires |
| E | Maximum-risk rejection | Force risk > 2.5 ATR (e.g. set `Maximum risk` = 0.6) on an otherwise valid setup | **No signal** — no marker, no levels, no alert; Audit Mode `REASON` = `RISK TOO LARGE` |
| F | R-based TP | On a valid BUY: `(TP1 − Entry)/Risk = 1.0`, `(TP2 − Entry)/Risk = 2.5` (mirror for SELL) | Exact ratios (Audit Mode `TP1 R` / `TP2 R` rows) |
| G | Reload stability | After a signal, reload the chart | Entry, SL, TP1, TP2, RISK, R:R all unchanged |
| H | Supported-timeframe matrix | Repeat A–G on 15m, 1H, and 4H; re-verify blocked timeframes (5m/30m/2H/…) show no levels | Same behavior on all three; blocked charts unchanged |
| I | Alerts | Risk-rejected setup (test E) with alerts enabled; then a valid setup | Risk-rejected: **zero alerts**. Valid: exactly one alert at confirmed close |
| J | UI cleanliness | Inspect the chart after a signal | Normal mode shows only the existing markers, score label, and latest Entry/SL/TP1/TP2 lines — no extra objects; panel gains only `RISK` and `R:R` rows |

## 3. Cross-check against built-in indicators

Add TradingView's built-in indicators to a separate pane and compare with the panel:

| Panel field | Built-in to compare |
|---|---|
| ADX | `ADX (14)` — value should match the panel ADX |
| ATR | `Average True Range (14)` — value should match |
| M15 EMAs | `EMA 9` / `EMA 21` plotted on a 15m chart |
| 1H EMAs | `EMA 21` / `EMA 50` plotted on a 1H chart |
| 4H EMA 50/200 | Plot on a 4H chart and compare levels |

Any mismatch in value or timing indicates a bug.

## 4. Repaint / lookahead verification

This is the most important test. Procedure:

1. Wait for a signal arrow to appear.
2. **Do not touch anything** — if the arrow's bar, direction, or Entry/SL/TP levels change after appearing, the script repaints and fails the test.
3. Watch a live bar form: no arrow may appear before the bar closes, and a signal that appears mid-bar and then disappears is a repaint failure.
4. Scroll far back in history: arrows on old bars must be stable across reloads.
5. Switch the chart timeframe and switch back — signal placement must not change.

The design guarantees: 4H values come from the **last completed 4H candle** (`lookahead_off`, step-constant during the forming 4H candle), the 1H confirmation comes from the **last closed 1H candle** (same methodology), entry signals are gated by `barstate.isconfirmed`, and no `lookahead_on` is used.

### Specific HTF (4H) repaint test

1. Attach to an **15m** chart.
2. Note the panel's H4 Trend field while a 4H candle is **forming**: it must read a fixed BULLISH/BEARISH value and **must not change** as 15m ticks arrive during that 4H candle.
3. When the 4H candle closes (on the 4-hour grid boundary), the panel may flip — a legitimate update to the newly completed candle.
4. The **4H EMA 50/200 lines on the chart must be flat** throughout each forming 4H candle (step-constant), never sloping tick-by-tick.
5. Scroll back across a previous 4H boundary: the 4H value shown on each 15m bar must equal the last 4H candle that completed at or before that bar's close time.
6. Reload the chart: every historical 4H value and signal must be identical to the pre-reload state.
7. Repeat the same test for the **1H confirmation** layer: the `1H CONF` row and 1H EMA series must be fixed during each forming 1H candle and update only at 1H boundaries.

A failure of steps 2, 4, 6, or 7 is a repaint bug.

## 5. Alerts

1. Enable `EnableAlerts` in the settings.
2. Create a TradingView alert on the script (or use the exposed `alertcondition`s).
3. Verify on a **supported timeframe** (15m / 1H / 4H):
   - Alerts fire **only when a new signal is confirmed** (at bar close).
   - No alert fires for historical signals when the chart loads.
   - The message contains symbol, timeframe, direction, score, Entry, SL, TP1, TP2.
   - BUY vs STRONG BUY are distinguishable.
4. Verify on a **blocked timeframe** (e.g. 5m): **no alert ever fires**, even if the settings are enabled.

## 6. Visual toggles

Each of these must hide/show the corresponding element immediately:

- `Show H4 EMA 50/200`
- `Show M15 EMA 9/21`
- `Show BUY/SELL markers`
- `Show signal labels` (shows/hides the latest-signal `Score 75` label; the marker direction labels remain)
- `Show Entry/SL/TP1/TP2 lines`
- `Show info panel`
- `Signal Audit Mode` (Visuals group, default off) — when on, an audit table appears below the info panel on **any** chart; when off, no audit table and the chart is identical to the default.

## 6a. Signal Audit Mode verification

1. On a **supported timeframe** (15m / 1H / 4H), enable `Signal Audit Mode`, wait for a signal (or scroll to an existing one), and verify:
   - `SIGNAL TF` reads `15M` / `1H` / `4H`; `SIGNAL MODE` reads `ENABLED` (green).
   - SIGNAL/SCORE match the main panel's LAST SIGNAL values exactly.
   - 4H TREND / 4H SLOPE / 1H CONF / ENTRY / ADX pass-fail marks and score contributions sum to the displayed TOTAL, and TOTAL equals the panel score.
   - ENTRY / SL / TP1 / TP2 match the on-chart level lines exactly.
   - ADX and EMA values match the built-in indicators from §3.
   - BAR shows symbol, timeframe, and the signal candle's time; CONFIRMED reads `YES - closed candle` (green).
2. On a **blocked timeframe** (e.g. 5m): the audit table shows only `SIGNAL TF 5M`, `SIGNAL MODE DISABLED` (red), and `REASON Use 15m / 1H / 4H`.
3. Disable the mode: the audit table disappears and the chart looks exactly as before.

Toggling level lines on must restore the **latest signal's** levels; toggling off must remove them.

## 7. Optional filters

For each optional filter (EMA separation, price vs EMA21, H4 momentum, ATR volatility, volume):

1. Enable it, set an extreme threshold (e.g., impossible-to-pass) — no signals should fire.
2. Set a permissive threshold — signals should return.
3. Verify the score/max updates when weights are changed.

## 8. Config validation

With invalid settings, the panel must show `CONFIG ERROR` (red header) with a reason, and **no signals may fire**:

1. Set 4H EMA Fast = 200, Slow = 50 (fast ≥ slow) → reason `EMA fast >= slow`.
2. Set 1H EMA Fast = 50, Slow = 21 → reason `EMA fast >= slow`.
3. Set M15 EMA Fast = 21, Slow = 9 → reason `EMA fast >= slow`.
4. Set all scoring weights to 0 → reason `all weights are 0`.
5. Set Minimum Score = 200 with default weights (max 100) → reason `min score > max`.
6. Set `Maximum risk (ATR)` = 0.5 and `Minimum risk (ATR)` = 0.6 (max ≤ min) → reason `risk config invalid`; signals suppressed.
7. Set `TP2 R multiple` = 1.0 and `TP1 R multiple` = 1.5 (TP2 ≤ TP1) → reason `risk config invalid`; signals suppressed.
8. Restore defaults → the header returns to `MARKET` and signals resume.

Each change must take effect immediately after re-running the script on the chart.

## 9. MT5 parity (informational)

The TradingView and MT5 versions implement the same core logic but are **not** expected to be tick-identical:

- TradingView uses exchange-timezone 4H candles; MT5 uses broker server time — 4H bar boundaries can shift slightly.
- The MT5 version is M15-attached with the H4 trend and M15 entry; the TradingView v2.4.0 architecture is a 15m / 1H / 4H signal-engine system with a 1H confirmation layer.
- Compare *patterns* (same signals on the same dates at the same H4 alignment), not exact arrow positions.

## 10. Backtest (future)

A Pine `strategy()` backtest version is planned. Until then, manual chart verification is the primary testing method.
