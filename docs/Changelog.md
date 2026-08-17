# Changelog

All notable changes to MyBuySellIndicator.

## v2.0.0 (current baseline) — TradingView multi-timeframe

Date: initial repository commit

- Removed the M15 lock — the entry logic now runs on the **current chart timeframe** (1m → 1W).
- H4 trend (EMA 50/200 + slope) via `request.security(..., lookahead_off)` on the **last closed H4 candle**.
- **Self mode** when the chart timeframe is ≥ H4 (4H/6H/12H/D/W); labelled `Trend (chart TF)` in the panel.
- Configurable scoring weights (default 25/25/25/25, max 100), `Minimum Signal Score` default 75.
- Optional **STRONG BUY / STRONG SELL** tier (threshold 100, configurable, toggleable).
- Optional quality filters (all off by default): EMA separation %, price vs EMA 21, H4 momentum, ATR volatility regime, volume confirmation.
- Individually toggleable visuals (H4 EMAs, entry EMAs, markers, level lines, panel).
- Expanded info panel (symbol, timeframe, trend/momentum/ADX/ATR, score, signal, levels, ✓/✗ confirmations).
- Four alert types (BUY / STRONG BUY / SELL / STRONG SELL) with full details, once per confirmed signal.
- Pine compatibility fixes for the target build: `ta.adx` → `ta.dmi`, labels via `label.new` (no `line.new text=`), no `table.label_font_family_monospace`, `na()`/`not na()` checks only, no tuple-from-`if` assignment.

## v1.0.0 — TradingView port (M15-locked)

- First Pine port of the MT5 Phase 2 logic (M15-attached).
- Fixed compilation for the target Pine build: `ta.adx` → `ta.dmi`, level labels via `label.new`, removed table font-family argument, `not na()` checks, guarded object deletion.
- Closed-candle discipline via `barstate.isconfirmed` and `lookahead_off`.

## MT5 history

### v2.00 — Phase 2 (M15)
- ATR-based Entry/SL/TP1/TP2 (1.5 / 1.5 / 3.0), ADX filter (period 14, min 20), H4 EMA 50 slope filter.
- 0–100 signal score (minimum 75), latest-signal SL/TP visuals, upper-right info panel, alert system, input groups.

### v1.00 (hardened) — Phase 1
- Enforced M15 timeframe, input validation, fixed M15 `CopyBuffer` bounds (no phantom signals), implemented the previously dead `EnableAlerts` input (once per new closed signal, no historical alerts).
