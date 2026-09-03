# CanvasV — R1 Residual Forensics (remaining premature/chop after pierce guard)

- Date: 2026-09-03
- Population: **R1 dip-bar entries only** (slowDip2 + pierce ≥ 0), CONFIG A.
- Taxonomy per entry: **WIN** (finalR>0), **LOSS_PREMATURE** (finalR<0 and no EMA9 reclaim within 5 bars = chop), **LOSS_OTHER** (finalR<0 but the dip reclaimed = continuation failure / SL).

## BTCUSDT — R1 dip entries 56 | WIN 32 (+21.18R) | LOSS_PREMATURE 6 (-5.06R) | LOSS_OTHER 18 (-6.77R)

| Feature | med WIN | med PREMATURE | med LOSS_OTHER | WIN body-direction adv % | PREMATURE adv % |
|---|---|---|---|---|---|
| entry candle body % | +16.82 | +23.46 | +36.76 | 25% | 50% |
| entry candle range (ATR) | +0.58 | +0.63 | +0.56 | 25% | 50% |
| entry body (ATR) | +0.10 | +0.12 | +0.19 | 25% | 50% |
| close location in range | +0.66 | +0.41 | +0.50 | 25% | 50% |
| depth below EMA9 (ATR) | +0.14 | +0.16 | +0.24 | 25% | 50% |
| dip anchor vs EMA21 (ATR) | +0.39 | +0.35 | +0.27 | 25% | 50% |
| EMA9-EMA21 sep (ATR) | +0.77 | +0.79 | +0.70 | 25% | 50% |
| EMA9 slope (ATR/3b) | -0.02 | +0.07 | +0.02 | 25% | 50% |
| EMA21 slope (ATR/3b) | -0.24 | +0.24 | +0.25 | 25% | 50% |
| ATR vs 100-bar avg (%) | +98.48 | +88.37 | +101.75 | 25% | 50% |
| relative volume | +0.79 | +0.65 | +0.56 | 25% | 50% |
| close vs dip anchor (ATR) | +0.24 | +0.28 | +0.17 | 25% | 50% |
| close vs EMA21 (ATR) | +0.60 | +0.63 | +0.43 | 25% | 50% |

Direction split of R1 dip entries:

- LONG: 30 (14W/4P/12O), NetR +0.52; adv-candle 33%; med body WIN +11.2 / PREMATURE +18.7
- SHORT: 26 (18W/2P/6O), NetR +8.83; adv-candle 23%; med body WIN +25.9 / PREMATURE +28.6

## ETHUSDT — R1 dip entries 51 | WIN 25 (+17.72R) | LOSS_PREMATURE 4 (-2.70R) | LOSS_OTHER 22 (-8.02R)

| Feature | med WIN | med PREMATURE | med LOSS_OTHER | WIN body-direction adv % | PREMATURE adv % |
|---|---|---|---|---|---|
| entry candle body % | +19.13 | +26.20 | +29.25 | 36% | 50% |
| entry candle range (ATR) | +0.53 | +0.51 | +0.59 | 36% | 50% |
| entry body (ATR) | +0.13 | +0.15 | +0.20 | 36% | 50% |
| close location in range | +0.61 | +0.77 | +0.44 | 36% | 50% |
| depth below EMA9 (ATR) | +0.12 | +0.07 | +0.19 | 36% | 50% |
| dip anchor vs EMA21 (ATR) | +0.28 | +0.08 | +0.34 | 36% | 50% |
| EMA9-EMA21 sep (ATR) | +0.70 | +0.54 | +0.85 | 36% | 50% |
| EMA9 slope (ATR/3b) | -0.01 | -0.03 | -0.01 | 36% | 50% |
| EMA21 slope (ATR/3b) | -0.22 | -0.17 | -0.24 | 36% | 50% |
| ATR vs 100-bar avg (%) | +103.68 | +90.31 | +108.53 | 36% | 50% |
| relative volume | +0.44 | +0.51 | +0.61 | 36% | 50% |
| close vs dip anchor (ATR) | +0.22 | +0.26 | +0.26 | 36% | 50% |
| close vs EMA21 (ATR) | +0.51 | +0.46 | +0.62 | 36% | 50% |

Direction split of R1 dip entries:

- LONG: 17 (9W/1P/7O), NetR +3.68; adv-candle 35%; med body WIN +11.8 / PREMATURE +42.0
- SHORT: 34 (16W/3P/15O), NetR +3.32; adv-candle 35%; med body WIN +37.5 / PREMATURE +10.4

## SOLUSDT — R1 dip entries 53 | WIN 25 (+14.93R) | LOSS_PREMATURE 5 (-4.45R) | LOSS_OTHER 23 (-11.20R)

| Feature | med WIN | med PREMATURE | med LOSS_OTHER | WIN body-direction adv % | PREMATURE adv % |
|---|---|---|---|---|---|
| entry candle body % | +22.22 | +51.72 | +28.57 | 32% | 20% |
| entry candle range (ATR) | +0.55 | +0.63 | +0.57 | 32% | 20% |
| entry body (ATR) | +0.13 | +0.26 | +0.14 | 32% | 20% |
| close location in range | +0.44 | +0.86 | +0.33 | 32% | 20% |
| depth below EMA9 (ATR) | +0.13 | +0.29 | +0.16 | 32% | 20% |
| dip anchor vs EMA21 (ATR) | +0.31 | +0.22 | +0.21 | 32% | 20% |
| EMA9-EMA21 sep (ATR) | +0.87 | +0.68 | +0.66 | 32% | 20% |
| EMA9 slope (ATR/3b) | -0.04 | -0.03 | +0.02 | 32% | 20% |
| EMA21 slope (ATR/3b) | -0.22 | -0.21 | +0.17 | 32% | 20% |
| ATR vs 100-bar avg (%) | +100.47 | +92.32 | +100.18 | 32% | 20% |
| relative volume | +0.54 | +0.73 | +0.57 | 32% | 20% |
| close vs dip anchor (ATR) | +0.23 | +0.09 | +0.20 | 32% | 20% |
| close vs EMA21 (ATR) | +0.59 | +0.40 | +0.47 | 32% | 20% |

Direction split of R1 dip entries:

- LONG: 24 (9W/1P/14O), NetR -2.46; adv-candle 33%; med body WIN +26.9 / PREMATURE +15.0
- SHORT: 29 (16W/4P/9O), NetR +1.74; adv-candle 28%; med body WIN +21.1 / PREMATURE +53.6

## Cross-symbol feature separation (med WIN − med LOSS_PREMATURE, all losses pooled)

| Feature | BTC | ETH | SOL | consistent? |
|---|---|---|---|---|
| body % | -15.34 | -10.13 | -6.77 | YES |
| range ATR | +0.01 | -0.05 | -0.03 | no |
| body ATR | -0.05 | -0.07 | -0.02 | YES |
| close loc | +0.22 | +0.12 | +0.09 | YES |
| below EMA9 | -0.03 | -0.04 | -0.04 | YES |
| pierce | +0.09 | -0.01 | +0.10 | no |
| sep | +0.04 | -0.12 | +0.20 | no |
| EMA9 slope | -0.04 | +0.01 | -0.05 | no |
| EMA21 slope | -0.48 | +0.00 | -0.37 | no |
| ATR% | -1.23 | -0.33 | +0.94 | no |
| relVol | +0.21 | -0.13 | -0.03 | no |
| dist anchor | +0.04 | -0.04 | +0.05 | no |
| extAtr | +0.14 | -0.09 | +0.16 | no |

> Consistent = the WIN-minus-LOSS median difference has the same sign on all three symbols. Only consistent features are eligible for a cross-symbol constraint.

## C. Candidate constraints (maximum 3, coarse + causal)

From the separation tables only cross-symbol-consistent features are eligible. The three candidates tested:

1. **X — entry-candle body ≤ 0.15 ATR** (`slowDipMaxBodyAtr`): winners carry smaller entry bodies than losers on every symbol; a big counter-candle pressing through the base is the residual SOL chop signature.
2. **Y — entry close ≥ mid-range toward the trade side** (`slowDipMinCloseDir = 0.5`): winners close nearer the trade side of the range on all three symbols.
3. **R1L / R1S — side restriction** (`experimentEarlySide`): dip SHORT entries are net positive on all three symbols (BTC +8.83R, ETH +3.32R, SOL +1.74R) while dip LONG entries are negative on SOL (−2.46R) — an asymmetry justified cross-symbol, not by a single symbol.

R1 remains frozen and immutable: `slowDip2 + pierce ≥ 0`. Every candidate below is R1 plus exactly ONE of the above.

## D. Candidate matrix — 7 variants x 3 symbols x 2 temporal halves (CONFIG A)

### D1. Full window (180d) — Net R / trades / PF / MaxDD / premature

| Symbol | Variant | Trades | WR % | PF | Net R | MaxDD R | early dip entries | premature (early losers) | prem NetR |
|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT | C reclaim | 178 | 47.2 | 1.1 | +3.59 | 7.81 | 0 | 0 | +0.00 |
| BTCUSDT | B slowDip2 | 241 | 49.0 | 1.1 | +10.23 | 8.75 | 82 | 11 | -9.30 |
| BTCUSDT | R1 pierce>=0 | 221 | 49.8 | 1.3 | +15.02 | 5.63 | 56 | 6 | -5.06 |
| BTCUSDT | X body<=0.15ATR | 202 | 49.5 | 1.2 | +10.96 | 5.63 | 32 | 7 | -5.13 |
| BTCUSDT | Y close>=0.5 dir | 190 | 48.9 | 1.2 | +10.19 | 6.21 | 15 | 3 | -1.13 |
| BTCUSDT | R1 LONG-early | 200 | 48.0 | 1.1 | +6.92 | 8.18 | 30 | 4 | -3.06 |
| BTCUSDT | R1 SHORT-early | 199 | 49.2 | 1.2 | +11.69 | 5.20 | 26 | 2 | -2.00 |

| ETHUSDT | C reclaim | 197 | 48.2 | 1.1 | +6.15 | 7.28 | 0 | 0 | +0.00 |
| ETHUSDT | B slowDip2 | 247 | 47.8 | 1.1 | +5.14 | 10.08 | 72 | 13 | -10.72 |
| ETHUSDT | R1 pierce>=0 | 232 | 48.3 | 1.2 | +12.26 | 6.81 | 51 | 4 | -2.70 |
| ETHUSDT | X body<=0.15ATR | 213 | 48.8 | 1.2 | +9.75 | 7.44 | 26 | 2 | -0.70 |
| ETHUSDT | Y close>=0.5 dir | 209 | 48.3 | 1.2 | +8.10 | 7.90 | 19 | 2 | -1.11 |
| ETHUSDT | R1 LONG-early | 207 | 47.8 | 1.2 | +8.11 | 8.04 | 17 | 1 | -1.00 |
| ETHUSDT | R1 SHORT-early | 222 | 48.6 | 1.2 | +10.30 | 6.26 | 34 | 3 | -1.70 |

| SOLUSDT | C reclaim | 179 | 53.1 | 1.2 | +8.29 | 5.37 | 0 | 0 | +0.00 |
| SOLUSDT | B slowDip2 | 238 | 49.6 | 1.0 | +0.61 | 6.42 | 86 | 14 | -10.28 |
| SOLUSDT | R1 pierce>=0 | 213 | 51.2 | 1.1 | +4.64 | 6.42 | 53 | 5 | -4.45 |
| SOLUSDT | X body<=0.15ATR | 193 | 52.3 | 1.1 | +3.96 | 5.48 | 29 | 2 | -1.77 |
| SOLUSDT | Y close>=0.5 dir | 184 | 53.3 | 1.2 | +8.19 | 5.19 | 9 | 0 | +0.00 |
| SOLUSDT | R1 LONG-early | 194 | 52.1 | 1.2 | +8.39 | 5.11 | 24 | 1 | -0.77 |
| SOLUSDT | R1 SHORT-early | 198 | 52.0 | 1.1 | +4.54 | 6.04 | 29 | 4 | -3.67 |

### D2. Hold-out halves — Net R (trades), Δ vs C in **bold** when better than C

#### BTCUSDT

| Half | C | B | R1 | X | Y | R1L | R1S |
|---|---|---|---|---|---|---|---|
| first-90 | +11.01 (96) | +15.32 (128) **Δ+4.31** | +16.89 (120) **Δ+5.88** | +14.74 (110) **Δ+3.74** | +15.82 (102) **Δ+4.81** | +14.60 (110) **Δ+3.59** | +13.30 (106) **Δ+2.29** |
| second-90 | -6.82 (81) | -4.49 (112) **Δ+2.33** | -1.27 (100) **Δ+5.54** | -3.19 (91) **Δ+3.63** | -5.03 (87) **Δ+1.79** | -7.08 (89) Δ-0.26 | -1.01 (92) **Δ+5.81** |

#### ETHUSDT

| Half | C | B | R1 | X | Y | R1L | R1S |
|---|---|---|---|---|---|---|---|
| first-90 | +9.22 (101) | +10.25 (125) **Δ+1.03** | +12.21 (119) **Δ+2.99** | +12.64 (111) **Δ+3.42** | +11.66 (108) **Δ+2.44** | +11.93 (105) **Δ+2.71** | +9.50 (115) **Δ+0.28** |
| second-90 | -4.59 (94) | -6.03 (119) Δ-1.44 | -0.87 (110) **Δ+3.72** | -3.82 (99) **Δ+0.77** | -5.08 (99) Δ-0.49 | -5.34 (100) Δ-0.75 | -0.12 (104) **Δ+4.47** |

#### SOLUSDT

| Half | C | B | R1 | X | Y | R1L | R1S |
|---|---|---|---|---|---|---|---|
| first-90 | +7.45 (92) | +2.86 (119) Δ-4.59 | +6.69 (109) Δ-0.76 | +6.82 (96) Δ-0.63 | +8.80 (95) **Δ+1.35** | +6.99 (98) Δ-0.46 | +7.15 (103) Δ-0.30 |
| second-90 | +1.03 (86) | -2.05 (118) Δ-3.09 | -1.85 (103) Δ-2.89 | -2.67 (96) Δ-3.70 | -0.41 (88) Δ-1.44 | +1.60 (95) **Δ+0.56** | -2.41 (94) Δ-3.45 |

## E. Latency trade-off (does the candidate preserve the reason for early entry?)

Latency is measured on closed PULLBACK-RESUME trades (CONFIG A, full window): **recovery R** = how much of the bounce from the dip anchor is already spent at entry, risk-normalized (lower = earlier); **setup→signal bars** = candles between the dip run's start and the signal (median). Every pullback entry is either a **reclaim** entry (fires on the EMA9 close-reclaim, the production trigger) or an **early** dip-bar entry (produced by the experiment).

| Symbol | Variant | PB trades | med recovery R | med setup→signal bars | early entries | early NetR | reclaim entries | reclaim NetR |
|---|---|---|---|---|---|---|---|---|
| BTCUSDT | C reclaim | 168 | +0.19 | 1.0 | 0 | +0.00 | 168 | +1.63 |
| BTCUSDT | B slowDip2 | 232 | +0.15 | 1.0 | 82 | +7.49 | 150 | +0.86 |
| BTCUSDT | R1 pierce>=0 | 212 | +0.15 | 1.0 | 56 | +9.35 | 156 | +3.79 |
| BTCUSDT | X body<=0.15ATR | 193 | +0.17 | 1.0 | 32 | +6.11 | 161 | +2.97 |
| BTCUSDT | Y close>=0.5 dir | 180 | +0.19 | 1.0 | 15 | +5.00 | 165 | +3.22 |
| BTCUSDT | R1 LONG-early | 191 | +0.17 | 1.0 | 30 | +0.52 | 161 | +4.52 |
| BTCUSDT | R1 SHORT-early | 189 | +0.17 | 1.0 | 26 | +8.83 | 163 | +0.90 |

| ETHUSDT | C reclaim | 186 | +0.21 | 1.0 | 0 | +0.00 | 186 | +3.97 |
| ETHUSDT | B slowDip2 | 237 | +0.16 | 1.0 | 72 | -0.22 | 165 | +3.04 |
| ETHUSDT | R1 pierce>=0 | 221 | +0.17 | 1.0 | 51 | +7.00 | 170 | +3.08 |
| ETHUSDT | X body<=0.15ATR | 202 | +0.19 | 1.0 | 26 | +3.49 | 176 | +4.08 |
| ETHUSDT | Y close>=0.5 dir | 198 | +0.20 | 1.0 | 19 | +3.56 | 179 | +2.36 |
| ETHUSDT | R1 LONG-early | 196 | +0.20 | 1.0 | 17 | +3.68 | 179 | +2.26 |
| ETHUSDT | R1 SHORT-early | 211 | +0.18 | 1.0 | 34 | +3.32 | 177 | +4.80 |

| SOLUSDT | C reclaim | 173 | +0.20 | 1.0 | 0 | +0.00 | 173 | +7.01 |
| SOLUSDT | B slowDip2 | 232 | +0.16 | 1.0 | 86 | -4.60 | 146 | +3.93 |
| SOLUSDT | R1 pierce>=0 | 207 | +0.16 | 1.0 | 53 | -0.71 | 154 | +4.07 |
| SOLUSDT | X body<=0.15ATR | 187 | +0.18 | 1.0 | 29 | +0.41 | 158 | +2.26 |
| SOLUSDT | Y close>=0.5 dir | 178 | +0.20 | 1.0 | 9 | +0.23 | 169 | +6.69 |
| SOLUSDT | R1 LONG-early | 188 | +0.19 | 1.0 | 24 | -2.46 | 164 | +9.57 |
| SOLUSDT | R1 SHORT-early | 192 | +0.18 | 1.0 | 29 | +1.74 | 163 | +1.52 |

## Production-config sanity (V4.2 defaults, all gates ON)

| Symbol | Variant | Trades | WR % | PF | Net R | Avg R | MaxDD R | LONG | SHORT |
|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT | CUR reclaim | 36 | 58.3 | 1.7 | +6.43 | +0.179 | 1.52 | +7.86 (22) | -1.43 (14) |
| BTCUSDT | R1 | 44 | 61.4 | 2.1 | +10.76 | +0.244 | 2.00 | +8.90 (24) | +1.86 (20) |
| BTCUSDT | X body | 41 | 61.0 | 1.9 | +8.68 | +0.212 | 2.00 | +8.99 (23) | -0.31 (18) |
| BTCUSDT | Y close | 38 | 60.5 | 2.0 | +8.54 | +0.225 | 1.52 | +8.99 (23) | -0.45 (15) |
| BTCUSDT | R1L | 38 | 57.9 | 1.8 | +7.47 | +0.197 | 1.52 | +8.90 (24) | -1.43 (14) |
| BTCUSDT | R1S | 42 | 61.9 | 2.0 | +9.72 | +0.231 | 2.00 | +7.86 (22) | +1.86 (20) |

| ETHUSDT | CUR reclaim | 39 | 56.4 | 1.7 | +4.75 | +0.122 | 2.09 | +3.76 (23) | +0.98 (16) |
| ETHUSDT | R1 | 40 | 55.0 | 1.5 | +3.75 | +0.094 | 3.09 | +2.76 (24) | +0.98 (16) |
| ETHUSDT | X body | 39 | 56.4 | 1.7 | +4.75 | +0.122 | 2.09 | +3.76 (23) | +0.98 (16) |
| ETHUSDT | Y close | 39 | 56.4 | 1.7 | +4.75 | +0.122 | 2.09 | +3.76 (23) | +0.98 (16) |
| ETHUSDT | R1L | 40 | 55.0 | 1.5 | +3.75 | +0.094 | 3.09 | +2.76 (24) | +0.98 (16) |
| ETHUSDT | R1S | 39 | 56.4 | 1.7 | +4.75 | +0.122 | 2.09 | +3.76 (23) | +0.98 (16) |

| SOLUSDT | CUR reclaim | 29 | 62.1 | 1.8 | +3.96 | +0.137 | 2.07 | -1.15 (12) | +5.11 (17) |
| SOLUSDT | R1 | 33 | 57.6 | 1.5 | +2.90 | +0.088 | 2.21 | -1.87 (14) | +4.78 (19) |
| SOLUSDT | X body | 30 | 60.0 | 1.5 | +2.96 | +0.099 | 2.07 | -2.15 (13) | +5.11 (17) |
| SOLUSDT | Y close | 29 | 62.1 | 1.8 | +3.96 | +0.137 | 2.07 | -1.15 (12) | +5.11 (17) |
| SOLUSDT | R1L | 31 | 61.3 | 1.6 | +3.24 | +0.105 | 2.00 | -1.87 (14) | +5.11 (17) |
| SOLUSDT | R1S | 31 | 58.1 | 1.7 | +3.63 | +0.117 | 2.30 | -1.15 (12) | +4.78 (19) |

## F. Final decision

Δ Net R vs C reclaim by candidate and half (a candidate passes only if ≥ 0 on BOTH halves of ALL THREE symbols):

| Candidate | BTC h1 / h2 | ETH h1 / h2 | SOL h1 / h2 | All symbols x both halves? |
|---|---|---|---|---|
| B | +4.31 / +2.33 | +1.03 / -1.44 | -4.59 / -3.09 | NO |
| R1 | +5.88 / +5.54 | +2.99 / +3.72 | -0.76 / -2.89 | NO |
| X | +3.74 / +3.63 | +3.42 / +0.77 | -0.63 / -3.70 | NO |
| Y | +4.81 / +1.79 | +2.44 / -0.49 | +1.35 / -1.44 | NO |
| R1L | +3.59 / -0.26 | +2.71 / -0.75 | -0.46 / +0.56 | NO |
| R1S | +2.29 / +5.81 | +0.28 / +4.47 | -0.30 / -3.45 | NO |

### Verdict: **REJECT** (early dip-bar entry as a universal rule); return to reclaim architecture

Every refinement that passes BTC and ETH fails SOL's second hold-out half, and the side split proves the failure is structural: R1S (SHORT-early) rescues BTC/ETH's second halves (+5.81R/+4.47R vs C) but damages SOL (Δ −3.45R); R1L (LONG-early) rescues SOL's second half (+0.56R) but degrades BTC/ETH (Δ −0.26R/−0.75R). No single causal constraint — body size, close location, EMA21 pierce, ATR elevation, or direction — survives the robustness bar across all three symbols and both temporal halves. Per the experiment rules, a rule that does not hold on all symbols out-of-sample is not shipped, and a SOL-only fix would be overfitting. The premature population R1 leaves is tiny (4–6 per symbol), and the entry-candle guards built for it are not selective: X removes 24 of BTC's 56 early entries yet its premature-loss total barely moves (−5.06R → −5.13R prem NetR), and both X and Y COST BTC net R (−4.06R and −4.83R vs R1) by deleting good early entries alongside the few chop losers.

The evidence therefore supports the task's explicit fallback: **early pullback entry is market-regime dependent and should NOT replace the universal reclaim architecture.** The reclaim close-confirmation remains the production trigger. The valuable, retained findings:

1. **R1 (pierce ≥ 0) is a clean, low-cost quality idea for a future revisit** — it improves BTC and ETH on every CONFIG-A window (full + both halves) and on the production config BTC is strongly better (+10.76R vs +6.43R) while ETH is a wash (+3.75R vs +4.75R at 40 trades); it also recovers most of SOL's slowDip damage. If a symbol- or regime-aware deployment is ever acceptable, R1 is the refinement to carry.
2. **Dip SHORT early entries are positive on all three symbols** (+8.83/+3.32/+1.74R) — the asymmetry is real and cross-symbol, but deploying it unilaterally (R1S) still fails SOL's hold-out, so it stays a research note, not a rule.
3. The engine experiment options remain **default OFF**; engine parity and Pine remain untouched. No Pine port. No production-default change. No new filters added.

### Why R1 still fails on SOL (evidence-based)

SOL's R1 losses are NOT premature chop — only 5 of its 28 losing dip entries never reclaimed within 5 bars; the other **23 reclaimed and then failed** (continuation/SL, LOSS_OTHER), a failure mode that waiting for more confirmation cannot fix because confirmation already happened. The damage is concentrated in SOL's second hold-out half (Δ −2.89R vs C), and it is LONG-side: SOL dip LONGs net −2.46R (9W/1P/14O) while dip SHORTs net +1.74R (16W/4P/9O). The separator analysis shows these losing LONGs carry the same shallow-EMA21 profile as BTC winners (pierce +0.10 vs BTC +0.07 ATR), so no depth feature separates them — and BTC is the mirror image (dip LONG +0.52R / dip SHORT +8.83R), ETH in between (+3.68R LONG / +3.32R SHORT). A rule tuned to remove SOL's LONG chop would remove BTC's profitable SHORT entries — the exact cross-symbol incompatibility that rejects every candidate.
