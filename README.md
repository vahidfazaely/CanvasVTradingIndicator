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
4. **Risk** — structural Entry / SL / TP1 / TP2 built from market swings and actual risk (R-based).
5. **Confidence** — a 0–100 signal score with a configurable minimum.

No RSI, no volume-based market structure, no machine learning. The logic is deliberately small and inspectable.

---

## TradingView version

- **Three-layer architecture:** **4H** = market trend (EMA 50/200 + slope), **1H** = intermediate confirmation (EMA 21/50), **entry** = EMA 9/21 cross + ADX + ATR on the chart.
- **Signal engine is a 3-timeframe system — 15m / 1H / 4H only.** On **15m**, **1H**, and **4H** charts the engine is enabled and BUY/SELL signals fire (on 4H the trend uses the chart series, confirmed at candle close). On **every other timeframe** (1m/3m/5m/30m/2H/6H/12H/1D/1W/custom) the engine is gated off by `isSupportedSignalTF`: **no signals, no markers, no Entry/SL/TP levels, no score labels, no alerts** — display/context only. The panel shows `SIGNALS DISABLED` and the reason `Use 15m / 1H / 4H` (red).
- **4H trend** is fetched with four single-line `request.security(..., "240", lookahead = barmerge.lookahead_off)` calls — one per value, each guaranteed to hold the **last completed 4H candle** (step-constant during the forming 4H candle; signals only ever see confirmed 4H values). No repaint, no lookahead.
- **1H confirmation** uses the same methodology on `"60"`. On the 4H chart itself the trend is computed on the chart series (self mode, confirmed at close); on the 1H chart the confirmation uses the chart series. All signals fire only on **confirmed closed candles** (`barstate.isconfirmed`).
- **Configurable scoring weights** with a default equivalent to the original 100-point model (25/25/25/25, minimum 75), plus optional **STRONG BUY / STRONG SELL** (threshold 100).
- **Optional quality filters** (all off by default): EMA separation %, price vs EMA 21, H4 momentum, ATR volatility regime, volume confirmation.
- **Config validation:** EMA periods must satisfy Fast < Slow, not all weights can be zero, and the minimum score cannot exceed the maximum achievable score — otherwise signals are suppressed and the panel shows `CONFIG ERROR` with the reason.
- **Phase 1 quality gates (v2.5.0):** every signal must pass a sequential pipeline of hard gates — 4H regime (direction + strict slope + ≥ 0.10% separation; flat slope → NEUTRAL → no signal), 1H confirmation + 1H momentum (1H close vs 1H EMA21), entry structure (EMA9/EMA21 + close vs EMA9 + gap expansion), candle quality (body ≥ 50%), ADX ≥ 18, ATR/close ≥ 0.05%, and a chasing filter (|close − EMA9|/ATR ≤ 1.5). A gate failure blocks the signal regardless of score. Audit Mode shows the first failed gate as the rejection reason.
- **Phase 2 risk engine (v3.1.0):** the position model no longer uses fixed ATR multiples. Entry = signal candle close; the stop is **structural** — `lowest(low, 10)[1] − 0.5·ATR` for BUY / `highest(high, 10)[1] + 0.5·ATR` for SELL (mandatory `[1]`, so the signal candle never defines its own swing). **Risk** = |Entry − SL|. If the structural stop is too tight (< 0.5·ATR) the model falls back to the documented `1.5·ATR` stop; if **risk > 2.5·ATR** the setup is **rejected outright** (hard risk gate — no marker, no levels, no alert). TP1 = Entry ± 1.0R, TP2 = Entry ± 2.5R — both derived from actual risk, never from ATR. The panel shows `RISK` (in ATR) and `R:R`; Audit Mode shows the full breakdown (STRUCT SL, FINAL SL, SL MODE, RISK, RISK ATR, TP1 R, TP2 R, R:R).
- **Signal Audit Mode** (default off): a debug-only diagnostic table that first reports the timeframe policy — `SIGNAL TF` (15M/1H/4H or the chart TF) and `SIGNAL MODE` (`ENABLED` / `DISABLED`, with the reason `Use 15m / 1H / 4H` on unsupported charts). On supported timeframes it additionally shows the exact values and conditions that produced the latest confirmed signal — 4H trend/slope, 1H confirmation, entry trigger, ADX, score breakdown, ATR levels, and signal bar with `CONFIRMED YES`. Presentation only; when off the chart is unchanged.
- **Signal Decision Logger (v3.3.0, Visuals group, default off):** a **data-collection** layer that answers *why* a candidate was accepted or rejected. Every confirmed candidate on a supported timeframe (a fresh EMA9/21 crossover) is logged with the exact engine values (4H regime/slope/separation, 1H structure/momentum, entry structure/position/EMA-expansion, candle, ADX/ATR%/chasing, full score breakdown, Entry/SL/TP/Risk/R:R) and the **first failing condition** in pipeline order — `4H REGIME` / `4H SLOPE` / `4H SEPARATION` / `1H STRUCTURE` / `1H MOMENTUM` / `ENTRY STRUCTURE` / `ENTRY POSITION` / `EMA EXPANSION` / `NO TRIGGER` / `CANDLE DIRECTION` / `CANDLE BODY` / `ADX` / `VOLATILITY` / `CHASING` / `INVALID STRUCTURE` / `RISK TOO LARGE` / `SCORE TOO LOW` — with the actual observed value (`ADX 14.2 ✗ (min 99)`). Output: a `RECENT DECISIONS` event history (bounded, default 20), a `— DECISION LOG —` detail (DECISION `BUY`/`REJECTED`, score, position), a `— GATE STATUS —` table (PASS/FAIL/N/A per gate), `— DIAGNOSTIC STATS —` (candidates/signals/rejected + per-reason counts), plus MFE/MAE **outcome tracking** in R and optional `CVLOG` alerts (own default-off input, separate from trading alerts). Historical candles replay the same decisions after reload. Bounded arrays, no files, **not a backtest** (no `strategy()`, no orders, no P&L). When off, the script is byte-identical to v3.2.0 (only the new input exists).
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

### EMA 9/21 entry (chart TF)

- **Bullish crossover:** previous EMA 9 ≤ previous EMA 21 AND current EMA 9 > current EMA 21
- **Bearish crossover:** previous EMA 9 ≥ previous EMA 21 AND current EMA 9 < current EMA 21
- Evaluated on the **chart timeframe when it is 15m, 1H, or 4H** (closed candles only).

### ADX filter

- ADX period 14, minimum 20, computed on the entry timeframe, closed candle only.

### Structural SL / R-based TP (v3.1.0)

- **Entry** = signal candle close. **Structural SL** uses the swing of the previous `10` completed bars (the signal candle is excluded via `[1]`): BUY `SL = lowest(low, 10)[1] − 0.5·ATR`, SELL `SL = highest(high, 10)[1] + 0.5·ATR`.
- **Risk** = |Entry − SL|. **TP1 = Entry ± 1.0·Risk**, **TP2 = Entry ± 2.5·Risk** — take-profits are multiples of actual risk (R), never of ATR.
- **Fallback:** a structural stop tighter than 0.5·ATR (or invalid) falls back to the documented `1.5·ATR` stop — it never blocks the signal.
- **Hard risk gate:** a setup whose risk exceeds **2.5·ATR** is **rejected** (no signal, no levels, no alert; Audit Mode reason `RISK TOO LARGE`).

### Signal scoring

- Each satisfied component adds its weight (defaults: trend 25, **1H confirmation** 25, ADX 25, slope 25; max 100).
- **BUY** requires: supported signal TF (15m/1H/4H) AND 4H bullish AND 1H bullish confirmation AND bullish crossover AND score ≥ minimum (default 75). **SELL** mirrored.
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

- **TradingView:** `v3.3.0` — three-layer TF architecture with a **15m / 1H / 4H signal-engine policy**, **Phase 1 quality gates**, the **Phase 2 structural risk engine** (structural SL, risk validation, R-based TP1/TP2), and the **v3.3.0 Signal Decision Logger** (first-failure chain, gate-status table, decision statistics, event history, MFE/MAE outcome tracker) — working and compiling in the Pine Editor.
- **MT5:** Phase 2 `v2.00` — working on M15 charts.
- **Next milestone:** a Pine `strategy()` backtest version (planned, not yet implemented).
