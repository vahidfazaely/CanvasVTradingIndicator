# atrStopMult — 90/90 Hold-Out Validation (production config)

> Generated: 2026-09-03 13:40:05 — engine: backtest/engine.mjs — protocol: midpoint split, indicators recomputed per slice.
> Question: does the tighter-stop finding (BTC simple-test: 1.0 → 54t/+11.97R vs 1.5 → 36t/+6.43R) survive both hold-out halves on all three symbols?
> Variants: CUR = 1.5 (default), A = 1.25, B = 1.0 — production config, one param changed. Verdict bar: Δ NetR ≥ 0 vs CUR in BOTH halves on ALL THREE symbols.

### BTCUSDT — 17,280 candles (half = 8,640)

| Window | Variant | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|
| full | CUR 1.5 | 36 | 58.3 | 1.7 | +6.43 | +0.18 | +1.52 | 22 / +7.86 | 14 / -1.43 | 34 / +7.35 | 2 / -0.92 |
| full | A 1.25 | 48 | 58.3 | 1.8 | +9.84 | +0.21 | +2.00 | 28 / +8.90 | 20 / +0.94 | 46 / +10.76 | 2 / -0.91 |
| full | B 1.0 | 54 | 57.4 | 2.0 | +11.97 | +0.22 | +2.00 | 31 / +11.58 | 23 / +0.38 | 50 / +14.08 | 4 / -2.12 |
| first-90 | CUR 1.5 | 20 | 70.0 | 1.9 | +4.77 | +0.24 | +1.22 | 11 / +4.58 | 9 / +0.19 | 20 / +4.77 | 0 / +0.00 |
| first-90 | A 1.25 | 26 | 65.4 | 2.2 | +7.78 | +0.30 | +2.00 | 15 / +5.34 | 11 / +2.44 | 26 / +7.78 | 0 / +0.00 |
| first-90 | B 1.0 | 31 | 61.3 | 2.2 | +8.52 | +0.27 | +2.00 | 18 / +6.48 | 13 / +2.04 | 29 / +9.73 | 2 / -1.21 |
| second-90 | CUR 1.5 | 16 | 43.8 | 1.4 | +1.66 | +0.10 | +1.52 | 11 / +3.28 | 5 / -1.62 | 14 / +2.58 | 2 / -0.92 |
| second-90 | A 1.25 | 22 | 50.0 | 1.4 | +2.06 | +0.09 | +1.61 | 13 / +3.57 | 9 / -1.50 | 20 / +2.97 | 2 / -0.91 |
| second-90 | B 1.0 | 23 | 52.2 | 1.7 | +3.44 | +0.15 | +1.74 | 13 / +5.10 | 10 / -1.66 | 21 / +4.35 | 2 / -0.91 |

### ETHUSDT — 17,280 candles (half = 8,640)

| Window | Variant | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|
| full | CUR 1.5 | 39 | 56.4 | 1.7 | +4.75 | +0.12 | +2.09 | 23 / +3.76 | 16 / +0.98 | 35 / +1.81 | 4 / +2.94 |
| full | A 1.25 | 46 | 56.5 | 1.5 | +4.70 | +0.10 | +3.09 | 28 / +3.87 | 18 / +0.84 | 41 / +1.70 | 5 / +3.00 |
| full | B 1.0 | 53 | 56.6 | 1.5 | +5.88 | +0.11 | +4.09 | 33 / +4.16 | 20 / +1.72 | 47 / +1.32 | 6 / +4.55 |
| first-90 | CUR 1.5 | 21 | 57.1 | 1.9 | +3.33 | +0.16 | +1.16 | 12 / +2.68 | 9 / +0.66 | 19 / +1.31 | 2 / +2.03 |
| first-90 | A 1.25 | 24 | 54.2 | 1.3 | +1.68 | +0.07 | +3.09 | 14 / +1.10 | 10 / +0.57 | 21 / -0.35 | 3 / +2.03 |
| first-90 | B 1.0 | 27 | 51.9 | 1.3 | +2.30 | +0.09 | +4.09 | 15 / +0.60 | 12 / +1.69 | 24 / -0.46 | 3 / +2.76 |
| second-90 | CUR 1.5 | 18 | 55.6 | 1.5 | +1.41 | +0.08 | +2.09 | 11 / +1.09 | 7 / +0.33 | 16 / +0.50 | 2 / +0.91 |
| second-90 | A 1.25 | 22 | 59.1 | 1.9 | +3.03 | +0.14 | +2.00 | 14 / +2.76 | 8 / +0.26 | 20 / +2.05 | 2 / +0.97 |
| second-90 | B 1.0 | 26 | 61.5 | 1.7 | +3.58 | +0.14 | +2.01 | 18 / +3.55 | 8 / +0.02 | 23 / +1.78 | 3 / +1.79 |

### SOLUSDT — 17,280 candles (half = 8,640)

| Window | Variant | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|
| full | CUR 1.5 | 29 | 62.1 | 1.8 | +3.96 | +0.14 | +2.07 | 12 / -1.15 | 17 / +5.11 | 27 / +3.74 | 2 / +0.23 |
| full | A 1.25 | 38 | 63.2 | 1.7 | +5.28 | +0.14 | +2.77 | 18 / -1.50 | 20 / +6.78 | 36 / +4.83 | 2 / +0.45 |
| full | B 1.0 | 47 | 55.3 | 1.2 | +2.57 | +0.05 | +3.18 | 22 / -2.60 | 25 / +5.16 | 43 / +4.08 | 4 / -1.51 |
| first-90 | CUR 1.5 | 17 | 64.7 | 2.9 | +4.03 | +0.24 | +1.34 | 7 / -1.05 | 10 / +5.08 | 15 / +3.80 | 2 / +0.23 |
| first-90 | A 1.25 | 21 | 66.7 | 3.0 | +5.65 | +0.27 | +1.15 | 9 / -0.99 | 12 / +6.64 | 19 / +5.20 | 2 / +0.45 |
| first-90 | B 1.0 | 27 | 59.3 | 1.6 | +3.62 | +0.13 | +2.00 | 11 / -1.43 | 16 / +5.05 | 23 / +5.13 | 4 / -1.51 |
| second-90 | CUR 1.5 | 12 | 58.3 | 1.0 | -0.06 | -0.01 | +2.07 | 5 / -0.10 | 7 / +0.04 | 12 / -0.06 | 0 / +0.00 |
| second-90 | A 1.25 | 17 | 58.8 | 0.9 | -0.37 | -0.02 | +2.77 | 9 / -0.51 | 8 / +0.14 | 17 / -0.37 | 0 / +0.00 |
| second-90 | B 1.0 | 20 | 50.0 | 0.8 | -1.05 | -0.05 | +3.13 | 11 / -1.16 | 9 / +0.11 | 20 / -1.05 | 0 / +0.00 |

## Δ vs CUR by half (verdict inputs)

| Symbol | Half | Δ 1.25 NetR / trades | Δ 1.0 NetR / trades |
|---|---:|---:|---:|
| BTCUSDT | first-90 | +3.01 / +6t | +3.75 / +11t |
| BTCUSDT | second-90 | +0.40 / +6t | +1.79 / +7t |
| ETHUSDT | first-90 | -1.66 / +3t | -1.04 / +6t |
| ETHUSDT | second-90 | +1.61 / +4t | +2.16 / +8t |
| SOLUSDT | first-90 | +1.63 / +4t | -0.41 / +10t |
| SOLUSDT | second-90 | -0.31 / +5t | -0.99 / +8t |

## Full-window summary (context; verdict uses the halves above)

| Symbol | Variant | Trades | Net R | Δ vs CUR |
|---|---|---:|---:|---:|
| BTCUSDT | A 1.25 | 48 | +9.84 | +3.41 |
| BTCUSDT | B 1.0 | 54 | +11.97 | +5.54 |
| BTCUSDT | CUR 1.5 | 36 | +6.43 | — |
| ETHUSDT | A 1.25 | 46 | +4.70 | -0.05 |
| ETHUSDT | B 1.0 | 53 | +5.88 | +1.13 |
| ETHUSDT | CUR 1.5 | 39 | +4.75 | — |
| SOLUSDT | A 1.25 | 38 | +5.28 | +1.32 |
| SOLUSDT | B 1.0 | 47 | +2.57 | -1.40 |
| SOLUSDT | CUR 1.5 | 29 | +3.96 | — |

## Verdict

- **A 1.25: ❌ does not meet the bar** — negative in 2 of 6 cells (ETHUSDT/first-90 Δ-1.66, SOLUSDT/second-90 Δ-0.31).
- **B 1.0: ❌ does not meet the bar** — negative in 3 of 6 cells (ETHUSDT/first-90 Δ-1.04, SOLUSDT/first-90 Δ-0.41, SOLUSDT/second-90 Δ-0.99).

## Interpretation

- **BTC: both tighter stops are positive in every window** (B: +3.75 / +1.79R halves; A: +3.01 / +0.40R). The simple-test BTC finding is real and consistent.
- **ETH: tighter stops are negative in first-90 for BOTH candidates** (B Δ -1.04R, A Δ -1.66R) but strongly positive in second-90 (B +2.16R, A +1.61R) — the tighter stop's ETH effect flips sign by half.
- **SOL: the tighter stop is negative regardless of value or half** (B: −0.41 / −0.99R; A: +1.63 / −0.31R). SOL's edge under CUR comes from holding winners through wider stops; tightening cuts those winners (SOL CUR second-90 baseline was already weak at −0.06R — V4-R1-PROD90).
- **Mechanism:** narrowing the stop adds frequency everywhere (+4 to +11 trades per symbol-half — fewer entries now trip the maxRiskAtr cap) and shortens loss exposure, but the extra trades are exactly the marginal low-quality entries that lose on ETH first-90 and SOL. The BTC full-window edge (+5.54R from simple-test) does **not** generalize out-of-sample.

**Both candidates fail the robustness bar — no default change.** The BTC-specific edge does not justify a production parameter change that degrades SOL and half of ETH. No Pine change; engine-only experiment.
