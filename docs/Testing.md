# Testing — CanvasV MTF Signal (TradingView)

How we verify the indicator behaves correctly in TradingView.

---

## 1. Compilation

1. Open the Pine Editor and paste `TradingView/MyBuySellIndicator.pine`.
2. Click **Save** — the script must compile with **zero errors**.
3. Click **Add to chart**.

If a compile error appears, note the line number and message; fixes are made in the canonical source and re-tested.

## 2. Timeframe matrix

The indicator uses a **fixed three-layer architecture** (4H trend + 1H confirmation + 15M entry). Attach it to each timeframe and verify:

`1m, 5m, 15m, 30m, 1H, 2H, 4H, 6H, 12H, 1D`

| Chart TF | Expected panel role | Expected status | Signals |
|---|---|---|---|
| 1m / 5m / 30m / 2H / 6H / 12H / 1D | the chart TF (e.g. `30m`) | `ENTRY SIGNALS DISABLED - M15 ONLY` (red) | **none** |
| 15m | `M15 ENTRY` | `ENTRY ACTIVE` (green) | BUY/SELL/STRONG fire here |
| 1H | `1H CONFIRMATION` | `CONTEXT - NO ENTRIES` | none |
| 4H | `4H TREND` | `CONTEXT - NO ENTRIES` | none |

For each timeframe verify:

- The panel shows the correct `TIMEFRAME` / `STATUS` values per the table above.
- **Signals only ever appear on the 15m chart** — on every other timeframe the arrows must never print, even in history (the `isM15` gate disables them in code, not just visually).
- On 15m: trend field reads `H4 TREND`, the `1H CONF` row shows the 1H EMA alignment, and ADX is the 15m value.
- On 1H: the `1H CONF` row uses the chart series; on 4H: the trend uses the chart series (self mode) and the panel reads it with `[1]`.
- Signals appear only on closed candles (see §4).

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
3. Verify:
   - Alerts fire **only when a new signal is confirmed** (at bar close).
   - No alert fires for historical signals when the chart loads.
   - The message contains symbol, timeframe, direction, score, Entry, SL, TP1, TP2.
   - BUY vs STRONG BUY are distinguishable.

## 6. Visual toggles

Each of these must hide/show the corresponding element immediately:

- `Show H4 EMA 50/200`
- `Show M15 EMA 9/21`
- `Show BUY/SELL markers`
- `Show signal labels` (shows/hides the latest-signal `Score 75` label; the marker direction labels remain)
- `Show Entry/SL/TP1/TP2 lines`
- `Show info panel`
- `Signal Audit Mode` (Visuals group, default off) — when on, an audit table appears below the info panel **on 15m charts only** with the latest signal's exact values; when off, no audit table and the chart is identical to the default.

## 6a. Signal Audit Mode verification

1. Attach to **15m**, enable `Signal Audit Mode`, wait for a signal (or scroll to an existing one), and verify:
   - SIGNAL/SCORE match the main panel's LAST SIGNAL values exactly.
   - 4H TREND / 4H SLOPE / 1H CONF / M15 ENTRY / ADX pass-fail marks and score contributions sum to the displayed TOTAL, and TOTAL equals the panel score.
   - ENTRY / SL / TP1 / TP2 match the on-chart level lines exactly.
   - ADX and EMA values match the built-in indicators from §3.
   - BAR shows symbol, timeframe, and the signal candle's time; CONFIRMED reads "YES - closed candle".
2. On **non-15m charts** the audit table must not appear even when the mode is on.

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
6. Restore defaults → the header returns to `MARKET` and signals resume.

Each change must take effect immediately after re-running the script on the chart.

## 9. MT5 parity (informational)

The TradingView and MT5 versions implement the same core logic but are **not** expected to be tick-identical:

- TradingView uses exchange-timezone 4H candles; MT5 uses broker server time — 4H bar boundaries can shift slightly.
- The MT5 version is M15-attached with the H4 trend and M15 entry; the TradingView v2.3.0 architecture adds the 1H confirmation layer.
- Compare *patterns* (same signals on the same dates at the same H4 alignment), not exact arrow positions.

## 10. Backtest (future)

A Pine `strategy()` backtest version is planned. Until then, manual chart verification is the primary testing method.
