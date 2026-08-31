# CanvasV V4 FAST — Pine → JavaScript Parity Audit

## A. Pine → JS Parity

### Overall Status: **PASS WITH ONE BUG FIXED**

One bug was found and fixed. With default parameters, the bug has no effect (both `enablePullback` and `enableBreakout` default to `true`). The fix was applied and the baseline was re-verified — results are identical.

### Bug Found and Fixed

| Location | Pine | JS (before fix) | JS (after fix) |
|----------|------|-----------------|----------------|
| `pullbackDn` trigger | `enablePullback and touchHighDn and reclaimDn` | `p.enableBreakout && touchHighDn && reclaimDn` | `p.enablePullback && touchHighDn && reclaimDn` |

**Impact:** If `enablePullback=false` and `enableBreakout=true`, pullback-down signals would incorrectly fire. With default settings (both true), no impact.

### Condition-by-Condition Audit

#### Regime

| Component | Pine Expression | JS Expression | Equivalent |
|-----------|----------------|---------------|------------|
| ATR | `ta.atr(atrPeriod)` | RMA: `atr[i] = (atr[i-1] * (period-1) + tr[i]) / period` | ✅ YES |
| ATR average | `ta.sma(atrVal, atrRegimeLen)` | `calcSMA(atr, atrRegimeLen)` | ✅ YES |
| Regime slope | `(emaSlow - emaSlow[regimeBars]) / (atrVal * regimeBars)` | Same formula | ✅ YES |
| Trending | `abs(regimeSlope) >= regimeMinSlope` | `Math.abs(regimeSlope) >= regimeMinSlope` | ✅ YES |
| High volatility | `atrVsAvg >= highVolPct` | `atrVsAvg >= highVolPct` | ✅ YES |
| trendUp | `trending and emaDir > emaSlow and emaSlow > emaSlow[regimeBars]` | Same | ✅ YES |
| trendDn | `trending and emaDir < emaSlow and emaSlow < emaSlow[regimeBars]` | Same | ✅ YES |

#### Direction / Momentum

| Component | Pine Expression | JS Expression | Equivalent |
|-----------|----------------|---------------|------------|
| EMA calc | `ta.ema(close, period)` | `calcEMA(closes, period)` — SMA init + multiplier `2/(period+1)` | ✅ YES |
| momUp | `emaTrig > emaTrig[momSlopeBars] and close >= emaDir` | Same | ✅ YES |
| momDn | `emaTrig < emaTrig[momSlopeBars] and close <= emaDir` | Same | ✅ YES |
| setupUp | `trendUp and momUp` | Same | ✅ YES |
| setupDn | `trendDn and momDn` | Same | ✅ YES |

#### Triggers

| Component | Pine Expression | JS Expression | Equivalent |
|-----------|----------------|---------------|------------|
| touchLowUp | `ta.lowest(low, pullbackLookback)[1] <= emaDir * (1 + pullbackTol)` | `lowestLowPB[i-1] <= emaDir[i] * (1 + pullbackTol)` | ✅ YES |
| touchHighDn | `ta.highest(high, pullbackLookback)[1] >= emaDir * (1 - pullbackTol)` | `highestHighPB[i-1] >= emaDir[i] * (1 - pullbackTol)` | ✅ YES |
| reclaimUp | `close > emaTrig and close[1] <= emaTrig[1]` | `c.close > emaTrig[i] && candles[i-1].close <= emaTrig[i-1]` | ✅ YES |
| reclaimDn | `close < emaTrig and close[1] >= emaTrig[1]` | Same | ✅ YES |
| pullbackUp | `enablePullback and touchLowUp and reclaimUp` | Same | ✅ YES |
| pullbackDn | `enablePullback and touchHighDn and reclaimDn` | **FIXED** (was `enableBreakout`) | ✅ YES (after fix) |
| breakUp | `enableBreakout and close > ta.highest(high, breakoutBars)[1]` | `enableBreakout && c.close > highestHighBO[i-1]` | ✅ YES |
| breakDn | `enableBreakout and close < ta.lowest(low, breakoutBars)[1]` | Same | ✅ YES |

#### Entry Quality

| Component | Pine Expression | JS Expression | Equivalent |
|-----------|----------------|---------------|------------|
| bodyPct | `abs(close - open) / candleRange * 100` | Same | ✅ YES |
| bodyOkUp | `minBodyPct <= 0 or (close > open and bodyPct >= minBodyPct)` | Same | ✅ YES |
| bodyOkDn | `minBodyPct <= 0 or (close < open and bodyPct >= minBodyPct)` | Same | ✅ YES |
| extAtrUp | `(close - emaDir) / atrVal` | Same | ✅ YES |
| extAtrDn | `(emaDir - close) / atrVal` | Same | ✅ YES |

#### Risk / SL

| Component | Pine Expression | JS Expression | Equivalent |
|-----------|----------------|---------------|------------|
| swingLow | `ta.lowest(low, swingLookback)[1]` | `swingLow[i-1]` (rolling low shifted) | ✅ YES |
| swingHigh | `ta.highest(high, swingLookback)[1]` | `swingHigh[i-1]` (rolling high shifted) | ✅ YES |
| structSLBuy | `swingLow - atrVal * structBufferAtr` | Same | ✅ YES |
| structSLSell | `swingHigh + atrVal * structBufferAtr` | Same | ✅ YES |
| slModeBuy | `riskStructBuy >= minRiskAtr * atrVal` | Same | ✅ YES |
| slBuy (struct) | `structSLBuy` | Same | ✅ YES |
| slBuy (fallback) | `entry - atrFallbackMult * atrVal` | Same | ✅ YES |
| riskBuy | `entry - slBuy` | Same | ✅ YES |
| riskGateBuyOk | `atrUsable and slBuy < entry and riskAtrBuy <= maxRiskAtr` | Same | ✅ YES |
| tp1Buy/tp2Buy | `entry + riskBuy * tp1R/tp2R` | Same | ✅ YES |

#### Position State

| Component | Pine Expression | JS Expression | Equivalent |
|-----------|----------------|---------------|------------|
| Entry | `entry = close` | `entry = c.close` | ✅ YES |
| SL check | `low <= posSL` / `high >= posSL` | Same | ✅ YES |
| TP check | `high >= posTP1` / `low <= posTP1` | Same | ✅ YES |
| MFE | `(high - posEntry) / posRisk` (LONG) | Same | ✅ YES |
| MAE | `(posEntry - low) / posRisk` (LONG) | Same | ✅ YES |
| Outcome priority | SL+TP > SL > TP2 > TP1 > EXPIRED | Same | ✅ YES |
| AMBIGUOUS finalR | `(close - posEntry) / posRisk` | Same | ✅ YES |
| SL FIRST finalR | `-1.0` | Same | ✅ YES |
| Expiry | `posAge >= outcomeBars` | Same | ✅ YES |
| Supersede | Close opposite + open new | Same | ✅ YES |

---

## B. Pine Semantics Audit

| Pine Concept | Implementation | Verified |
|--------------|----------------|----------|
| `barstate.isconfirmed` | All historical bars are confirmed; JS processes every bar | ✅ |
| Series `[1]` shift | `arr[i-1]` — previous bar's value | ✅ |
| `ta.ema` | SMA init + `2/(period+1)` multiplier | ✅ |
| `ta.atr` | Wilder's RMA: `period` SMA init, then `(prev * (p-1) + tr) / p` | ✅ |
| `ta.sma` | Simple rolling average | ✅ |
| `ta.lowest` / `ta.highest` | Rolling min/max over N bars | ✅ |
| `na` handling | NaN propagation; JS uses `isNaN()` checks | ✅ |
| Warmup bars | JS skips first `max(emaSlowLen, atrRegimeLen, swingLookback) + 5` bars | ✅ |
| Boolean `and` | JS `&&` (short-circuit) | ✅ |
| Float/int | JS uses `parseFloat` for OHLC; all math is floating-point | ✅ |

---

## C. Signal Parity

### Baseline Comparison

| Metric | Before Fix | After Fix | Delta |
|--------|-----------|-----------|-------|
| Total signals | 188 | 188 | 0 |
| BUY signals | 100 | 100 | 0 |
| SELL signals | 88 | 88 | 0 |
| Win rate | 44.1% | 44.1% | 0 |
| Net R | -17.92 | -17.92 | 0 |
| SL hit % | 44.1% | 44.1% | 0 |

**Conclusion:** With default parameters, the bug fix produces identical results. The fix is correct and has no impact on the default baseline.

### Signal Timestamp Parity

Cannot compare exact Pine timestamps without running the Pine script in TradingView. However, the logic is mathematically identical, so for the same input data, signal timestamps must match exactly.

**Limitation:** Pine processes confirmed bars only; JS processes all bars. For historical data, this is equivalent.

---

## D. Entry/SL Parity

### Entry Price
- Pine: `entry = close` (close of the confirmed signal bar)
- JS: `entry = c.close` (close of the current bar)
- **Equivalent:** ✅

### SL Calculation
- Pine: `structSLBuy = swingLow - atrVal * structBufferAtr`
- JS: Same formula
- **Equivalent:** ✅

### SL Validation
- Pine: `slBuy < entry and riskAtrBuy <= maxRiskAtr`
- JS: Same
- **Equivalent:** ✅

### Maximum Difference
With identical input data and parameters, the maximum difference in entry/SL should be **zero** (bit-identical for the same floating-point operations).

---

## E. Trade Simulator Audit

### TP/SL Ordering

| Scenario | Pine | JS | Equivalent |
|----------|------|-----|------------|
| SL hit alone | `posOutcome := "SL FIRST"`, `posFinalR := -1.0` | Same | ✅ |
| TP1 hit alone | `posOutcome := "TP1 FIRST"`, R = close-based | Same | ✅ |
| TP2 hit alone | `posOutcome := "TP2 FIRST"`, R = close-based | Same | ✅ |
| SL + TP on same bar | `posOutcome := "AMBIGUOUS"`, R = close-based | Same | ✅ |
| TP1 + TP2 on same bar | `tp2T` checked first → "TP2 FIRST" | Same | ✅ |
| No hit, age >= 20 | `posOutcome := "EXPIRED"`, R = close-based | Same | ✅ |

### Ambiguous Candle Resolution

When a candle's `high >= TP` AND `low <= SL`:
- Pine: `AMBIGUOUS`, finalR = close-based (not SL-based)
- JS: Same — `AMBIGUOUS`, finalR = close-based
- **Equivalent:** ✅

**Note:** Both implementations treat SL+TP on the same bar as ambiguous. The final R is computed from the close price, which is the best available information for intrabar ordering.

### Entry-Bar Behavior

- Pine: `bar_index > posBar` — tracking starts from bar AFTER entry
- JS: `barIdx > posBar` — same
- **Equivalent:** ✅

### End-of-Data Behavior

- Pine: If position is open at last bar, it remains "unresolved"
- JS: Same — no trade is recorded until resolution
- **Equivalent:** ✅

---

## F. MFE/MAE Audit

### Measurement Definitions

| Metric | Pine Formula | JS Formula | Equivalent |
|--------|-------------|------------|------------|
| MFE (LONG) | `(high - posEntry) / posRisk` | Same | ✅ |
| MFE (SHORT) | `(posEntry - low) / posRisk` | Same | ✅ |
| MAE (LONG) | `(posEntry - low) / posRisk` | Same | ✅ |
| MAE (SHORT) | `(high - posEntry) / posRisk` | Same | ✅ |

### Measurement Scope

- **Start:** Entry bar (bar after entry)
- **End:** Resolution bar (SL/TP/expiry)
- **Price basis:** High/Low of each bar during the trade
- **Normalization:** In R (divided by posRisk)
- **Accumulation:** Running max from entry to exit

### Post-SL MFE

- **Start:** Bar after SL exit
- **End:** `exitBar + 20` bars (configurable)
- **Price basis:** High/Low of each post-exit bar
- **Normalization:** In R (divided by original posRisk)
- **This is NOT in Pine** — it's a local diagnostic addition

---

## G. Failure Classification Audit

### Definitions (Local Analysis — Not in Pine)

| Category | Condition | Count | % |
|----------|-----------|-------|---|
| STOP_TOO_TIGHT | Post-SL MFE >= 1.0R (price moved 1R+ after stop) | 22 | 26.5% |
| MARGINAL_STOP | Post-SL MFE >= 0.5R but < 1.0R | 6 | 7.2% |
| LATE_ENTRY | In-trade MFE < 0.3R (never moved favorably) | 30 | 36.1% |
| OVEREXTENDED | Entry extension > 1.5 ATR from direction EMA | 2 | 2.4% |
| CONTINUATION | Everything else | 23 | 27.7% |

### Post-SL MFE Calculation

- Average post-SL MFE: 0.728R
- This means: across all SL-hit trades, price moved an average of 0.728R in the intended direction AFTER being stopped out (within 20 bars)
- **This is a diagnostic metric, not a strategy component**

---

## H. Known Limitations

1. **Cannot run Pine locally** — True parity requires running the Pine script in TradingView and comparing signal-by-signal. The JS engine is a faithful translation but cannot be proven identical without this comparison.

2. **Intrabar ordering** — Both Pine and JS use the same assumption: if SL and TP are both hit on the same bar, it's ambiguous (AMBIGUOUS outcome). Neither can determine the true intrabar sequence from OHLC data alone.

3. **Real-time vs historical** — Pine's `barstate.isconfirmed` only matters for real-time bars. For historical data (which is what we backtest on), all bars are confirmed. The JS engine is equivalent for historical data.

4. **Floating-point precision** — Pine uses 64-bit floating-point internally. JavaScript also uses 64-bit IEEE 754. Minor rounding differences may exist but should not affect signal generation.

5. **Failure classification thresholds** — The classification thresholds (STOP_TOO_TIGHT >= 1.0R, LATE_ENTRY MFE < 0.3R, etc.) are analytical choices, not part of the V4 FAST strategy. They may need adjustment based on further analysis.
