# CanvasV MTF Signal

A multi-timeframe **4H Trend + 1H Confirmation + 15M Entry** buy/sell indicator, with two implementations maintained side by side:

| Platform | Language | File |
|---|---|---|
| TradingView | Pine Script v5 | [`TradingView/MyBuySellIndicator.pine`](TradingView/MyBuySellIndicator.pine) |
| MetaTrader 5 | MQL5 | [`MT5/MyBuySellIndicator.mq5`](MT5/MyBuySellIndicator.mq5) |

> This repository is the **canonical source of truth** for the project. Changes to the indicator are made here first and then deployed to each platform.

---

## What it is

A non-repainting trend-following signal system built on a simple, explicit rule set:

1. **Trend filter** — 4H EMA 50/200 (plus an EMA 50 slope check).
2. **Confirmation** — 1H EMA fast/slow alignment (EMA 21/50).
3. **Entry trigger** — 15M EMA 9/21 crossover + ADX strength filter.
4. **Risk** — ATR-based Entry / SL / TP1 / TP2 levels.
5. **Confidence** — a 0–100 signal score with a configurable minimum.

No RSI, no volume-based market structure, no machine learning. The logic is deliberately small and inspectable.

---

## TradingView version

- **Fixed three-layer architecture:** **4H** = market trend (EMA 50/200 + slope), **1H** = intermediate confirmation (EMA 21/50), **15M** = entry trigger (EMA 9/21 cross + ADX + ATR).
- **Signals fire ONLY on the 15M chart** — one consistent strategy, no per-timeframe variants. On **1H** the indicator shows the confirmation/context view; on **4H** the trend/context view; on **every other timeframe** (1m/3m/5m/30m/2H/6H/12H/D/W…) BUY/SELL signals are **actually disabled** (not just hidden) and the panel shows `ENTRY SIGNALS DISABLED - M15 ONLY`.
- **4H trend** is fetched with four single-line `request.security(..., "240", lookahead = barmerge.lookahead_off)` calls — one per value, each guaranteed to hold the **last completed 4H candle** (step-constant during the forming 4H candle; signals only ever see confirmed 4H values). No repaint, no lookahead.
- **1H confirmation** uses the same methodology on `"60"`. On the 4H chart itself the trend is computed on the chart series (self mode, confirmed at close); on the 1H chart the confirmation uses the chart series. All signals fire only on **confirmed closed candles** (`barstate.isconfirmed`).
- **Configurable scoring weights** with a default equivalent to the original 100-point model (25/25/25/25, minimum 75), plus optional **STRONG BUY / STRONG SELL** (threshold 100).
- **Optional quality filters** (all off by default): EMA separation %, price vs EMA 21, H4 momentum, ATR volatility regime, volume confirmation.
- **Config validation:** EMA periods must satisfy Fast < Slow, not all weights can be zero, and the minimum score cannot exceed the maximum achievable score — otherwise signals are suppressed and the panel shows `CONFIG ERROR` with the reason.
- **Signal Audit Mode** (default off): a debug-only diagnostic table (15M charts only) showing the exact values and conditions that produced the latest confirmed signal — 4H trend/slope, 1H confirmation, 15M entry trigger, ADX, score breakdown, ATR levels, and signal bar. Presentation only; when off the chart is unchanged.
- **Visuals:** H4 EMAs, entry EMAs, BUY/SELL/STRONG markers with direction labels, a latest-signal score label, the latest Entry/SL/TP1/TP2 lines, and a two-section info panel (MARKET / LAST SIGNAL) — every element individually toggleable (incl. the score label).

## MT5 version

- **Phase 2 (v2.00)** of the MQL5 build: H4 trend + **M15 entry** (the MT5 version is M15-attached by design), ADX filter, H4 slope filter, ATR SL/TP1/TP2, 0–100 scoring, info panel, and input groups.
- Compiles with **0 errors / 0 warnings** in MetaEditor.

---

## Signal logic overview

### 4H trend (both platforms)

- **Bullish:** H4 EMA 50 > H4 EMA 200
- **Bearish:** H4 EMA 50 < H4 EMA 200
- **Slope (BUY):** closed H4 EMA 50 ≥ previous closed H4 EMA 50
- **Slope (SELL):** closed H4 EMA 50 ≤ previous closed H4 EMA 50
- Closed H4 candles only. No lookahead. No repainting.

### 1H confirmation

- **Bullish:** 1H EMA 21 > 1H EMA 50 (last closed 1H candle)
- **Bearish:** 1H EMA 21 < 1H EMA 50

### EMA 9/21 entry (15M)

- **Bullish crossover:** previous EMA 9 ≤ previous EMA 21 AND current EMA 9 > current EMA 21
- **Bearish crossover:** previous EMA 9 ≥ previous EMA 21 AND current EMA 9 < current EMA 21
- Evaluated on the **15M chart** (closed candles only).

### ADX filter

- ADX period 14, minimum 20, computed on the entry timeframe, closed candle only.

### ATR SL/TP

- ATR period 14. **BUY:** SL = Entry − ATR×1.5, TP1 = Entry + ATR×1.5, TP2 = Entry + ATR×3.0. **SELL:** mirrored. Entry = signal candle close. Multipliers configurable.

### Signal scoring

- Each satisfied component adds its weight (defaults: trend 25, **1H confirmation** 25, ADX 25, slope 25; max 100).
- **BUY** requires: 4H bullish AND 1H bullish confirmation AND 15M bullish crossover AND score ≥ minimum (default 75), on an **M15 chart**. **SELL** mirrored.
- **STRONG** signals require a higher score threshold (default 100), optional.

---

## Non-repainting requirement

This is a hard requirement, not a preference:

- Signals are only generated **after the signal candle closes** (`barstate.isconfirmed`).
- Higher-timeframe values are the **last completed H4 candle**: with `lookahead_off`, each H4 value is step-constant during the forming H4 candle and only updates when an H4 candle completes. At the exact H4 boundary bar the value is the just-completed candle's final value — confirmed data at that bar's close.
- The H4 EMA 50 slope compares **two consecutive closed H4 candles** (`[1]` applied *inside* the H4 context of `request.security`).
- No `lookahead_on` is used anywhere.
- A signal, once printed, never moves or disappears.

See [`docs/Testing.md`](docs/Testing.md) for the repaint verification procedure.

---

## Documentation

- [`docs/Strategy.md`](docs/Strategy.md) — precise signal logic and defaults.
- [`docs/Changelog.md`](docs/Changelog.md) — version history.
- [`docs/Testing.md`](docs/Testing.md) — how we test the indicator in TradingView.

## Development status

- **TradingView:** `v2.3.0` — three-layer TF architecture (4H trend + 1H confirmation + 15M entry), entries only on M15 charts — working and compiling in the Pine Editor.
- **MT5:** Phase 2 `v2.00` — working on M15 charts.
- **Next milestone:** a Pine `strategy()` backtest version (planned, not yet implemented).
