# CanvasV — slowDip Refinement Candidates (R1/R2/R3 vs C and B)

- Date: 2026-09-03
- Engine-only (CONFIG A). Coarse, interpretable constraints only.
- **R1** = slowDip2 + dip anchor never penetrated below EMA21 (pierce ≥ 0 ATR at entry).
- **R2** = slowDip2 + entry-bar ATR ≤ 120% of its 100-bar average.
- **R3** = R1 + R2.

## 1. Full-window comparison (180d, CONFIG A)

| Symbol | Variant | Trades | WR % | PF | Net R | Avg R | MaxDD R | dip entries | dip NetR | med recovery@dip | premature | prem NetR |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT | C reclaim | 178 | 47.2 | 1.1 | +3.59 | +0.020 | 7.81 | 0 | +0.00 | n/a | 0 | +0.00 |
| BTCUSDT | B slowDip2 | 241 | 49.0 | 1.1 | +10.23 | +0.042 | 8.75 | 82 | +7.49 | +0.09 | 17 | -5.01 |
| BTCUSDT | R1 pierce>=0 | 221 | 49.8 | 1.3 | +15.02 | +0.068 | 5.63 | 56 | +9.35 | +0.07 | 10 | -2.07 |
| BTCUSDT | R2 atrVs<=120 | 226 | 46.9 | 1.1 | +7.70 | +0.034 | 8.45 | 62 | +6.39 | +0.08 | 14 | -4.50 |
| BTCUSDT | R3 R1+R2 | 209 | 47.8 | 1.2 | +10.79 | +0.052 | 5.78 | 40 | +6.49 | +0.07 | 8 | -2.56 |

| ETHUSDT | C reclaim | 197 | 48.2 | 1.1 | +6.15 | +0.031 | 7.28 | 0 | +0.00 | n/a | 0 | +0.00 |
| ETHUSDT | B slowDip2 | 247 | 47.8 | 1.1 | +5.14 | +0.021 | 10.08 | 72 | -0.22 | +0.10 | 17 | -8.92 |
| ETHUSDT | R1 pierce>=0 | 232 | 48.3 | 1.2 | +12.26 | +0.053 | 6.81 | 51 | +7.00 | +0.07 | 7 | -1.94 |
| ETHUSDT | R2 atrVs<=120 | 230 | 47.4 | 1.1 | +9.20 | +0.040 | 7.70 | 46 | +5.23 | +0.09 | 12 | -4.51 |
| ETHUSDT | R3 R1+R2 | 222 | 47.3 | 1.2 | +9.77 | +0.044 | 6.88 | 36 | +5.96 | +0.07 | 6 | -1.34 |

| SOLUSDT | C reclaim | 179 | 53.1 | 1.2 | +8.29 | +0.046 | 5.37 | 0 | +0.00 | n/a | 0 | +0.00 |
| SOLUSDT | B slowDip2 | 238 | 49.6 | 1.0 | +0.61 | +0.003 | 6.42 | 86 | -4.60 | +0.09 | 18 | -9.58 |
| SOLUSDT | R1 pierce>=0 | 213 | 51.2 | 1.1 | +4.64 | +0.022 | 6.42 | 53 | -0.71 | +0.06 | 7 | -4.01 |
| SOLUSDT | R2 atrVs<=120 | 232 | 48.3 | 1.0 | -0.44 | -0.002 | 7.89 | 73 | -3.05 | +0.09 | 15 | -8.89 |
| SOLUSDT | R3 R1+R2 | 209 | 50.7 | 1.1 | +4.35 | +0.021 | 7.85 | 44 | +0.97 | +0.05 | 5 | -3.21 |

### Δ vs references (full window)

| Symbol | Variant | Δ vs C | Δ vs B | LONG | SHORT | dip LONG | dip SHORT |
|---|---|---|---|---|---|---|---|
| BTCUSDT | C reclaim | +0.00 | -6.64 | +2.57 (96) | +1.02 (82) | +0.00 (0) | +0.00 (0) |
| BTCUSDT | B slowDip2 | +6.64 | +0.00 | +3.57 (130) | +6.66 (111) | +0.03 (44) | +7.46 (38) |
| BTCUSDT | R1 pierce>=0 | +11.43 | +4.78 | +5.90 (118) | +9.12 (103) | +0.52 (30) | +8.83 (26) |
| BTCUSDT | R2 atrVs<=120 | +4.11 | -2.54 | +3.46 (122) | +4.24 (104) | +1.37 (32) | +5.02 (30) |
| BTCUSDT | R3 R1+R2 | +7.20 | +0.55 | +4.06 (112) | +6.73 (97) | +0.07 (21) | +6.42 (19) |

| ETHUSDT | C reclaim | +0.00 | +1.01 | +4.03 (107) | +2.12 (90) | +0.00 (0) | +0.00 (0) |
| ETHUSDT | B slowDip2 | -1.01 | +0.00 | +3.03 (127) | +2.11 (120) | +0.95 (28) | -1.17 (44) |
| ETHUSDT | R1 pierce>=0 | +6.11 | +7.12 | +5.99 (117) | +6.27 (115) | +3.68 (17) | +3.32 (34) |
| ETHUSDT | R2 atrVs<=120 | +3.05 | +4.06 | +5.02 (118) | +4.18 (112) | +2.48 (17) | +2.75 (29) |
| ETHUSDT | R3 R1+R2 | +3.62 | +4.63 | +4.43 (113) | +5.34 (109) | +1.89 (12) | +4.07 (24) |

| SOLUSDT | C reclaim | +0.00 | +7.68 | -0.75 (92) | +9.04 (87) | +0.00 (0) | +0.00 (0) |
| SOLUSDT | B slowDip2 | -7.68 | +0.00 | -3.32 (120) | +3.93 (118) | -3.49 (40) | -1.11 (46) |
| SOLUSDT | R1 pierce>=0 | -3.65 | +4.03 | -0.65 (107) | +5.29 (106) | -2.46 (24) | +1.74 (29) |
| SOLUSDT | R2 atrVs<=120 | -8.73 | -1.05 | -4.24 (117) | +3.80 (115) | -2.73 (34) | -0.32 (39) |
| SOLUSDT | R3 R1+R2 | -3.94 | +3.74 | -1.57 (104) | +5.92 (105) | -1.70 (18) | +2.67 (26) |

## 2. Out-of-sample — 90/90 temporal hold-out, all variants

### BTCUSDT

| Half | C | B | R1 | R2 | R3 |
|---|---|---|---|---|---|
| first-90 | +11.01 (96) | +15.32 (128) | +16.89 (120) | +15.17 (122) | +15.74 (115) |
| second-90 | -6.82 (81) | -4.49 (112) | -1.27 (100) | -6.87 (103) | -4.35 (93) |

### ETHUSDT

| Half | C | B | R1 | R2 | R3 |
|---|---|---|---|---|---|
| first-90 | +9.22 (101) | +10.25 (125) | +12.21 (119) | +8.03 (118) | +8.88 (114) |
| second-90 | -4.59 (94) | -6.03 (119) | -0.87 (110) | -0.34 (110) | -0.63 (106) |

### SOLUSDT

| Half | C | B | R1 | R2 | R3 |
|---|---|---|---|---|---|
| first-90 | +7.45 (92) | +2.86 (119) | +6.69 (109) | +4.38 (115) | +8.86 (106) |
| second-90 | +1.03 (86) | -2.05 (118) | -1.85 (103) | -4.62 (116) | -4.31 (102) |

## 3. Decision

### ADOPT? No (rule-by-rule)

| Candidate | BTC OOS | ETH OOS | SOL OOS | Both halves, all symbols? | Decision |
|---|---|---|---|---|---|
| R1 | +5.88 / +5.54 | +2.99 / +3.72 | -0.76 / -2.89 | NO (SOLUSDT) | REFINE |
| R2 | +4.16 / -0.05 | -1.19 / +4.24 | -3.07 / -5.66 | NO (BTCUSDT,ETHUSDT,SOLUSDT) | REFINE |
| R3 | +4.73 / +2.47 | -0.34 / +3.96 | +1.40 / -5.34 | NO (ETHUSDT,SOLUSDT) | REFINE |

**Verdict: REFINE.** R1 (dip never pierced below EMA21) is the best rule found — it makes BTC and ETH robustly better than reclaim in BOTH hold-out halves and on the production config, with lower drawdown than B and premature entries roughly halved. It is NOT yet adoptable because SOL's second hold-out half still trails C (R1 −1.9R vs C +1.0R), even though R1 already recovers most of B's SOL damage. The remaining SOL weakness is a single-regime residual (its slow dips chop in the second half), so the rule is not yet 'robust across all symbols and both halves' — the ADOPT bar.

**Next single experiment:** apply the same premature/chop forensics used here (separation tool) to R1's *remaining* losers per symbol — R1 already removes the pierce signature, so the residual chop predictor must be re-measured on the survivors (candidates: entry-candle body/close position, dip depth below EMA9, and per-direction context). Add ONE causal constraint from that evidence and re-run this identical 5-variant × 3-symbol × 2-half matrix. Pine port remains conditional on a full pass.
