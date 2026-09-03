# CanvasV — Slow-Dip Entry Separation: BTC vs ETH vs SOL

- Date: 2026-09-03
- Population: every **dip-bar entry** created by `slowDip2` (early entries only — reclaim-bar entries excluded), CONFIG A, 180d per symbol.
- All features are causal (data ≤ entry bar). Coarse buckets only; no threshold search.

## BTCUSDT — 81 dip-bar entries, 42W / 39L, NetR +7.27

| Feature | med WIN | med LOSS | notes |
|---|---|---|---|
| EMA21 penetration (ATR; <0 = pierced below) | +0.22 | +0.15 |  |
| dip-run bars at entry | +2.00 | +2.00 | hint |
| ATR vs 100-bar avg (%) | +93.62 | +99.41 | distinct |
| relative volume | +0.79 | +0.66 |  |
| EMA9-EMA21 separation (dir-signed ATR) | +0.68 | +0.68 |  |
| distance below EMA9 (ATR) | +0.13 | +0.23 |  |
| EMA9 slope (ATR/3b) | -0.01 | +0.02 |  |
| EMA21 slope (ATR/3b) | -0.12 | +0.20 | distinct |
| close vs EMA21 (ATR) | +0.50 | +0.37 |  |
| body % | +18.58 | +31.76 | distinct |
| range (ATR) | +0.56 | +0.71 | hint |

Pierce buckets (EMA21 penetration, ATR):

| Bucket | n | W | L | NetR |
|---|---|---|---|---|
| deep pierce ≤ −0.75 | 3 | 1 | 2 | -0.83 |
| moderate (−0.75, −0.25] | 7 | 3 | 4 | +0.43 |
| shallow (−0.25, 0.25] | 37 | 19 | 18 | +5.72 |
| held above > 0.25 | 34 | 19 | 15 | +1.95 |

Volatility buckets (ATR vs 100-bar avg):

| Bucket | n | W | L | NetR |
|---|---|---|---|---|
| compressed < 80% | 17 | 10 | 7 | +3.79 |
| normal 80–120% | 46 | 20 | 26 | +1.60 |
| elevated > 120% | 18 | 12 | 6 | +1.89 |

Direction split:

- LONG: 43 entries, 19W/24L, NetR -0.18, med pierce +0.18, med atrVsAvg +97%
- SHORT: 38 entries, 23W/15L, NetR +7.46, med pierce +0.20, med atrVsAvg +98%

- Premature (no reclaim within 5 bars): 17 (6W / 11L), NetR -5.01

Predictors of prematurity (chop): median feature by eventual outcome — premature (no EMA9 reclaim within 5 bars) vs reclaimed

| Feature | med PREMATURE | med RECLAIMED |
|---|---|---|
| EMA21 penetration (ATR; <0 = pierced below) | +0.05 | +0.19 |
| dip-run bars at entry | +2.00 | +2.00 |
| ATR vs 100-bar avg (%) | +94.71 | +99.97 |
| relative volume | +0.57 | +0.79 |
| EMA9-EMA21 separation (dir-signed ATR) | +0.61 | +0.68 |
| distance below EMA9 (ATR) | +0.16 | +0.17 |
| EMA9 slope (ATR/3b) | +0.03 | +0.00 |
| EMA21 slope (ATR/3b) | +0.16 | -0.00 |
| close vs EMA21 (ATR) | +0.38 | +0.46 |
| body % | +25.46 | +27.52 |
| range (ATR) | +0.65 | +0.62 |

Entry-candle direction (candle closes toward the trade side?):

| Candle | premature n | premature NetR | reclaimed n | reclaimed NetR |
|---|---|---|---|---|
| adv-candle | 8 | -1.31 | 19 | +9.54 |
| counter-candle | 9 | -3.70 | 45 | +2.75 |

## ETHUSDT — 71 dip-bar entries, 32W / 39L, NetR -0.02

| Feature | med WIN | med LOSS | notes |
|---|---|---|---|
| EMA21 penetration (ATR; <0 = pierced below) | +0.21 | +0.10 |  |
| dip-run bars at entry | +2.00 | +2.00 | hint |
| ATR vs 100-bar avg (%) | +103.36 | +112.94 | distinct |
| relative volume | +0.48 | +0.68 | hint |
| EMA9-EMA21 separation (dir-signed ATR) | +0.66 | +0.67 |  |
| distance below EMA9 (ATR) | +0.15 | +0.14 |  |
| EMA9 slope (ATR/3b) | -0.01 | -0.02 |  |
| EMA21 slope (ATR/3b) | -0.21 | -0.18 |  |
| close vs EMA21 (ATR) | +0.46 | +0.50 |  |
| body % | +27.38 | +20.81 | distinct |
| range (ATR) | +0.62 | +0.68 |  |

Pierce buckets (EMA21 penetration, ATR):

| Bucket | n | W | L | NetR |
|---|---|---|---|---|
| deep pierce ≤ −0.75 | 1 | 0 | 1 | -1.00 |
| moderate (−0.75, −0.25] | 8 | 2 | 6 | -4.92 |
| shallow (−0.25, 0.25] | 36 | 17 | 19 | +3.17 |
| held above > 0.25 | 26 | 13 | 13 | +2.74 |

Volatility buckets (ATR vs 100-bar avg):

| Bucket | n | W | L | NetR |
|---|---|---|---|---|
| compressed < 80% | 12 | 5 | 7 | -1.05 |
| normal 80–120% | 33 | 18 | 15 | +7.65 |
| elevated > 120% | 26 | 9 | 17 | -6.62 |

Direction split:

- LONG: 27 entries, 13W/14L, NetR +1.15, med pierce +0.12, med atrVsAvg +109%
- SHORT: 44 entries, 19W/25L, NetR -1.17, med pierce +0.17, med atrVsAvg +104%

- Premature (no reclaim within 5 bars): 17 (4W / 13L), NetR -8.92

Predictors of prematurity (chop): median feature by eventual outcome — premature (no EMA9 reclaim within 5 bars) vs reclaimed

| Feature | med PREMATURE | med RECLAIMED |
|---|---|---|
| EMA21 penetration (ATR; <0 = pierced below) | -0.05 | +0.24 |
| dip-run bars at entry | +2.00 | +2.00 |
| ATR vs 100-bar avg (%) | +103.84 | +107.51 |
| relative volume | +0.70 | +0.58 |
| EMA9-EMA21 separation (dir-signed ATR) | +0.48 | +0.74 |
| distance below EMA9 (ATR) | +0.17 | +0.14 |
| EMA9 slope (ATR/3b) | +0.01 | -0.01 |
| EMA21 slope (ATR/3b) | +0.13 | -0.21 |
| close vs EMA21 (ATR) | +0.32 | +0.52 |
| body % | +17.74 | +24.43 |
| range (ATR) | +0.71 | +0.62 |

Entry-candle direction (candle closes toward the trade side?):

| Candle | premature n | premature NetR | reclaimed n | reclaimed NetR |
|---|---|---|---|---|
| adv-candle | 6 | -2.76 | 18 | +3.60 |
| counter-candle | 11 | -6.16 | 36 | +5.31 |

## SOLUSDT — 86 dip-bar entries, 37W / 47L, NetR -4.60

| Feature | med WIN | med LOSS | notes |
|---|---|---|---|
| EMA21 penetration (ATR; <0 = pierced below) | +0.10 | +0.10 |  |
| dip-run bars at entry | +2.00 | +2.00 | hint |
| ATR vs 100-bar avg (%) | +98.38 | +97.70 | distinct |
| relative volume | +0.57 | +0.68 |  |
| EMA9-EMA21 separation (dir-signed ATR) | +0.61 | +0.58 |  |
| distance below EMA9 (ATR) | +0.15 | +0.18 |  |
| EMA9 slope (ATR/3b) | -0.02 | +0.01 |  |
| EMA21 slope (ATR/3b) | -0.19 | +0.14 | distinct |
| close vs EMA21 (ATR) | +0.44 | +0.35 |  |
| body % | +22.22 | +29.17 | distinct |
| range (ATR) | +0.70 | +0.66 |  |

Pierce buckets (EMA21 penetration, ATR):

| Bucket | n | W | L | NetR |
|---|---|---|---|---|
| deep pierce ≤ −0.75 | 2 | 1 | 1 | +0.01 |
| moderate (−0.75, −0.25] | 12 | 4 | 8 | +0.04 |
| shallow (−0.25, 0.25] | 44 | 16 | 28 | -4.67 |
| held above > 0.25 | 28 | 16 | 12 | +0.02 |

Volatility buckets (ATR vs 100-bar avg):

| Bucket | n | W | L | NetR |
|---|---|---|---|---|
| compressed < 80% | 18 | 9 | 9 | +2.67 |
| normal 80–120% | 55 | 20 | 35 | -5.72 |
| elevated > 120% | 13 | 8 | 5 | -1.55 |

Direction split:

- LONG: 40 entries, 13W/27L, NetR -3.49, med pierce +0.06, med atrVsAvg +104%
- SHORT: 46 entries, 24W/22L, NetR -1.11, med pierce +0.12, med atrVsAvg +94%

- Premature (no reclaim within 5 bars): 18 (4W / 14L), NetR -9.58

Predictors of prematurity (chop): median feature by eventual outcome — premature (no EMA9 reclaim within 5 bars) vs reclaimed

| Feature | med PREMATURE | med RECLAIMED |
|---|---|---|
| EMA21 penetration (ATR; <0 = pierced below) | -0.07 | +0.11 |
| dip-run bars at entry | +2.00 | +2.00 |
| ATR vs 100-bar avg (%) | +102.02 | +98.04 |
| relative volume | +0.74 | +0.58 |
| EMA9-EMA21 separation (dir-signed ATR) | +0.59 | +0.60 |
| distance below EMA9 (ATR) | +0.29 | +0.16 |
| EMA9 slope (ATR/3b) | -0.01 | -0.01 |
| EMA21 slope (ATR/3b) | -0.08 | -0.12 |
| close vs EMA21 (ATR) | +0.33 | +0.42 |
| body % | +42.05 | +24.04 |
| range (ATR) | +0.73 | +0.66 |

Entry-candle direction (candle closes toward the trade side?):

| Candle | premature n | premature NetR | reclaimed n | reclaimed NetR |
|---|---|---|---|---|
| adv-candle | 6 | -4.46 | 17 | +0.27 |
| counter-candle | 12 | -5.11 | 51 | +4.71 |
