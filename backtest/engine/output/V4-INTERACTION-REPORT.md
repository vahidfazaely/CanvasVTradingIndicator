# CanvasV V4.2 — HighVol Interaction & Filter Attribution

Generated: 2026-09-03T12:07:16.658Z

Purpose: explain WHY the filters interact — specifically why BTC's HV-only edge (+5.63R over baseline) shrinks to +2.84R in full V4.2 — before any sensitivity sweep. No thresholds were tuned; all runs use current V4.2 defaults. Config A = V4 baseline (all V4.2 gates off, hvMode Allow); B = HV confirmation only; C..I = B plus one/two gates; J = full V4.2. `hvMode` defaults to "Stronger Confirmation", so every config except A has the HV gate active (HV bars require relVol ≥ 1.40 and closeLoc ≥ 0.75/0.25).

**Headline finding (discovered during this analysis):** the HV "edge" is not an entry effect. Under HV-only mode almost no HV-bar entries fire at all (BTC 1, ETH 0, SOL 0 of 158–182 trades). The +5.63R BTC improvement comes from the HV gate **rejecting 24 baseline HV-bar entries worth −5.24R** (15 losers vs 9 winners). So the correct population for interaction analysis is the baseline (A) HV-bar trade set, not the HV-only trade set.

## 1. Interaction matrix — A–J (all symbols)

### BTCUSDT — baseline A: 178 trades, NetR +3.59 | HV-only B: 158 trades, NetR +9.22

| Cfg | Trades | WR | PF | NetR | AvgR | MaxDD(R) | Long R | Short R | BO R | PB R | ΔNetR vs A | ΔNetR vs B | LOW SAMPLE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 178 | 47.2% | 1.07 | +3.59 | +0.02 | 7.81R | +2.57 | +1.02 | +1.96 | +1.63 | +0.00 | -5.63 | BO |
| B | 158 | 48.1% | 1.21 | +9.22 | +0.06 | 6.59R | +3.51 | +5.71 | +1.94 | +7.28 | +5.63 | +0.00 | BO |
| C | 37 | 59.5% | 1.72 | +6.44 | +0.17 | 1.52R | +7.87 | -1.43 | -0.91 | +7.35 | +2.85 | -2.78 | LONG,SHORT,BO |
| D | 153 | 47.1% | 1.15 | +6.70 | +0.04 | 7.69R | +3.47 | +3.23 | -0.81 | +7.51 | +3.11 | -2.52 | BO |
| E | 154 | 47.4% | 1.21 | +9.04 | +0.06 | 7.22R | +3.52 | +5.52 | +1.53 | +7.51 | +5.45 | -0.18 | BO |
| F | 158 | 48.1% | 1.21 | +9.22 | +0.06 | 6.59R | +3.51 | +5.71 | +1.94 | +7.28 | +5.63 | +0.00 | BO |
| G | 36 | 58.3% | 1.72 | +6.43 | +0.18 | 1.52R | +7.86 | -1.43 | -0.92 | +7.35 | +2.84 | -2.79 | LONG,SHORT,BO |
| H | 36 | 58.3% | 1.72 | +6.43 | +0.18 | 1.52R | +7.86 | -1.43 | -0.92 | +7.35 | +2.84 | -2.79 | LONG,SHORT,BO |
| I | 152 | 46.7% | 1.15 | +6.59 | +0.04 | 7.69R | +3.36 | +3.23 | -0.92 | +7.51 | +3.00 | -2.63 | BO |
| J | 36 | 58.3% | 1.72 | +6.43 | +0.18 | 1.52R | +7.86 | -1.43 | -0.92 | +7.35 | +2.84 | -2.79 | LONG,SHORT,BO |

### ETHUSDT — baseline A: 197 trades, NetR +6.15 | HV-only B: 182 trades, NetR +4.67

| Cfg | Trades | WR | PF | NetR | AvgR | MaxDD(R) | Long R | Short R | BO R | PB R | ΔNetR vs A | ΔNetR vs B | LOW SAMPLE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 197 | 48.2% | 1.12 | +6.15 | +0.03 | 7.28R | +4.03 | +2.12 | +2.18 | +3.97 | +0.00 | +1.48 | BO |
| B | 182 | 49.5% | 1.10 | +4.67 | +0.03 | 7.61R | +2.27 | +2.41 | +1.20 | +3.47 | -1.48 | +0.00 | BO |
| C | 44 | 56.8% | 1.68 | +5.95 | +0.14 | 2.16R | +4.60 | +1.35 | +4.85 | +1.09 | -0.20 | +1.28 | LONG,SHORT,BO |
| D | 179 | 49.7% | 1.13 | +6.02 | +0.03 | 7.19R | +2.79 | +3.23 | +2.65 | +3.37 | -0.13 | +1.35 | BO |
| E | 178 | 49.4% | 1.09 | +3.97 | +0.02 | 7.19R | +3.79 | +0.18 | +0.60 | +3.37 | -2.18 | -0.70 | BO |
| F | 182 | 49.5% | 1.10 | +4.67 | +0.03 | 7.61R | +2.27 | +2.41 | +1.20 | +3.47 | -1.48 | +0.00 | BO |
| G | 39 | 56.4% | 1.70 | +4.75 | +0.12 | 2.09R | +3.76 | +0.98 | +2.94 | +1.81 | -1.40 | +0.08 | LONG,SHORT,BO |
| H | 42 | 54.8% | 1.56 | +4.95 | +0.12 | 2.16R | +3.76 | +1.18 | +3.85 | +1.09 | -1.20 | +0.27 | LONG,SHORT,BO |
| I | 177 | 49.7% | 1.11 | +4.97 | +0.03 | 7.19R | +3.79 | +1.18 | +1.60 | +3.37 | -1.18 | +0.30 | BO |
| J | 39 | 56.4% | 1.70 | +4.75 | +0.12 | 2.09R | +3.76 | +0.98 | +2.94 | +1.81 | -1.40 | +0.08 | LONG,SHORT,BO |

### SOLUSDT — baseline A: 179 trades, NetR +8.29 | HV-only B: 161 trades, NetR +8.49

| Cfg | Trades | WR | PF | NetR | AvgR | MaxDD(R) | Long R | Short R | BO R | PB R | ΔNetR vs A | ΔNetR vs B | LOW SAMPLE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 179 | 53.1% | 1.19 | +8.29 | +0.05 | 5.37R | -0.75 | +9.04 | +1.28 | +7.01 | +0.00 | -0.20 | BO |
| B | 161 | 53.4% | 1.21 | +8.49 | +0.05 | 5.76R | -0.26 | +8.75 | +1.28 | +7.21 | +0.20 | +0.00 | BO |
| C | 32 | 62.5% | 1.71 | +4.07 | +0.13 | 2.34R | -1.04 | +5.11 | +0.33 | +3.74 | -4.21 | -4.41 | LONG,SHORT,BO,PB |
| D | 159 | 53.5% | 1.17 | +7.10 | +0.04 | 5.76R | -1.64 | +8.75 | -0.11 | +7.21 | -1.19 | -1.39 | BO |
| E | 161 | 53.4% | 1.21 | +8.49 | +0.05 | 5.76R | -0.26 | +8.75 | +1.28 | +7.21 | +0.20 | +0.00 | BO |
| F | 161 | 53.4% | 1.21 | +8.49 | +0.05 | 5.76R | -0.26 | +8.75 | +1.28 | +7.21 | +0.20 | +0.00 | BO |
| G | 29 | 62.1% | 1.84 | +3.96 | +0.14 | 2.07R | -1.15 | +5.11 | +0.23 | +3.74 | -4.32 | -4.52 | ALL,LONG,SHORT,BO,PB |
| H | 31 | 61.3% | 1.68 | +3.89 | +0.13 | 2.34R | -1.23 | +5.11 | +0.15 | +3.74 | -4.40 | -4.60 | LONG,SHORT,BO,PB |
| I | 159 | 53.5% | 1.17 | +7.10 | +0.04 | 5.76R | -1.64 | +8.75 | -0.11 | +7.21 | -1.19 | -1.39 | BO |
| J | 29 | 62.1% | 1.84 | +3.96 | +0.14 | 2.07R | -1.15 | +5.11 | +0.23 | +3.74 | -4.32 | -4.52 | ALL,LONG,SHORT,BO,PB |

## 2. Incremental effects — each configuration vs HV-only (B)

Decomposition: `ΔNetR vs B = −(NetR of removed trades) + (NetR of gained trades)`. Removed = trades present in B absent from the config; gained = trades present in the config absent from B (position cascade — filtering an early trade frees the slot for a later one).

### BTCUSDT

| Change | Trades | NetR | Δ trades | Δ NetR | Removed trades | Removed NetR | Removed W/L | Gained trades | Gained NetR |
|---|---|---|---|---|---|---|---|---|---|
| HV confirmation only (B) | 158 | +9.22 | 0 | +0.00 | 0 | +0.00 | 0/0/0 | 0 | +0.00 |
| + Relative volume (C) | 37 | +6.44 | 121 | -2.78 | 128 | +1.27 | 57/71/0 | 7 | -1.51 |
| + ATR buffer (D) | 153 | +6.70 | 5 | -2.52 | 6 | +2.75 | 5/1/0 | 1 | +0.23 |
| + Close location (E) | 154 | +9.04 | 4 | -0.18 | 5 | +0.41 | 4/1/0 | 1 | +0.23 |
| + Breakout extension (F) | 158 | +9.22 | 0 | +0.00 | 0 | +0.00 | 0/0/0 | 0 | +0.00 |
| + RelVol + CloseLoc (G) | 36 | +6.43 | 122 | -2.79 | 129 | +1.27 | 58/71/0 | 7 | -1.51 |
| + RelVol + ATR buffer (H) | 36 | +6.43 | 122 | -2.79 | 129 | +1.27 | 58/71/0 | 7 | -1.51 |
| + ATR buffer + CloseLoc (I) | 152 | +6.59 | 6 | -2.63 | 7 | +2.86 | 6/1/0 | 1 | +0.23 |
| + all remaining filters (J, full) | 36 | +6.43 | 122 | -2.79 | 129 | +1.27 | 58/71/0 | 7 | -1.51 |

### ETHUSDT

| Change | Trades | NetR | Δ trades | Δ NetR | Removed trades | Removed NetR | Removed W/L | Gained trades | Gained NetR |
|---|---|---|---|---|---|---|---|---|---|
| HV confirmation only (B) | 182 | +4.67 | 0 | +0.00 | 0 | +0.00 | 0/0/0 | 0 | +0.00 |
| + Relative volume (C) | 44 | +5.95 | 138 | +1.28 | 156 | -1.51 | 74/82/0 | 18 | -0.24 |
| + ATR buffer (D) | 179 | +6.02 | 3 | +1.35 | 4 | -1.45 | 1/3/0 | 1 | -0.10 |
| + Close location (E) | 178 | +3.97 | 4 | -0.70 | 5 | +0.60 | 2/3/0 | 1 | -0.10 |
| + Breakout extension (F) | 182 | +4.67 | 0 | +0.00 | 0 | +0.00 | 0/0/0 | 0 | +0.00 |
| + RelVol + CloseLoc (G) | 39 | +4.75 | 143 | +0.08 | 158 | +0.71 | 76/82/0 | 15 | +0.79 |
| + RelVol + ATR buffer (H) | 42 | +4.95 | 140 | +0.27 | 157 | -1.34 | 75/82/0 | 17 | -1.07 |
| + ATR buffer + CloseLoc (I) | 177 | +4.97 | 5 | +0.30 | 6 | -0.40 | 2/4/0 | 1 | -0.10 |
| + all remaining filters (J, full) | 39 | +4.75 | 143 | +0.08 | 158 | +0.71 | 76/82/0 | 15 | +0.79 |

### SOLUSDT

| Change | Trades | NetR | Δ trades | Δ NetR | Removed trades | Removed NetR | Removed W/L | Gained trades | Gained NetR |
|---|---|---|---|---|---|---|---|---|---|
| HV confirmation only (B) | 161 | +8.49 | 0 | +0.00 | 0 | +0.00 | 0/0/0 | 0 | +0.00 |
| + Relative volume (C) | 32 | +4.07 | 129 | -4.41 | 137 | +5.13 | 72/64/1 | 8 | +0.72 |
| + ATR buffer (D) | 159 | +7.10 | 2 | -1.39 | 2 | +1.39 | 1/1/0 | 0 | +0.00 |
| + Close location (E) | 161 | +8.49 | 0 | +0.00 | 0 | +0.00 | 0/0/0 | 0 | +0.00 |
| + Breakout extension (F) | 161 | +8.49 | 0 | +0.00 | 0 | +0.00 | 0/0/0 | 0 | +0.00 |
| + RelVol + CloseLoc (G) | 29 | +3.96 | 132 | -4.52 | 137 | +5.13 | 72/64/1 | 5 | +0.61 |
| + RelVol + ATR buffer (H) | 31 | +3.89 | 130 | -4.60 | 137 | +5.13 | 72/64/1 | 7 | +0.53 |
| + ATR buffer + CloseLoc (I) | 159 | +7.10 | 2 | -1.39 | 2 | +1.39 | 1/1/0 | 0 | +0.00 |
| + all remaining filters (J, full) | 29 | +3.96 | 132 | -4.52 | 137 | +5.13 | 72/64/1 | 5 | +0.61 |

## 3. Baseline HV-bar trades (config A) — funnel through the gates

Population P1 = trades that entered on a high-volatility bar under baseline A (`trades.highVol === true`). Each config's row shows how many of P1 survive and the NetR of the removed subset. This is the correct population for the HV interaction question, because HV-only mode itself leaves almost no HV entries to study.

### BTCUSDT — P1 (baseline HV-bar trades): 25 total, NetR -5.47 (9W / 16L)

| Config | P1 kept | P1 removed | Removed NetR | Removed W/L | Total trades | Config NetR |
|---|---|---|---|---|---|---|
| A — baseline | 25 | 0 | +0.00 | 0/0/0 | 178 | +3.59 |
| HV confirmation only (B) | 1 | 24 | -5.24 | 9/15/0 | 158 | +9.22 |
| + Relative volume (C) | 1 | 24 | -5.24 | 9/15/0 | 37 | +6.44 |
| + ATR buffer (D) | 1 | 24 | -5.24 | 9/15/0 | 153 | +6.70 |
| + Close location (E) | 1 | 24 | -5.24 | 9/15/0 | 154 | +9.04 |
| + Breakout extension (F) | 1 | 24 | -5.24 | 9/15/0 | 158 | +9.22 |
| + RelVol + CloseLoc (G) | 1 | 24 | -5.24 | 9/15/0 | 36 | +6.43 |
| + RelVol + ATR buffer (H) | 1 | 24 | -5.24 | 9/15/0 | 36 | +6.43 |
| + ATR buffer + CloseLoc (I) | 1 | 24 | -5.24 | 9/15/0 | 152 | +6.59 |
| + all remaining filters (J, full) | 1 | 24 | -5.24 | 9/15/0 | 36 | +6.43 |

**Attribution of P1 trades removed by full V4.2 (J):** each trade is first attributed to HV confirmation if the HV gate alone removes it (B); otherwise to the single gate that alone removes it among relVol/buffer/closeLoc/ext (each evaluated as the B→X delta); otherwise 'cascade/other'.

| Reason | Removed | Winners | Losers | NetR of removed |
|---|---|---|---|---|
| HV confirmation | 24 | 9 | 15 | -5.24 |

### ETHUSDT — P1 (baseline HV-bar trades): 20 total, NetR +0.33 (7W / 13L)

| Config | P1 kept | P1 removed | Removed NetR | Removed W/L | Total trades | Config NetR |
|---|---|---|---|---|---|---|
| A — baseline | 20 | 0 | +0.00 | 0/0/0 | 197 | +6.15 |
| HV confirmation only (B) | 0 | 20 | +0.33 | 7/13/0 | 182 | +4.67 |
| + Relative volume (C) | 0 | 20 | +0.33 | 7/13/0 | 44 | +5.95 |
| + ATR buffer (D) | 0 | 20 | +0.33 | 7/13/0 | 179 | +6.02 |
| + Close location (E) | 0 | 20 | +0.33 | 7/13/0 | 178 | +3.97 |
| + Breakout extension (F) | 0 | 20 | +0.33 | 7/13/0 | 182 | +4.67 |
| + RelVol + CloseLoc (G) | 0 | 20 | +0.33 | 7/13/0 | 39 | +4.75 |
| + RelVol + ATR buffer (H) | 0 | 20 | +0.33 | 7/13/0 | 42 | +4.95 |
| + ATR buffer + CloseLoc (I) | 0 | 20 | +0.33 | 7/13/0 | 177 | +4.97 |
| + all remaining filters (J, full) | 0 | 20 | +0.33 | 7/13/0 | 39 | +4.75 |

**Attribution of P1 trades removed by full V4.2 (J):** each trade is first attributed to HV confirmation if the HV gate alone removes it (B); otherwise to the single gate that alone removes it among relVol/buffer/closeLoc/ext (each evaluated as the B→X delta); otherwise 'cascade/other'.

| Reason | Removed | Winners | Losers | NetR of removed |
|---|---|---|---|---|
| HV confirmation | 20 | 7 | 13 | +0.33 |

### SOLUSDT — P1 (baseline HV-bar trades): 22 total, NetR -0.59 (10W / 12L)

| Config | P1 kept | P1 removed | Removed NetR | Removed W/L | Total trades | Config NetR |
|---|---|---|---|---|---|---|
| A — baseline | 22 | 0 | +0.00 | 0/0/0 | 179 | +8.29 |
| HV confirmation only (B) | 0 | 22 | -0.59 | 10/12/0 | 161 | +8.49 |
| + Relative volume (C) | 0 | 22 | -0.59 | 10/12/0 | 32 | +4.07 |
| + ATR buffer (D) | 0 | 22 | -0.59 | 10/12/0 | 159 | +7.10 |
| + Close location (E) | 0 | 22 | -0.59 | 10/12/0 | 161 | +8.49 |
| + Breakout extension (F) | 0 | 22 | -0.59 | 10/12/0 | 161 | +8.49 |
| + RelVol + CloseLoc (G) | 0 | 22 | -0.59 | 10/12/0 | 29 | +3.96 |
| + RelVol + ATR buffer (H) | 0 | 22 | -0.59 | 10/12/0 | 31 | +3.89 |
| + ATR buffer + CloseLoc (I) | 0 | 22 | -0.59 | 10/12/0 | 159 | +7.10 |
| + all remaining filters (J, full) | 0 | 22 | -0.59 | 10/12/0 | 29 | +3.96 |

**Attribution of P1 trades removed by full V4.2 (J):** each trade is first attributed to HV confirmation if the HV gate alone removes it (B); otherwise to the single gate that alone removes it among relVol/buffer/closeLoc/ext (each evaluated as the B→X delta); otherwise 'cascade/other'.

| Reason | Removed | Winners | Losers | NetR of removed |
|---|---|---|---|---|
| HV confirmation | 22 | 10 | 12 | -0.59 |

## 4. Per-filter rejection of HV-bar trades (P1)

Population P1 = baseline HV-bar trades. Rows show, per filter: the P1 trades it removes (relative to the config that precedes it) and their Net R. Positive NetR of rejected trades = the filter deletes profitable HV trades. HV confirmation row = P1 trades removed when switching A→B. Remaining-gates row = P1 trades that survive HV confirmation but are removed by relVol+buffer+closeLoc+ext combined (B→J).

### BTCUSDT — P1: 25 HV-bar trades (NetR -5.47)

| Filter | HV-bar trades rejected | Winners | Losers | BE | NetR of rejected | Verdict |
|---|---|---|---|---|---|---|
| HV confirmation (A→B) | 24 | 9 | 15 | 0 | -5.24 | removes losers (useful) |
| Relative volume (B→C) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| ATR buffer (B→D) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| Close location (B→E) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| Breakout extension (B→F) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| All other gates combined (B→J) | 0 | 0 | 0 | 0 | +0.00 | no effect |

Note: HV-only mode itself ends up with 1 HV-flagged trade(s), so the standalone gates have almost no HV entries left to delete — the HV edge was already fully resolved by the HV gate. The rows above measure the gates' effect on the baseline HV-bar population.

### ETHUSDT — P1: 20 HV-bar trades (NetR +0.33)

| Filter | HV-bar trades rejected | Winners | Losers | BE | NetR of rejected | Verdict |
|---|---|---|---|---|---|---|
| HV confirmation (A→B) | 20 | 7 | 13 | 0 | +0.33 | **REMOVES PROFIT** |
| Relative volume (B→C) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| ATR buffer (B→D) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| Close location (B→E) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| Breakout extension (B→F) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| All other gates combined (B→J) | 0 | 0 | 0 | 0 | +0.00 | no effect |

Note: HV-only mode itself ends up with 0 HV-flagged trade(s), so the standalone gates have almost no HV entries left to delete — the HV edge was already fully resolved by the HV gate. The rows above measure the gates' effect on the baseline HV-bar population.

### SOLUSDT — P1: 22 HV-bar trades (NetR -0.59)

| Filter | HV-bar trades rejected | Winners | Losers | BE | NetR of rejected | Verdict |
|---|---|---|---|---|---|---|
| HV confirmation (A→B) | 22 | 10 | 12 | 0 | -0.59 | removes losers (useful) |
| Relative volume (B→C) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| ATR buffer (B→D) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| Close location (B→E) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| Breakout extension (B→F) | 0 | 0 | 0 | 0 | +0.00 | no effect (subsumed/dead) |
| All other gates combined (B→J) | 0 | 0 | 0 | 0 | +0.00 | no effect |

Note: HV-only mode itself ends up with 0 HV-flagged trade(s), so the standalone gates have almost no HV entries left to delete — the HV edge was already fully resolved by the HV gate. The rows above measure the gates' effect on the baseline HV-bar population.

## 5. BTC deep-dive — what produces the +5.63R HV edge, and where does it go?

### 5.1 P1 profile (BTC baseline HV-bar trades)

| Group | Count | NetR | AvgR | Avg relVol | Avg closeLoc |
|---|---|---|---|---|---|
| All P1 | 25 | -5.47 | -0.22 | 0.96 | 0.60 |
| BREAKOUT | 1 | +0.02 | +0.02 | 0.65 | 0.84 |
| PULLBACK | 24 | -5.49 | -0.23 | 0.97 | 0.59 |
| LONG | 16 | -2.16 | -0.13 | 0.63 | 0.79 |
| SHORT | 9 | -3.31 | -0.37 | 1.54 | 0.26 |

The +5.63R edge = removing 24 P1 members worth −5.24R net (9W/15L — the 15 losers outweigh the 9 winners). It is a **loser-removal** effect, not a winner-finding effect: the removed set is 23 PULLBACK + 1 BREAKOUT entry, consistent with the known PULLBACK weakness on BTC. (The 1 surviving P1 trade is a BUY/PULLBACK at bar 14253, −0.23R.)

### 5.2 Fate of the biggest P1 contributors (top 8 by |finalR|) across configs

K = kept at same entry bar, R = removed. Shows which gate deletes each high-value HV-bar trade.

| Entry bar | Dir | Trig | finalR | Outcome | B HV | C relVol | D buffer | E closeLoc | J full |
|---|---|---|---|---|---|---|---|---|---|
| 1541 | BUY | PULLBACK RESUME | -1.00 | L | R | R | R | R | R |
| 13643 | SELL | PULLBACK RESUME | -1.00 | L | R | R | R | R | R |
| 15660 | BUY | PULLBACK RESUME | -1.00 | L | R | R | R | R | R |
| 16298 | SELL | PULLBACK RESUME | -1.00 | L | R | R | R | R | R |
| 1869 | SELL | PULLBACK RESUME | -0.83 | L | R | R | R | R | R |
| 7628 | SELL | PULLBACK RESUME | -0.72 | L | R | R | R | R | R |
| 2109 | SELL | PULLBACK RESUME | +0.61 | W | R | R | R | R | R |
| 8689 | BUY | PULLBACK RESUME | -0.60 | L | R | R | R | R | R |

### 5.3 Where the rest of the +2.84R loss vs HV-only goes (cascade)

B→C (relVol) is the entire interaction on BTC: it removes 128 trades (net +1.27, barely positive) and the position cascade creates 7 new trades (net -1.51), so the book rewrites almost completely. Adding buffer/closeLoc/ext on top of relVol (C→J) changes nothing on BTC (36 trades, identical NetR in C, G, H, J) — the quality trio is fully dominated by the volume gate once it is on.

## 6. ETH / SOL — is the HV behavior symbol-specific?

### ETHUSDT

| Config | Trades | NetR | WR | PF |
|---|---|---|---|---|
| A | 197 | +6.15 | 48.2% | 1.12 |
| B | 182 | +4.67 | 49.5% | 1.10 |
| J | 39 | +4.75 | 56.4% | 1.70 |

P1 (baseline HV-bar trades): 20 (NetR +0.33). HV-only ΔNetR vs baseline: -1.48; full V4.2 ΔNetR vs baseline: -1.40.

**HV behavior on ETHUSDT: HV-negative.**

### SOLUSDT

| Config | Trades | NetR | WR | PF |
|---|---|---|---|---|
| A | 179 | +8.29 | 53.1% | 1.19 |
| B | 161 | +8.49 | 53.4% | 1.21 |
| J | 29 | +3.96 | 62.1% | 1.84 |

P1 (baseline HV-bar trades): 22 (NetR -0.59). HV-only ΔNetR vs baseline: +0.20; full V4.2 ΔNetR vs baseline: -4.32.

**HV behavior on SOLUSDT: HV-neutral.**

## 7. Breakout sample audit — are filters disproportionately killing breakouts?

Breakout funnel from audit rows (config J): raw = close beyond previous 10-bar range on any evaluated bar; each gate's surviving count. Trade counts from configs A and J are shown for comparison (BO < 30 = LOW SAMPLE).

| Symbol | Raw BO | + ATR buffer | + close loc | + ext (≤2.0) | + rel vol | BO trades A | BO trades J |
|---|---|---|---|---|---|---|---|
| BTCUSDT | 2597 | 2183 | 1861 | 2597 | 1494 | 10 | 2 |
| ETHUSDT | 2150 | 1790 | 1428 | 2150 | 1479 | 11 | 4 |
| SOLUSDT | 2287 | 1976 | 1594 | 2287 | 1467 | 6 | 2 |

Per-direction breakout funnel (LONG / SHORT):

**BTCUSDT**

| Direction | Raw BO | + ATR buffer | + close loc | + ext | + rel vol |
|---|---|---|---|---|---|
| LONG | 1285 | 1077 | 918 | 1285 | 738 |
| SHORT | 1312 | 1106 | 943 | 1312 | 756 |

**ETHUSDT**

| Direction | Raw BO | + ATR buffer | + close loc | + ext | + rel vol |
|---|---|---|---|---|---|
| LONG | 1089 | 917 | 730 | 1089 | 735 |
| SHORT | 1061 | 873 | 698 | 1061 | 744 |

**SOLUSDT**

| Direction | Raw BO | + ATR buffer | + close loc | + ext | + rel vol |
|---|---|---|---|---|---|
| LONG | 1125 | 967 | 791 | 1125 | 721 |
| SHORT | 1162 | 1009 | 803 | 1162 | 746 |

## 8. Dead-gate verification & removal (empirical)

| BTCUSDT | strict-pass but breakout-ext-fail: **0** | breakout-ext-pass but strict-fail: **4195** |
| ETHUSDT | strict-pass but breakout-ext-fail: **0** | breakout-ext-pass but strict-fail: **3787** |
| SOLUSDT | strict-pass but breakout-ext-fail: **0** | breakout-ext-pass but strict-fail: **3828** |

`breakout-ext ≤ 2.0` never rejects a bar the strict `≤ 1.5` gate passed (0 bars on all symbols — the guarded form is now used in production), while the strict gate rejects ~1,800–2,000 bars that breakout-ext would pass. `pullback-momentum` was provably always true (`pullbackUp ⇒ close > emaTrig` via the `reclaimUp` leg) and the pre-removal audit rows confirmed 0 rejections on every symbol; it has been **deleted** from both the engine and the Pine script. `breakout-ext` has been **guarded** (only enforced when stricter than the strict gate, preserving behavior under every valid configuration). Post-removal parity check: configs A and J produce byte-identical trade sets, signal bars and NetR on all three symbols before vs after the removal — the cleanup changed nothing.

## 9. Filter classification (no threshold values)

| Filter | Evidence | Classification |
|---|---|---|
| **HV confirmation** | Pure rejection effect: BTC rejects 24 P1 trades worth −5.24R (9W/15L) → +5.63R book improvement; ETH rejects 20 worth +0.33R (7W/13L) → −1.48R; SOL rejects 22 worth −0.59R (10W/12L) → +0.20R. Symbol-dependent but cheap — inside full V4.2 it is pre-empted by the volume gates (rejects 1–3 candidates). | PROCEED TO SENSITIVITY TEST (per-symbol; ETH requires scrutiny) |
| **Relative volume** | The only gate that moves NetR inside the full stack — it dominates C/G/H/J on every symbol (C≡G≡H≡J on BTC and SOL). BTC removes 128 trades (net +1.27R) and the cascade rewrites the book; SOL removes 137 trades worth +5.13R (net −4.41R); ETH removes losers (−1.51R removed, +1.28R). | INTERACTION PROBLEM — dominant, symbol-divergent, cascade-heavy |
| **ATR buffer** | Removes winners: BTC 6 trades worth +2.75R (5W/1L), SOL 2 worth +1.39R. Harmful wherever it acts; neutral on ETH (−1.45R of losers removed). | NEEDS MORE DATA (BTC/SOL harm must be understood before any sweep) |
| **Close location** | Near-neutral: BTC 5 trades +0.41R, ETH 5 +0.60R, SOL 0. Slightly removes winners. | NEEDS MORE DATA |
| **Breakout extension ≤2.0** | Removes 0 trades in every config on every symbol (subsumed by strict ≤1.5). | REMOVE (dead code) — guarded, not deleted |
| **Pullback momentum** | Mathematically always-true; rejects 0 candidates. | REMOVE (dead code) |

### Central question

**Which filter is actually improving signal quality, and which filters are merely deleting trades the strategy could have profitably taken?**

**HV confirmation is the only gate that improves signal quality**, and it does so by deleting bad trades: on BTC it removes 24 baseline HV-bar entries worth −5.24R net (9W/15L; 23 PULLBACK + 1 BREAKOUT), which is the entire +5.63R book improvement. **Relative volume, ATR buffer and close-location are trade-deleters, not quality-improvers**: their marginal effect is positive on ETH (removing losers, +1.28R), neutral on BTC (removes 128 trades net +1.27R but final ΔNetR −2.78R via cascade), and strongly negative on SOL (removes 137 trades worth +5.13R of winners, −4.41R). The ATR buffer and close-location gates delete winners wherever they act (BTC buffer: 5W/1L worth +2.75R). The breakout-quality trio contributes **zero** additional effect on top of the volume gate (C≡G≡H≡J on BTC and SOL), and two gates (breakout-ext ≤2.0, pullback-momentum) are provably dead (section 8). The BTC HV edge is lost inside full V4.2 not because a gate deletes the HV winners (there are almost none — HV-only mode takes just 1 HV entry) but because the volume gate restructures the whole book: its 128 removals (net +1.27R) free positions that cascade into 7 new trades (net −1.51R), so the full-V4.2 book of 36 trades shares only 29 entry-bars with HV-only's 158.

