# MyBuySellIndicator

A multi-timeframe **H4 Trend + EMA Crossover** buy/sell indicator, with two implementations maintained side by side:

| Platform | Language | File |
|---|---|---|
| TradingView | Pine Script v5 | [`TradingView/MyBuySellIndicator.pine`](TradingView/MyBuySellIndicator.pine) |
| MetaTrader 5 | MQL5 | [`MT5/MyBuySellIndicator.mq5`](MT5/MyBuySellIndicator.mq5) |

> This repository is the **canonical source of truth** for the project. Changes to the indicator are made here first and then deployed to each platform.

---

## What it is

A non-repainting trend-following signal system built on a simple, explicit rule set:

1. **Trend filter** — H4 EMA 50/200 (plus an EMA 50 slope check).
2. **Entry trigger** — current-timeframe EMA 9/21 crossover.
3. **Confirmation** — ADX strength filter.
4. **Risk** — ATR-based Entry / SL / TP1 / TP2 levels.
5. **Confidence** — a 0–100 signal score with a configurable minimum.

No RSI, no volume-based market structure, no machine learning. The logic is deliberately small and inspectable.

---

## TradingView version

- **Works on every chart timeframe** (1m, 3m, 5m, 15m, 30m, 1H, 2H, 4H, 6H, 12H, 1D, 1W).
- **H4 trend** is fetched with `request.security(..., "240", lookahead = barmerge.lookahead_off)` — always the **last closed H4 candle**, never the forming one, so it cannot repaint.
- When the chart timeframe is **≥ H4** (4H, 6H, 12H, D, W), the trend is computed on the chart timeframe itself ("self mode") and labelled in the panel.
- **Entry** (EMA 9/21 cross, ADX, ATR) always uses the **current chart timeframe** and fires only on **confirmed closed candles** (`barstate.isconfirmed`).
- **Configurable scoring weights** with a default equivalent to the original 100-point model (25/25/25/25, minimum 75), plus optional **STRONG BUY / STRONG SELL** (threshold 100).
- **Optional quality filters** (all off by default): EMA separation %, price vs EMA 21, H4 momentum, ATR volatility regime, volume confirmation.
- **Visuals:** H4 EMAs, entry EMAs, BUY/SELL/STRONG markers, the latest Entry/SL/TP1/TP2 lines, and a compact info panel — every element individually toggleable.

## MT5 version

- **Phase 2 (v2.00)** of the MQL5 build: H4 trend + **M15 entry** (the MT5 version is M15-attached by design), ADX filter, H4 slope filter, ATR SL/TP1/TP2, 0–100 scoring, info panel, and input groups.
- Compiles with **0 errors / 0 warnings** in MetaEditor.

---

## Signal logic overview

### H4 trend (both platforms)

- **Bullish:** H4 EMA 50 > H4 EMA 200
- **Bearish:** H4 EMA 50 < H4 EMA 200
- **Slope (BUY):** closed H4 EMA 50 ≥ previous closed H4 EMA 50
- **Slope (SELL):** closed H4 EMA 50 ≤ previous closed H4 EMA 50
- Closed H4 candles only. No lookahead. No repainting.

### EMA 9/21 entry

- **Bullish crossover:** previous EMA 9 ≤ previous EMA 21 AND current EMA 9 > current EMA 21
- **Bearish crossover:** previous EMA 9 ≥ previous EMA 21 AND current EMA 9 < current EMA 21

### ADX filter

- ADX period 14, minimum 20, computed on the entry timeframe, closed candle only.

### ATR SL/TP

- ATR period 14. **BUY:** SL = Entry − ATR×1.5, TP1 = Entry + ATR×1.5, TP2 = Entry + ATR×3.0. **SELL:** mirrored. Entry = signal candle close. Multipliers configurable.

### Signal scoring

- Each satisfied component adds its weight (defaults: trend 25, momentum 25, ADX 25, slope 25; max 100).
- **BUY** requires: H4 bullish AND bullish crossover AND score ≥ minimum (default 75). **SELL** mirrored.
- **STRONG** signals require a higher score threshold (default 100), optional.

---

## Non-repainting requirement

This is a hard requirement, not a preference:

- Signals are only generated **after the signal candle closes**.
- Higher-timeframe values are always the **last closed H4 candle** (confirmed, step-constant values).
- No `lookahead_on`, no `[1]`-style future data, no `request.security` with lookahead.
- A signal, once printed, never moves or disappears.

See [`docs/Testing.md`](docs/Testing.md) for the repaint verification procedure.

---

## Documentation

- [`docs/Strategy.md`](docs/Strategy.md) — precise signal logic and defaults.
- [`docs/Changelog.md`](docs/Changelog.md) — version history.
- [`docs/Testing.md`](docs/Testing.md) — how we test the indicator in TradingView.

## Development status

- **TradingView:** multi-timeframe baseline `v2.0.0` — working and compiling in the Pine Editor.
- **MT5:** Phase 2 `v2.00` — working on M15 charts.
- **Next milestone:** a Pine `strategy()` backtest version (planned, not yet implemented).
