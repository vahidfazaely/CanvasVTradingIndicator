# CanvasV V4.2 — HighVol Fresh-Data Validation (Temporal Hold-Out)

Generated: 2026-09-03T12:07:17.740Z

## 0. Methodology & limitation (read first)

**Binance API was unreachable from this environment at run time** (api.binance.com: fetch failed; data-api.binance.vision: HTTP 451 restricted-location). A genuinely external dataset could **not** be downloaded.

**Fallback used: temporal hold-out.** The last **90 days** (8640 candles) of each existing 180-day M15 file are treated as the fresh/out-of-sample window; the first 90 days are the training window (a 50/50 time split). No prior conclusion (baseline metrics, HV interaction matrix, dead-gate decisions) was made on this specific tail — every previous report used the full window. The engine recomputes all indicators inside each slice, so the hold-out contains no information leaked from training bars.

**This is an in-file, time-based out-of-sample test relative to the decisions made — it is NOT an external dataset.** Verdicts are sample-size gated (baseline HV-bar population < 10 ⇒ INSUFFICIENT DATA).

No strategy parameters, thresholds, SL/TP or position management were changed. Config A = V4 baseline (all V4.2 gates off, hvMode Allow); Config B = HighVol confirmation only.

| Symbol | File window | Train candles | Hold-out candles | Hold-out range |
|---|---|---|---|---|
| BTCUSDT | 2026-02-28 → 2026-08-27 | 8640 | 8640 | 2026-05-29 → 2026-08-27 |

## 1. BTCUSDT — A vs B on hold-out (2026-05-29 → 2026-08-27)

| Metric | A (baseline) | B (HV only) | Δ |
|---|---|---|---|
| Trades | 81 | 71 | -10 |
| Win rate | 42.0% | 43.7% | 1.7% |
| Profit factor | 0.74 | 0.83 | 0.10 |
| Net R | -6.82 | -3.75 | +3.07 |
| Avg R | -0.08 | -0.05 | +0.03 |
| Max DD (R) | 7.24R | 6.59R | -0.65R |
| Max DD (%) | 3.60% | 3.26% | -0.33% |

**LONG / SHORT (NetR / count):**

| Side | A | B |
|---|---|---|
| LONG | -0.29 / 49 | +0.21 / 43 |
| SHORT | -6.53 / 32 | -3.96 / 28 |

**PULLBACK / BREAKOUT (NetR / count):**

| Trigger | A | B |
|---|---|---|
| PULLBACK | -6.69 / 77 | -3.62 / 67 |
| BREAKOUT | -0.13 / 4 | -0.13 / 4 |

## 2. BTCUSDT — baseline (A) trades occurring on HighVol bars (hold-out)

**Population:** 13 trades — winners 3, losers 10, NetR -3.69, avgR -0.28. LONG 8 / SHORT 5; PULLBACK 13 / BREAKOUT 0.

> Sample check: Adequate (≥10).

## 3. BTCUSDT — HV gate as a loser-removal mechanism (hold-out)

Baseline HV-bar trades **removed** by the HV gate: 12 (winners 3, losers 9).

Net R of **removed** trades: **-3.46** (winner contribution +0.44, loser contribution -3.90).

Net R of **retained** HV-bar trades: **-0.23** (1 trades).

Book-level: all baseline trades removed by B = 13 (NetR -3.27); retained = 68 (NetR -3.55). Book ΔNetR A→B = +3.07.

**In-sample context (train window, for comparison):** A 96 trades +11.01R | B 87 trades +12.97R (Δ +1.96R).

## 4. BTCUSDT — VERDICT: **HIGHVOL VALIDATED**

HV gate improved the hold-out book by +3.07R and the 12 removed baseline HV trades were net losers (-3.46R) — consistent loser-removal behavior that also held in the training window (train Δ +1.96R).

| ETHUSDT | 2026-03-04 → 2026-08-31 | 8640 | 8640 | 2026-06-02 → 2026-08-31 |

## 1. ETHUSDT — A vs B on hold-out (2026-06-02 → 2026-08-31)

| Metric | A (baseline) | B (HV only) | Δ |
|---|---|---|---|
| Trades | 94 | 89 | -5 |
| Win rate | 43.6% | 44.9% | 1.3% |
| Profit factor | 0.82 | 0.82 | -0.00 |
| Net R | -4.59 | -4.46 | +0.13 |
| Avg R | -0.05 | -0.05 | -0.00 |
| Max DD (R) | 7.28R | 7.61R | 0.33R |
| Max DD (%) | 3.64% | 3.77% | 0.13% |

**LONG / SHORT (NetR / count):**

| Side | A | B |
|---|---|---|
| LONG | +0.84 / 55 | +0.82 / 52 |
| SHORT | -5.43 / 39 | -5.29 / 37 |

**PULLBACK / BREAKOUT (NetR / count):**

| Trigger | A | B |
|---|---|---|
| PULLBACK | -3.86 / 88 | -3.75 / 84 |
| BREAKOUT | -0.73 / 6 | -0.71 / 5 |

## 2. ETHUSDT — baseline (A) trades occurring on HighVol bars (hold-out)

**Population:** 7 trades — winners 1, losers 6, NetR -1.19, avgR -0.17. LONG 5 / SHORT 2; PULLBACK 6 / BREAKOUT 1.

> Sample check: **INSUFFICIENT** — 7 < 10 HV-bar trades.

## 3. ETHUSDT — HV gate as a loser-removal mechanism (hold-out)

Baseline HV-bar trades **removed** by the HV gate: 7 (winners 1, losers 6).

Net R of **removed** trades: **-1.19** (winner contribution +0.98, loser contribution -2.17).

Net R of **retained** HV-bar trades: **+0.00** (0 trades).

Book-level: all baseline trades removed by B = 7 (NetR -1.19); retained = 87 (NetR -3.40). Book ΔNetR A→B = +0.13.

**In-sample context (train window, for comparison):** A 101 trades +9.22R | B 92 trades +8.36R (Δ -0.86R).

## 4. ETHUSDT — VERDICT: **INSUFFICIENT DATA**

baseline HV-bar population only 7 (<10) on the hold-out — cannot separate signal from noise.

| SOLUSDT | 2026-03-04 → 2026-08-31 | 8640 | 8640 | 2026-06-02 → 2026-08-31 |

## 1. SOLUSDT — A vs B on hold-out (2026-06-02 → 2026-08-31)

| Metric | A (baseline) | B (HV only) | Δ |
|---|---|---|---|
| Trades | 86 | 77 | -9 |
| Win rate | 52.3% | 53.2% | 0.9% |
| Profit factor | 1.05 | 1.12 | 0.07 |
| Net R | +1.03 | +2.27 | +1.24 |
| Avg R | +0.01 | +0.03 | +0.02 |
| Max DD (R) | 4.51R | 4.51R | -0.00R |
| Max DD (%) | 2.26% | 2.26% | 0.00% |

**LONG / SHORT (NetR / count):**

| Side | A | B |
|---|---|---|
| LONG | +4.10 / 44 | +4.60 / 39 |
| SHORT | -3.06 / 42 | -2.33 / 38 |

**PULLBACK / BREAKOUT (NetR / count):**

| Trigger | A | B |
|---|---|---|
| PULLBACK | -0.35 / 84 | +0.89 / 75 |
| BREAKOUT | +1.39 / 2 | +1.39 / 2 |

## 2. SOLUSDT — baseline (A) trades occurring on HighVol bars (hold-out)

**Population:** 10 trades — winners 4, losers 6, NetR -1.44, avgR -0.14. LONG 6 / SHORT 4; PULLBACK 10 / BREAKOUT 0.

> Sample check: Adequate (≥10).

## 3. SOLUSDT — HV gate as a loser-removal mechanism (hold-out)

Baseline HV-bar trades **removed** by the HV gate: 10 (winners 4, losers 6).

Net R of **removed** trades: **-1.44** (winner contribution +1.18, loser contribution -2.62).

Net R of **retained** HV-bar trades: **+0.00** (0 trades).

Book-level: all baseline trades removed by B = 10 (NetR -1.44); retained = 76 (NetR +2.48). Book ΔNetR A→B = +1.24.

**In-sample context (train window, for comparison):** A 92 trades +7.45R | B 83 trades +5.18R (Δ -2.28R).

## 4. SOLUSDT — VERDICT: **INSUFFICIENT DATA**

HV gate improved the hold-out by +1.24R but the training window shows the opposite (train Δ -2.28R) — the effect is not stable across windows (10-trade HV population), so it cannot be declared validated.

## 5. Summary — per-symbol verdict

| Symbol | Hold-out A trades | A NetR | B NetR | ΔNetR | HV-bar trades (A) | Removed HV NetR | Retained HV NetR | VERDICT |
|---|---|---|---|---|---|---|---|---|
| BTCUSDT | 81 | -6.82 | -3.75 | +3.07 | 13 | -3.46 | -0.23 | **HIGHVOL VALIDATED** |
| ETHUSDT | 94 | -4.59 | -4.46 | +0.13 | 7 | -1.19 | +0.00 | **INSUFFICIENT DATA** |
| SOLUSDT | 86 | +1.03 | +2.27 | +1.24 | 10 | -1.44 | +0.00 | **INSUFFICIENT DATA** |

### Interpretation guidance

- **HIGHVOL VALIDATED** — the HV gate improved the hold-out book by removing net-losing HV-bar entries, on a population large enough to be meaningful AND with the same direction in the training window (stable across both halves).
- **HIGHVOL NOT VALIDATED** — the HV gate cost meaningful NetR on the hold-out (its removals were not beneficial).
- **INSUFFICIENT DATA** — the HV-bar population or overall hold-out sample is too small to separate the effect from noise, or the effect flips sign between the training and hold-out windows (unstable). No conclusion either way.

**Remember:** this validates the gate against a 90-day temporal hold-out of the same downloaded windows, not against an external dataset (Binance API was unreachable at run time). A definitive verdict requires new data fetched after network access is restored (see `backtest/fetch-data.mjs`).

