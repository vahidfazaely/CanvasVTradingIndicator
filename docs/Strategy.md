# Strategy — CanvasV V4 FAST

This document describes the **current baseline** (TradingView `v4.2.0`, Pine `strategy()`) signal logic precisely. It documents *what the code does*, not a proposal.

Pine source: [`TradingView/CanvasV_V4_FAST.pine`](../TradingView/CanvasV_V4_FAST.pine).
Lite build: [`TradingView/CanvasV_V4_FAST_lite.pine`](../TradingView/CanvasV_V4_FAST_lite.pine) — signal-identical, diagnostics trimmed (see §13).
Local mirror: [`backtest/engine.mjs`](../backtest/engine.mjs) — every default matches the Pine inputs exactly (see §14 for deliberate gaps).

---

## 1. Architecture

| Stage | Source |
|---|---|
| Regime | EMA 50 slope (ATR-normalized) + ATR-vs-average volatility flag |
| Direction / momentum | EMA 9 / 21 / 50 stack + EMA 9 slope + close vs EMA 21 |
| Triggers | Pullback-resume **or** breakout (each with quality gates) |
| Entry quality | Extension limit + candle body + relative volume + high-vol confirmation |
| Risk | Structural SL + ATR buffer + risk bounds + R-based TP1/TP2 |
| Strategy | `strategy.entry` / `strategy.exit`, sizing, exits, outcome tracking |

The pipeline is `REGIME → DIRECTION → SETUP → TRIGGER → RISK → STRATEGY`. A setup must pass **every** stage. Entries fire only on **confirmed closed candles** (`barstate.isconfirmed`). Everything runs on the chart series (15m-first design, works on any chart TF) — there are no `request.security` calls and no lookahead.

`cfgOk` sanity gate (blocks all entries when false): `emaTrigLen < emaDirLen < emaSlowLen`, `swingLookback ≥ 2`, `tp1R > 0`, `tp2R > tp1R`, `maxRiskAtr > minRiskAtr`.

---

## 2. Regime

Inputs: `regimeBars = 10`, `regimeMinSlope = 0.05`, `atrRegimeLen = 100`, `highVolPct = 130.0`, `atrPeriod = 14`.

- `regimeSlope = (EMA50 − EMA50[10]) / max(ATR × 10, ε)` — EMA 50 slope in ATR per bar.
- `trending = |regimeSlope| ≥ 0.05`.
- `highVol = ATR / SMA(ATR, 100) × 100 ≥ 130`.
- **Trend up:** `trending AND EMA21 > EMA50 AND EMA50 > EMA50[10]`.
- **Trend down:** `trending AND EMA21 < EMA50 AND EMA50 < EMA50[10]`.

A flat EMA 50 (equal 10 bars ago) satisfies neither direction → ranging → no signal.

---

## 3. Direction + momentum (setup)

Inputs: `emaTrigLen = 9`, `emaDirLen = 21`, `emaSlowLen = 50`, `momSlopeBars = 3`.

- **Momentum up:** `EMA9 > EMA9[3] AND close ≥ EMA21`.
- **Momentum down:** `EMA9 < EMA9[3] AND close ≤ EMA21`.
- **Setup long** = trend up + momentum up. **Setup short** = trend down + momentum down.

---

## 4. Triggers

Either trigger can fire; both are AND-combined with the setup.

### 4a. Pullback resume

Inputs: `enablePullback = true`, `pullbackLookback = 5`, `pullbackTolPct = 0.5`.

- **Long:** `lowest(low, 5)[1] ≤ EMA21 × 1.005` (touched the direction EMA within tolerance, signal bar excluded) **AND** `close > EMA9 AND close[1] ≤ EMA9[1]` (close reclaims the trigger EMA).
- **Short:** mirrored (`highest(high, 5)[1] ≥ EMA21 × 0.995`, close loses EMA 9).

### 4b. Breakout

Inputs: `enableBreakout = true`, `breakoutBars = 10`, plus the Breakout Quality group (§6).

- **Long:** `close > highest(high, 10)[1] + ATR × 0.10` (prior range excluded the signal bar, plus ATR buffer).
- **Short:** mirrored below `lowest(low, 10)[1]`.
- Plus close-location, extension, and volume gates (§5–§7).

---

## 5. Entry quality

Inputs: `maxExtAtr = 1.5`, `useStrictExt = true`, `minBodyPct = 0.0` (off).

- **Extension guard:** `|close − EMA21| / ATR ≤ 1.5` (both triggers). Hard reject when strict mode is on.
- **Candle body:** when `minBodyPct > 0`, requires directional close (`close > open` for long) and `body/range × 100 ≥ min`.
- `closeLocation = (close − low) / (high − low)` (0.5 for a zero-range bar) feeds the breakout and high-vol gates.

---

## 6. Breakout quality (Phase 3)

Inputs: `enableBtBuffer = true`, `breakoutBuffer = 0.10`, `enableCloseLoc = true`, `closeLocMinLong = 0.70`, `closeLocMinShort = 0.30`, `enableBtExtFilter = true`, `breakoutExtAtr = 2.0`.

Breakout entries additionally require:

1. **ATR buffer** — close clears the range by `0.10 × ATR` (§4b).
2. **Close location** — long: `closeLocation ≥ 0.70`; short: `closeLocation ≤ 0.30`.
3. **Extension filter** — within `2.0 ATR` of EMA 21. Under defaults this is subsumed by the stricter global 1.5 ATR gate, so it only binds when strict mode is off or set tighter (avoids double-counting rejections in funnels).

---

## 7. Volume (Phase 4)

Inputs: `enableRelVol = true`, `volLookback = 20`, `volMinBreakout = 1.20`, `volMinPullback = 1.10`.

`relVol = volume / SMA(volume, 20)`. Breakout triggers need `relVol ≥ 1.20`; pullback triggers need `relVol ≥ 1.10`. Missing volume data (`na`) passes the gate (fail-open).

---

## 8. High volatility (Phase 5)

Inputs: `hvMode = "Stronger Confirmation"`, `hvVolMin = 1.40`, `hvCloseLocLong = 0.75`, `hvCloseLocShort = 0.25`.

When `highVol` is true (ATR ≥ 130% of its 100-bar average):

| Mode | Behavior |
|---|---|
| `Allow` | No extra requirement. |
| `Stronger Confirmation` (default) | Entries need `relVol ≥ 1.40` (missing volume **fails** here) **and** close location ≥ 0.75 long / ≤ 0.25 short. |
| `Block` | All entries rejected (`HV BLOCKED`). |
| `Reduce Risk` | Accepted upstream (reserved: Pine currently applies no size change). |

---

## 9. Risk model

Inputs: `swingLookback = 10`, `structBufferAtr = 0.5`, `minRiskAtr = 0.5`, `maxRiskAtr = 4.0`, `tp1R = 1.0`, `tp2R = 2.5`, `atrFallbackMult = 1.5` (fixed), `atrStopMult = 1.5`.

- **Entry** = signal candle close.
- **Structural SL** = `lowest(low, 10)[1] − 0.5·ATR` (long) / `highest(high, 10)[1] + 0.5·ATR` (short). The `[1]` excludes the signal bar.
- **Volatility buffer:** SL is pushed a further `atrStopMult × ATR` (1.5) beyond structure.
- **Fallback:** structural risk < 0.5 ATR (or invalid) → fixed `1.5·ATR` stop. Never blocks the signal.
- **Hard risk gate:** risk > 4.0 ATR → setup **rejected** (`RISK TOO WIDE` / `INVALID STRUCTURE`). SL must also be on the correct side of entry with usable ATR.
- **Targets:** TP1 = Entry ± 1.0R, TP2 = Entry ± 2.5R — multiples of actual risk, never of ATR.

---

## 10. Position sizing (Phase 2)

Inputs: `enableFixedRisk = true`, `riskPerTrade = 0.5`, `maxPosSize = 0.0` (no cap).

`qty = equity × risk% / stop distance`, floored to 4 decimals, optionally capped. When disabled, Pine falls back to `default_qty_value = 1`. Strategy account: $10,000 initial capital, 0.04% commission, 1-tick slippage.

---

## 11. Execution (Phase 3)

Entries go through `strategy.entry("Long"/"Short")` with a one-shot bar guard; an opposite-direction entry reverses the position (counted as `SUPERSEDED`).

| Exit | Default | Rule |
|---|---|---|
| Partial TP (50% TP1 / 50% TP2) | off | `enablePartialTP` |
| Break-even after TP1 fill | off | `enableMoveBE` (needs partial TP) |
| Mid-trade break-even | off | `enableMidTradeBE`: after 10 bars, profit ≥ +0.25R → SL to entry |
| **Stale-trade exit** | **on** | After 15 bars, position within −0.25R…+0.25R → close at market |
| **Time expiry** | **on** | After 20 bars → close at market |
| Session filter | off | `0800-1700:23456` (Mon–Fri) when enabled |

The stale exit and expiry have no off switch — they always apply.

---

## 12. Outcomes, MFE/MAE, diagnostics

- **Outcomes:** `TP2 FIRST` / `TP1 FIRST` / `SL FIRST` / `EXPIRED` / `SUPERSEDED`, classified from the exit price vs the tracked levels. Counters feed the DEBUG panel and decisions log.
- **MFE/MAE** tracked in R for the open position; per-trade R recorded at close.
- **Post-SL observation** (default 10 bars): after an `SL FIRST` exit, tracks max favorable excursion in R — *"did price move our way after the stop?"* Reported in the decisions log, a DEBUG label, and a `V4POST|` alert.
- **Alerts (all off by default):** entry alerts; diagnostic `V4LOG|` (signal/rejection with `T=` bar time), `V4OUT|` (resolution: outcome, bars, MFE/MAE, R, entry); `alertcondition("CanvasV V4 BUY"/"SELL")` for TradingView alert dialogs.
- **Visuals:** `NORMAL` mode = regime-colored EMA 21 trend line, ▲/▼ markers, Entry/SL/TP lines, compact 11-row panel. `DEBUG` adds the raw EMA set, a 15-row research panel (regime/setup/reason/RISK-RR/position/outcomes/W-L), the 12-line decisions log, and per-signal record labels. Signal logic is identical in both modes.

---

## 13. Lite build

`TradingView/CanvasV_V4_FAST_lite.pine` (`v4.2.0-lite`) trims **diagnostics only**: no `visualMode`/`DEBUG` mode, no decisions log, no `V4LOG`/`V4OUT`/`V4POST` alerts, no post-SL window. Verified signal-identical to the full build:

- `node scripts/check-pine-parity.mjs` — 95 identifiers + 50 inputs match.
- `backtest/engine/output/V4-LITE-HOLDOUT90.md` — zero divergences across 3 symbols × 3 windows.

---

## 14. Local engine parity

`backtest/engine.mjs` reproduces the Pine v4.2.0 signal logic: every `DEFAULT_PARAMS` value equals its Pine input default (verified by direct extraction; no engine-only keys). Indicator math matches Pine `ta.*` semantics (EMA seed = SMA, Wilder RMA for ATR, `[1]`-shifted rolling extremes, NaN-safe warmup).

Deliberate differences (documented in the engine header):

- **Not modeled:** partial TP, break-even-after-TP1, session filter, commission/slippage (all default-off or strategy-account concerns in Pine).
- **Engine extras:** `AMBIGUOUS` outcome (SL+TP hit on the same bar — Pine can only classify by exit price) and an explicit `STALE_EXIT` outcome (Pine folds these into `EXPIRED`); `opts.audit` per-bar funnel capture; opt-in early-pullback experiments (`firstDip` / `slowDip`, default off, production trigger is reclaim-only).
- Position sizing is computed against a fixed $10k equity; compounding appears only in the account-% drawdown metric.

---

## 15. Version note

V4 is a single-timeframe strategy line. The retired V3 MTF indicator (4H trend + 1H confirmation + 15M entry, `MyBuySellIndicator.pine`) is described in [`Changelog.md`](Changelog.md) for history but is **not shipped** in this repository — only the V4 line is present.
