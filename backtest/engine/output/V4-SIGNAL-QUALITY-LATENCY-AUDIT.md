# CanvasV — Signal Quality & Latency Audit

- Date: 2026-09-03
- Engine: unchanged production code + one opt-in audit experiment (`opts.experimentEarlyPullback`, default OFF, parity-verified identical when off).
- Datasets: BTCUSDT / ETHUSDT / SOLUSDT M15, 180 days each (same windows as all prior reports).
- CONFIG A = original signal logic (all V4.2 quality toggles OFF) — the unfiltered setup detector, largest sample.
- CONFIG CUR = current production defaults (V4.2 full).

---

## 1. Baseline (as-is, no modifications)

| Symbol | Cfg | Signals | Trades | WR % | PF | Net R | Avg R | Avg W | Avg L | MaxDD R | Avg hold |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT | A | 178 | 178 | 47.2 | 1.1 | +3.59 | +0.020 | +0.64 | -0.54 | +7.81 | 13.9 | SELL/PULLBACK RESUME: 80 (WR 43%, -1.46R)  |  BUY/PULLBACK RESUME: 88 (WR 48%, +3.09R)  |  BUY/BREAKOUT: 8 (WR 75%, -0.52R)  |  SELL/BREAKOUT: 2 (WR 100%, +2.48R) |
| BTCUSDT | CUR | 36 | 36 | 58.3 | 1.7 | +6.43 | +0.179 | +0.73 | -0.59 | +1.52 | 12.6 | SELL/PULLBACK RESUME: 14 (WR 43%, -1.43R)  |  BUY/PULLBACK RESUME: 20 (WR 70%, +8.78R)  |  BUY/BREAKOUT: 2 (WR 50%, -0.92R) |
| ETHUSDT | A | 197 | 197 | 48.2 | 1.1 | +6.15 | +0.031 | +0.60 | -0.50 | +7.28 | 14.0 | SELL/PULLBACK RESUME: 85 (WR 48%, +1.13R)  |  BUY/PULLBACK RESUME: 101 (WR 50%, +2.84R)  |  BUY/BREAKOUT: 6 (WR 33%, +1.19R)  |  SELL/BREAKOUT: 5 (WR 40%, +0.99R) |
| ETHUSDT | CUR | 39 | 39 | 56.4 | 1.7 | +4.75 | +0.122 | +0.52 | -0.40 | +2.09 | 13.7 | BUY/PULLBACK RESUME: 19 (WR 47%, +0.83R)  |  SELL/PULLBACK RESUME: 16 (WR 63%, +0.98R)  |  BUY/BREAKOUT: 4 (WR 75%, +2.94R) |
| SOLUSDT | A | 179 | 179 | 53.1 | 1.2 | +8.29 | +0.046 | +0.55 | -0.53 | +5.37 | 14.1 | SELL/PULLBACK RESUME: 84 (WR 58%, +8.91R)  |  BUY/PULLBACK RESUME: 89 (WR 49%, -1.90R)  |  SELL/BREAKOUT: 3 (WR 33%, +0.13R)  |  BUY/BREAKOUT: 3 (WR 33%, +1.15R) |
| SOLUSDT | CUR | 29 | 29 | 62.1 | 1.8 | +3.96 | +0.137 | +0.48 | -0.43 | +2.07 | 14.7 | BUY/PULLBACK RESUME: 12 (WR 42%, -1.15R)  |  SELL/BREAKOUT: 2 (WR 50%, +0.23R)  |  SELL/PULLBACK RESUME: 15 (WR 80%, +4.89R) |

Family net-R breakdown (closed trades):
- **BTCUSDT A** — SELL/PULLBACK RESUME: 80 (WR 43%, -1.46R)  |  BUY/PULLBACK RESUME: 88 (WR 48%, +3.09R)  |  BUY/BREAKOUT: 8 (WR 75%, -0.52R)  |  SELL/BREAKOUT: 2 (WR 100%, +2.48R)
- **BTCUSDT CUR** — SELL/PULLBACK RESUME: 14 (WR 43%, -1.43R)  |  BUY/PULLBACK RESUME: 20 (WR 70%, +8.78R)  |  BUY/BREAKOUT: 2 (WR 50%, -0.92R)
- **ETHUSDT A** — SELL/PULLBACK RESUME: 85 (WR 48%, +1.13R)  |  BUY/PULLBACK RESUME: 101 (WR 50%, +2.84R)  |  BUY/BREAKOUT: 6 (WR 33%, +1.19R)  |  SELL/BREAKOUT: 5 (WR 40%, +0.99R)
- **ETHUSDT CUR** — BUY/PULLBACK RESUME: 19 (WR 47%, +0.83R)  |  SELL/PULLBACK RESUME: 16 (WR 63%, +0.98R)  |  BUY/BREAKOUT: 4 (WR 75%, +2.94R)
- **SOLUSDT A** — SELL/PULLBACK RESUME: 84 (WR 58%, +8.91R)  |  BUY/PULLBACK RESUME: 89 (WR 49%, -1.90R)  |  SELL/BREAKOUT: 3 (WR 33%, +0.13R)  |  BUY/BREAKOUT: 3 (WR 33%, +1.15R)
- **SOLUSDT CUR** — BUY/PULLBACK RESUME: 12 (WR 42%, -1.15R)  |  SELL/BREAKOUT: 2 (WR 50%, +0.23R)  |  SELL/PULLBACK RESUME: 15 (WR 80%, +4.89R)

> Current production config (CUR) is very selective: 29–39 trades per 180d symbol. Every per-family verdict below is **LOW SAMPLE** on CUR (≤20 per family). CONFIG A is the only configuration with enough population (178–197 trades) to separate signal-quality and latency effects from noise — the deep diagnostics use A, with CUR shown where the number permits.

## 2. Signal latency — measurement definitions

Latency is measured with two ATR-normalised entry-quality metrics plus one candle metric, all computed **without future data** at the signal bar:

- **`extAtr`** = |close − EMA21| / ATR at entry — how far the entry has already run *past* the direction EMA (chasing distance).
- **`recoveryAtr`** (PULLBACK only) = how much of the bounce from the dip low is already spent at entry. Near 0 = entered at the bottom; large = the reclaim came late.
- **`touchAge`** (PULLBACK only) = dip bars between first EMA21 touch and the EMA9-close reclaim that fires the signal. ≥2 means the market sat at the level before the signal appeared.
- **`leadAtr`** (BREAKOUT only) = close vs the 10-bar box boundary in ATR — breakout entries are *same-bar by construction* (close must exceed the box on the signal candle), so their latency shows up as this excess, not as candle lag.
- **`mfe1Age`** = bars from entry to first favorable excursion ≥ 1.0R (from the bar-walk simulator). Short = the move responded immediately; null = it never reached 1R.

**Simulator calibration (BTC A, 178 closed trades): 178/178 exact match** (outcome + finalR + age + MFE, computed inside enrichTrades). Mismatches: 0.

## 3. Losing-trade decomposition (evidence-based taxonomy, CONFIG A)

Classification order: STOP_TOO_TIGHT (SL hit, then price ≥1R favorable within 20 bars) → MARGINAL_STOP (0.5–1R post) → FALSE_BREAKOUT (breakout loss, MFE<0.5R, close back inside the box) → LATE_ENTRY (never moved AND entry was chasing — for PULLBACKS: bounce from the dip anchor already ≥0.5 ATR spent at entry; for BREAKOUTS: entry ≥0.5 ATR past EMA21) → WEAK_MOMENTUM (never moved, not chasing) → CONTINUATION_FAILURE (got ≥0.3R then reversed).

### BTCUSDT (94 losing closed trades)
Simulator parity: **178/178** closed trades reproduced exactly (0 mismatches).

| Class | N | % losses | Net R | Avg R | median extAtr | median touchAge | % reached 1R (med bars) | typical evidence |
|---|---|---|---|---|---|---|---|---|---|
| STOP_TOO_TIGHT | 4 | 4.3 | -4.00 | -1.000 | +0.73 | +1.0 | 0 | — |
| MARGINAL_STOP | 4 | 4.3 | -4.00 | -1.000 | +0.92 | +1.0 | 0 | — |
| FALSE_BREAKOUT | 1 | 1.1 | -0.53 | -0.528 | +1.31 | +1.0 | 0 | — |
| LATE_ENTRY | 41 | 43.6 | -23.44 | -0.572 | +0.79 | +1.0 | 0 | MFE 0.06R, bounce spent 0.52 ATR |
| WEAK_MOMENTUM | 20 | 21.3 | -7.57 | -0.379 | +0.76 | +1.0 | 0 | MFE 0.23R, bounce spent 0.24 ATR |
| CONTINUATION_FAILURE | 24 | 25.5 | -10.92 | -0.455 | +0.89 | +1.0 | 0 | MFE 0.34R, exit STALE_EXIT |

### ETHUSDT (102 losing closed trades)
Simulator parity: **197/197** closed trades reproduced exactly (0 mismatches).

| Class | N | % losses | Net R | Avg R | median extAtr | median touchAge | % reached 1R (med bars) | typical evidence |
|---|---|---|---|---|---|---|---|---|---|
| STOP_TOO_TIGHT | 3 | 2.9 | -3.00 | -1.000 | +1.26 | +1.0 | 0 | — |
| MARGINAL_STOP | 3 | 2.9 | -3.00 | -1.000 | +0.81 | +1.0 | 0 | — |
| FALSE_BREAKOUT | 4 | 3.9 | -0.79 | -0.197 | +1.30 | +4.5 | 0 | — |
| LATE_ENTRY | 64 | 62.7 | -34.44 | -0.538 | +0.87 | +1.0 | 0 | MFE 0.12R, bounce spent 0.64 ATR |
| WEAK_MOMENTUM | 3 | 2.9 | -1.74 | -0.579 | +0.40 | +1.0 | 0 | — |
| CONTINUATION_FAILURE | 25 | 24.5 | -8.29 | -0.332 | +0.78 | +1.0 | 0 | MFE 0.37R, exit STALE_EXIT |

### SOLUSDT (83 losing closed trades)
Simulator parity: **179/179** closed trades reproduced exactly (0 mismatches).

| Class | N | % losses | Net R | Avg R | median extAtr | median touchAge | % reached 1R (med bars) | typical evidence |
|---|---|---|---|---|---|---|---|---|---|
| STOP_TOO_TIGHT | 5 | 6.0 | -5.00 | -1.000 | +0.75 | +1.0 | 0 | post-SL MFE 1.24R |
| MARGINAL_STOP | 2 | 2.4 | -2.00 | -1.000 | +1.13 | +1.0 | 0 | — |
| FALSE_BREAKOUT | 1 | 1.2 | -0.24 | -0.238 | +1.25 | +10.0 | 0 | — |
| LATE_ENTRY | 37 | 44.6 | -20.86 | -0.564 | +0.94 | +1.0 | 0 | MFE 0.17R, bounce spent 0.57 ATR |
| WEAK_MOMENTUM | 10 | 12.0 | -5.71 | -0.571 | +0.69 | +1.0 | 0 | MFE 0.08R, bounce spent 0.49 ATR |
| CONTINUATION_FAILURE | 28 | 33.7 | -9.82 | -0.351 | +0.87 | +1.0 | 0 | MFE 0.64R, exit STALE_EXIT |

## 4. The four signal families (CONFIG A)

### BTCUSDT

| Family | N | WR % | PF | Net R | Avg R | avg extAtr | avg touchAge (PB) | avg recoveryAtr (PB) | avg leadAtr (BO) | % reached 1R (med bars) | dominant loss class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BUY/BREAKOUT ⚠️ LOW SAMPLE | 8 | 75.0 | 0.7 | -0.52 | -0.065 | +1.33 | — | — | +0.12 | 0 | FALSE_BREAKOUT (1) |
| SELL/BREAKOUT ⚠️ LOW SAMPLE | 2 | 100.0 | Infinity | +2.48 | +1.240 | +0.98 | — | — | +0.07 | 50 (+10.0b) | — |
| BUY/PULLBACK RESUME | 88 | 47.7 | 1.1 | +3.09 | +0.035 | +0.82 | +1.7 | +0.82 | — | 27 (+9.0b) | LATE_ENTRY (23) |
| SELL/PULLBACK RESUME | 80 | 42.5 | 0.9 | -1.46 | -0.018 | +0.80 | +1.7 | +0.82 | — | 21 (+10.5b) | LATE_ENTRY (17) |

### ETHUSDT

| Family | N | WR % | PF | Net R | Avg R | avg extAtr | avg touchAge (PB) | avg recoveryAtr (PB) | avg leadAtr (BO) | % reached 1R (med bars) | dominant loss class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BUY/BREAKOUT ⚠️ LOW SAMPLE | 6 | 33.3 | 1.7 | +1.19 | +0.198 | +1.30 | — | — | +0.20 | 33 (+10.5b) | FALSE_BREAKOUT (2) |
| SELL/BREAKOUT ⚠️ LOW SAMPLE | 5 | 40.0 | 1.8 | +0.99 | +0.198 | +1.25 | — | — | +0.16 | 20 (+10.0b) | FALSE_BREAKOUT (2) |
| BUY/PULLBACK RESUME | 101 | 49.5 | 1.1 | +2.84 | +0.028 | +0.87 | +1.6 | +0.87 | — | 19 (+10.7b) | LATE_ENTRY (34) |
| SELL/PULLBACK RESUME | 85 | 48.2 | 1.0 | +1.13 | +0.013 | +0.81 | +1.7 | +0.85 | — | 27 (+9.4b) | LATE_ENTRY (29) |

### SOLUSDT

| Family | N | WR % | PF | Net R | Avg R | avg extAtr | avg touchAge (PB) | avg recoveryAtr (PB) | avg leadAtr (BO) | % reached 1R (med bars) | dominant loss class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BUY/BREAKOUT ⚠️ LOW SAMPLE | 3 | 33.3 | 5.1 | +1.15 | +0.383 | +1.10 | — | — | +0.16 | 33 (+5.0b) | FALSE_BREAKOUT (1) |
| SELL/BREAKOUT ⚠️ LOW SAMPLE | 3 | 33.3 | 1.4 | +0.13 | +0.043 | +1.29 | — | — | +0.33 | 33 (+13.0b) | CONTINUATION_FAILURE (2) |
| BUY/PULLBACK RESUME | 89 | 49.4 | 0.9 | -1.90 | -0.021 | +0.82 | +1.5 | +0.85 | — | 19 (+9.7b) | LATE_ENTRY (23) |
| SELL/PULLBACK RESUME | 84 | 58.3 | 1.4 | +8.91 | +0.106 | +0.85 | +1.9 | +0.85 | — | 27 (+9.6b) | LATE_ENTRY (14) |

## 5. Winner vs loser feature separation (BTC CONFIG A, n=178)

Median-split test: for each feature, trades are split at the pooled median; WR / NetR of the LOW bucket vs the HIGH bucket. A feature is useful when the two buckets differ materially in net R and the split is not an artifact of a tiny side. All splits are in-sample descriptions, not optimised thresholds.

| Feature | med WIN | med LOSS | LOW bucket (NetR, n, WR) | HIGH bucket (NetR, n, WR) | split at | verdict |
|---|---|---|---|---|---|---|
| Entry extension (ATR beyond EMA21) | +0.80 | +0.80 | +3.09 (90, WR 47%) | +0.50 (88, WR 48%) | 0.80 | weak |
| Bounce already spent at entry (PB, ATR) | +0.83 | +0.64 | -4.26 (90, WR 40%) | +7.85 (88, WR 55%) | 0.74 | SEPARATES |
| Dip bars before reclaim (PB) | +1.00 | +1.00 | -4.14 (131, WR 44%) | +7.73 (47, WR 57%) | 1.00 | SEPARATES |
| Excess beyond breakout box (BO, ATR) | -1.10 | -1.12 | -4.78 (90, WR 46%) | +8.37 (88, WR 49%) | -1.11 | SEPARATES |
| EMA9/EMA21 separation (ATR) | +0.48 | +0.54 | +7.05 (90, WR 52%) | -3.46 (88, WR 42%) | 0.50 | SEPARATES |
| EMA9 slope (ATR/3bars) | +0.02 | +0.00 | +0.80 (90, WR 46%) | +2.79 (88, WR 49%) | 0.01 | weak |
| EMA21 slope (ATR/3bars) | +0.10 | +0.03 | +2.54 (90, WR 44%) | +1.05 (88, WR 50%) | 0.07 | flat |
| ATR vs 100-bar average (%) | +87.32 | +99.08 | +19.24 (90, WR 59%) | -15.65 (88, WR 35%) | 92.22 | SEPARATES |
| Candle body % | +55.17 | +59.52 | +5.46 (90, WR 50%) | -1.87 (88, WR 44%) | 58.20 | SEPARATES |
| Close location in candle | +0.56 | +0.58 | +3.67 (90, WR 48%) | -0.08 (88, WR 47%) | 0.58 | SEPARATES |
| Initial risk (ATR) | +3.58 | +3.50 | -6.25 (90, WR 43%) | +9.84 (88, WR 51%) | 3.54 | SEPARATES |

> Reading the table: `extAtr` LOW = entered near EMA21, HIGH = chasing past it. `recoveryAtr` LOW = entered right at the dip low; HIGH = bounce already spent. A **SEPARATES** verdict = the two halves differ by ≥3R net. **Caveats:** (1) pooled splits mix LONG+SHORT — direction matters (see §8 for direction-aware results); (2) all splits are in-sample and need the hold-out re-run before any use.

Surprises vs naive hypotheses (why these splits matter):`recoveryAtr` HIGH (bounce already spent) outperformed LOW on BTC pullbacks — fast one-bar reclaims were the *weaker* subset, not the stronger one. `touchAge` HIGH (dips basing ≥2 bars at EMA21) outperformed quick reclaims. `riskAtr` HIGH (deeper structural stops) outperformed tight ones. Quiet signal bars (`atrVsAvgPct` LOW) strongly outperformed high-volatility signal bars. None of these are recommendations — they are the in-sample candidates for a tiered A/B.

## 6. Minimum effective confirmation — core pipeline funnel (BTC CONFIG A)

Per-bar funnel with first-failing-gate attribution (LONG and SHORT summed), reconstructed from engine audit rows. For the actionable stages (EXTENSION, RISK, IN-POSITION) we add a hypothetical value: `if entered anyway, what would the standalone trade have produced?` (bar-walk from the rejected bar with that bar's structural SL/TP; no position contention).

| Stage (chain order) | LONG pass | LONG rej | SHORT pass | SHORT rej | hypothetical value of the rejected (if entered anyway) |
|---|---|---|---|---|---|
| REGIME+DIR | 4960 | 12215 | 4556 | 12619 | — |
| MOMENTUM | 3377 | 1583 | 3059 | 1497 | — |
| TRIGGER | 619 | 2758 | 595 | 2464 | — |
| STRICT EXT ≤1.5 ATR | 230 | 389 | 189 | 406 | L: 389 sims → +0.26R (WR 44%), S: 406 sims → -3.05R (WR 44%) |
| BODY | 230 | 0 | 189 | 0 | — |
| RISK GATE | 126 | 104 | 116 | 73 | L: 104 sims → +2.62R (WR 47%), S: 73 sims → +4.69R (WR 49%) |
| IN-POSITION → final entries | 96 | 30 | 82 | 34 | — |

**Parity assertion**: funnel final entries (LONG 96 / SHORT 82) vs engine signals (LONG 96 / SHORT 82) — EXACT MATCH ✓.

> **Stage labels**: REGIME+DIR = `trending` (EMA50 slope ≥ 0.05 ATR/bar) plus direction vs EMA50/EMA21. MOMENTUM = EMA9 3-bar slope + close vs EMA21. TRIGGER = pullback (EMA21 touch + EMA9 close-reclaim) OR breakout (close beyond the 10-bar box). BODY = `minBodyPct` gate — **dead at default 0.0** (passes every bar). IN-POSITION = engine blocks a fresh entry while the opposite side is already held; bars that pass every earlier stage but are blocked here are typically consecutive same-trend signals after a recent entry.

Interpretation: rejection drops from REGIME+DIR to MOMENTUM and TRIGGER dwarf the tail gates — the scarcity is architectural (the setup itself is rare), not a tail-gate problem. At the actionable tail:
- **STRICT EXT ≤1.5 ATR** rejects 795 triggers (LONG 389 / SHORT 406). Hypothetical standalone value if entered anyway: LONG +0.26R (removes nothing useful), SHORT −3.05R (protective) — consistent with the §8 finding that *extended SHORT* entries are the weak population. **Keep**, treat as a short-side chase guard.
- **RISK GATE** rejects 177 triggers (LONG 104 / SHORT 73). Hypothetical value if entered anyway: +7.31R net — it deletes would-be *winners* in isolation (deeper-structure stops win more, §5 `riskAtr` HIGH bucket). Upper bound only (no position-contention), not actionable alone — the risk bounds deserve a dedicated audit before any tightening.
- **BODY** (minBodyPct=0) and the previously removed gates are dead/no-op.

## 7. Earlier-entry opportunities

### 7a. Early-pullback experiment (entry on the first dip bar instead of waiting for the EMA9 reclaim)

Opt-in engine experiment `experimentEarlyPullback` (default OFF; parity-verified identical when off). Entry moves to the first bar of the touch window where the setup is up, close ≤ EMA9 and price is not free-falling >1.5 ATR below EMA21. Same SL/TP machinery. Standard **reclaim** signals remain possible for dips whose entry conditions never completed earlier.

- **BTCUSDT**: standard 178 trades / +3.59R (WR 47%, PF 1.1) → early 410 trades / +12.92R (WR 48%, PF 1.1, MaxDD 15.40R). Families: BUY/PULLBACK RESUME: 210 (WR 49%, +3.93R)  |  SELL/PULLBACK RESUME: 193 (WR 47%, +9.41R)  |  BUY/BREAKOUT: 6 (WR 67%, -0.61R)  |  SELL/BREAKOUT: 1 (WR 100%, +0.19R)
- **ETHUSDT**: standard 197 trades / +6.15R (WR 48%, PF 1.1) → early 383 trades / -1.89R (WR 46%, PF 1.0, MaxDD 13.70R). Families: SELL/PULLBACK RESUME: 185 (WR 44%, -6.74R)  |  SELL/BREAKOUT: 4 (WR 25%, -0.19R)  |  BUY/PULLBACK RESUME: 189 (WR 49%, +2.86R)  |  BUY/BREAKOUT: 5 (WR 40%, +2.19R)
- **SOLUSDT**: standard 179 trades / +8.29R (WR 53%, PF 1.2) → early 407 trades / -2.15R (WR 48%, PF 1.0, MaxDD 15.35R). Families: SELL/PULLBACK RESUME: 198 (WR 50%, +0.53R)  |  BUY/PULLBACK RESUME: 202 (WR 47%, -4.15R)  |  SELL/BREAKOUT: 3 (WR 33%, +0.13R)  |  BUY/BREAKOUT: 4 (WR 50%, +1.33R)

> Interpretation guardrail: the early run changes *when* positions open (and therefore which later signals exist at all), so the trade-count delta is not a pure 'extra signals' count — it reflects earlier capture of the same episodes plus genuinely new dip entries that never reclaimed. Per-symbol stability and the WIN/LOSS mix of the added population matter more than the headline delta; ETH/SOL columns show whether BTC generalises.

### 7b. Matched comparison — same pullback episodes, standard vs earliest-dip entry (BTC A)

- 93 standard pullback signals had an earlier dip-bar entry candidate (of 168 standard pullback trades).
- Standard (reclaim) version: 40W / -3.55R total.
- Earliest-dip version: 47W / +10.81R total.
- Entries moved earlier by median 1 bar(s) (avg 2.2); the early entry close is at/below EMA9 by construction, so the entry extension is lower and the structural SL is computed at the dip, not the bounce.

### 7c. Breakout earlier-detection (breakoutBars 10 → 5)

- BTC A breakoutBars=10 (baseline): 178 total trades / +3.59R; breakout trades 10.
- BTC A breakoutBars=5: 198 total trades / +3.77R — breakout entries: 37 (WR 51%, +5.61R).
- Breakout detection cannot be moved 1 candle earlier without lookahead: the close must first exceed the box. Earlier *detection* only comes from a shorter box (5 bars) or intra-bar evaluation — both trade scope for noise. LOW SAMPLE on breakouts in every config (2–8 per symbol) — treat all breakout verdicts as indicative only.

## 8. Soft-scoring feasibility (from Section 5 evidence)

The median-split table in §5 shows which single features separate R. A weighted score is only justified where ≥2 features show *independent* separation with adequate sample size. Findings:

- BTCUSDT LONG extAtr: low-half +0.29R (48) vs high-half +2.28R (48)
- BTCUSDT SHORT extAtr: low-half +1.79R (41) vs high-half -0.78R (41)
- ETHUSDT LONG extAtr: low-half +0.43R (54) vs high-half +3.60R (53)
- ETHUSDT SHORT extAtr: low-half +2.91R (45) vs high-half -0.79R (45)
- SOLUSDT LONG extAtr: low-half -0.48R (46) vs high-half -0.27R (46)
- SOLUSDT SHORT extAtr: low-half +9.15R (44) vs high-half -0.12R (43)

Direction-aware reading (all three symbols):
- **SHORT entries are the only direction where chasing is consistently punished** — the extended (high-`extAtr`) half of SHORTs is net-negative on every symbol (BTC −0.78R, ETH −0.79R, SOL −0.12R vs the cheap half +1.79/+2.91/+9.15R).
- **LONG entries do NOT show the penalty** — extended LONGs are net-positive on BTC (+2.28R) and ETH (+3.60R). A symmetric chasing filter would delete LONG winners (consistent with the interaction audit's finding that filters mostly harmed the BUY side).
- Other separators from §5 (quiet signal bars, deeper structural stops, ≥2-bar dips) need per-symbol verification before any design.

Soft-scoring feasibility: a continuous score is only justified where features separate R *independently and per direction*. Today the only direction-robust single feature is SHORT entry extension. A tiered architecture (binary eligibility for regime/direction/momentum/trigger; a quality term on top) is structurally compatible with the existing pipeline and adds zero candle latency, but there is **not yet enough evidence for a multi-feature weighted score** — §5 splits are pooled and in-sample. Recommended path: test the single strongest direction-specific term as an A/B first; only add more terms if they survive the same test.

## 9. Findings and recommendation (evidence-based, no threshold tuning performed)

### Top causes of false / losing signals (ranked by R impact, BTC A evidence)

- **LATE_ENTRY** — 41 losses, -23.44R combined.
- **CONTINUATION_FAILURE** — 24 losses, -10.92R combined.
- **WEAK_MOMENTUM** — 20 losses, -7.57R combined.
- **STOP_TOO_TIGHT** — 4 losses, -4.00R combined.
- **MARGINAL_STOP** — 4 losses, -4.00R combined.
- **FALSE_BREAKOUT** — 1 losses, -0.53R combined.

### Top latency causes (ranked by impact, BTC A)

- **PULLBACK reclaim close-confirmation (structural)** — pullback entries fire on the close-reclaim above EMA9, which lands on average **~0.8 ATR above the dip low** (avg `recoveryAtr` 0.82–0.87 on every symbol and direction, §4) and typically 1–2 bars after the EMA21 touch (avg `touchAge` 1.5–1.9). The bounce is spent before the trigger completes — this is the single largest, systematic entry-latency cost, and it is the same mechanism behind the LATE_ENTRY loss population (MFE<0.3R with bounce ≥0.5 ATR already spent: BTC 41, ETH 64, SOL 37 — the largest loss class on every symbol).
- **Breakout entries are same-bar by construction** (no candle lag), but BTC breakouts enter at avg `extAtr` 1.33 vs 0.80–0.87 for pullbacks (§4) — they structurally chase an extended close beyond the box. LOW SAMPLE on breakouts everywhere (2–10 per symbol): treat as indicative.
- **V4.2 stack adds no candle latency** (same-bar gates) but collapses frequency to 29–39 trades/180d on CUR — scarcity, not lateness (earlier audits).

### Minimum effective confirmation — verdict (BTC A funnel, §6)

- **PULLBACK touch → reclaim**: the only gate that adds *candle* latency. Removing it entirely is NOT validated (full early-pullback run: BTC +9.33R but ETH −8.04R, SOL −10.44R — §7a), so it must be tiered, not deleted. The matched-episode test (§7b: 93 BTC episodes, +10.81R vs −3.55R standard) shows the *timing* value when the dip is real.
- **STRICT EXT ≤1.5 ATR**: keep — its 795 trigger rejections are protective on SHORTs (−3.05R hypothetical) and neutral on LONGs (+0.26R); this is the short-side chase guard.
- **RISK GATE**: keep as a safety bound; its standalone rejections would have been net-positive (+7.31R hypothetical, upper bound) — the risk bounds need their own dedicated audit before any tightening.
- **BODY** (`minBodyPct` 0) and the previously-removed gates (pullback-momentum, breakout-ext ≤2.0) are dead/no-op — no confirmation value.

## 10. Recommended changes (max 3, ranked — each requires the engine A/B + 90-day hold-out before Pine)

1. **Tiered pullback entry — EARLY tier for slow dips only (HIGH IMPACT on latency; UNVALIDATED, experiment required).** Evidence is two-sided: removing the reclaim wholesale is BTC-positive but ETH/SOL-negative (§7a), yet matched earlier entries on BTC gained +14.4R over the same 93 episodes (§7b), and §5 shows dips basing ≥2 bars (`touchAge` high) outperform 1-bar reclaims. Test as parameterised variants on the engine: (a) early dip-bar entry; (b) early entry only when the dip has already based ≥2 bars at EMA21; (c) current reclaim-only. Ship the variant that survives all three symbols + the 90-day hold-out with positive ΔNetR — the goal is moving entries into the dip without admitting non-reclaiming dip noise.
2. **Direction-aware SHORT chasing guard (MEDIUM IMPACT; the only direction-robust filter found).** Extended SHORT entries are net-negative on all three symbols (§8), while extended LONG entries are not — a soft tier that suppresses only high-`extAtr` SHORTs targets the LATE_ENTRY/SELL weakness without touching the LONG side. Requires per-symbol hold-out confirmation of the split before implementation.
3. **Re-aim the V4.2 default stack (MEDIUM IMPACT, LATER)** — CUR's 29–39 trades/180d is too selective for practical use; relax defaults per the interaction audit. Frequency objective, not latency.

**Changes explicitly NOT recommended** (would recreate the scarcity/late-entry failure mode): HTF confirmation, ADX/choppiness indices, additional EMA confirmations, a symmetric (both-direction) chasing gate, or any new binary gate stacked after the trigger.

## 11. Proposed next implementation step (single change)

**Implement recommendation 1's variant (b): an opt-in `slowDipEarlyEntry` experiment on the engine only — early dip-bar entry permitted only when the EMA21 touch has been continuous for ≥2 bars (no immediate same-bar reclaims).** Run the existing all-symbol + 90-day hold-out A/B against (a) and (c). No Pine change until the A/B is measured; this is the minimal change that tests the §7b timing value while gating out the non-reclaiming dip noise that hurt ETH/SOL in the wholesale relaxation.
