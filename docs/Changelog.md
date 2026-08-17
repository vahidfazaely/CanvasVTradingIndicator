# Changelog

All notable changes to CanvasV MTF Signal.

## v2.4.0 — Signal-engine timeframe policy (15m / 1H / 4H only)

Date: 2026-08-17

- **3-timeframe signal engine.** New explicit `isSupportedSignalTF` gate — true **only** on 15m, 1H, and 4H charts. The signal engine itself is gated by it, so on every other timeframe (1m/3m/5m/30m/2H/6H/12H/1D/1W/custom) **no BUY/SELL signal, marker, Entry/SL/TP level, score label, or alert can be generated** — display/context only. This replaces the v2.3.0 15M-only entry policy.
- **Signals on 15m / 1H / 4H.** On each supported chart the signal candle is the **confirmed chart candle**: 15m and 1H use the literal 4H series + `request.security` 1H confirmation; 1H also reads the 1H confirmation from the chart series; **4H uses the chart series for the trend (self mode)** — signals require `barstate.isconfirmed`, so the currently-forming 4H candle can never fire a signal (explicit non-repaint comments added).
- **Panel:** `STATUS` now reads `SIGNAL ENGINE ENABLED` (green) on supported charts and `SIGNALS DISABLED` (red) on all others, with a new `REASON` row showing `Use 15m / 1H / 4H` on unsupported charts.
- **Signal Audit Mode** now renders on any chart: it always shows `SIGNAL TF` (15M/1H/4H or the chart TF) and `SIGNAL MODE` (ENABLED/DISABLED, with the reason on blocked charts). On supported timeframes it keeps the full detail rows (4H trend/slope, 1H conf, entry trigger, ADX, score breakdown, ATR levels, signal bar) with a dynamic entry label and `CONFIRMED YES - closed candle`.
- **Alerts** inherit the gate: `buySig`/`sellSig` require `isSupportedSignalTF`, so blocked timeframes can never fire the `alert()` calls or the `alertcondition`s.
- **Preserved:** scoring formulas, ATR Entry/SL/TP1/TP2 (1.5/1.5/3.0), ADX/EMA calculations, the four single-line `request.security` H4 calls + two single-line 1H calls (all `lookahead_off`), closed-candle discipline, config validation, and all Pine build-compatibility constraints. MT5 code untouched.

## v2.3.0 — Three-layer TF architecture (4H trend + 1H confirmation + 15M entry)

Date: 2026-08-17

- **Fixed timeframe architecture.** The indicator is no longer a "run on any chart TF" entry system. The roles are now fixed: **4H** = market trend (EMA 50/200 + EMA 50 slope), **1H** = intermediate confirmation (EMA 21/50), **15M** = entry trigger (EMA 9/21 cross + ADX + ATR).
- **Signals fire ONLY on the 15M chart.** `buySig`/`sellSig` now include an `isM15` gate, so BUY/SELL are **actually disabled** (not merely hidden) on every other timeframe — 1m/3m/5m/30m/2H/6H/12H/1D/1W produce no signals in history or live.
- **1H confirmation layer added:** two single-line `request.security(..., "60", lookahead_off)` calls for the last closed 1H candle (EMA 21/50), with chart-series self mode on the 1H chart. The old "Momentum" scoring component (25 pts for the cross) is now the **1H Confirmation** component (25 pts for 1H EMA alignment). The 15M EMA 9/21 cross remains a hard gate but no longer scores points.
- **Self mode narrowed:** the trend is computed on the chart series **only on the 4H chart itself** (previously on every TF ≥ 4H). On all other charts the trend is the literal 4H series; the panel reads the self-mode trend with `[1]` so it never shows the forming bar.
- **Panel:** new `TIMEFRAME` (M15 ENTRY / 1H CONFIRMATION / 4H TREND / chart TF) and `STATUS` (ENTRY ACTIVE / CONTEXT - NO ENTRIES / ENTRY SIGNALS DISABLED - M15 ONLY) rows; the MOMENTUM row is now `1H CONF`.
- **Signal Audit Mode** now renders on 15M charts only and shows the three layers explicitly (4H TREND, 1H CONF, M15 ENTRY) with the exact snapshotted values and contributions.
- **Config validation** extended: `1H EMA Fast < 1H EMA Slow` is now also enforced (`EMA fast >= slow`).
- **Preserved:** closed-candle discipline (`barstate.isconfirmed`), the 4H/1H `lookahead_off` methodology (all `request.security` calls remain single-line), ATR Entry/SL/TP1/TP2 formulas (1.5/1.5/3.0), ADX/ATR periods, alerts, repaint protection, and all Pine build-compatibility constraints. MT5 code untouched.

## v2.2.0 — Signal Audit Mode (debug/diagnostic)

Date: 2026-08-17

- New `Signal Audit Mode` input (Visuals group, **default off**). When off, the indicator behaves byte-for-byte identically to v2.1.0.
- When on, a compact audit table below the info panel shows the **exact** values and conditions that produced the latest confirmed signal:
  - SIGNAL (BUY / SELL / STRONG) and SCORE;
  - H4 TREND (EMA50, EMA200, pass/fail, score contribution);
  - H4 SLOPE (current and previous confirmed EMA50, rising/falling, pass/fail, contribution);
  - CROSS (EMA9 / EMA21, pass/fail, contribution);
  - ADX (value, configured minimum, pass/fail, contribution);
  - VOLATILITY / VOLUME contributions when their weights are enabled;
  - TOTAL (the exact existing score);
  - ENTRY / SL / TP1 / TP2 (the exact existing ATR levels);
  - BAR (symbol, timeframe, signal candle time, closed-candle confirmation).
- All values are **snapshotted at signal time from the same series the signal logic used** — nothing is recalculated, no new conditions, no timing changes, no lookahead, no repaint. Historical signals unchanged.
- Presentation only: signal conditions, scoring, HTF `request.security` methodology, ATR formulas, alert logic, and repaint protection are untouched (byte-level verified).

## v2.1.0 — Visual/UI refinement

Date: 2026-08-17

- **Signal markers:** BUY/SELL now draw larger, readable green/red triangle markers with a direction label (`BUY`, `STRONG BUY`, `SELL`, `STRONG SELL`); STRONG signals are larger. The score appears on a latest-signal `Score 75` label and in the panel.
- **New `Show signal labels` toggle** (Visuals group) — shows/hides the latest-signal score label; marker direction labels remain.
- **Info panel redesign:** larger typography with hierarchy (title > signal > prices > labels); split into two clear sections — **MARKET** (H4 TREND, MOMENTUM, ADX) and **LAST SIGNAL** (SIGNAL large and colored, SCORE, ENTRY, SL, TP1, TP2). Removed the compact rows (symbol / timeframe / ATR / ✓✗ confirmations) to reduce clutter.
- **Level labels:** ENTRY / SL / TP1 / TP2 labels enlarged for readability. Latest-signal-only behavior unchanged.
- **Build compatibility:** marker text uses constant strings (`plotshape` on the target Pine build rejects series-string text) and level labels use no `bgcolor` argument (unsupported on that build); the score is carried by `label.new`, which accepts dynamic text.
- **Presentation only:** no changes to signal logic, scoring, HTF architecture, ATR levels, alerts, or repaint protection — verified by byte-level comparison of every logic line against v2.0.2.

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
