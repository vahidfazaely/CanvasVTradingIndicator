# R1 under the Production Config — 90/90 Hold-Out Protocol

> Generated: 2026-09-03 13:21:55 — engine: backtest/engine.mjs — config: production CUR (DEFAULT_PARAMS, all V4.2 gates on)
> R1 = CUR + slow-dip early entry (minBars 2) with EMA21 pierce >= 0 — same candidate as V4-R1-FORENSICS.md section D "R1 pierce>=0", now at production selectivity.
> Protocol: midpoint split (first-90 / second-90), indicators recomputed per slice. Verdict bar (forensics rules): dNetR >= 0 vs CUR in BOTH halves on ALL THREE symbols, no DD explosion, useful frequency.

## Verdict: ❌ DOES NOT MEET THE BAR

R1 fails the bar on 2 of 6 half-symbol cells: ETHUSDT/second-90 Δ-1.00, SOLUSDT/first-90 Δ-1.10.

### BTCUSDT — 17,280 candles (half = 8,640)

| Window | Variant | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|
| full | CUR | 36 | 58.3 | 1.7 | +6.43 | +0.18 | +1.52 | 22 / +7.86 | 14 / -1.43 | 34 / +7.35 | 2 / -0.92 |
| full | R1 | 44 | 61.4 | 2.1 | +10.76 | +0.24 | +2.00 | 24 / +8.90 | 20 / +1.86 | 42 / +11.68 | 2 / -0.92 |  ← full-window sanity anchor (forensics)
| first-90 | CUR | 20 | 70.0 | 1.9 | +4.77 | +0.24 | +1.22 | 11 / +4.58 | 9 / +0.19 | 20 / +4.77 | 0 / +0.00 |
| first-90 | R1 | 25 | 68.0 | 2.0 | +6.01 | +0.24 | +2.00 | 12 / +4.50 | 13 / +1.52 | 25 / +6.01 | 0 / +0.00 |
| second-90 | CUR | 16 | 43.8 | 1.4 | +1.66 | +0.10 | +1.52 | 11 / +3.28 | 5 / -1.62 | 14 / +2.58 | 2 / -0.92 |
| second-90 | R1 | 19 | 52.6 | 2.2 | +4.74 | +0.25 | +1.52 | 12 / +4.41 | 7 / +0.34 | 17 / +5.66 | 2 / -0.92 |

**Hold-out Δ (R1 − CUR):** first-90 Δ+1.24R · second-90 Δ+3.09R · full Δ+4.33R — ✅ improved in both halves

**R1 pullback-entry anatomy (early vs reclaim, per window):**

| Window | PB trades | Early n / NetR | Early LONG n/R | Early SHORT n/R | Reclaim n / NetR |
|---|---:|---:|---:|---:|---:|
| full | 42 | 8 / +4.33 | 2 / +1.04 | 6 / +3.29 | 34 / +7.35 |
| first-90 | 25 | 5 / +1.24 | 1 / -0.09 | 4 / +1.33 | 20 / +4.77 |
| second-90 | 17 | 3 / +3.09 | 1 / +1.13 | 2 / +1.96 | 14 / +2.58 |

### ETHUSDT — 17,280 candles (half = 8,640)

| Window | Variant | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|
| full | CUR | 39 | 56.4 | 1.7 | +4.75 | +0.12 | +2.09 | 23 / +3.76 | 16 / +0.98 | 35 / +1.81 | 4 / +2.94 |
| full | R1 | 40 | 55.0 | 1.5 | +3.75 | +0.09 | +3.09 | 24 / +2.76 | 16 / +0.98 | 36 / +0.81 | 4 / +2.94 |  ← full-window sanity anchor (forensics)
| first-90 | CUR | 21 | 57.1 | 1.9 | +3.33 | +0.16 | +1.16 | 12 / +2.68 | 9 / +0.66 | 19 / +1.31 | 2 / +2.03 |
| first-90 | R1 | 21 | 57.1 | 1.9 | +3.33 | +0.16 | +1.16 | 12 / +2.68 | 9 / +0.66 | 19 / +1.31 | 2 / +2.03 |
| second-90 | CUR | 18 | 55.6 | 1.5 | +1.41 | +0.08 | +2.09 | 11 / +1.09 | 7 / +0.33 | 16 / +0.50 | 2 / +0.91 |
| second-90 | R1 | 19 | 52.6 | 1.1 | +0.41 | +0.02 | +3.09 | 12 / +0.09 | 7 / +0.33 | 17 / -0.50 | 2 / +0.91 |

**Hold-out Δ (R1 − CUR):** first-90 Δ+0.00R · second-90 Δ-1.00R · full Δ-1.00R — ❌ fails one/both halves

**R1 pullback-entry anatomy (early vs reclaim, per window):**

| Window | PB trades | Early n / NetR | Early LONG n/R | Early SHORT n/R | Reclaim n / NetR |
|---|---:|---:|---:|---:|---:|
| full | 36 | 1 / -1.00 | 1 / -1.00 | 0 / +0.00 | 35 / +1.81 |
| first-90 | 19 | 0 / +0.00 | 0 / +0.00 | 0 / +0.00 | 19 / +1.31 |
| second-90 | 17 | 1 / -1.00 | 1 / -1.00 | 0 / +0.00 | 16 / +0.50 |

### SOLUSDT — 17,280 candles (half = 8,640)

| Window | Variant | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|
| full | CUR | 29 | 62.1 | 1.8 | +3.96 | +0.14 | +2.07 | 12 / -1.15 | 17 / +5.11 | 27 / +3.74 | 2 / +0.23 |
| full | R1 | 33 | 57.6 | 1.5 | +2.90 | +0.09 | +2.21 | 14 / -1.87 | 19 / +4.78 | 31 / +2.68 | 2 / +0.23 |
| first-90 | CUR | 17 | 64.7 | 2.9 | +4.03 | +0.24 | +1.34 | 7 / -1.05 | 10 / +5.08 | 15 / +3.80 | 2 / +0.23 |
| first-90 | R1 | 19 | 57.9 | 1.9 | +2.92 | +0.15 | +1.49 | 8 / -2.05 | 11 / +4.97 | 17 / +2.70 | 2 / +0.23 |
| second-90 | CUR | 12 | 58.3 | 1.0 | -0.06 | -0.01 | +2.07 | 5 / -0.10 | 7 / +0.04 | 12 / -0.06 | 0 / +0.00 |
| second-90 | R1 | 14 | 57.1 | 1.0 | -0.02 | -0.00 | +2.21 | 6 / +0.18 | 8 / -0.20 | 14 / -0.02 | 0 / +0.00 |

**Hold-out Δ (R1 − CUR):** first-90 Δ-1.10R · second-90 Δ+0.04R · full Δ-1.06R — ❌ fails one/both halves

**R1 pullback-entry anatomy (early vs reclaim, per window):**

| Window | PB trades | Early n / NetR | Early LONG n/R | Early SHORT n/R | Reclaim n / NetR |
|---|---:|---:|---:|---:|---:|
| full | 31 | 4 / -1.06 | 2 / -0.72 | 2 / -0.34 | 27 / +3.74 |
| first-90 | 17 | 2 / -1.10 | 1 / -1.00 | 1 / -0.10 | 15 / +3.80 |
| second-90 | 14 | 2 / +0.04 | 1 / +0.28 | 1 / -0.23 | 12 / -0.06 |

## Δ vs CUR by half (verdict inputs)

| Symbol | Half | CUR trades/netR | R1 trades/netR | Δ trades | Δ NetR |
|---|---|---:|---:|---:|---:|
| BTCUSDT | first-90 | 20 / +4.77 | 25 / +6.01 | +5 | +1.24 |
| BTCUSDT | second-90 | 16 / +1.66 | 19 / +4.74 | +3 | +3.09 |
| ETHUSDT | first-90 | 21 / +3.33 | 21 / +3.33 | +0 | +0.00 |
| ETHUSDT | second-90 | 18 / +1.41 | 19 / +0.41 | +1 | -1.00 |
| SOLUSDT | first-90 | 17 / +4.03 | 19 / +2.92 | +2 | -1.10 |
| SOLUSDT | second-90 | 12 / -0.06 | 14 / -0.02 | +2 | +0.04 |

Robustness check: 6 half-symbol cells, 4 with Δ ≥ 0, 2 with Δ < 0.

## Interpretation

### 1. R1's early entries are purely additive at CUR selectivity

In every window R1's reclaim stream is stream-identical to the CUR pullback stream (verified trade-by-trade: entry bar, direction, exit, final R), so Δ NetR vs CUR is EXACTLY the NetR of R1's extra early-entry basket. R1 under the production config = the CUR book + a small basket of additional slow-dip entries.

### 2. The extra early-entry basket per symbol (full window)

| Symbol | Basket n / NetR | LONG part | SHORT part | Full Δ vs CUR |
|---|---:|---:|---:|---:|
| BTCUSDT | 8 / +4.33 | 2 / +1.04 | 6 / +3.29 | +4.33 |
| ETHUSDT | 1 / -1.00 | 1 / -1.00 | 0 / +0.00 | -1.00 |
| SOLUSDT | 4 / -1.06 | 2 / -0.72 | 2 / -0.34 | -1.06 |

### 3. The dip-SHORT asymmetry does not transfer to production selectivity

CONFIG A found dip SHORT entries net positive on all three symbols (+8.83 / +3.32 / +1.74R). At CUR selectivity the surviving early population is 1–8 trades per symbol and the SHORT part is positive only on **BTC** (6 / +3.29R); **SOL's** SHORT-early entries lose (2 / -0.34R) and **ETH** produced zero qualifying SHORT dips in either half. Every cell is LOW SAMPLE (≤ 6 trades); the asymmetry is not measurable at CUR selectivity, and its CONFIG-A form (R1S) already failed SOL in both hold-out halves there.

### 4. What-if: SHORT-early only (R1S)

Since early entries are additive, R1S per window = CUR + that window's early-SHORT basket only.

| Symbol | first-90 Δ | second-90 Δ | Verdict under R1S |
|---|---:|---:|---|
| BTCUSDT | +1.33 | +1.96 | passes |
| ETHUSDT | +0.00 | +0.00 | passes but ≡ CUR (no qualifying SHORT dips — a no-op) |
| SOLUSDT | -0.10 | -0.23 | fails (one/both halves negative) |

### 5. Decision

**REJECT R1 as a production-config change** — 2 of 6 half-symbol cells are negative (ETHUSDT/second-90 Δ-1.00, SOLUSDT/first-90 Δ-1.10). The full window still reproduces the forensics anchor (BTC **44 / +10.76R**, ETH **40 / +3.75R**, SOL **33 / +2.90R**).

**REJECT the SHORT-only variant (R1S) as the replacement** — it is a no-op on ETH (no qualifying SHORT dips), helps only BTC, and leaves SOL negative in both halves (Δ -0.10 / -0.23R).

**Why the mechanism fails at production selectivity:** R1's benefit is frequency-limited. The whole BTC improvement is 8 extra trades per 180 days (+4.33R); the ETH damage is one losing early LONG (−1.00R, second-90) and the SOL damage is four losing early entries (−1.06R) concentrated in first-90. None of these baskets is large enough to distinguish signal from noise — every cell above is LOW SAMPLE (≤ 6 trades) — and the CONFIG-A edge that motivated the test does not survive the V4.2 gates. The reclaim trigger remains the production architecture. **No Pine change.**

## Sample-size flags

- BTCUSDT: CUR/first-90 20t, R1/first-90 25t, CUR/second-90 16t, R1/second-90 19t (<30 trades flagged LOW SAMPLE)
- ETHUSDT: CUR/first-90 21t, R1/first-90 21t, CUR/second-90 18t, R1/second-90 19t (<30 trades flagged LOW SAMPLE)
- SOLUSDT: CUR/full 29t, CUR/first-90 17t, R1/first-90 19t, CUR/second-90 12t, R1/second-90 14t (<30 trades flagged LOW SAMPLE)
