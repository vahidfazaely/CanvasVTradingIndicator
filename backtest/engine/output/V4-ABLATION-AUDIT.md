# CanvasV V4.2 — Ablation & Integrity Audit

Generated: 2026-09-03T12:07:14.819Z

Scope: BTCUSDT / ETHUSDT / SOLUSDT M15. No thresholds were tuned. Config A = V4 baseline (all V4.2 gates OFF), I = full V4.2 defaults. Position sizing (fixed-risk) does not feed back into signal generation.

**Engine fix applied during audit:** `generateReport` max drawdown was NOT peak-to-trough (it tracked the deepest below-zero cumulative sum from equity start, which misses underwater-but-positive drawdowns and never resets at new equity highs). Now computes true peak-to-trough on cumulative R and on a compounding equity curve (account %).

### 2.1 Synthetic validation (peak-to-trough)

| Sequence | MaxDD R | Expected |
|---|---|---|
| R: +2,-3,+4,-1 (peak 2 → trough -1) | 3.00 | 3.00 |
| R: +10,-8,+3 (underwater but never < 0) | 8.00 | 8.00 |
| R: +5,+2,+7,+1 (monotone up) | 0.00 | 0.00 |

Account-% DD @1% risk on +2,-3,+4,-1: engine 3.0600% vs manual 3.0600%

## 1. Backtest Integrity — risk % must not change R metrics

R is computed from (exit − entry)/riskDistance at the signal bar and is independent of position size. Sizing only scales $ PnL. Config I (full V4.2), BTCUSDT:

| riskPerTrade | signals | trades | winRate | PF | NetR | AvgR | MaxDD(R) | MaxDD(account %) |
|---|---|---|---|---|---|---|---|---|
| 0.25% | 36 | 36 | 58.33% | 1.721 | +6.43 | 0.1786 | 1.52 | 0.385% |
| 0.5% | 36 | 36 | 58.33% | 1.721 | +6.43 | 0.1786 | 1.52 | 0.782% |
| 1% | 36 | 36 | 58.33% | 1.721 | +6.43 | 0.1786 | 1.52 | 1.607% |

**Verdict:** R-metrics invariant across risk 0.25% / 0.50% / 1.00% → PASS. Only account-% drawdown moves (it scales ~linearly with risk). Note the engine uses a fixed $10,000 base per trade (no compounding), matching the "equity fixed for backtest" comment — account-% DD is computed on a compounding curve for TV-like realism and reported separately.

## 2. Drawdown audit — real symbols

| Symbol | Config | MaxDD (R) | MaxDD (account % @0.5%) | NetR |
|---|---|---|---|---|
| BTCUSDT | A | 7.81R | 4.09% | +3.59 |
| BTCUSDT | I | 1.52R | 0.78% | +6.43 |
| ETHUSDT | A | 7.28R | 3.84% | +6.15 |
| ETHUSDT | I | 2.09R | 1.07% | +4.75 |
| SOLUSDT | A | 5.37R | 2.75% | +8.29 |
| SOLUSDT | I | 2.07R | 1.06% | +3.96 |

The previous 0.00R value was a formula artifact: cumulative R never dropped below zero on the V4.2 BTC path, so the old (cumulative-only) tracker reported 0 even though the equity curve fell from a peak. Peak-to-trough shows the real underwater depth.

## 3. highVol trace (config I — full V4.2)

| Symbol | Eval bars | HV bars | HV % | HV setups | HV raw triggers | HV gated triggers | HV entries | HV trades |
|---|---|---|---|---|---|---|---|---|
| BTCUSDT | 17175 | 2638 | 15.36% | 1299 | 228 | 149 | 1 | 1 |
| ETHUSDT | 17175 | 2705 | 15.75% | 1385 | 207 | 131 | 1 | 1 |
| SOLUSDT | 17175 | 2239 | 13.04% | 1080 | 181 | 108 | 0 | 0 |

HV stage distribution (of HV bars):

| Symbol | trending | trendUp | trendDn | setupUp | setupDn | pbUp | pbDn | boUp | boDn |
|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT | 1738 | 999 | 739 | 740 | 559 | 230 | 229 | 211 | 197 |
| ETHUSDT | 1799 | 1081 | 718 | 822 | 563 | 216 | 207 | 210 | 183 |
| SOLUSDT | 1458 | 933 | 525 | 688 | 392 | 185 | 197 | 174 | 155 |

## 4. Filter funnel (config I — full V4.2, per evaluated bar)

### BTCUSDT

  **Funnel — LONG** (17175 evaluated bars)
  | Stage | Scope | Input | Passed | Rejected | Rej % of applicable |
  |---|---|---|---|---|---|
  | Raw candidates (post-warmup, valid ATR) | all | 17175 | 17175 | 0 | 0.0% |
  | Regime: trending (|EMA50 slope| >= min) | all | 17175 | 9519 | 7656 | 44.6% |
  | Direction UP (EMA21 vs EMA50 geometry) | all | 9519 | 4960 | 4559 | 47.9% |
  | Momentum setup (EMA9 rising + close side) | all | 4960 | 3377 | 1583 | 31.9% |
  | Trigger: raw PULLBACK/BREAKOUT (touch+reclaim, or close past range) | all | 3377 | 619 | 2758 | 81.7% |
  | ATR breakout buffer (0.10 ATR) | BO | 619 | 561 | 58 | 14.0% |
  | Candle close location | BO | 561 | 472 | 89 | 25.1% |
  | Strict extension <= 1.5 ATR (maxExtAtr) | all | 472 | 204 | 268 | 56.8% |
  | Body quality | all | 204 | 204 | 0 | 0.0% |
  | Relative volume (BO>=1.20) | BO | 204 | 189 | 15 | 68.2% |
  | Relative volume (PB>=1.10) | PB | 189 | 44 | 145 | 79.7% |
  | High-vol confirmation (mode gate) | all | 44 | 43 | 1 | 2.3% |
  | Risk gate (SL width bounds) | all | 43 | 24 | 19 | 44.2% |
  | Position available (flat / opposite) | all | 24 | 22 | 2 | 8.3% |
  | FINAL ENTRY | all | 22 | 22 | 0 | 0.0% |

  **Funnel — SHORT** (17175 evaluated bars)
  | Stage | Scope | Input | Passed | Rejected | Rej % of applicable |
  |---|---|---|---|---|---|
  | Raw candidates (post-warmup, valid ATR) | all | 17175 | 17175 | 0 | 0.0% |
  | Regime: trending (|EMA50 slope| >= min) | all | 17175 | 9519 | 7656 | 44.6% |
  | Direction DOWN (EMA21 vs EMA50 geometry) | all | 9519 | 4556 | 4963 | 52.1% |
  | Momentum setup (EMA9 rising + close side) | all | 4556 | 3059 | 1497 | 32.9% |
  | Trigger: raw PULLBACK/BREAKOUT (touch+reclaim, or close past range) | all | 3059 | 595 | 2464 | 80.5% |
  | ATR breakout buffer (0.10 ATR) | BO | 595 | 536 | 59 | 14.2% |
  | Candle close location | BO | 536 | 443 | 93 | 26.1% |
  | Strict extension <= 1.5 ATR (maxExtAtr) | all | 443 | 171 | 272 | 61.4% |
  | Body quality | all | 171 | 171 | 0 | 0.0% |
  | Relative volume (BO>=1.20) | BO | 171 | 157 | 14 | 77.8% |
  | Relative volume (PB>=1.10) | PB | 157 | 33 | 124 | 81.0% |
  | High-vol confirmation (mode gate) | all | 33 | 31 | 2 | 6.1% |
  | Risk gate (SL width bounds) | all | 31 | 16 | 15 | 48.4% |
  | Position available (flat / opposite) | all | 16 | 14 | 2 | 12.5% |
  | FINAL ENTRY | all | 14 | 14 | 0 | 0.0% |

### ETHUSDT

  **Funnel — LONG** (17175 evaluated bars)
  | Stage | Scope | Input | Passed | Rejected | Rej % of applicable |
  |---|---|---|---|---|---|
  | Raw candidates (post-warmup, valid ATR) | all | 17175 | 17175 | 0 | 0.0% |
  | Regime: trending (|EMA50 slope| >= min) | all | 17175 | 9112 | 8063 | 46.9% |
  | Direction UP (EMA21 vs EMA50 geometry) | all | 9112 | 4668 | 4444 | 48.8% |
  | Momentum setup (EMA9 rising + close side) | all | 4668 | 3228 | 1440 | 30.8% |
  | Trigger: raw PULLBACK/BREAKOUT (touch+reclaim, or close past range) | all | 3228 | 563 | 2665 | 82.6% |
  | ATR breakout buffer (0.10 ATR) | BO | 563 | 518 | 45 | 13.8% |
  | Candle close location | BO | 518 | 413 | 105 | 37.4% |
  | Strict extension <= 1.5 ATR (maxExtAtr) | all | 413 | 232 | 181 | 43.8% |
  | Body quality | all | 232 | 232 | 0 | 0.0% |
  | Relative volume (BO>=1.20) | BO | 232 | 223 | 9 | 50.0% |
  | Relative volume (PB>=1.10) | PB | 223 | 49 | 174 | 81.3% |
  | High-vol confirmation (mode gate) | all | 49 | 48 | 1 | 2.0% |
  | Risk gate (SL width bounds) | all | 48 | 26 | 22 | 45.8% |
  | Position available (flat / opposite) | all | 26 | 23 | 3 | 11.5% |
  | FINAL ENTRY | all | 23 | 23 | 0 | 0.0% |

  **Funnel — SHORT** (17175 evaluated bars)
  | Stage | Scope | Input | Passed | Rejected | Rej % of applicable |
  |---|---|---|---|---|---|
  | Raw candidates (post-warmup, valid ATR) | all | 17175 | 17175 | 0 | 0.0% |
  | Regime: trending (|EMA50 slope| >= min) | all | 17175 | 9112 | 8063 | 46.9% |
  | Direction DOWN (EMA21 vs EMA50 geometry) | all | 9112 | 4442 | 4670 | 51.3% |
  | Momentum setup (EMA9 rising + close side) | all | 4442 | 2982 | 1460 | 32.9% |
  | Trigger: raw PULLBACK/BREAKOUT (touch+reclaim, or close past range) | all | 2982 | 471 | 2511 | 84.2% |
  | ATR breakout buffer (0.10 ATR) | BO | 471 | 423 | 48 | 16.0% |
  | Candle close location | BO | 423 | 346 | 77 | 30.6% |
  | Strict extension <= 1.5 ATR (maxExtAtr) | all | 346 | 172 | 174 | 50.3% |
  | Body quality | all | 172 | 172 | 0 | 0.0% |
  | Relative volume (BO>=1.20) | BO | 172 | 157 | 15 | 71.4% |
  | Relative volume (PB>=1.10) | PB | 157 | 28 | 129 | 85.4% |
  | High-vol confirmation (mode gate) | all | 28 | 28 | 0 | 0.0% |
  | Risk gate (SL width bounds) | all | 28 | 18 | 10 | 35.7% |
  | Position available (flat / opposite) | all | 18 | 16 | 2 | 11.1% |
  | FINAL ENTRY | all | 16 | 16 | 0 | 0.0% |

### SOLUSDT

  **Funnel — LONG** (17175 evaluated bars)
  | Stage | Scope | Input | Passed | Rejected | Rej % of applicable |
  |---|---|---|---|---|---|
  | Raw candidates (post-warmup, valid ATR) | all | 17175 | 17175 | 0 | 0.0% |
  | Regime: trending (|EMA50 slope| >= min) | all | 17175 | 9290 | 7885 | 45.9% |
  | Direction UP (EMA21 vs EMA50 geometry) | all | 9290 | 4692 | 4598 | 49.5% |
  | Momentum setup (EMA9 rising + close side) | all | 4692 | 3179 | 1513 | 32.2% |
  | Trigger: raw PULLBACK/BREAKOUT (touch+reclaim, or close past range) | all | 3179 | 553 | 2626 | 82.6% |
  | ATR breakout buffer (0.10 ATR) | BO | 553 | 499 | 54 | 15.1% |
  | Candle close location | BO | 499 | 394 | 105 | 34.5% |
  | Strict extension <= 1.5 ATR (maxExtAtr) | all | 394 | 184 | 210 | 53.3% |
  | Body quality | all | 184 | 184 | 0 | 0.0% |
  | Relative volume (BO>=1.20) | BO | 184 | 175 | 9 | 81.8% |
  | Relative volume (PB>=1.10) | PB | 175 | 29 | 146 | 84.4% |
  | High-vol confirmation (mode gate) | all | 29 | 28 | 1 | 3.4% |
  | Risk gate (SL width bounds) | all | 28 | 12 | 16 | 57.1% |
  | Position available (flat / opposite) | all | 12 | 12 | 0 | 0.0% |
  | FINAL ENTRY | all | 12 | 12 | 0 | 0.0% |

  **Funnel — SHORT** (17175 evaluated bars)
  | Stage | Scope | Input | Passed | Rejected | Rej % of applicable |
  |---|---|---|---|---|---|
  | Raw candidates (post-warmup, valid ATR) | all | 17175 | 17175 | 0 | 0.0% |
  | Regime: trending (|EMA50 slope| >= min) | all | 17175 | 9290 | 7885 | 45.9% |
  | Direction DOWN (EMA21 vs EMA50 geometry) | all | 9290 | 4596 | 4694 | 50.5% |
  | Momentum setup (EMA9 rising + close side) | all | 4596 | 3167 | 1429 | 31.1% |
  | Trigger: raw PULLBACK/BREAKOUT (touch+reclaim, or close past range) | all | 3167 | 580 | 2587 | 81.7% |
  | ATR breakout buffer (0.10 ATR) | BO | 580 | 537 | 43 | 11.3% |
  | Candle close location | BO | 537 | 427 | 110 | 32.6% |
  | Strict extension <= 1.5 ATR (maxExtAtr) | all | 427 | 186 | 241 | 56.4% |
  | Body quality | all | 186 | 186 | 0 | 0.0% |
  | Relative volume (BO>=1.20) | BO | 186 | 180 | 6 | 50.0% |
  | Relative volume (PB>=1.10) | PB | 180 | 33 | 147 | 84.5% |
  | High-vol confirmation (mode gate) | all | 33 | 33 | 0 | 0.0% |
  | Risk gate (SL width bounds) | all | 33 | 18 | 15 | 45.5% |
  | Position available (flat / opposite) | all | 18 | 17 | 1 | 5.6% |
  | FINAL ENTRY | all | 17 | 17 | 0 | 0.0% |


## 5. Ablation A–I (BTC / ETH / SOL)

### BTCUSDT — baseline A trades=178 NetR=+3.59

| Cfg | Trades | WR | PF | NetR | AvgR/Exp | MaxDD R | MaxDD % | Long R | Short R | BO R | PB R | TradesΔ vs A | NetR Δ vs A | SL cat (L/S/C) | Low sample |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 178 | 47.2% | 1.07 | +3.59 | +0.02 | 7.81R | 4.09% | +2.57 | +1.02 | +1.96 | +1.63 | 0 | +0.00 | 19/4/8 | BO |
| B | 173 | 46.2% | 1.02 | +1.07 | +0.01 | 9.72R | 5.04% | +2.54 | -1.46 | -0.79 | +1.86 | -5 | -2.52 | 19/4/8 | BO |
| C | 174 | 46.6% | 1.07 | +3.41 | +0.02 | 8.44R | 4.42% | +2.59 | +0.83 | +1.55 | +1.86 | -4 | -0.18 | 19/4/8 | BO |
| D | 178 | 47.2% | 1.07 | +3.59 | +0.02 | 7.81R | 4.09% | +2.57 | +1.02 | +1.96 | +1.63 | 0 | +0.00 | 19/4/8 | BO |
| E | 40 | 57.5% | 1.42 | +4.54 | +0.11 | 2.84R | 1.46% | +7.97 | -3.43 | -0.91 | +5.45 | -138 | +0.95 | 8/0/1 | LONG,SHORT,BO |
| F | 158 | 48.1% | 1.21 | +9.22 | +0.06 | 6.59R | 3.48% | +3.51 | +5.71 | +1.94 | +7.28 | -20 | +5.63 | 17/4/7 | BO |
| G | 172 | 45.9% | 1.02 | +0.97 | +0.01 | 9.72R | 5.04% | +2.43 | -1.46 | -0.90 | +1.86 | -6 | -2.63 | 19/4/8 | BO |
| H | 39 | 56.4% | 1.41 | +4.53 | +0.12 | 2.84R | 1.46% | +7.96 | -3.43 | -0.92 | +5.45 | -139 | +0.94 | 8/0/1 | LONG,SHORT,BO |
| I | 36 | 58.3% | 1.72 | +6.43 | +0.18 | 1.52R | 0.78% | +7.86 | -1.43 | -0.92 | +7.35 | -142 | +2.84 | 7/0/0 | LONG,SHORT,BO |

### ETHUSDT — baseline A trades=197 NetR=+6.15

| Cfg | Trades | WR | PF | NetR | AvgR/Exp | MaxDD R | MaxDD % | Long R | Short R | BO R | PB R | TradesΔ vs A | NetR Δ vs A | SL cat (L/S/C) | Low sample |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 197 | 48.2% | 1.12 | +6.15 | +0.03 | 7.28R | 3.84% | +4.03 | +2.12 | +2.18 | +3.97 | 0 | +0.00 | 28/3/5 | BO |
| B | 195 | 48.2% | 1.13 | +6.46 | +0.03 | 7.19R | 3.76% | +4.52 | +1.94 | +2.65 | +3.82 | -2 | +0.31 | 28/3/5 | BO |
| C | 193 | 48.2% | 1.11 | +5.45 | +0.03 | 7.19R | 3.74% | +5.56 | -0.11 | +1.57 | +3.88 | -4 | -0.70 | 27/3/5 | BO |
| D | 197 | 48.2% | 1.12 | +6.15 | +0.03 | 7.28R | 3.84% | +4.03 | +2.12 | +2.18 | +3.97 | 0 | +0.00 | 28/3/5 | BO |
| E | 45 | 57.8% | 1.79 | +6.93 | +0.15 | 2.16R | 1.08% | +5.58 | +1.35 | +4.85 | +2.07 | -152 | +0.78 | 1/0/2 | LONG,SHORT,BO |
| F | 182 | 49.5% | 1.10 | +4.67 | +0.03 | 7.61R | 3.95% | +2.27 | +2.41 | +1.20 | +3.47 | -15 | -1.48 | 24/2/6 | BO |
| G | 193 | 48.2% | 1.11 | +5.41 | +0.03 | 7.19R | 3.74% | +5.52 | -0.11 | +1.60 | +3.82 | -4 | -0.74 | 27/3/5 | BO |
| H | 40 | 57.5% | 1.85 | +5.73 | +0.14 | 1.39R | 0.71% | +4.74 | +0.98 | +2.94 | +2.79 | -157 | -0.42 | 1/0/1 | LONG,SHORT,BO |
| I | 39 | 56.4% | 1.70 | +4.75 | +0.12 | 2.09R | 1.07% | +3.76 | +0.98 | +2.94 | +1.81 | -158 | -1.40 | 1/0/1 | LONG,SHORT,BO |

### SOLUSDT — baseline A trades=179 NetR=+8.29

| Cfg | Trades | WR | PF | NetR | AvgR/Exp | MaxDD R | MaxDD % | Long R | Short R | BO R | PB R | TradesΔ vs A | NetR Δ vs A | SL cat (L/S/C) | Low sample |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 179 | 53.1% | 1.19 | +8.29 | +0.05 | 5.37R | 2.75% | -0.75 | +9.04 | +1.28 | +7.01 | 0 | +0.00 | 17/5/5 | BO |
| B | 177 | 53.1% | 1.16 | +6.90 | +0.04 | 5.51R | 2.86% | -2.13 | +9.04 | -0.11 | +7.01 | -2 | -1.39 | 17/5/5 | BO |
| C | 179 | 53.1% | 1.19 | +8.29 | +0.05 | 5.37R | 2.75% | -0.75 | +9.04 | +1.28 | +7.01 | 0 | +0.00 | 17/5/5 | BO |
| D | 179 | 53.1% | 1.19 | +8.29 | +0.05 | 5.37R | 2.75% | -0.75 | +9.04 | +1.28 | +7.01 | 0 | +0.00 | 17/5/5 | BO |
| E | 33 | 60.6% | 1.70 | +4.04 | +0.12 | 2.38R | 1.20% | -1.08 | +5.11 | +0.33 | +3.70 | -146 | -4.25 | 2/1/1 | LONG,SHORT,BO,PB |
| F | 161 | 53.4% | 1.21 | +8.49 | +0.05 | 5.76R | 2.87% | -0.26 | +8.75 | +1.28 | +7.21 | -18 | +0.20 | 16/6/5 | BO |
| G | 177 | 53.1% | 1.16 | +6.90 | +0.04 | 5.51R | 2.86% | -2.13 | +9.04 | -0.11 | +7.01 | -2 | -1.39 | 17/5/5 | BO |
| H | 30 | 60.0% | 1.82 | +3.93 | +0.13 | 2.07R | 1.06% | -1.19 | +5.11 | +0.23 | +3.70 | -149 | -4.36 | 2/1/0 | LONG,SHORT,BO,PB |
| I | 29 | 62.1% | 1.84 | +3.96 | +0.14 | 2.07R | 1.06% | -1.15 | +5.11 | +0.23 | +3.74 | -150 | -4.32 | 2/1/0 | ALL,LONG,SHORT,BO,PB |


## 6. SELL/PULLBACK — V4 baseline (A) vs V4.2 (I)

| Symbol | Cfg | SELL/PB trades | WR | PF | NetR | AvgR | LATE_ENTRY | SL_TOO_TIGHT | CONTINUATION |
|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT | A | 80 | 42.5% | 0.94 | -1.46 | -0.02 | 5 | 2 | 6 |
| BTCUSDT | I | 14 | 42.9% | 0.69 | -1.43 | -0.10 | 3 | 0 | 0 |
| ETHUSDT | A | 85 | 48.2% | 1.05 | +1.13 | +0.01 | 15 | 1 | 2 |
| ETHUSDT | I | 16 | 62.5% | 1.36 | +0.98 | +0.06 | 1 | 0 | 0 |
| SOLUSDT | A | 84 | 58.3% | 1.42 | +8.91 | +0.11 | 9 | 2 | 3 |
| SOLUSDT | I | 15 | 80.0% | 3.90 | +4.89 | +0.33 | 1 | 0 | 0 |

## 7. Findings & verdicts

### 7.1 Integrity verdict

**PASS.** Risk per trade (0.25% / 0.50% / 1.00%) changes only $ PnL and account-% drawdown; trade count, win rate, PF, NetR, AvgR and MaxDD(R) are invariant. R is computed from the stop distance at the signal bar and is size-independent. The engine sizes on a fixed $10,000 base (no compounding of the base between trades), matching its `equity = 10000` comment.

### 7.2 Genuine bugs found & fixed (engine only)

1. **`calcSMA` was poisoned by leading NaN (Pine parity bug).** `calcATR` returns NaN for the first 13 bars; the old `calcSMA` added NaN into its running sum, so `atrAvg` (SMA 100 of ATR) stayed NaN on **every** subsequent bar. That made `atrVsAvg = NaN`, so `highVol` was **always false** in the local engine (0 HV bars on all 3 symbols / 51k bars) while the Pine (native `ta.sma` NaN handling) has highVol active on 13–16% of bars. Every earlier 'HV count = 0' result was an engine artifact, and all HV-gated ablations (configs F/I) were computed with the HV gate silently disabled. **Fixed:** `calcSMA` now skips NaN inputs and only returns a value once a full window of valid samples exists. Post-fix: BTC 2,638 HV bars (15.4%), ETH 2,705 (15.8%), SOL 2,239 (13.0%). The V4.1-era 178-trade / +3.59R baseline is unchanged (config A forces `hvMode=Allow`, where highVol has no entry effect), confirming the fix does not disturb pre-V4.2 parity.

2. **Max drawdown was not peak-to-trough.** The old tracker kept `min(cumulativeSum, 0)` from equity start — it missed underwater-but-positive drawdowns and never reset at new equity highs, so a curve of +10R, −8R, +3R reported 0.00R. **Fixed:** true peak-to-trough on cumulative R, plus a new `maxDrawdownPct` on a compounding equity curve (riskPerTrade parameterized). Synthetic validation in section 2.1 passes (3.00 / 8.00 / 0.00R cases and 3.0600% compounding check). The earlier 'BTC V4.2 Max DD = 0.00' figure was this artifact; true values are in section 2 (e.g. BTC config A 7.81R / 4.09%, config I 2.84R / 1.46%).

3. **Audit instrumentation added** (backwards compatible): `runEngine(candles, params, { audit: true })` returns per-bar stage booleans used for the funnel / HV trace. `generateReport(trades, { riskPerTrade })` is additive.

### 7.3 highVol trace (post-fix)

HV bars are common (13–16% of bars) but almost none convert to setups, and almost none of those convert to entries. BTC: 2,638 HV bars → 1,299 setups (49%) → 228 raw triggers → 66 gated triggers → **1 entry**. ETH: 2,705 → 1,385 → 207 → 51 → 1. SOL: 2,239 → 1,080 → 181 → 45 → 0. The collapse happens at the same architectural stages as the rest of the market: regime/direction/momentum (≈50% loss), trigger (≈82% loss), breakout quality (≈75%), pullback volume gate (≈80%). The high-vol *confirmation* mode itself only rejects 1–3 candidates per symbol in the full stack (2–6% of applicable) because by the time a candidate reaches it, relVol ≥ 1.1–1.2 has already been enforced — but config F shows HV confirmation *alone* removed 20 trades on BTC for +5.63R, i.e. HV filtering is cheap and BTC-positive but is largely pre-empted inside the full V4.2 stack.

### 7.4 Filter funnel — dominant rejection stages

Across all symbols and both directions the funnel is consistent:

- Regime (trending) rejects ~45–47% of bars; direction rejects ~half of the remainder; momentum ~1/3 → **signal scarcity is architectural (regime/direction/momentum), not caused by V4.2 filters.**
- Raw trigger fires on only ~18–19% of setup bars (~620/5.3k setups) — the touch+reclaim / range-break events themselves are rare.
- Of candidates that do trigger: pullback volume (PB ≥ 1.10) is the **single largest V4.2 rejection** (~78–85% of applicable pullbacks), then the risk gate (SL width 0.5–4.0 ATR, 36–48%), then breakout extension (BO ≤ 2.0 ATR, ~73–78% — but see dead-gate note below), then close location (~25–37% of applicable breakouts) and ATR buffer (~14%).
- **Pullback momentum gate rejects 0 candidates on every symbol** — it is provably dead code: `pullbackUp` already requires `close > emaTrig` via `reclaimUp`, so `pbMomOkUp` is always true. **Removed from the production script** in the interaction task (engine + Pine); backtest results unchanged.
- **Breakout extension ≤ 2.0 ATR is redundant while `useStrictExt` (≤ 1.5 ATR) is on:** config D (breakout-ext only) is byte-identical to baseline A on all three symbols (178/197/179 trades, identical NetR). **Now guarded** in production: the breakout-ext gate is only enforced when it is stricter than the strict gate (useStrictExt=false or breakoutExtAtr < maxExtAtr), eliminating the double-counted rejection stage under defaults without changing behavior under any valid configuration.

### 7.5 Ablation summary (Δ NetR vs baseline A)

| Filter (config) | BTC | ETH | SOL | Reading |
|---|---|---|---|---|
| ATR buffer only (B) | −2.52R | +0.31R | −1.39R | Net harmful; removes good breakouts |
| Close location only (C) | −0.18R | −0.70R | 0.00R | Neutral-to-harmful |
| Breakout ext only (D) | 0.00R | 0.00R | 0.00R | Dead filter (subsumed by strict 1.5 ATR) |
| Rel volume only (E) | +0.95R | +0.78R | −4.25R | −140+ trades; BTC/ETH marginal, SOL negative |
| HV confirmation only (F) | **+5.63R** | −1.48R | +0.20R | Strong BTC signal, ETH-negative |
| buffer+closeloc+ext (G) | −2.63R | −0.74R | −1.39R | Harmful (buffer dominates) |
| G + relVol (H) | +0.94R | −0.42R | −4.36R | Volume dominates; SOL-negative |
| **Full V4.2 (I)** | **+2.84R** | −1.40R | −4.32R | BTC best (WR 58.3%, PF 1.72); ETH/SOL lose NetR |

**Caution:** configs E/H/I remove 85–95% of trades; the surviving samples (30–40 per symbol) are LOW SAMPLE (flagged in section 5) and the BTC +2.84R is +0.02R avg edge on 36 trades — not yet evidence of robustness. Every symbol-level claim below 30 trades must be re-tested on more data.

### 7.6 LONG vs SHORT

V4 baseline A is long-positive (BTC +2.57R, ETH +4.03R) with SOL long-negative (−0.75R). Full V4.2 improves LONG NetR on BTC (+2.57→+7.86R) and ETH (+4.03→+3.76R) while SOL LONG stays negative (−1.15R). SHORT under full V4.2: BTC +1.02→−1.43R, ETH +2.12→+0.98R, SOL +9.04→+5.11R — **every symbol's short contribution falls** under V4.2, though SOL SHORT remains the largest single contributor (+5.11R). The V4.2 filters cut shorts more than longs (e.g. BTC 82→14 shorts) and the removed shorts were, on balance, profitable (SOL −9.04→+5.11R is mostly removal of winners).

### 7.7 Breakout vs Pullback

Breakouts are a small share (BTC 10/178, ETH 11/197, SOL 6/179 baseline) and V4.2 cuts them to 2–4 trades — every breakout figure in V4.2 is LOW SAMPLE (flagged). Breakout NetR flips negative on BTC under config I (−0.92R from +1.96R) while ETH breakouts improve (+2.18→+2.94R). Pullbacks dominate the book; their quality improves on BTC (PB +1.63→+7.35R) and SOL (+7.01→+3.74R but with 173→28 trades).

### 7.8 SELL/PULLBACK diagnosis (V4 vs V4.2)

V4.2 does **not** fix SELL/PULLBACK — it removes most of them and keeps the least-bad subset:

- ETH SELL/PB: 85→16 trades; WR 48.2→62.5%, PF 1.05→1.36, NetR +1.13→+0.98R, LATE_ENTRY 15→1. Better WR/PF but nearly all profit removed.
- SOL SELL/PB: 84→15 trades; WR 58.3→80.0%, PF 1.42→3.90, NetR +8.91→+4.89R. Same story: strong metrics on a tiny survivor sample (LOW SAMPLE).
- BTC SELL/PB: 80→14 trades; still unprofitable (PF 0.69, −1.43R) — V4.2 removes the worst (STOP_TOO_TIGHT 2→0, CONTINUATION 6→0) but does not make the short-pullback idea profitable on BTC.
- LATE_ENTRY / STOP_TOO_TIGHT / CONTINUATION counts all fall toward zero because the trade count collapses, not because the failure mechanism was fixed.

**Conclusion:** V4.2 is a trade-culling filter set. It improves average quality (WR, PF, DD) everywhere but its NetR effect is positive only on BTC; on ETH/SOL it mostly deletes winning trades. The filters that actually move NetR are **relative volume** (dominant, negative on SOL) and **HV confirmation** (positive on BTC). The breakout-quality trio (buffer / close-location / breakout-ext) is neutral-to-harmful and one member (breakout-ext) is dead code.

### 7.9 Filters to carry into sensitivity testing (no threshold values recommended yet)

Per the task constraints, no values are recommended. Candidates that changed NetR enough to warrant a sweep, in priority order: (1) relative-volume thresholds — needs per-symbol analysis before any relaxation; (2) HV confirmation interplay with the volume gates (it is pre-empted inside the full stack); (3) breakout extension only after deciding strict-1.5 vs breakout-2.0 (currently redundant). Close-location and ATR-buffer should not proceed until their BTC harm is understood; pullback-momentum and breakout-ext-2.0 should be removed as dead/redundant gates before any sweep to avoid double-counting rejections.
