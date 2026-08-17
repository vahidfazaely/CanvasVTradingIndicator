# Strategy — CanvasV MTF Signal

This document describes the **current baseline** (TradingView `v2.2.0` / MT5 Phase 2 `v2.00`) signal logic precisely. It is a documentation of *what the code does*, not a proposal. The v2.1.0 and v2.2.0 releases changed presentation only — the logic described here is identical to v2.0.2.

---

## 1. Architecture

| Layer | Source |
|---|---|
| Trend filter | H4 EMA 50 / EMA 200 + EMA 50 slope |
| Entry | Current chart timeframe (TradingView) or M15 (MT5) |
| Confirmation | ADX ≥ minimum on the entry timeframe |
| Risk | ATR(14) → Entry, SL, TP1, TP2 |
| Confidence | Weighted score 0–100, minimum 75 |

### TradingView multi-timeframe behaviour

- Chart TF **< H4**: trend comes from four single-line `request.security(syminfo.tickerid, "240", ..., lookahead = barmerge.lookahead_off)` calls → the **last closed H4 candle** (confirmed, step-constant).
- Chart TF **≥ H4** (4H/6H/12H/D/W): trend is computed on the **chart timeframe itself** (self mode) and the panel labels it `Trend (chart TF)`. On a 4H chart this is exactly H4. On 6H/12H/D/W it is **not** the H4 trend — it is the trend of the chart timeframe (a slower EMA 50/200). This is a deliberate consequence of self mode, not a bug: the strategy's "higher timeframe" horizon becomes the chart timeframe itself, so the trend horizon is never *below* the entry horizon. If literal H4 trend filtering is required on 6H+ charts, that is a future change.
- Entry EMAs, ADX and ATR always use the current chart timeframe.

---

## 2. H4 trend

Closed H4 candles only. For BUY:

- **Trend bullish:** `H4 EMA 50 > H4 EMA 200`
- **Slope confirmation:** `H4 EMA 50 (current closed) >= H4 EMA 50 (previous closed)`

For SELL (mirrored):

- **Trend bearish:** `H4 EMA 50 < H4 EMA 200`
- **Slope confirmation:** `H4 EMA 50 (current closed) <= H4 EMA 50 (previous closed)`

The slope compares two **consecutive closed H4 candles** (never the forming H4 candle).

---

## 3. EMA 9/21 entry

On the entry timeframe, with `emaF = EMA 9`, `emaS = EMA 21`:

- **Bullish crossover:** `emaF[previous] <= emaS[previous] AND emaF[current] > emaS[current]`
- **Bearish crossover:** `emaF[previous] >= emaS[previous] AND emaF[current] < emaS[current]`

Evaluated only on **closed candles**.

---

## 4. ADX filter

- `ADX = ta.dmi(period, period)` main line (Wilder's ADX; Pine has no `ta.adx`).
- Defaults: period 14, minimum 20.0.
- The ADX value of the **closed signal candle** is used.
- Weight configurable; set to 0 to disable the ADX component.

---

## 5. Optional filters (TradingView; all OFF by default)

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

## 6. Scoring

Each component contributes its weight when satisfied:

| Component | Default weight | BUY condition | SELL condition |
|---|---|---|---|
| Trend | 25 | H4 bullish | H4 bearish |
| Momentum | 25 | Bullish crossover | Bearish crossover |
| ADX | 25 | ADX ≥ minimum | ADX ≥ minimum |
| Slope | 25 | H4 EMA 50 rising | H4 EMA 50 falling |
| Volatility | 0 | ATR regime ok | ATR regime ok |
| Volume | 0 | Volume ok | Volume ok |

`maxScore = sum of enabled weights` (default 100). A disabled component contributes 0 to both score and max.

**Config validation:** signals are suppressed when the inputs are internally inconsistent:

- any EMA Fast ≥ its Slow (H4 or entry),
- all weights are 0 (`maxScore = 0`),
- `MinimumScore > maxScore`.

The panel header then reads `CONFIG ERROR` and the bottom row shows the reason (`EMA fast >= slow`, `all weights are 0`, `min score > max`). Weight inputs are clamped to ≥ 0 in the settings UI, so negative weights are not possible.

---

## 7. Signal conditions

**BUY** (exact):

```
H4 bullish
AND bullish crossover
AND all enabled optional gates pass
AND score ≥ MinimumScore (default 75)
```

**SELL** (exact): mirrored.

**STRONG BUY** (optional, default on):

```
BUY conditions
AND score ≥ StrongScore (default 100)
```

**STRONG SELL**: mirrored. STRONG uses the same Entry/SL/TP levels as the base signal.

---

## 8. ATR risk levels

ATR period 14, values of the closed signal candle, Entry = signal candle close:

| | BUY | SELL |
|---|---|---|
| Entry | `close` | `close` |
| SL | `Entry − ATR × 1.5` | `Entry + ATR × 1.5` |
| TP1 | `Entry + ATR × 1.5` | `Entry − ATR × 1.5` |
| TP2 | `Entry + ATR × 3.0` | `Entry − ATR × 3.0` |

Multipliers are configurable inputs.

---

## 9. Closed-candle discipline / no repaint

- Signals are only evaluated when `barstate.isconfirmed` (live bar) or on fully closed historical bars.
- **H4 methodology:** each H4 value is a separate `request.security(syminfo.tickerid, "240", expr, lookahead = barmerge.lookahead_off)` call. With `lookahead_off` the value only updates when an H4 candle **completes**: during the forming H4 candle it holds the last closed H4 value and is step-constant (never rewrites history); at the exact H4 boundary bar it is the just-completed candle's final value, which is confirmed data at that bar's close. The slope baseline `h4e50PrevH` applies `[1]` **inside** the H4 context — one H4 candle before the last closed one, i.e. two consecutive confirmed H4 values.
- Arrows, level lines, labels and alerts are created once per signal from closed data and are never re-evaluated; the latest-signal state is frozen in `var` variables and replaced only by a newer confirmed signal.
- There is no `lookahead_on` anywhere in the code.

---

## 10. Defaults summary

| Input | Default |
|---|---|
| H4 EMA Fast / Slow | 50 / 200 |
| Entry EMA Fast / Slow | 9 / 21 |
| ADX weight / period / minimum | 25 / 14 / 20.0 |
| ATR period / SL / TP1 / TP2 | 14 / 1.5 / 1.5 / 3.0 |
| Trend / Momentum / Slope weights | 25 / 25 / 25 |
| Minimum score | 75 |
| STRONG enabled / threshold | on / 100 |
| Optional filters | all off |
| Alerts | off |

## 11. MT5 differences (Phase 2 v2.00)

- Attached to an **M15 chart** (enforced at init).
- Scoring is fixed at 25/25/25/25 (no weights input yet), minimum 75, no STRONG tier, no optional filters.
- Alert system: once per new confirmed signal, with symbol, direction, Entry/SL/TP1/TP2 and score.
