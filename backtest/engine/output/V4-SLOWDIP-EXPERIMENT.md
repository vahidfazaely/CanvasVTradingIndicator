# CanvasV — slowDipEarlyEntry (Variant B) A/B/C Experiment

- Date: 2026-09-03
- Engine-only experiment; Pine untouched. CONFIG A (all V4.2 toggles OFF) for the primary comparison, matching the quality/latency audit.
- Modes: **C** reclaim-only (current trigger) · **A** firstDip (early entry at first qualifying dip bar) · **B** slowDip2 (early entry only once the dip has based ≥2 consecutive bars on the dip side of EMA9, low still in EMA21 touch window, close not free-falling >1.5 ATR below EMA21).

## 1. Full-window results (180 days per symbol, CONFIG A)

| Symbol | Variant | Trades | WR % | PF | Net R | Avg R | MaxDD R | avg MFE | med extAtr (PB) | med dipBars | med recoveryAtr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT | C reclaim | 178 | 47.2 | 1.1 | +3.59 | +0.020 | 7.81 | +0.58 | +0.79 | +0.0 | +1.14 |
| BTCUSDT | A firstDip | 410 | 48.3 | 1.1 | +12.92 | +0.032 | 15.40 | +0.61 | +0.50 | +1.0 | +0.16 |
| BTCUSDT | B slowDip2 | 241 | 49.0 | 1.1 | +10.23 | +0.042 | 8.75 | +0.61 | +0.71 | +0.0 | +0.86 |

| ETHUSDT | C reclaim | 197 | 48.2 | 1.1 | +6.15 | +0.031 | 7.28 | +0.58 | +0.84 | +0.0 | +1.11 |
| ETHUSDT | A firstDip | 383 | 46.5 | 1.0 | -1.89 | -0.005 | 13.70 | +0.59 | +0.49 | +1.0 | +0.21 |
| ETHUSDT | B slowDip2 | 247 | 47.8 | 1.1 | +5.14 | +0.021 | 10.08 | +0.59 | +0.75 | +0.0 | +0.93 |

| SOLUSDT | C reclaim | 179 | 53.1 | 1.2 | +8.29 | +0.046 | 5.37 | +0.61 | +0.82 | +0.0 | +1.12 |
| SOLUSDT | A firstDip | 407 | 48.4 | 1.0 | -2.15 | -0.005 | 15.35 | +0.58 | +0.48 | +1.0 | +0.20 |
| SOLUSDT | B slowDip2 | 238 | 49.6 | 1.0 | +0.61 | +0.003 | 6.42 | +0.59 | +0.67 | +0.0 | +0.78 |

### Direction & no-follow-through breakdown (PULLBACK population)

| Symbol | Variant | LONG n | LONG NetR | SHORT n | SHORT NetR | NO_FOLLOW losses (MFE<0.3R) | NO_FOLLOW R | PB trades | PB NetR |
|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT | C reclaim | 96 | +2.57 | 82 | +1.02 | 65 | -35.01 | 168 | +1.63 |
| BTCUSDT | A firstDip | 216 | +3.32 | 194 | +9.60 | 128 | -74.72 | 403 | +13.34 |
| BTCUSDT | B slowDip2 | 130 | +3.57 | 111 | +6.66 | 79 | -47.23 | 232 | +8.35 |
| ETHUSDT | C reclaim | 107 | +4.03 | 90 | +2.12 | 70 | -39.18 | 186 | +3.97 |
| ETHUSDT | A firstDip | 194 | +5.05 | 189 | -6.93 | 124 | -71.00 | 374 | -3.88 |
| ETHUSDT | B slowDip2 | 127 | +3.03 | 120 | +2.11 | 88 | -50.14 | 237 | +2.82 |
| SOLUSDT | C reclaim | 92 | -0.75 | 87 | +9.04 | 49 | -28.57 | 173 | +7.01 |
| SOLUSDT | A firstDip | 206 | -2.82 | 201 | +0.66 | 135 | -81.60 | 400 | -3.61 |
| SOLUSDT | B slowDip2 | 120 | -3.32 | 118 | +3.93 | 71 | -41.63 | 232 | -0.67 |

### Early vs reclaim-type pullback entries (dip-bar entry vs reclaim-bar entry)

| Symbol | Variant | dip-bar entries | dip-bar NetR (WR) | med recovery at dip-bar entry | reclaim-bar entries | reclaim NetR (WR) | med recovery at reclaim entry |
|---|---|---|---|---|---|---|---|
| BTCUSDT | C reclaim | 0 | +0.00 (n/a%) | n/a | 168 | +1.63 (45%) | +1.14 |
| BTCUSDT | A firstDip | 355 | +6.07 (47%) | +0.13 | 48 | +7.26 (56%) | +1.26 |
| BTCUSDT | B slowDip2 | 82 | +7.49 (52%) | +0.27 | 150 | +0.86 (45%) | +1.13 |
| ETHUSDT | C reclaim | 0 | +0.00 (n/a%) | n/a | 186 | +3.97 (49%) | +1.11 |
| ETHUSDT | A firstDip | 328 | -1.15 (48%) | +0.16 | 46 | -2.73 (39%) | +1.26 |
| ETHUSDT | B slowDip2 | 72 | -0.22 (44%) | +0.29 | 165 | +3.04 (50%) | +1.11 |
| SOLUSDT | C reclaim | 0 | +0.00 (n/a%) | n/a | 173 | +7.01 (54%) | +1.12 |
| SOLUSDT | A firstDip | 354 | -6.96 (48%) | +0.17 | 46 | +3.34 (52%) | +1.21 |
| SOLUSDT | B slowDip2 | 86 | -4.60 (43%) | +0.30 | 146 | +3.93 (54%) | +1.09 |

> Reading: on the reclaim-only variant (C) every pullback entry is a reclaim-bar entry with ~1.1 ATR of bounce already spent. Variant A shifts almost everything to dip-bar entries (recovery ≈ 0.2 ATR) but admits the premature noise of §2. Variant B shifts only a minority to dip-bar entries; the rest remain reclaim-bar entries — so its latency gain is partial by construction.

## 2. Failure trade-off — premature entries (early variants only)

A trade is tagged *premature* when its entry bar had ≥1 dip bar and no EMA9 reclaim followed within 5 bars — i.e. the system entered a dip that did not resolve upward. Winners/Losers split shows what the early entries bought.

| Symbol | Variant | premature losers | loser R | premature winners | winner R |
|---|---|---|---|---|---|
| BTCUSDT | A firstDip | 68 | -41.63 | 33 | +15.63 |
| BTCUSDT | B slowDip2 | 11 | -9.30 | 6 | +4.29 |
| ETHUSDT | A firstDip | 67 | -44.08 | 19 | +5.83 |
| ETHUSDT | B slowDip2 | 13 | -10.72 | 4 | +1.80 |
| SOLUSDT | A firstDip | 71 | -44.17 | 26 | +10.36 |
| SOLUSDT | B slowDip2 | 14 | -10.28 | 4 | +0.70 |

## 3. Matched episodes (BTC) — same pullback episodes under C vs B vs A

- **A firstDip vs C** — 93 matched episodes. C-winner/B-winner 36, C-winner→early-loss (damage) 4, C-loss→early-winner (rescues) 11, both losses 42. Net R: C -3.55 → early +10.81 (Δ +14.36). Entries earlier by median 1 bar(s).
- **B slowDip2 vs C** — 14 matched episodes. C-winner/B-winner 5, C-winner→early-loss (damage) 1, C-loss→early-winner (rescues) 5, both losses 3. Net R: C +0.53 → early +5.62 (Δ +5.09). Entries earlier by median 3 bar(s).

## 4. Gate interaction — the slow-dip pool vs what actually entered

Slow-dip eligibility is reconstructed per bar with the exact engine conditions (setup up, EMA21 touch in window, dipAge ≥ 2, close on the dip side of EMA9, not free-falling). A bar in the pool becomes an entry unless a downstream gate blocks it. Under CONFIG A the only binding downstream gates are RISK and the in-position rule; STRICT-EXT ≤1.5 ATR cannot block a dip bar (close ≤ EMA21 ⇒ extension ≤ 0) and BODY/HV/volume are off.

| Symbol | slow-dip pool (bars) | entries (B signals) | blocked total | risk-blocked | in-position blocked | entry rate |
|---|---|---|---|---|---|---|
| BTCUSDT | 146 | 82 | 64 | 24 | 40 | 56% |
| ETHUSDT | 123 | 72 | 51 | 21 | 30 | 59% |
| SOLUSDT | 136 | 86 | 50 | 23 | 27 | 63% |

### Exit distribution of Variant-B pullback entries

| Symbol | B PB entries | SL FIRST | TP1/TP2 | EXPIRED | STALE | avg age (bars) | losers with MFE<0.3R |
|---|---|---|---|---|---|---|---|
| BTCUSDT | 232 | 50 | 63 | 24 | 95 | 15.0 | 79 |
| ETHUSDT | 237 | 51 | 54 | 16 | 116 | 15.0 | 88 |
| SOLUSDT | 232 | 42 | 49 | 34 | 107 | 15.0 | 71 |

## 5. Out-of-sample check — 90/90 temporal hold-out (C vs frozen B)

Split each 180-day file into two non-overlapping 90-day halves; indicators recomputed inside each slice (no leakage). Variant B rule (≥2 dip bars) was fixed from the audit evidence before this run. The second half is the nearest thing to an external test available offline (Binance unreachable — same limitation as the HV validation report).

### BTCUSDT (8640 bars per half)

| Half | Variant | Trades | WR % | PF | Net R | Avg R | MaxDD R |
|---|---|---|---|---|---|---|---|
| first-90 | C reclaim | 96 | 52.1 | 1.5 | +11.01 | +0.115 | 5.19 |
| first-90 | B slowDip2 | 128 | 52.3 | 1.5 | +15.32 | +0.120 | 3.90 |
| second-90 | C reclaim | 81 | 42.0 | 0.7 | -6.82 | -0.084 | 7.24 |
| second-90 | B slowDip2 | 112 | 45.5 | 0.9 | -4.49 | -0.040 | 8.75 |
ΔNetR(B − C): first-90 +4.31, second-90 +2.33

### ETHUSDT (8640 bars per half)

| Half | Variant | Trades | WR % | PF | Net R | Avg R | MaxDD R |
|---|---|---|---|---|---|---|---|
| first-90 | C reclaim | 101 | 51.5 | 1.4 | +9.22 | +0.091 | 3.15 |
| first-90 | B slowDip2 | 125 | 52.0 | 1.3 | +10.25 | +0.082 | 5.18 |
| second-90 | C reclaim | 94 | 43.6 | 0.8 | -4.59 | -0.049 | 7.28 |
| second-90 | B slowDip2 | 119 | 42.9 | 0.8 | -6.03 | -0.051 | 10.08 |
ΔNetR(B − C): first-90 +1.03, second-90 -1.44

### SOLUSDT (8640 bars per half)

| Half | Variant | Trades | WR % | PF | Net R | Avg R | MaxDD R |
|---|---|---|---|---|---|---|---|
| first-90 | C reclaim | 92 | 54.3 | 1.3 | +7.45 | +0.081 | 5.37 |
| first-90 | B slowDip2 | 119 | 50.4 | 1.1 | +2.86 | +0.024 | 5.81 |
| second-90 | C reclaim | 86 | 52.3 | 1.0 | +1.03 | +0.012 | 4.51 |
| second-90 | B slowDip2 | 118 | 49.2 | 0.9 | -2.05 | -0.017 | 6.42 |
ΔNetR(B − C): first-90 -4.59, second-90 -3.09

## 6. Sanity on the current production config (V4.2 defaults ON)

| Symbol | C (reclaim) trades/NetR | B (slowDip2) trades/NetR |
|---|---|---|
| BTCUSDT | 36 / +6.43R (WR 58%) | 53 / +11.60R (WR 58%) |
| ETHUSDT | 39 / +4.75R (WR 56%) | 48 / -2.41R (WR 48%) |
| SOLUSDT | 29 / +3.96R (WR 62%) | 40 / +1.91R (WR 48%) |

## 7. Decision — REFINE (do not ship as-is)

### What the evidence shows

- **Variant B is a real improvement on BTC only** — consistent everywhere BTC is measured: full window A-config +3.59 → +10.23R (WR 47→49%, PF 1.07→1.15); both hold-out halves (+4.31R / +2.33R) including the adversarial second half where C lost −6.82R and B only −4.49R; production config 36→53 trades at the *same* 58% WR with +6.43 → +11.60R. Its new dip-bar entries are excellent: 82 entries, +7.49R, 52% WR, recovery 0.27 ATR vs 1.14 ATR on reclaim entries.
- **Variant B is flat-to-negative on ETH** — full window +5.14 vs +6.15R; hold-out second half −1.44R; production config +4.75 → −2.41R. Dip-bar entries are ~breakeven (−0.22R).
- **Variant B clearly damages SOL** — full window +0.61 vs +8.29R; both hold-out halves negative (−4.59R / −3.09R); production config WR drops 62→48%. Its 86 dip-bar entries net **−4.60R** (43% WR): SOL's slow dips are chop, not continuation. SOL's entire edge lives in reclaim-confirmed SHORT pullbacks (+9.04R) which B dilutes to +3.93R.
- **B is strictly better than A (firstDip)** on every risk measure: premature (never-reclaim) losers cut ~6× (BTC 68→11, ETH 67→13, SOL 71→14), MaxDD far lower (BTC 15.40→8.75R), ETH/SOL no longer destroyed (−1.89→+5.14 ETH, −2.15→+0.61 SOL). The ≥2-bar basing gate removes most of Variant A's noise.
- **Upstream gates do not strangle B**: of the slow-dip pool (123–146 bars/symbol), 56–63% become entries; the risk gate blocks only 21–24 and the in-position rule 27–40. The constraint is the pool itself, not the gate stack.
- **The quality of a slow-dip entry is symbol-dependent**: BTC +0.09R/trade, ETH −0.00, SOL −0.05. No direction split explains it cleanly (B improved BTC SELL PB +1.02→+6.66R but damaged SOL SELL PB +9.04→+3.93R) — the discriminator between "slow dip → continuation" (BTC) and "slow dip → chop" (SOL) is not the dip length.

### Verdict per the task's decision rule

- **ADOPT? No.** The rule does not improve all three symbols out-of-sample; per instructions an improvement that does not survive out-of-sample is not an improvement. Shipping it would damage SOL and ETH on the production config.
- **REJECT? No.** On BTC the mechanism is strong, stable across both windows/configs, and it is the only tested variant that converts the audit's "earlier valid entries" finding into Net R without a drawdown explosion. Rejecting it discards the best evidence-backed latency fix found so far.
- **REFINE — yes.** The next single experiment (engine only, same 90/90 protocol per symbol) is to find the condition that separates BTC-type slow dips from SOL-type slow dips before allowing the dip-bar entry — candidate discriminators already present in the data and consistent with the audit §5 findings: dip depth vs EMA21 (pierceAtr — deep pierces are the chop signature), ATR regime (quiet-bar entries outperformed high-vol bars), and the direction-aware SHORT extension context. Test one conditioned variant (e.g. slow-dip early only when the dip does not pierce EMA21 more than X ATR **and** ATR < its 100-bar average) across all three symbols; adopt only if it clears BOTH hold-out halves on all three symbols. No Pine change before that.

---
**Pine parity status:** engine option `opts.experimentSlowDipEarly` (default OFF) + `slowDipMinBars`; default run verified byte-identical to pre-experiment behavior (178/197/179 trades on A). Pine untouched in this phase per instructions — the Pine port is conditional on an ADOPT decision from the refined variant.
