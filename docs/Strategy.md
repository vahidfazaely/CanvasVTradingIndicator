# Strategy — CanvasV MTF Signal

This document describes the **current baseline** (TradingView `v3.1.0` / MT5 Phase 2 `v2.00`) signal logic precisely. It is a documentation of *what the code does*, not a proposal.

---

## 1. Architecture

| Layer | Source |
|---|---|
| Trend | 4H EMA 50 / EMA 200 + EMA 50 slope |
| Confirmation | 1H EMA 21 / EMA 50 |
| Entry trigger | Chart TF (15m / 1H / 4H) EMA 9 / 21 crossover + ADX |
| Risk | Structural SL + risk validation + R-based TP1/TP2 |
| Confidence | Weighted score 0–100, minimum 75 |

The intended hierarchy is: **4H** = main market direction, **1H** = intermediate momentum confirmation, **entry timeframe** (15m / 1H / 4H) = entry trigger. This is one consistent strategy, not three independent ones.

### TradingView timeframe behaviour (signal-engine policy)

The signal engine is gated by `isSupportedSignalTF` — true **only** on 15m, 1H, and 4H charts. On those charts BUY/SELL signals, markers, Entry/SL/TP levels, score labels, and alerts can be generated; on every other timeframe they are **disabled in code** (not merely hidden).

- **15m chart:** signal candle = confirmed 15m candle. The 4H trend and 1H confirmation come from `request.security` with `lookahead = barmerge.lookahead_off`; the entry (EMA cross, ADX, ATR) runs on the 15m chart series.
- **1H chart:** signal candle = confirmed 1H candle. The 4H trend comes from `request.security`; the 1H confirmation is read from the chart series (`[1]`, so never the forming bar).
- **4H chart:** signal candle = confirmed 4H candle. The trend is computed on the chart series itself (self mode); signals require `barstate.isconfirmed`, so the currently-forming 4H candle can never fire a signal — the panel reads the trend with `[1]`. Non-repainting by construction.
- **All other timeframes (1m/3m/5m/30m/2H/6H/12H/1D/1W/custom):** display/context only. The panel shows the chart TF, `SIGNALS DISABLED` (red), and the reason `Use 15m / 1H / 4H`. No signals can be generated or alerted.

### HTF request methodology

Each 4H value is a separate single-line `request.security(syminfo.tickerid, "240", expr, lookahead = barmerge.lookahead_off)` call; the 1H layer uses the same pattern on `"60"`. With `lookahead_off` a value only updates when its HTF candle **completes**: during the forming HTF candle it holds the last closed value and is step-constant (never rewrites history); at the exact HTF boundary bar it is the just-completed candle's final value — confirmed data at that bar's close. The 4H slope baseline `h4e50PrevH` applies `[1]` **inside** the 4H context, i.e. two consecutive confirmed 4H values.

---

## 2. 4H trend

Closed 4H candles only. For BUY:

- **Trend bullish:** `4H EMA 50 > 4H EMA 200`
- **Slope confirmation:** `4H EMA 50 (current closed) >= 4H EMA 50 (previous closed)`

For SELL (mirrored):

- **Trend bearish:** `4H EMA 50 < 4H EMA 200`
- **Slope confirmation:** `4H EMA 50 (current closed) <= 4H EMA 50 (previous closed)`

The slope compares two **consecutive closed 4H candles** (never the forming 4H candle).

---

## 3. 1H confirmation

Closed 1H candles only, EMA fast/slow default 21/50:

- **Bullish confirmation:** `1H EMA 21 > 1H EMA 50`
- **Bearish confirmation:** `1H EMA 21 < 1H EMA 50`

On charts below 1H this comes from `request.security(..., "60", lookahead_off)`; on the 1H chart itself it is read from the chart series (never the forming bar). The 1H alignment replaces the old "momentum" scoring component — the signal now requires the intermediate timeframe to agree with the direction before an entry can score.

---

## 4. EMA 9/21 entry (chart TF)

On a **supported signal timeframe (15m / 1H / 4H)**, with `emaF = EMA 9`, `emaS = EMA 21` computed on the chart series:

- **Bullish crossover:** `emaF[previous] <= emaS[previous] AND emaF[current] > emaS[current]`
- **Bearish crossover:** `emaF[previous] >= emaS[previous] AND emaF[current] < emaS[current]`

Evaluated only on **closed candles**. The crossover is a hard requirement of the signal (it gates), but no longer contributes points itself — its former weight now belongs to the 1H confirmation component.

---

## 5. ADX filter

- `ADX = ta.dmi(period, period)` main line (Wilder's ADX; Pine has no `ta.adx`), computed on the **chart series (15m / 1H / 4H)**.
- Defaults: period 14, minimum 18.0 (hard gate since v2.5.0).
- The ADX value of the **closed signal candle** is used.
- Weight configurable; set to 0 to disable the ADX component.

## 6. Optional filters (TradingView; all OFF by default)

| Filter | Rule (BUY example) | Default |
|---|---|---|
| EMA separation | `(emaF − emaS)/emaS × 100 ≥ min` | off, min 0.05 % |
| Price vs EMA 21 | `close ≥ emaS` | off |
| H4 momentum | `close ≥ H4 EMA(21)` | off |
| ATR volatility | `ATR/close × 100 ≥ min` | off, min 0.05 % |
| Volume | `volume ≥ SMA(volume, 20) × ratio` | off, ratio 1.0 |

SELL rules are mirrored (`close ≤ emaS`, `close ≤ H4 EMA`, etc.). There are two distinct roles:

- **Gate conditions** — the signal does not fire unless the filter passes. This applies to the H4 trend and the EMA crossover (always gates) and to every optional filter when enabled (separation, price vs EMA 21, H4 momentum) or when its weight is > 0 (volatility, volume).
- **Scoring components** — volatility and volume add points (`atrVolWeight`, `volWeight`) when their condition passes. Separation / price vs EMA 21 / H4 momentum have no weight inputs, so they gate but never score.

Setting a weight to 0 disables both the gate and the points for that component.

---

## 7. Phase 1 quality gates (v2.5.0)

Hard gates — any failure blocks the signal **regardless of score**. The existing score model is kept unchanged in v2.5.0 so the gate effect can be measured in isolation (a structural SL/TP and new scoring model come in later phases).

| Gate | BUY rule | SELL rule | Default |
|---|---|---|---|
| 4H REGIME | EMA50 > EMA200 AND EMA50 > EMA50[prev] AND separation ≥ min | mirrored (strict <) | separation ≥ 0.10% |
| 1H CONFIRMATION | 1H EMA21 > EMA50 | 1H EMA21 < EMA50 | — |
| 1H MOMENTUM | 1H close ≥ 1H EMA21 | 1H close ≤ 1H EMA21 | on |
| ENTRY STRUCTURE | EMA9 > EMA21 AND close ≥ EMA9 | EMA9 < EMA21 AND close ≤ EMA9 | — |
| EMA GAP EXPANSION | (EMA9−EMA21) > previous gap | mirrored | on |
| CANDLE QUALITY | close > open AND body ≥ 50% of range | mirrored | body ≥ 50% |
| ADX FLOOR | ADX ≥ 18 | same | 18 |
| VOLATILITY FLOOR | ATR/close ≥ 0.05% | same | 0.05% |
| CHASING | \|close − EMA9\|/ATR ≤ 1.5 | mirrored | 1.5 ATR |

A **flat 4H slope** (EMA50 == EMA50[prev]) counts for neither direction → `NEUTRAL` regime → no signal. A **converged regime** (separation below the minimum) is likewise rejected.

In **Audit Mode**, a rejected candidate setup shows the **first failed gate** in the `REASON` row (`4H REGIME` / `1H CONFIRMATION` / `1H MOMENTUM` / `ENTRY STRUCTURE` / `CANDLE QUALITY` / `ADX` / `VOLATILITY` / `CHASING` / `OPTIONAL FILTERS` / `ATR INVALID` / `SCORE TOO LOW` / `RISK TOO LARGE` / `INVALID STRUCTURE`), distinguishing "setup rejected" from "setup passed but score too low" and from "position rejected by the risk gate".

---

## 8. Scoring

Each component contributes its weight when satisfied:

| Component | Default weight | BUY condition | SELL condition |
|---|---|---|---|
| Trend | 25 | 4H bullish | 4H bearish |
| 1H Confirmation | 25 | 1H EMA 21 > EMA 50 | 1H EMA 21 < EMA 50 |
| ADX | 25 | ADX ≥ minimum | ADX ≥ minimum |
| Slope | 25 | 4H EMA 50 rising | 4H EMA 50 falling |
| Volatility | 0 | ATR regime ok | ATR regime ok |
| Volume | 0 | Volume ok | Volume ok |

`maxScore = sum of enabled weights` (default 100). A disabled component contributes 0 to both score and max.

**Config validation:** signals are suppressed when the inputs are internally inconsistent:

- any EMA Fast ≥ its Slow (4H, 1H, or M15 entry),
- the **risk inputs** are inconsistent (`Swing lookback < 2`, `Structure buffer < 0`, `Minimum risk ≤ 0`, `Maximum risk ≤ Minimum risk`, `TP1 R ≤ 0`, or `TP2 R ≤ TP1 R`),
- all weights are 0 (`maxScore = 0`),
- `MinimumScore > maxScore`.

The panel header then reads `CONFIG ERROR` and the bottom row shows the reason (`EMA fast >= slow`, `risk config invalid`, `all weights are 0`, `min score > max`). Weight inputs are clamped to ≥ 0 in the settings UI, so negative weights are not possible.

---

## 9. Signal conditions

**BUY** (exact):

```
chart timeframe is supported (15m / 1H / 4H)   // isSupportedSignalTF
AND 4H regime bullish (EMA50 > EMA200 AND strict rising slope AND separation ≥ 0.10%)
AND 1H confirmation (1H EMA21 > EMA50)
AND 1H momentum (1H close ≥ 1H EMA21)
AND entry structure (EMA9 > EMA21 AND close ≥ EMA9 AND gap expanding)
AND bullish crossover (chart TF)
AND candle quality (close > open AND body ≥ 50% of range)
AND ADX ≥ 18
AND ATR/close ≥ 0.05%
AND |close − EMA9|/ATR ≤ 1.5
AND all enabled optional gates pass
AND score ≥ MinimumScore (default 75)
AND valid position risk (risk ≤ MaximumRiskATR × ATR; structural SL from `lowest(low, 10)[1] − 0.5·ATR` or its documented fallback)
```

**SELL** (exact): mirrored.

**STRONG BUY** (optional, default on):

```
BUY conditions
AND score ≥ StrongScore (default 100)
```

**STRONG SELL**: mirrored. STRONG uses the same Entry/SL/TP levels as the base signal.

---

## 10. Position / risk engine (v3.1.0)

Replaces the old fixed ATR-multiplier model. Entry = `close` of the confirmed signal candle.

### Structural SL

BUY: `SL = lowest(low, SwingLookback)[1] − ATR × StructureBufferATR`

SELL: `SL = highest(high, SwingLookback)[1] + ATR × StructureBufferATR`

The `[1]` is mandatory — the swing uses **previously completed entry-timeframe bars only**, so the forming signal candle can never define its own structural stop (chart series only, no `request.security`, no lookahead). Defaults: lookback 10, buffer 0.5×ATR.

### Risk

`Risk = |Entry − SL|` (always positive for a valid position). `RiskATR = Risk / ATR` (safe division).

### Minimum-risk fallback

If the structural stop is **too tight or invalid** (`Risk < MinimumRiskATR × ATR`, e.g. the swing is inside the ATR buffer), the model does **not** reject the signal — it falls back to the documented ATR stop: BUY `SL = Entry − 1.5×ATR`, SELL `SL = Entry + 1.5×ATR`, then recalculates Risk/RiskATR. The final SL is always strictly below Entry (BUY) / above Entry (SELL).

### Maximum-risk rejection (hard gate)

If `Risk > MaximumRiskATR × ATR` (default 2.5), the setup is **rejected**: no marker, no Entry/SL/TP levels, no score label, no alert, and no last-signal-state update. Audit Mode shows `RISK TOO LARGE` (or `INVALID STRUCTURE` / `ATR INVALID` for the other risk-gate failures). This is a hard gate, not a score adjustment.

### ATR safety

If ATR is `na` or zero, no position is computed — the signal is rejected (`ATR INVALID`). No division by zero, no manufactured risk value.

### R-based take-profits

TPs are computed from the **actual risk**, never from ATR:

BUY: `TP1 = Entry + Risk × TP1_R`, `TP2 = Entry + Risk × TP2_R`

SELL: `TP1 = Entry − Risk × TP1_R`, `TP2 = Entry − Risk × TP2_R`

Defaults `TP1_R = 1.0`, `TP2_R = 2.5`, so TP1 = exactly 1R and TP2 = exactly 2.5R. The displayed R:R is **calculated from the prices** (`(TP1 − Entry)/Risk`, `(TP2 − Entry)/Risk`), so it always stays correct if the R-multiple inputs change.

---

## 11. Closed-candle discipline / no repaint

- Signals are only evaluated when `barstate.isconfirmed` (live bar) or on fully closed historical bars.
- **H4 methodology:** each H4 value is a separate `request.security(syminfo.tickerid, "240", expr, lookahead = barmerge.lookahead_off)` call. With `lookahead_off` the value only updates when an H4 candle **completes**: during the forming H4 candle it holds the last closed H4 value and is step-constant (never rewrites history); at the exact H4 boundary bar it is the just-completed candle's final value, which is confirmed data at that bar's close. The slope baseline `h4e50PrevH` applies `[1]` **inside** the H4 context — one H4 candle before the last closed one, i.e. two consecutive confirmed H4 values.
- **4H self mode:** on the 4H chart the trend is the chart's own EMA series. Intra-bar it moves with the forming candle's ticks, but signals require `barstate.isconfirmed`, so only the **closed candle's** final values are ever used — a forming 4H candle can never fire a signal. The slope baseline is the previous closed 4H candle.
- **Structural SL:** `lowest(low, N)[1]` / `highest(high, N)[1]` use only previously completed bars — the forming signal candle is excluded, so changing its low/high can never retroactively move the stop. Final Entry/SL/TP/Risk are deterministic after candle close; reloading reproduces the same values.
- Arrows, level lines, labels and alerts are created once per signal from closed data and are never re-evaluated; the latest-signal state (including Risk and R:R) is frozen in `var` variables and replaced only by a newer confirmed signal.
- There is no `lookahead_on` anywhere in the code.

---

## 12. Defaults summary

| Input | Default |
|---|---|
| 4H EMA Fast / Slow | 50 / 200 |
| 1H EMA Fast / Slow | 21 / 50 |
| Entry EMA Fast / Slow (chart TF) | 9 / 21 |
| Supported signal timeframes | 15m / 1H / 4H |
| ADX weight / period / minimum (gate) | 25 / 14 / 18.0 |
| ATR period | 14 |
| Swing lookback | 10 |
| Structure buffer (ATR) | 0.5 |
| Minimum risk (ATR) | 0.5 |
| Maximum risk (ATR) | 2.5 |
| TP1 / TP2 R multiple | 1.0 / 2.5 |
| Trend / 1H Conf / Slope weights | 25 / 25 / 25 |
| Minimum score | 75 |
| STRONG enabled / threshold | on / 100 |
| Min 4H regime separation | 0.10% |
| Require EMA gap expansion | on |
| Min candle body | 50% |
| Min volatility (ATR %) | 0.05% |
| Max entry distance (ATR) | 1.5 |
| Optional filters | all off |
| Alerts | off |

## 13. MT5 differences (Phase 2 v2.00)

- Attached to an **M15 chart** (enforced at init).
- Scoring is fixed at 25/25/25/25 (no weights input yet), minimum 75, no STRONG tier, no optional filters.
- Alert system: once per new confirmed signal, with symbol, direction, Entry/SL/TP1/TP2 and score.
