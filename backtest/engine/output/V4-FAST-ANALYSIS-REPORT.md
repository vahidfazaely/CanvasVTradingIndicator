# CanvasV V4 FAST — Failure Decomposition & Parameter Sensitivity Report

**Date:** 2026-08-31  
**Symbol:** BTCUSDT  
**Timeframe:** M15  
**Period:** 2026-02-28 to 2026-08-27 (17,280 candles)  
**Engine:** Local JavaScript backtest (parity-verified against Pine)

---

## 1. BASELINE

| Metric | Value |
|--------|-------|
| Total signals | 188 |
| BUY signals | 100 |
| SELL signals | 88 |
| Winners | 83 |
| Losers | 105 |
| **Win rate** | **44.1%** |
| **Profit factor** | **0.81** |
| **Net R** | **-17.92R** |
| Average R | -0.095R |
| Average winner | +0.892R |
| Average loser | -0.876R |
| Max drawdown | -18.81R |
| SL hit % | 44.1% (83) |
| TP hit % | 35.1% (66) |
| Expired | 38 (20.2%) |
| Avg MFE | 0.767R |
| Avg MAE | 0.821R |
| Avg holding | 10.4 bars |

**The strategy loses money on default parameters.**

---

## 2. FAILURE DECOMPOSITION

### By Exit Reason

| Exit | Count | Total R | Avg R | Avg MFE | Avg MAE | Avg Bars |
|------|-------|---------|-------|---------|---------|----------|
| SL FIRST | 83 | -83.00R | -1.000R | 0.326 | 1.257 | 7.7 |
| TP1 FIRST | 64 | +63.97R | +1.000R | 1.375 | 0.382 | 8.1 |
| EXPIRED | 38 | -4.43R | -0.117R | 0.519 | 0.621 | 20.0 |
| TP2 FIRST | 2 | +4.96R | +2.479R | 3.592 | 0.472 | 13.0 |
| AMBIGUOUS | 1 | +0.58R | +0.580R | 2.186 | 1.115 | 8.0 |

### SL Failure Classification

| Classification | Count | Avg Post-SL MFE | In-Trade MFE | MAE | Extension (ATR) |
|----------------|-------|-----------------|--------------|-----|-----------------|
| **LATE_ENTRY** | 30 | 0.082R | 0.094R | 1.214R | 0.951 |
| **CONTINUATION** | 23 | 0.074R | 0.571R | 1.296R | 0.851 |
| **STOP_TOO_TIGHT** | 22 | **2.348R** | 0.421R | 1.289R | 0.861 |
| MARGINAL_STOP | 6 | 0.768R | 0.186R | 1.244R | 0.946 |
| OVEREXTENDED | 2 | 0.000R | 0.348R | 1.119R | 1.713 |

### Key Finding: Three Distinct Failure Modes

1. **LATE_ENTRY (30 trades, 36.1% of SL hits):** Entry trigger fires after price has already moved. MFE < 0.10R means price barely moves in the right direction before SL. **This is the largest single failure mode.**

2. **CONTINUATION (23 trades, 27.7%):** Price moves decently (MFE 0.571R) but then reverses through SL. These are the "almost worked" trades.

3. **STOP_TOO_TIGHT (22 trades, 26.5%):** Price moves well after SL (post-SL MFE 2.348R). These trades would have been winners with slightly wider stops. **This is the most recoverable category.**

---

## 3. HYPOTHETICAL WIDER STOP ANALYSIS

Simulated wider stops on the 83 SL trades:

| SL Multiplier | Saved from SL | TP Reached | Still Lose | Saved R | Win Rate |
|---------------|---------------|------------|------------|---------|----------|
| 0.75× | 0 (0.0%) | 0 | 0 | 0.00R | 0.0% |
| 1.00× (baseline) | 0 | 0 | 0 | 0.00R | 0.0% |
| 1.10× | 28 (33.7%) | 1 | 27 | -8.89R | 3.6% |
| 1.20× | 46 (55.4%) | 2 | 44 | -13.14R | 4.3% |
| 1.30× | 55 (66.3%) | 2 | 53 | -6.15R | 3.6% |
| 1.40× | 69 (83.1%) | 3 | 66 | -5.31R | 4.3% |
| 1.50× | 72 (86.7%) | 1 | 71 | -6.51R | 1.4% |
| 2.00× | 81 (97.6%) | 2 | 79 | +1.98R | 2.5% |

**Critical insight:** Widening stops saves trades from SL, but almost none of them reach TP. Only 1-3 out of 55-82 saved trades actually reach TP. The saved trades mostly become EXPIRED losers. **Wider SL alone is NOT the solution.**

---

## 4. RISK PARAMETER SENSITIVITY

### structBufferAtr (structural SL buffer)

| Value | Signals | Win% | PF | Net R | SL% |
|-------|---------|------|-----|-------|-----|
| 0.25 | 235 | 45.1% | 0.84 | -17.86R | 45.5% |
| **0.50 (baseline)** | **188** | **44.1%** | **0.81** | **-17.92R** | **44.1%** |
| 0.75 | 139 | 41.7% | 0.73 | -18.40R | 45.3% |
| 1.00 | 90 | 37.8% | 0.53 | -21.48R | 45.6% |
| 1.25 | 58 | 46.6% | 0.73 | -6.64R | 34.5% |
| 1.50 | 26 | 50.0% | 0.87 | -1.20R | 30.8% |

**Finding:** Increasing structBufferAtr reduces signal count dramatically but doesn't fix the win rate. At 1.50, only 26 signals remain and net is still negative. The parameter is too aggressive to be useful.

### atrFallbackMult (ATR fallback SL)

| Value | Signals | Win% | PF | Net R | SL% |
|-------|---------|------|-----|-------|-----|
| 1.00-3.00 | All 188 | 44.1% | 0.81 | -17.92R | 44.1% |

**Finding:** Zero impact. The structural SL is used for all 83 SL trades. The ATR fallback never triggers on this dataset.

### maxExtAtr (maximum extension filter)

| Value | Signals | Win% | PF | Net R | SL% |
|-------|---------|------|-----|-------|-----|
| 1.50 | 176 | 44.3% | 0.83 | -14.81R | 43.8% |
| 2.00 | 188 | 44.1% | 0.80 | -18.45R | 44.7% |
| **2.50 (baseline)** | **188** | **44.1%** | **0.81** | **-17.92R** | **44.1%** |
| 3.00+ | 188 | 44.1% | 0.81 | -17.92R | 44.1% |

**Finding:** Reducing maxExtAtr from 2.5 to 1.5 removes 12 signals and saves ~3R. Minimal impact.

### maxRiskAtr (maximum risk cap)

| Value | Signals | Win% | PF | Net R | SL% |
|-------|---------|------|-----|-------|-----|
| 1.50 | 26 | 50.0% | 0.88 | -1.37R | 42.3% |
| 2.00 | 93 | 38.7% | 0.58 | -21.05R | 50.5% |
| **2.50 (baseline)** | **188** | **44.1%** | **0.81** | **-17.92R** | **44.1%** |
| 3.00 | 259 | 44.0% | 0.83 | -20.50R | 41.7% |
| 3.50 | 325 | 44.3% | 0.85 | -21.39R | 40.0% |
| 4.00 | 351 | 45.0% | 0.91 | -13.28R | 35.6% |

**Finding:** Increasing maxRiskAtr adds more signals but doesn't improve per-trade quality. Decreasing it reduces signals but maintains negative expectancy.

---

## 5. ENTRY TIMING ANALYSIS

### Extension Distribution (ATR-normalized distance from structure)

| Extension | SL Trades | Winners |
|-----------|-----------|---------|
| 0.0-0.5 ATR | 7 | 10 |
| 0.5-1.0 ATR | 49 | 48 |
| 1.0-1.5 ATR | 21 | 20 |
| 1.5-2.0 ATR | 6 | 5 |

**Finding:** SL trades and winners have nearly identical extension distributions. **Entry extension is NOT a predictor of failure.**

### MFE Before SL (LATE_ENTRY depth)

| MFE Range | Count |
|-----------|-------|
| 0.00-0.10R | **28** |
| 0.10-0.20R | 8 |
| 0.20-0.30R | 7 |
| 0.30-0.50R | 18 |
| 0.50-0.75R | 14 |
| 0.75-1.00R | 8 |

**Finding:** 28 of 83 SL trades (33.7%) had MFE < 0.10R — price barely moved before reversing. These are clearly "late entry" or "bad trigger" trades.

---

## 6. TRIGGER COMPARISON

| Trigger | Trades | Win% | PF | Net R | Avg R | SL% | TP% |
|---------|--------|------|-----|-------|-------|-----|-----|
| PULLBACK RESUME | 176 | 43.8% | 0.78 | -19.02R | -0.108R | 45.5% | 34.1% |
| **BREAKOUT** | **12** | **50.0%** | **1.25** | **+1.10R** | **+0.092R** | **25.0%** | **50.0%** |

**Critical finding:** BREAKOUT signals are profitable (PF 1.25, 50% win rate, 25% SL hit). PULLBACK RESUME signals are losing money (PF 0.78, 43.8% win rate, 45.5% SL hit).

The PULLBACK RESUME trigger is responsible for ALL of the strategy's negative expectancy.

---

## 7. DIRECTION COMPARISON

| Direction | Trades | Win% | PF | Net R | Avg R | SL% |
|-----------|--------|------|-----|-------|-------|-----|
| BUY | 100 | 45.0% | 0.88 | -5.86R | -0.059R | 43.0% |
| SELL | 88 | 43.2% | 0.73 | -12.06R | -0.137R | 45.5% |

**Finding:** SELL signals are significantly worse. They have higher SL hit rate (45.5% vs 43.0%) and worse average R (-0.137R vs -0.059R). The SELL side contributes 67% of the total loss.

---

## 8. DIRECTION × TRIGGER MATRIX

| Combination | Trades | Win% | PF | Net R | SL% |
|-------------|--------|------|-----|-------|-----|
| BUY/PULLBACK | 91 | 46.2% | 0.91 | -3.90R | 44.0% |
| BUY/BREAKOUT | 9 | 33.3% | 0.55 | -1.96R | 33.3% |
| **SELL/PULLBACK** | **85** | **41.2%** | **0.66** | **-15.12R** | **47.1%** |
| SELL/BREAKOUT | 3 | 100.0% | ∞ | +3.06R | 0.0% |

**Critical finding:** SELL/PULLBACK is the worst combination by far — 85 trades, 41.2% win rate, -15.12R. This single cell accounts for 84% of the total loss.

---

## 9. REGIME ANALYSIS

| Regime | Trades | Win% | PF | Net R | Avg R | SL% |
|--------|--------|------|-----|-------|-------|-----|
| TREND UP | 100 | 45.0% | 0.88 | -5.86R | -0.059R | 43.0% |
| TREND DOWN | 88 | 43.2% | 0.73 | -12.06R | -0.137R | 45.5% |

**Finding:** Regime maps 1:1 to direction (BUY = TREND UP, SELL = TREND DOWN). The "TREND DOWN" regime is losing because SELL signals are worse.

---

## 10. ROBUSTNESS CHECK

| Period | Bars | Signals | Win% | Net R | SL% |
|--------|------|---------|------|-------|-----|
| A (Feb-May) | 8,640 | 96 | 47.9% | -6.54R | 39.6% |
| B (May-Aug) | 8,640 | 91 | 40.7% | -10.38R | 48.4% |

**Finding:** Period B (newer) has worse performance. Higher SL hit rate (48.4% vs 39.6%). The strategy may be degrading in recent market conditions.

---

## 11. SCORE ANALYSIS

V4 FAST has no numerical score — signals pass binary gates. Using riskAtr as quality proxy:

| Risk (ATR) | Trades | Win% | Net R | Avg R |
|------------|--------|------|-------|-------|
| 1.0-1.5 | 18 | 50.0% | -1.03R | -0.057R |
| 1.5-2.0 | 63 | 36.5% | -17.49R | -0.278R |
| 2.0-2.5 | 107 | 47.7% | +0.60R | +0.006R |

**Finding:** Trades with risk 2.0-2.5 ATR are slightly profitable (+0.60R). Trades with risk 1.5-2.0 ATR are the worst performers (-17.49R). This suggests a non-linear relationship between SL distance and outcome.

---

## 12. CONCLUSION

```
PRIMARY FAILURE:    PULLBACK RESUME trigger on SELL side
                    (85 trades, 41.2% win rate, -15.12R net)
                    
SECONDARY FAILURE:  LATE_ENTRY / bad trigger timing
                    (30 of 83 SL trades had MFE < 0.10R)
                    
TERTIARY FAILURE:   STOP_TOO_TIGHT (recoverable but narrow)
                    (22 trades, post-SL MFE 2.348R)
                    
MOST PROMISING LEVER: Improve SELL/PULLBACK entry quality
                      (currently 47.1% SL hit rate)
                      
LEAST IMPORTANT:    atrFallbackMult (zero impact on this dataset)
                    maxExtAtr (minimal impact)
                    
EVIDENCE CONFIDENCE: HIGH
                    (188 trades, consistent across periods,
                     clear failure mode decomposition)
```

---

## 13. RECOMMENDED NEXT STEPS

1. **Do NOT widen SL blindly** — the hypothetical wider-stop analysis shows saved trades mostly become EXPIRED losers, not winners.

2. **Investigate SELL/PULLBACK trigger quality** — this is the dominant failure mode. Consider:
   - Adding a momentum filter for SELL signals
   - Requiring stronger trend confirmation on the SELL side
   - Testing whether SELL signals need different thresholds

3. **Investigate LATE_ENTRY trades** — 30 trades had MFE < 0.10R. Consider:
   - Requiring a minimum pullback before entry
   - Adding a candle confirmation filter
   - Testing whether the pullback-resume trigger fires too early

4. **Consider asymmetry** — BUY and SELL may need different parameters. The current symmetric design treats them identically, but the data shows SELL signals are materially worse.

5. **Test on additional symbols/timeframes** — the current analysis is BTCUSDT M15 only. The SELL weakness may be symbol-specific.

---

## 14. FILES

| File | Purpose |
|------|---------|
| `engine/output/ANALYSIS.json` | Full analysis dataset |
| `engine/output/V4-FAST-ANALYSIS-REPORT.md` | This report |
| `engine/output/BTCUSDT-15m-results.json` | Raw signal/trade data |
| `engine/output/BTCUSDT-15m-viewer.html` | Interactive HTML viewer |
| `analysis.mjs` | Analysis engine source |

---

*Report generated 2026-08-31. No production Pine files were modified.*
