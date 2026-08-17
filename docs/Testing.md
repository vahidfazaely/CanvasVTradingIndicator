# Testing — MyBuySellIndicator (TradingView)

How we verify the indicator behaves correctly in TradingView.

---

## 1. Compilation

1. Open the Pine Editor and paste `TradingView/MyBuySellIndicator.pine`.
2. Click **Save** — the script must compile with **zero errors**.
3. Click **Add to chart**.

If a compile error appears, note the line number and message; fixes are made in the canonical source and re-tested.

## 2. Timeframe matrix

The indicator must be attached to every supported timeframe and produce sensible signals:

`1m, 3m, 5m, 15m, 30m, 1H, 2H, 4H, 6H, 12H, 1D, 1W`

For each timeframe, verify:

- The panel shows the correct `Timeframe` value.
- The trend field is labelled `H4 Trend` (chart TF < H4) or `Trend (chart TF)` (chart TF ≥ H4).
- EMA/ADX/ATR values in the panel make sense for the timeframe.
- Signals appear only on closed candles (see §4).

## 3. Cross-check against built-in indicators

Add TradingView's built-in indicators to a separate pane and compare with the panel:

| Panel field | Built-in to compare |
|---|---|
| ADX | `ADX (14)` — value should match the panel ADX |
| ATR | `Average True Range (14)` — value should match |
| Entry EMAs | `EMA 9` / `EMA 21` plotted on the chart |
| H4 EMA 50/200 | Plot on an H4 chart and compare levels |

Any mismatch in value or timing indicates a bug.

## 4. Repaint / lookahead verification

This is the most important test. Procedure:

1. Wait for a signal arrow to appear.
2. **Do not touch anything** — if the arrow's bar, direction, or Entry/SL/TP levels change after appearing, the script repaints and fails the test.
3. Watch a live bar form: no arrow may appear before the bar closes, and a signal that appears mid-bar and then disappears is a repaint failure.
4. Scroll far back in history: arrows on old bars must be stable across reloads.
5. Switch the chart timeframe and switch back — signal placement must not change.

The design guarantees: H4 values come from the **last closed H4 candle** (`lookahead_off`, step-constant), entry signals are gated by `barstate.isconfirmed`, and no `lookahead_on` is used.

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
- `Show Entry EMA 9/21`
- `Show BUY/SELL markers`
- `Show Entry/SL/TP1/TP2 lines`
- `Show info panel`

Toggling level lines on must restore the **latest signal's** levels; toggling off must remove them.

## 7. Optional filters

For each optional filter (EMA separation, price vs EMA21, H4 momentum, ATR volatility, volume):

1. Enable it, set an extreme threshold (e.g., impossible-to-pass) — no signals should fire.
2. Set a permissive threshold — signals should return.
3. Verify the score/max updates when weights are changed.

## 8. MT5 parity (informational)

The TradingView and MT5 versions implement the same core logic but are **not** expected to be tick-identical:

- TradingView uses exchange-timezone H4 candles; MT5 uses broker server time — H4 bar boundaries can shift slightly.
- The MT5 version is M15-attached and has fixed 25/25/25/25 scoring; the TradingView version is multi-timeframe with configurable weights.
- Compare *patterns* (same signals on the same dates at the same H4 alignment), not exact arrow positions.

## 9. Backtest (future)

A Pine `strategy()` backtest version is planned. Until then, manual chart verification is the primary testing method.
