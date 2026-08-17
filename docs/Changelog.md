# Changelog

All notable changes to CanvasV MTF Signal.

## v3.4.0 — UI/UX cleanup: simplified color system + compact panel

Date: 2026-08-17

**Presentation-only release. Trading logic is unchanged.**

- **Color system reduced to 5 roles:** GREEN = bullish / BUY / PASS · RED = bearish / SELL / FAIL · WHITE = primary neutral values · SILVER = secondary/context/labels · neutral identification colors for the EMA lines. Removed all semantic use of `lime`, `teal`, `fuchsia`, and blue-as-direction.
- **Markers:** BUY / STRONG BUY are now **green** (were lime); SELL / STRONG SELL remain red. The latest-signal score label uses green for BUY / red for SELL (was lime).
- **Position levels:** ENTRY line/label is now **white/neutral** (was blue); SL stays red; TP1 and TP2 now share **one directional color** — green for a BUY position, red for a SELL position (previously TP1 green / TP2 teal, which was not direction-consistent).
- **EMA identification colors:** fast lines (H4 EMA 50, entry EMA 9) are blue, slow lines (H4 EMA 200, entry EMA 21) are orange — pure line identification, no bullish/bearish meaning. (Entry EMA 9 was green and EMA 21 fuchsia; both implied direction.)
- **Compact panel (18 → 11 rows):** new hierarchy — title + version, **TREND** (green/red/silver), **SIGNAL** (large, green/red/silver), SCORE (always neutral), ENTRY (white), SL (red), TP1/TP2 (directional), RISK, R:R, then **one context footer line** — `15M SIGNAL · 1H BULLISH · ADX 35.8` with `ENABLED`/`DISABLED` status. The separate TIMEFRAME / STATUS / REASON / MARKET / LAST SIGNAL rows were folded away; on a blocked timeframe or config error the footer turns red and shows the reason (`5M · SIGNALS DISABLED · Use 15m / 1H / 4H`). No blank rows are wasted on normal charts.
- **Debug tables (Audit Mode / Signal Decision Logger) unchanged in content**, colors unified to PASS = green, FAIL = red, N/A / context = silver, primary values = white. All diagnostic functionality (first-failure chain, GATE STATUS, DIAGNOSTIC STATS, RECENT DECISIONS, DECISION LOG, outcome tracking, CVLOG alerts) is fully preserved and remains hidden when the modes are off.
- **Score is never colored by range** — always neutral, per the cleanup spec.
- **Unchanged (byte-verified vs v3.3.0):** `buySig`/`sellSig`, all Phase 1 gates, score formulas and thresholds, STRONG logic, the Phase 2 position engine (structural SL, ATR fallback, max-risk gate, R-based TPs, R:R), TF policy, `barstate.isconfirmed`, all 7 `request.security` calls (`lookahead_off`), repaint protection, frozen last-signal state, outcome tracking, alert logic, `alertcondition`s, and every Pine build-compatibility constraint. MT5 code untouched. This is a presentation-only release — no trading behavior changed.

Date: 2026-08-17

- **Renamed the master diagnostic toggle to `Signal Decision Logger`** (Visuals group, default **off**; previously `Signal Diagnostic Mode`). When off, the script is byte-identical to v3.2.0 except the version string and the new input — no labels, no tables, no alerts.
- **First-failure decision chain.** Rejected candidates now identify the first failing condition in the engine's exact order: `4H REGIME` → `4H SLOPE` → `4H SEPARATION` → `1H STRUCTURE` → `1H MOMENTUM` → `ENTRY STRUCTURE` → `ENTRY POSITION` → `EMA EXPANSION` → `NO TRIGGER` → `CANDLE DIRECTION` → `CANDLE BODY` → `ADX` → `VOLATILITY` → `CHASING` → `OPTIONAL FILTERS` → `ATR INVALID` → `SCORE` → `RISK TOO LARGE` / `INVALID STRUCTURE`. The entry-setup gate is now split into **ENTRY STRUCTURE** (EMA9 vs EMA21) and **ENTRY POSITION** (close vs EMA9), and the old `GAP EXPANSION` label is now **EMA EXPANSION**. Derived only from the existing gate booleans — no new conditions. The chain distinguishes **rejected before scoring** from **all gates passed but score insufficient** (`SCORE`) from **signal fired** (`DECISION = BUY/SELL`).
- **`— DECISION LOG —` detail section** (renamed from `— LAST DIAGNOSTIC —`): adds a large `DECISION` row (`BUY`/`STRONG BUY`/`SELL`/`STRONG SELL`/`REJECTED`, green/red) alongside the existing EVENT / REASON / 4H / EMA50-200 / 1H / ENTRY / CANDLE / EMA9-21 / QUALITY / SCORE / POSITION / RISK-RR / TRACK / HITS / OUTCOME rows.
- **`— GATE STATUS —` table:** PASS / FAIL / N/A per gate (4H REGIME, 4H SLOPE, 4H SEPARATION, 1H STRUCTURE, 1H MOMENTUM, ENTRY STRUCTURE, ENTRY POSITION, EMA EXPANSION, TRIGGER, CANDLE, ADX, VOLATILITY, CHASING, RISK, SCORE) + DECISION row, from frozen per-gate snapshot booleans.
- **`— DIAGNOSTIC STATS —` table:** CANDIDATES / SIGNALS / REJECTED plus per-reason rejection counts (4H REGIME, 4H SLOPE, 4H SEPARATION, 1H STRUCTURE, 1H MOMENTUM, ENTRY STRUCTURE, ENTRY POSITION, EMA EXPANSION, CANDLE, ADX, VOLATILITY, CHASING, RISK, SCORE, OPTIONAL FILTERS) — answers *which filter kills the most setups*. Observation only; no filter changes.
- **Default `Diagnostic history size` changed 50 → 20** (bounded event log, newest kept; matches the compact `RECENT DECISIONS` summary header rename).
- **Unchanged (byte-verified vs v3.2.0):** `buySig`/`sellSig`, score formulas and thresholds, every Phase 1 gate, the Phase 2 position engine (structural SL, risk gate, R-based TPs), TF policy, trading alerts, `alertcondition`s, HTF methodology, repaint protection, and all Pine build-compatibility constraints (including the `ta.lowest`/`ta.highest` fix). MT5 code untouched. Still **not a backtest** — no `strategy()`, no orders, no P&L, no profitability claim.

- The target Pine build does not provide the bare `lowest()` / `highest()` functions (`Could not find function or function reference 'lowest'`). The Phase 2 structural-SL swing is now computed with the namespaced `ta.lowest(low, swingLookback)[1]` / `ta.highest(high, swingLookback)[1]` — identical values, zero logic change (same pattern as the earlier `abs()` → `math.abs()` fix).

## v3.2.0 — Signal Diagnostic Mode: event logger + outcome tracker

Date: 2026-08-17

- **Diagnostic-only release.** New `Diagnostics` input group: `Signal Diagnostic Mode` (default **off**), `Diagnostic history size` (default 50, max 100), `Outcome tracking bars` (default 20), `Enable diagnostic CVLOG alerts` (default off). When the mode is **off** the script is byte-identical to v3.1.0 except the version string — no labels, no tables, no alerts, no behavior change.
- **Signal event logger.** Every confirmed candidate evaluation on a supported timeframe (15m/1H/4H) is captured with the **exact values the engine used** — 4H regime (EMA50/200, separation %, slope direction), 1H (EMA21/50, close, structure/momentum pass), entry (EMA9/21, gap and previous gap, gap-expansion pass), candle (direction, body %, range), quality (ADX, ATR, ATR%, chasing distance in ATR), full score breakdown (existing weights only), and position (Entry/SL/TP1/TP2/Risk/RiskATR/R:R). Reused existing variables — **no recalculation, no second implementation** of any gate.
- **First-failed-gate logging.** Rejected candidates record the precise gate and actual value: `4H REGIME` / `4H SLOPE` / `4H SEPARATION` / `1H STRUCTURE` / `1H MOMENTUM` / `ENTRY STRUCTURE` / `GAP EXPANSION` / `CANDLE DIRECTION` / `CANDLE BODY` / `ADX` / `VOLATILITY` / `CHASING` / `OPTIONAL FILTERS` / `ATR INVALID` / `SCORE` / `RISK TOO LARGE` / `INVALID STRUCTURE`, with the observed value (`ADX 14.2 ✗ (min 99)`, `CHASE 2.13A ✗`, etc.). The existing Audit Mode `rejectTxt` is untouched.
- **Bounded event history.** 10 parallel arrays (time/TF/dir/result/score/reason/entry/riskATR/RR1/RR2), newest at the end, oldest removed when over `Diagnostic history size`. Shown as one compact line per event in a `CANVASV DIAGNOSTICS` summary table (rendered only while the mode is on).
- **Latest-event detail table.** `— LAST DIAGNOSTIC —` shows the frozen snapshot of the most recent event (EVENT, REASON, 4H, EMA50/200, 1H, ENTRY, CANDLE, EMA9/21, QUALITY, SCORE, POSITION, RISK/RR) plus the tracking state.
- **Actual-signal outcome tracking (observational).** Each accepted signal is frozen (time, direction, Entry, SL, TP1, TP2, Risk) and followed across the next `Outcome tracking bars` **confirmed entry-TF candles after the signal bar**: MFE/MAE in R (`favorable/risk`, `adverse/risk`), TP1/TP2/SL hit flags, and outcome classification — `SL FIRST`, `TP1 FIRST`, `TP2 FIRST` (TP2 reached implies passing through TP1), `AMBIGUOUS` (SL and any TP touched inside the same candle — order unknowable from OHLC), `EXPIRED` (window elapsed), `SUPERSEDED` (a newer signal replaced an unresolved one). A bounded outcome log keeps the last 20 records.
- **CVLOG export alert.** Optional `Enable diagnostic CVLOG alerts` emits a compact machine-readable line per event (`CVLOG|SYM|TF|DIR|RESULT|SCORE|REASON|ADX=..|ATR=..|RISK=..A|RR=../..|E=..|SL=..|TP1=..|TP2=..`), clearly separate from the trading alerts (own default-off input; the two trading `alert()` calls and the four `alertcondition`s are unchanged).
- **Repaint / data integrity:** events are captured only at `barstate.isconfirmed` on supported timeframes; the H4/1H `request.security(..., lookahead_off)` methodology is untouched; outcome tracking inspects only candles **after** the signal bar and never feeds back into the signal decision (SIGNAL DECISION vs OUTCOME TRACKING separation). No `lookahead_on`, no future references in signal calculations.
- **Pine limitation documented:** Pine cannot write files to disk, so persistence is bounded in-script arrays + optional alerts; historical events rebuild deterministically on reload (replayed from the same confirmed data). This is a **data-collection tool, not a backtest** — no `strategy()`, no orders, no P&L, no profitability claim.
- **Unchanged (byte-verified vs v3.1.0):** `buySig`/`sellSig`, score model and thresholds, all Phase 1 gates, the Phase 2 position engine (structural SL, risk gate, R-based TPs), TF policy (15m/1H/4H only), trading alerts, `alertcondition`s, HTF methodology, repaint protection, and all Pine build-compatibility constraints. MT5 code untouched.

## v3.1.0 — Phase 2: structural risk & R-based position engine

Date: 2026-08-17

- **Replaced the fixed ATR-multiple position model** with a structural, risk-based engine. There is now ONE position source of truth: Entry → Structural SL → Risk validation → R-based TP1/TP2. The old normal ATR SL/TP formulas (1.5/1.5/3.0) are gone from the code; the `1.5×ATR` stop survives only as the documented **minimum-risk fallback**.
- **New `Risk` input group** (old `ATR SL/TP Multiplier` inputs removed): `Swing lookback` = 10, `Structure buffer (ATR)` = 0.5, `Minimum risk (ATR)` = 0.5, `Maximum risk (ATR)` = 2.5, `TP1 R multiple` = 1.0, `TP2 R multiple` = 2.5. `ATR Period` remains.
- **Structural SL:** BUY `SL = lowest(low, 10)[1] − 0.5×ATR`, SELL `SL = highest(high, 10)[1] + 0.5×ATR`. The mandatory `[1]` excludes the forming signal candle — it can never define its own swing (chart series only, no `request.security`, no lookahead, no repaint).
- **Risk:** `Risk = |Entry − SL|`, `RiskATR = Risk / ATR` (safe division). **Minimum-risk fallback:** a stop tighter than `0.5×ATR` (or invalid) falls back to `Entry ∓ 1.5×ATR` and the signal still fires; the final SL is always strictly below/above Entry. **Maximum-risk gate (HARD):** `Risk > 2.5×ATR` → **NO SIGNAL** — no marker, no levels, no score label, no alert, no last-signal-state update.
- **ATR safety:** `na`/zero ATR → no position, signal rejected (`ATR INVALID`). No division by zero.
- **R-based TPs:** `TP1 = Entry ± Risk×1.0`, `TP2 = Entry ± Risk×2.5` — multiples of actual risk, never ATR. Displayed R:R is computed from the actual prices (`(TP1−Entry)/Risk`, `(TP2−Entry)/Risk`), so it stays correct if the R inputs change.
- **Panel:** two new compact rows under TP2 — `RISK` (in ATR) and `R:R` (`1.0 / 2.5`). No other layout change.
- **Audit Mode:** new rows `STRUCT SL`, `FINAL SL`, `SL MODE` (`STRUCTURAL` / `ATR FALLBACK`), `RISK`, `RISK ATR`, `TP1 R`, `TP2 R`, `R:R`. Rejection reasons extended: `ATR INVALID`, `RISK TOO LARGE`, `INVALID STRUCTURE` (first-failed-gate order preserved).
- **Config validation:** new `riskCfgOk` — signals suppressed when `Swing lookback < 2`, `Structure buffer < 0`, `Minimum risk ≤ 0`, `Maximum risk ≤ Minimum risk`, `TP1 R ≤ 0`, or `TP2 R ≤ TP1 R` (panel reason `risk config invalid`).
- **Unchanged:** ALL Phase 1 signal gates (4H regime, 1H confirmation, 1H momentum, entry structure, candle quality, ADX, volatility floor, chasing) — byte-identical; the score model and thresholds; the TF policy (15m/1H/4H only); HTF `request.security` methodology (7 single-line calls, `lookahead_off`); `barstate.isconfirmed` gating; alerts (once per confirmed signal, downstream of the final valid signal); repaint protection; all Pine build-compatibility constraints. MT5 code untouched.
- **No profitability claim** — the effect of structural stops vs ATR stops requires backtesting.

## v2.5.0 — Phase 1 of Signal Engine v3: quality gates

Date: 2026-08-17

- **New hard gates** (a failure blocks the signal regardless of score; the existing score model is kept unchanged so the gate effect can be isolated):
  - **4H REGIME:** EMA50 > EMA200 **and** strict rising slope (`EMA50 > EMA50[prev]`) **and** separation ≥ 0.10% (`Min 4H regime separation`). A **flat** EMA50 slope counts for neither direction → `NEUTRAL` regime → **no signal**. SELL mirrored. 4H slope made strict (`>`/`<`, was `>=`/`<=`).
  - **1H MOMENTUM:** 1H close ≥ 1H EMA21 (BUY) / ≤ (SELL) — one new single-line `request.security(syminfo.tickerid, "60", close, lookahead_off)`, confirmed 1H candle only.
  - **ENTRY STRUCTURE:** EMA9 > EMA21 and close ≥ EMA9 (BUY), mirrored for SELL, plus optional **EMA gap expansion** (default on).
  - **CANDLE QUALITY:** close > open (BUY) / close < open (SELL) and body ≥ 50% of range (safe division; zero-range guard).
  - **ADX floor:** ADX ≥ 18 now a hard gate (was score-only). Default minimum changed 20 → 18.
  - **VOLATILITY floor:** ATR/close ≥ 0.05% (safe division).
  - **CHASING:** |close − EMA9| / ATR ≤ 1.5 (no entries on already-extended bars).
- **Audit Mode:** on a rejected candidate setup (a fresh confirmed crossover on a supported timeframe), the `REASON` row shows the **first failed gate** in pipeline order — `4H REGIME`, `1H CONFIRMATION`, `1H MOMENTUM`, `ENTRY STRUCTURE`, `CANDLE QUALITY`, `ADX`, `VOLATILITY`, `CHASING`, `OPTIONAL FILTERS`, or `SCORE TOO LOW` — distinguishing "setup rejected" from "setup passed but score too low".
- **Panel:** the `H4 TREND` row now reflects the full regime (shows `NEUTRAL` when the slope is flat or separation is below the minimum). No new rows.
- **Unchanged:** scoring model, Entry/SL/TP1/TP2 formulas, markers, levels, labels, alerts, TF policy (15m/1H/4H only), repaint methodology (single-line `request.security` ×7, `lookahead_off`, `barstate.isconfirmed`), config validation, all Pine build-compatibility constraints.
- **No profitability claim** — requires backtesting.
- **Build compatibility fix:** the bare `abs()` function is not available on the target Pine build (`Could not find function or function reference 'abs'`); the four new calculations now use `math.abs()`. Same values, no logic change.

## v2.4.0 — Signal-engine timeframe policy (15m / 1H / 4H only)

Date: 2026-08-17

- **3-timeframe signal engine.** New explicit `isSupportedSignalTF` gate — true **only** on 15m, 1H, and 4H charts. The signal engine itself is gated by it, so on every other timeframe (1m/3m/5m/30m/2H/6H/12H/1D/1W/custom) **no BUY/SELL signal, marker, Entry/SL/TP level, score label, or alert can be generated** — display/context only. This replaces the v2.3.0 15M-only entry policy.
- **Signals on 15m / 1H / 4H.** On each supported chart the signal candle is the **confirmed chart candle**: 15m and 1H use the literal 4H series + `request.security` 1H confirmation; 1H also reads the 1H confirmation from the chart series; **4H uses the chart series for the trend (self mode)** — signals require `barstate.isconfirmed`, so the currently-forming 4H candle can never fire a signal (explicit non-repaint comments added).
- **Panel:** `STATUS` now reads `SIGNAL ENGINE ENABLED` (green) on supported charts and `SIGNALS DISABLED` (red) on all others, with a new `REASON` row showing `Use 15m / 1H / 4H` on unsupported charts.
- **Signal Audit Mode** now renders on any chart: it always shows `SIGNAL TF` (15M/1H/4H or the chart TF) and `SIGNAL MODE` (ENABLED/DISABLED, with the reason on blocked charts). On supported timeframes it keeps the full detail rows (4H trend/slope, 1H conf, entry trigger, ADX, score breakdown, ATR levels, signal bar) with a dynamic entry label and `CONFIRMED YES - closed candle`.
- **Alerts** inherit the gate: `buySig`/`sellSig` require `isSupportedSignalTF`, so blocked timeframes can never fire the `alert()` calls or the `alertcondition`s.
- **Preserved:** scoring formulas, ATR Entry/SL/TP1/TP2 (1.5/1.5/3.0), ADX/EMA calculations, the four single-line `request.security` H4 calls + two single-line 1H calls (all `lookahead_off`), closed-candle discipline, config validation, and all Pine build-compatibility constraints. MT5 code untouched.
- **Build compatibility fix:** the audit snapshot `audBarTime` was declared with the `datetime` type keyword, which the target Pine build rejects (`'datetime' is not a valid type keyword`). Timestamps are plain `int` in Pine, so it is now `var int audBarTime = na` — same value (`time`), same display, no logic change.
- **Build compatibility fix (2):** the audit table used the `format.timestamp` constant (undeclared on the target build) and an explicit `end` keyword (also unsupported — the build delimits `if` blocks purely by indentation). The BAR row now formats via `str.tostring(audBarTime, "yyyy-MM-dd HH:mm")`, and the audit detail block was restructured from a nested `if isSupportedSignalTF ... end` into a separate top-level `if auditMode and isSupportedSignalTF` block closed by dedent — identical rendered output, zero logic change.

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
