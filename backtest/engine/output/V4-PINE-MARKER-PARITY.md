# V4 Pine Numeric Marker Parity — full vs Lite

> Generated: 2026-09-03 13:21:54 — engine data: BTCUSDT, ETHUSDT, SOLUSDT M15 — engine: backtest/engine.mjs (pre-validated Pine mirror)
> Method: both Pine files' declared inputs are parsed and run through the engine with \`audit:true\`; outputs compared candle-by-candle.

## Verdict: ✅ PASS

Signal-affecting input defaults are identical across FULL Pine, LITE Pine and the engine reference.

## Input defaults compared (46 signal-affecting inputs)

| Input | FULL | LITE | Engine |
|---|---|---|---|
| regimeBars | 10 | 10 | 10 |
| regimeMinSlope | 0.05 | 0.05 | 0.05 |
| atrRegimeLen | 100 | 100 | 100 |
| highVolPct | 130 | 130 | 130 |
| atrPeriod | 14 | 14 | 14 |
| emaTrigLen | 9 | 9 | 9 |
| emaDirLen | 21 | 21 | 21 |
| emaSlowLen | 50 | 50 | 50 |
| momSlopeBars | 3 | 3 | 3 |
| enablePullback | true | true | true |
| enableBreakout | true | true | true |
| pullbackLookback | 5 | 5 | 5 |
| pullbackTolPct | 0.5 | 0.5 | 0.5 |
| breakoutBars | 10 | 10 | 10 |
| maxExtAtr | 1.5 | 1.5 | 1.5 |
| useStrictExt | true | true | true |
| minBodyPct | 0 | 0 | 0 |
| swingLookback | 10 | 10 | 10 |
| structBufferAtr | 0.5 | 0.5 | 0.5 |
| minRiskAtr | 0.5 | 0.5 | 0.5 |
| maxRiskAtr | 4 | 4 | 4 |
| tp1R | 1 | 1 | 1 |
| tp2R | 2.5 | 2.5 | 2.5 |
| atrStopMult | 1.5 | 1.5 | 1.5 |
| enableFixedRisk | true | true | true |
| riskPerTrade | 0.5 | 0.5 | 0.5 |
| maxPosSize | 0 | 0 | 0 |
| enableBtBuffer | true | true | true |
| breakoutBuffer | 0.1 | 0.1 | 0.1 |
| enableCloseLoc | true | true | true |
| closeLocMinLong | 0.7 | 0.7 | 0.7 |
| closeLocMinShort | 0.3 | 0.3 | 0.3 |
| enableBtExtFilter | true | true | true |
| breakoutExtAtr | 2 | 2 | 2 |
| enableRelVol | true | true | true |
| volLookback | 20 | 20 | 20 |
| volMinBreakout | 1.2 | 1.2 | 1.2 |
| volMinPullback | 1.1 | 1.1 | 1.1 |
| hvMode | Stronger Confirmation | Stronger Confirmation | Stronger Confirmation |
| hvVolMin | 1.4 | 1.4 | 1.4 |
| hvCloseLocLong | 0.75 | 0.75 | 0.75 |
| hvCloseLocShort | 0.25 | 0.25 | 0.25 |
| enableMidTradeBE | false | false | false |
| beBarThreshold | 10 | 10 | 10 |
| staleBarLimit | 15 | 15 | 15 |
| outcomeBars | 20 | 20 | 20 |

Signal inputs declared in FULL Pine but missing in LITE (engine drift guard): none.

## Per-symbol candle-by-candle comparison

### BTCUSDT

| Metric | Value |
|---|---|
| Candles | 17,280 |
| Processed (audit) bars | 17,175 |
| Signals (full / lite) | 36 / 36 |
| Trades (full / lite) | 36 / 36 |
| Audit-row field diffs | 0 |
| Signal diffs | 0 |
| Trade diffs | 0 |

✅ IDENTICAL

### ETHUSDT

| Metric | Value |
|---|---|
| Candles | 17,280 |
| Processed (audit) bars | 17,175 |
| Signals (full / lite) | 39 / 39 |
| Trades (full / lite) | 39 / 39 |
| Audit-row field diffs | 0 |
| Signal diffs | 0 |
| Trade diffs | 0 |

✅ IDENTICAL

### SOLUSDT

| Metric | Value |
|---|---|
| Candles | 17,280 |
| Processed (audit) bars | 17,175 |
| Signals (full / lite) | 29 / 29 |
| Trades (full / lite) | 29 / 29 |
| Audit-row field diffs | 0 |
| Signal diffs | 0 |
| Trade diffs | 0 |

✅ IDENTICAL


## Summary

- Audit-row marker/gate diffs (full vs lite): **0**
- Signal SL/TP geometry diffs: **0**
- Trade-stream diffs: **0**
- Covers: entryUp/entryDn and every stage boolean (regime, momentum, trigger, breakout gates, volume, HV, risk) per candle, plus each signal's entry/SL/TP1/TP2/riskAtr and the resulting trade exits.
