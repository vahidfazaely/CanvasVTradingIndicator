# Changelog

All notable changes to CanvasV MTF Signal.

## v2.0.2 — Renamed to CanvasV MTF Signal

Date: 2026-08-17

- Renamed the TradingView indicator's public/display name from "My Buy/Sell Scalper - MTF" to **CanvasV MTF Signal**.
- Updated: `indicator()` title and shorttitle, the on-chart info panel title, the four `alertcondition` titles/messages, and the script header comment.
- Renamed README, `docs/Strategy.md`, and `docs/Testing.md` headings.
- **No logic, architecture, or hardening changes.** File paths unchanged (`TradingView/MyBuySellIndicator.pine`, `MT5/MyBuySellIndicator.mq5`) — repository/file renaming is handled in a separate phase. MT5 code untouched (its on-chart name still shows the old title until the MT5 naming phase).

## v2.0.1 (hardening) — TradingView MTF confirmation + repaint safety

Date: 2026-08-17

- **HTF confirmation fix:** replaced the multi-line 4-tuple `request.security` with **four single-line calls**, one per H4 value (`h4e50H`, `h4e50PrevH`, `h4e200H`, `h4momH`), each with `lookahead = barmerge.lookahead_off`. Fixes the target Pine build's compiler error `Syntax error at input 'end of line without line continuation'`.
- **Repaint proof documented:** each H4 value is step-constant during the forming H4 candle and only updates when an H4 candle completes; the slope baseline `[1]` is applied inside the H4 context (two consecutive closed H4 values). Comments and docs updated to state the exact semantics.
- **Config validation:** signals are suppressed and the panel shows `CONFIG ERROR` + reason when an EMA Fast ≥ its Slow (H4 or entry), when all weights are 0, or when `MinimumScore > maxScore`. Weight inputs clamped ≥ 0.
- **na-safe level redraw:** level-line/label deletion in the BUY/SELL blocks and in the `showLevels` toggle is guarded with `not na(...)`; toggling levels off now also nulls the stored ids — no risk of deleting non-existent objects.
- **Color compatibility fix:** replaced the Pine v5-only extended color names (`dodgerblue`, `limegreen`, `magenta`) with universal palette names (`blue`, `green`, `fuchsia`) — every remaining color constant is supported from Pine v4 onward. Fixes `Undeclared identifier 'color.dodgerblue'/'color.limegreen'/'color.magenta'` on builds whose color table lacks the v5-only names.
- **No trading-logic changes:** signal conditions, scoring defaults (25/25/25/25, min 75), ATR levels (1.5/1.5/3.0), H4 trend/slope rules, and STRONG thresholds are unchanged.

## v2.0.0 — TradingView multi-timeframe

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
