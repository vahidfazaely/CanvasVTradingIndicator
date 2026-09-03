# V4.2 Lite — 90/90 Hold-Out Protocol Verification

> Generated: 2026-09-03 13:21:54 — engine: backtest/engine.mjs (pre-validated Pine mirror) — protocol: r1-forensics 90/90 midpoint split, indicators recomputed per slice.
> Builds compared: FULL Pine (CanvasV_V4_FAST.pine) vs LITE Pine (CanvasV_V4_FAST_lite.pine), 46 parsed signal-affecting inputs each (identical overlay).

## Verdict: ✅ PASS

- **FULL ≡ LITE** on all 3 windows (full / first-90 / second-90) of all 3 symbols — 17 metrics per window, zero divergence.
- **Full-window baselines reproduce the documented V4.2 production (CUR) results** for BTC, ETH and SOL within rounding tolerance.

### BTCUSDT — 17,280 candles (half = 8,640)

#### Full window vs documented V4.2 production baseline (CUR)

| Field | Documented | Lite (= FULL) | Status |
|---|---|---|---|
| Trades | 36 | 36 | ✅ |
| Win rate % | 58.3 | 58.3 | ✅ |
| PF | 1.7 | 1.7 | ✅ |
| Net R | 6.43 | 6.43 | ✅ |
| Avg R | 0.179 | 0.179 | ✅ |
| Max DD (R) | 1.52 | 1.52 | ✅ |
| LONG n | 22 | 22 | ✅ |
| LONG netR | 7.86 | 7.86 | ✅ |
| SHORT n | 14 | 14 | ✅ |
| SHORT netR | -1.43 | -1.43 | ✅ |

#### 90/90 hold-out — FULL vs LITE per window

| Window | Candles | Signals | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R | F≡L |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---|---|
| full | 17,280 | 36 | 36 | 58.3 | 1.7 | +6.43 | +0.18 | +1.52 | 22 / +7.86 | 14 / -1.43 | 34 / +7.35 | 2 / -0.92 | ✅ |
| first-90 | 8,640 | 20 | 20 | 70.0 | 1.9 | +4.77 | +0.24 | +1.22 | 11 / +4.58 | 9 / +0.19 | 20 / +4.77 | 0 / +0.00 | ✅ |
| second-90 | 8,640 | 16 | 16 | 43.8 | 1.4 | +1.66 | +0.10 | +1.52 | 11 / +3.28 | 5 / -1.62 | 14 / +2.58 | 2 / -0.92 | ✅ |

### ETHUSDT — 17,280 candles (half = 8,640)

#### Full window vs documented V4.2 production baseline (CUR)

| Field | Documented | Lite (= FULL) | Status |
|---|---|---|---|
| Trades | 39 | 39 | ✅ |
| Win rate % | 56.4 | 56.4 | ✅ |
| PF | 1.7 | 1.7 | ✅ |
| Net R | 4.75 | 4.75 | ✅ |
| Avg R | 0.122 | 0.122 | ✅ |
| Max DD (R) | 2.09 | 2.09 | ✅ |
| LONG n | 23 | 23 | ✅ |
| LONG netR | 3.76 | 3.76 | ✅ |
| SHORT n | 16 | 16 | ✅ |
| SHORT netR | 0.98 | 0.98 | ✅ |

#### 90/90 hold-out — FULL vs LITE per window

| Window | Candles | Signals | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R | F≡L |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---|---|
| full | 17,280 | 39 | 39 | 56.4 | 1.7 | +4.75 | +0.12 | +2.09 | 23 / +3.76 | 16 / +0.98 | 35 / +1.81 | 4 / +2.94 | ✅ |
| first-90 | 8,640 | 21 | 21 | 57.1 | 1.9 | +3.33 | +0.16 | +1.16 | 12 / +2.68 | 9 / +0.66 | 19 / +1.31 | 2 / +2.03 | ✅ |
| second-90 | 8,640 | 18 | 18 | 55.6 | 1.5 | +1.41 | +0.08 | +2.09 | 11 / +1.09 | 7 / +0.33 | 16 / +0.50 | 2 / +0.91 | ✅ |

### SOLUSDT — 17,280 candles (half = 8,640)

#### Full window vs documented V4.2 production baseline (CUR)

| Field | Documented | Lite (= FULL) | Status |
|---|---|---|---|
| Trades | 29 | 29 | ✅ |
| Win rate % | 62.1 | 62.1 | ✅ |
| PF | 1.8 | 1.8 | ✅ |
| Net R | 3.96 | 3.96 | ✅ |
| Avg R | 0.137 | 0.137 | ✅ |
| Max DD (R) | 2.07 | 2.07 | ✅ |
| LONG n | 12 | 12 | ✅ |
| LONG netR | -1.15 | -1.15 | ✅ |
| SHORT n | 17 | 17 | ✅ |
| SHORT netR | 5.11 | 5.11 | ✅ |

#### 90/90 hold-out — FULL vs LITE per window

| Window | Candles | Signals | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R | F≡L |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---|---|
| full | 17,280 | 29 | 29 | 62.1 | 1.8 | +3.96 | +0.14 | +2.07 | 12 / -1.15 | 17 / +5.11 | 27 / +3.74 | 2 / +0.23 | ✅ |
| first-90 | 8,640 | 17 | 17 | 64.7 | 2.9 | +4.03 | +0.24 | +1.34 | 7 / -1.05 | 10 / +5.08 | 15 / +3.80 | 2 / +0.23 | ✅ |
| second-90 | 8,640 | 12 | 12 | 58.3 | 1.0 | -0.06 | -0.01 | +2.07 | 5 / -0.10 | 7 / +0.04 | 12 / -0.06 | 0 / +0.00 | ✅ |

## Fields compared per window (FULL vs LITE)

`signals, trades, superseded, winRate, profitFactor, netR, avgR, maxDD_R, maxDD_Pct, longN, longR, shortN, shortR, pbN, pbR, boN, boR`

Zero FULL-vs-LITE divergences across all 3 symbols × 3 windows. The Lite port is behaviorally identical to the full build under the hold-out protocol.

## Baseline reference

Documented V4.2 production (CUR) baselines reproduced on the full window: **BTC 36 trades / +6.43R**, **ETH 39 trades / +4.75R**, **SOL 29 trades / +3.96R** (V4-R1-FORENSICS.md prod table, V4-SIGNAL-QUALITY-LATENCY-AUDIT.md).
First-90 / second-90 per-half results above are the new Lite hold-out reference (not previously documented for the CUR config).
