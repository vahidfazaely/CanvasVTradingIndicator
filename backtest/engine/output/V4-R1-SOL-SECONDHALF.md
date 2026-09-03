# Why does R1 still fail on SOLUSDT's second hold-out half?

> Generated: 2026-09-03 13:21:56 — engine: backtest/engine.mjs — protocol: 90/90 midpoint split, indicators recomputed per slice.
> Population: CONFIG A (V4.2 gates off — the signal-study config), R1 = slowDip2 + EMA21 pierce ≥ 0.
> Anchor cross-check vs V4-R1-FORENSICS.md D2: all 24 pass ✅

## 0. The documented blocker and the 90/90 numbers (CONFIG A)

| Symbol | Half | C trades / NetR | R1 trades / NetR | Δ NetR | Δ trades |
|---|---|---:|---:|---:|---:|
| BTCUSDT | first-90 | 96 / +11.01 | 120 / +16.89 | +5.88 | +24 |
| BTCUSDT | second-90 | 81 / -6.82 | 100 / -1.27 | +5.54 | +19 |
| ETHUSDT | first-90 | 101 / +9.22 | 119 / +12.21 | +2.99 | +18 |
| ETHUSDT | second-90 | 94 / -4.59 | 110 / -0.87 | +3.72 | +16 |
| SOLUSDT | first-90 | 92 / +7.45 | 109 / +6.69 | -0.76 | +17 |
| SOLUSDT | second-90 | 86 / +1.03 | 103 / -1.85 | -2.89 | +17 |

**SOL second-90 is the only cell where R1 is deeply negative** (Δ -2.89R; SOL first-90 Δ -0.76R) while both BTC/ETH cells are R1-positive. Window: 2026-06-02 → 2026-08-31 (8,640 M15 bars).

## 1. Displacement vs early-basket decomposition (R1 = CUR book − displaced reclaims + early entries)

| Symbol | Half | C trades | R1 reclaim | Displaced (C PB, gone under R1) | R1 early basket | Δ NetR |
|---|---|---:|---:|---:|---:|---:|
| BTCUSDT | first-90 | 96 | 81 | 9 / -2.07 | 33 / +3.81 | +5.88 |
| BTCUSDT | second-90 | 81 | 74 | 3 / -0.09 | 23 / +5.54 | +5.54 |
| ETHUSDT | first-90 | 101 | 90 | 8 / -0.77 | 24 / +2.41 | +2.99 |
| ETHUSDT | second-90 | 94 | 78 | 11 / +2.18 | 26 / +5.19 | +3.72 |
| SOLUSDT | first-90 | 92 | 79 | 11 / +5.76 | 26 / +3.03 | -0.76 |
| SOLUSDT | second-90 | 86 | 74 | 11 / +0.01 | 27 / -3.74 | -2.89 |

R1 does **not** displace reclaims on SOL second-90 at scale (11 of 86 pre-empted, worth +0.01R) — the Δ -2.89R shortfall is **the early-entry basket itself**: 27 entries, -3.74R (the residual ≈ +0.9R is R1's reclaim book gaining from re-entry churn). Compare BTC second-90: early basket 23 / +5.54R, displacement 3 / -0.09R.

## 2. SOL second-90 early-entry basket — 27 entries (-3.74R)

| Taxonomy | n | NetR | Exit reasons (n) |
|---|---:|---:|---|
| WIN | 12 | +5.54 | TP1 FIRST 4, STALE_EXIT 6, EXPIRED 2 |
| LOSS_PREMATURE (no EMA9 reclaim ≤ 5 bars) | 3 | -2.45 | SL FIRST 1, EXPIRED 2 |
| LOSS_OTHER (reclaimed, then failed) | 12 | -6.84 | STALE_EXIT 4, EXPIRED 4, SL FIRST 4 |

Direction split:
- LONG: 15 (7W/1P/7O), NetR -0.87
- SHORT: 12 (5W/2P/5O), NetR -2.88

Every trade in the basket (date, dir, exit, finalR, MAE, MFE, bars, pierce ATR, entry-body ATR, closeLoc):

| date | dir | exit | finalR | MAE | MFE | bars | pierce | bodyAtr | closeLoc | below9 | tx |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2026-06-07 | LONG | TP1 FIRST | +1.21 | +0.02 | +1.30 | 8 | +0.31 | +0.51 | 0.28 | +0.39 | WIN |
| 2026-06-08 | LONG | STALE_EXIT | -0.16 | +0.68 | +0.08 | 15 | +0.10 | +0.02 | 0.33 | +0.11 | LOSS_OTHER |
| 2026-06-16 | SHORT | EXPIRED | -0.95 | +0.96 | +0.29 | 20 | +0.17 | +0.36 | 0.80 | +0.44 | LOSS_OTHER |
| 2026-06-16 | LONG | SL FIRST | -1.00 | +1.68 | +0.58 | 17 | +0.62 | +0.09 | 0.26 | +0.17 | LOSS_OTHER |
| 2026-06-17 | SHORT | SL FIRST | -1.00 | +1.16 | +0.54 | 11 | +0.22 | +0.51 | 0.86 | +0.43 | LOSS_PREMATURE |
| 2026-06-20 | LONG | STALE_EXIT | +0.20 | +0.43 | +0.55 | 16 | +0.53 | +0.34 | 0.47 | +0.31 | WIN |
| 2026-06-28 | SHORT | STALE_EXIT | +0.02 | +0.25 | +0.34 | 15 | +0.82 | +0.03 | 0.95 | +0.08 | WIN |
| 2026-07-03 | LONG | STALE_EXIT | -0.23 | +0.62 | +0.35 | 17 | +0.21 | +0.08 | 0.23 | +0.16 | LOSS_OTHER |
| 2026-07-05 | SHORT | TP1 FIRST | +0.90 | +0.42 | +1.05 | 12 | +0.00 | +0.00 | 0.26 | +0.07 | WIN |
| 2026-07-06 | LONG | EXPIRED | -0.77 | +0.84 | +0.06 | 20 | +0.45 | +0.07 | 0.30 | +0.09 | LOSS_PREMATURE |
| 2026-07-07 | SHORT | STALE_EXIT | -0.23 | +0.76 | +0.35 | 16 | +0.12 | +0.37 | 0.56 | +0.46 | LOSS_OTHER |
| 2026-07-11 | SHORT | EXPIRED | -0.31 | +0.48 | +0.25 | 20 | +0.03 | +0.05 | 0.64 | +0.14 | LOSS_OTHER |
| 2026-07-16 | SHORT | EXPIRED | +0.47 | +0.24 | +0.84 | 20 | +0.09 | +0.03 | 0.25 | +0.05 | WIN |
| 2026-07-19 | LONG | STALE_EXIT | +0.00 | +0.07 | +0.72 | 15 | +0.06 | +0.06 | 0.09 | +0.03 | LOSS_OTHER |
| 2026-07-21 | LONG | EXPIRED | +0.28 | +0.02 | +0.97 | 20 | +0.06 | +0.29 | 0.08 | +0.25 | WIN |
| 2026-07-24 | SHORT | EXPIRED | -0.67 | +0.84 | +0.04 | 20 | +0.10 | +0.26 | 0.89 | +0.41 | LOSS_PREMATURE |
| 2026-07-27 | LONG | STALE_EXIT | +0.14 | +0.19 | +0.59 | 17 | +0.06 | +0.00 | 0.45 | +0.10 | WIN |
| 2026-08-01 | SHORT | STALE_EXIT | +0.22 | +0.50 | +0.54 | 15 | +0.26 | +0.00 | 0.67 | +0.02 | WIN |
| 2026-08-02 | LONG | SL FIRST | -1.00 | +1.10 | +0.20 | 19 | +0.95 | +0.13 | 0.57 | +0.16 | LOSS_OTHER |
| 2026-08-05 | LONG | EXPIRED | -0.48 | +0.79 | +0.15 | 20 | +0.39 | +0.00 | 0.30 | +0.05 | LOSS_OTHER |
| 2026-08-06 | SHORT | STALE_EXIT | +0.15 | +0.52 | +0.27 | 15 | +0.23 | +0.05 | 0.50 | +0.13 | WIN |
| 2026-08-09 | LONG | TP1 FIRST | +0.86 | +0.16 | +1.06 | 16 | +0.51 | +0.05 | 0.11 | +0.21 | WIN |
| 2026-08-22 | LONG | TP1 FIRST | +1.04 | +0.00 | +1.26 | 5 | +0.03 | +0.09 | 0.35 | +0.15 | WIN |
| 2026-08-23 | SHORT | SL FIRST | -1.00 | +1.04 | +0.21 | 17 | +0.21 | +0.14 | 0.29 | +0.13 | LOSS_OTHER |
| 2026-08-27 | LONG | STALE_EXIT | +0.06 | +0.10 | +0.82 | 15 | +0.70 | +0.37 | 0.02 | +0.34 | WIN |
| 2026-08-27 | LONG | SL FIRST | -1.00 | +1.03 | +0.36 | 11 | +0.29 | +0.05 | 0.20 | +0.07 | LOSS_OTHER |
| 2026-08-31 | SHORT | EXPIRED | -0.47 | +0.58 | +0.61 | 20 | +0.59 | +0.25 | 0.39 | +0.01 | LOSS_OTHER |

Median profile — SOL second-90 basket winners vs losers vs the same on SOL first-90 and BTC/ETH second-90:

| Feature | SOL-2 WIN med | SOL-2 LOSS med | SOL-1 LOSS med | BTC-2 WIN med | ETH-2 WIN med |
|---|---:|---:|---:|---:|---:|
| pierce ATR | +0.24 | +0.21 | +0.19 | +0.24 | +0.21 |
| dist anchor ATR | +0.26 | +0.15 | +0.20 | +0.29 | +0.21 |
| recovery R | +0.09 | +0.04 | +0.06 | +0.09 | +0.06 |
| dip bars | +2.00 | +2.00 | +2.00 | +2.00 | +2.00 |
| body ATR | +0.05 | +0.09 | +0.20 | +0.11 | +0.21 |
| body % | +8.83 | +15.79 | +36.00 | +16.82 | +52.64 |
| range ATR | +0.76 | +0.49 | +0.62 | +0.62 | +0.54 |
| close loc | +0.32 | +0.33 | +0.36 | +0.73 | +0.73 |
| below EMA9 ATR | +0.14 | +0.14 | +0.20 | +0.17 | +0.16 |
| EMA9-21 sep | +0.69 | +0.68 | +0.66 | +0.79 | +0.65 |
| EMA9 slope | +0.00 | +0.01 | +0.02 | -0.03 | -0.02 |
| EMA21 slope | +0.15 | +0.14 | +0.16 | -0.24 | -0.22 |
| extAtr | +0.56 | +0.47 | +0.42 | +0.61 | +0.35 |
| ATR % avg | +103.15 | +98.89 | +100.18 | +108.99 | +102.56 |
| relVol | +0.54 | +0.59 | +0.53 | +0.85 | +0.45 |
| MFE | +0.83 | +0.29 | +0.24 | +1.02 | +1.04 |
| MAE | +0.22 | +0.84 | +0.85 | +0.23 | +0.19 |
| hold bars | +15.00 | +17.00 | +15.00 | +13.50 | +13.00 |

Win/loss medians on SOL second-90: 12 WIN vs 15 LOSS — LOW SAMPLE. Interpret separators cautiously.

## 3. Cross-symbol second-half basket contrast

| Symbol | second-90 early n / NetR | LONG n/R | SHORT n/R | WIN | PREMATURE | OTHER |
|---|---:|---:|---:|---:|---:|---:|
| BTCUSDT | 23 / +5.54 | 12 / -0.27 | 11 / +5.81 | 14 | 2 | 7 |
| ETHUSDT | 26 / +5.19 | 10 / +0.75 | 16 / +4.44 | 14 | 1 | 11 |
| SOLUSDT | 27 / -3.74 | 15 / -0.87 | 12 / -2.88 | 12 | 3 | 12 |

BTC's second-90 basket is SHORT-heavy and positive; ETH's is tiny; SOL's is the only deeply negative one. The dominant SOL failure class: **LOSS_OTHER (reclaimed then failed — more confirmation would not have helped)**.

## 4. Production-config reconciliation (the config that would actually ship)

| Variant | trades | NetR | early entries |
|---|---:|---:|---:|
| CUR reclaim | 12 | -0.06 | 0 |
| R1 | 14 | -0.02 | 2 |

At production selectivity (all V4.2 gates on), SOL second-90 feeds R1 only 2 early entries (+0.04R) — R1 **passes** here (Δ +0.04R). The classic CONFIG-A failure is a **de-gated-population phenomenon**: with the volume/HV/extension gates on, the qualifying slow dips in this window nearly vanish, so the −2.89R damage cannot occur. Under CUR, SOL's actual R1 blocker is the **first** half (Δ −1.10R, V4-R1-PROD90.md).

- CUR-basket trade: 2026-07-07 SHORT STALE_EXIT -0.23R
- CUR-basket trade: 2026-07-21 LONG EXPIRED +0.28R

## 5. Evidence-based conclusion (why SOL second-90 fails R1, CONFIG A)

- **The damage is the early-entry basket itself, not displacement.** Only 11 of 86 trades were pre-empted (+0.01R) — R1's reclaim stream on SOL second-90 is nearly intact. The basket's 27 entries lost -3.74R, which fully accounts for (and slightly exceeds) the Δ -2.89R.
- **Failure class is reclaimed-then-failed, NOT premature chop:** of 15 losing entries, only 3 never reclaimed EMA9 within 5 bars (reclaim-filterable); the other 12 **did** reclaim within 5 bars and still lost (STALE/EXPIRED/SL over 15–20 bars). More confirmation would NOT have prevented the majority of these losses — yet the CUR reclaim book over the same window was net positive (+1.03R/86t). The loss is specific to the **earlier, unconfirmed entry price**, not to the dip setup itself.
- **Directional concentration:** LONG 15 / -0.87R, SHORT 12 / -2.88R — both directions lose.
- **Cross-symbol contrast:** the same rule on BTC second-90 is SHORT-heavy and positive (11 SHORT / +5.81R); SOL second-90's basket loses on BOTH sides (LONG -0.87R, SHORT -2.88R) in a window where even the reclaim baseline only made +1.03R over 86 trades — a weak/chop regime that did not continue dips.
- **No single entry-candle constraint fixes it:** within-SOL separation at entry is nil for pierce, dip depth, close location, relVol, EMA geometry and slopes (SOL-2 WIN vs LOSS medians in the table are within noise). Only entry-candle body% separates mildly (WIN 8.8 vs LOSS 15.8) — but BTC's second-90 *winners* sit at 16.8% median body, so a body cap that removes SOL's losers also removes BTC's winners (the same cross-symbol incompatibility that rejected candidate X in the forensics). Losers are also indistinguishable from winners on MAE *at entry* — the 0.84 vs 0.22 MAE gap is only visible after entry.

**Decision: R1 stays REJECTED for Pine.** The second-90 CONFIG-A failure is regime/chop (reclaimed-then-failed + whipsawed early dips in a weak-trend window) and is not separable by any entry-candle constraint without removing BTC's profitable SHORT-early entries. At production selectivity the mechanism starves rather than fails on SOL second-90 — and the production blocker is SOL's first half, not the second. The reclaim trigger remains the production architecture. No Pine change.

