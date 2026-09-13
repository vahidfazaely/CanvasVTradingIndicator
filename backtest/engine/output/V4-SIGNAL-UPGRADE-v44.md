# V4 Signal Upgrade Research (v4.4.0 candidate — REJECTED by user 2026-09-12, v4.3.4 base kept; retained for reference)

Date: 2026-09-12 · Engine: `backtest/engine.mjs` (v4.3.0) · Data: 15m Binance,
~180 days × 3 symbols (17,280 candles each), in-sample.
Method: `simple-test.mjs --vs` A/B per symbol, totals across BTC+ETH+SOL,
90/90 halves stability for finalists, neighbor robustness for the winner.

Base (production defaults): BTC 48t/+8.06R · ETH 46t/+7.33R · SOL 38t/+6.58R.
**Total 21.97R**, 132 trades, 6/6 halves positive.

## Round 1 — 35 single-param variants (entry side only)

| Variant | Total R | BTC | ETH | SOL | Verdict |
|---|---|---|---|---|---|
| base | 21.97 | +8.06 | +7.33 | +6.58 | — |
| useStrictExt=false | **28.32** | +8.45 | +10.13 | +9.74 | FINAList |
| swingLookback=7 | **28.32** | +9.52 | +12.51 | +6.29 | Finalist |
| maxExtAtr=2.0 | **28.14** | +8.45 | +9.95 | +9.74 | Finalist |
| closeLocMinShort=0.40 | 25.47 | +9.06 | +9.83 | +6.58 | Luck (2 trades) → reject |
| breakoutBars=7 | **24.46** | +8.96 | +8.11 | +7.39 | Finalist (all 3 +) |
| maxRiskAtr=5.0 | 24.44 | +11.17 | +7.88 | +5.39 | Unstable halves → reject |
| maxRiskAtr=6.0 | 23.58 | +10.99 | +6.88 | +5.71 | Worse than 5.0 → reject |
| highVolPct=150 | 23.04 | +8.17 | +8.33 | +6.54 | Mild, not pursued |
| closeLocMinShort=0.20 | 22.11 | +8.06 | +7.47 | +6.58 | Noise → reject |
| hvMode=Block | 21.92 | +8.28 | +7.27 | +6.37 | Noise → reject |
| breakoutBuffer=0.15 | 21.97 | +8.06 | +7.33 | +6.58 | No effect |
| breakoutExtAtr=1.5/2.5 | 21.97 | — | — | — | No effect (dead gate, confirmed) |
| pullbackLookback=3/7 | 21.97 | — | — | — | No effect (touch never binds) |
| pullbackTolPct=0.25/1.0 | 21.97 | — | — | — | No effect |
| hvMode=Allow | 21.04 | +6.17 | +8.33 | +6.54 | Reject (BTC −1.89) |
| breakoutBars=15 | 21.03 | +8.06 | +7.39 | +5.58 | Reject |
| breakoutBuffer=0.05 | 20.97 | +8.06 | +6.33 | +6.58 | Reject |
| volMinBreakout=1.4 | 20.76 | +8.06 | +6.12 | +6.58 | Reject |
| minBodyPct=10 | 21.59 | +7.68 | +7.33 | +6.58 | Reject |
| highVolPct=120 | 20.30 | +6.06 | +7.66 | +6.58 | Reject |
| volMinBreakout=1.0 | 20.14 | +8.06 | +6.51 | +5.57 | Reject |
| minBodyPct=20 | 19.43 | +6.91 | +6.94 | +5.58 | Reject |
| breakoutBuffer=0.20 | 19.44 | +7.98 | +4.83 | +6.63 | Reject (kills ETH BO) |
| regimeMinSlope=0.03 | 19.21 | +7.31 | +9.98 | +1.92 | Reject (SOL −4.67) |
| closeLocMinLong=0.80 | 19.18 | +7.98 | +4.62 | +6.58 | Reject |
| enableBreakout=false | 18.42 | +8.98 | +3.81 | +5.63 | Keep breakouts (ETH −3.52 w/o) |
| regimeBars=15 | 18.20 | +4.46 | +7.83 | +5.91 | Reject |
| volMinPullback=1.0 | 18.16 | +7.24 | +6.98 | +3.94 | Reject (1.10 is sweet spot) |
| regimeMinSlope=0.075 | 15.69 | +2.74 | +7.93 | +5.02 | Reject (strictRegime re-confirmed) |
| volMinPullback=1.3 | 13.24 | +4.91 | +3.23 | +5.10 | Reject |
| regimeBars=7 | 12.30 | +2.09 | +7.60 | +2.61 | Reject |
| maxExtAtr=1.0 | 11.91 | +4.39 | +2.99 | +4.53 | Reject (filter too tight) |
| swingLookback=15 | 10.89 | +4.29 | +3.32 | +3.28 | Reject |
| momSlopeBars=2 | 9.92 | +7.69 | +3.40 | −1.17 | Reject (3 is load-bearing) |
| momSlopeBars=5 | 7.42 | +5.47 | +0.83 | +1.12 | Reject |
| structBufferAtr=1.0 | 6.89 | +2.05 | +1.93 | +2.91 | Reject |
| enablePullback=false | 4.56 | +0.09 | +3.52 | +0.95 | Pullbacks ARE the system |
| useSessionFilter=true | ERR | — | — | — | Engine doesn't model it (known gap) |

Key reads: pullback volume 1.10 is a sharp optimum; momentum/regime core (3/10)
is load-bearing; breakout-ext gate is dead code (zero effect both directions);
the 1.5-ATR extension cap rejects ~6R of good trades.

## Round 2 — halves stability (Δ vs base, H1/H2)

| Variant | BTC | ETH | SOL | Green |
|---|---|---|---|---|
| useStrictExt=false (+6.35) | +0.88 / −0.49 | +2.02 / +0.78 | +3.55 / −0.39 | 4/6 |
| swingLookback=7 (+6.35) | +1.02 / +0.43 | +0.34 / +4.84 | +0.69 / −0.98 | 4/6, ETH conc. |
| closeLocMinShort=0.40 (+3.50) | 0 / +1.00 | +2.50 / 0 | 0 / 0 | 2-trade luck → DROP |
| breakoutBars=7 (+2.49) | +1.00 / −0.11 | +0.78 / 0 | −0.19 / +1.00 | 4/6, small+consistent |
| maxRiskAtr=5.0 (+2.47) | +1.04 / +2.06 | −2.88 / +3.42 | +0.32 / −1.51 | whiplash → DROP |

## Round 3 — refinement + combos

| Variant | Total R | BTC | ETH | SOL |
|---|---|---|---|---|
| maxExtAtr=1.75 | 25.08 | +8.71 | +6.95 | +9.42 |
| maxExtAtr=2.5 | 28.32 | +8.45 | +10.13 | +9.74 | (= off; nothing past 2.5) |
| breakoutBars=5 | 20.59 | +8.96 | +6.56 | +5.07 |
| breakoutBars=6 | 23.01 | +8.96 | +6.98 | +7.07 |
| breakoutBars=8 | 21.65 | +7.96 | +7.11 | +6.58 |
| swingLookback=5 | 28.18 | +12.15 | +9.31 | +6.72 |
| swingLookback=6 | 27.43 | +11.00 | +10.37 | +6.06 |
| **swingLookback=8** | **29.42** | +10.91 | +10.74 | +7.77 |
| swingLookback=9 | 24.15 | +7.98 | +8.30 | +7.87 |
| swing8+ext2.0 | 33.10 | +11.30 | +10.87 | +10.93 |
| swing8+bb7 | 31.89 | +11.81 | +11.50 | +8.58 |
| ext2.0+bb7 | 32.68 | +9.35 | +12.54 | +10.79 |
| **swing8+ext2.0+bb7 (TRIPLE)** | **37.42** | +12.19 | +13.35 | +11.88 |
| swing7+ext2.0+bb7 (robust) | 34.89 | +10.30 | +15.00 | +9.59 |
| swing8+ext2.5+bb7 (robust) | 37.72 | +12.15 | +13.53 | +12.04 |

swingLookback 5–8 is a broad plateau (all +5.5R or better); 8 is the peak.
Neighbors of the triple hold (+12.9R / +15.7R) → plateau, not knife-edge.

## Winner: TRIPLE (swingLookback=8, maxExtAtr=2.0, breakoutBars=7)

Full window: **37.42R total (+15.45 over base)**, 206 trades (132 base).
BTC 65t +12.19R (WR 58.5%, PF 1.7, DD 2.00R) · L 39/+8.50 S 26/+3.69
ETH 72t +13.35R (WR 54.2%, PF 1.8, DD 5.38R) · L 43/+6.07 S 29/+7.28
SOL 69t +11.88R (WR 60.9%, PF 1.7, DD 4.44R) · L 33/−2.97 S 36/+14.85

Halves Δ: BTC +2.28/+1.85 ✓✓ · ETH +2.40/+3.61 ✓✓ · SOL +6.23/−0.93 (5/6 green).
BTC shorts fixed (+0.51 → +3.69). SOL longs worsen (−1.38 → −2.97);
SOL shorts carry (+7.96 → +14.85).

## Caveats (read before shipping)

1. **In-sample**: discovery and measurement use the same 180 days. Fresh-data
   holdout was attempted but the Binance fetch failed (network), so no
   out-of-sample confirmation exists yet.
2. **ETH/SOL drawdown rises** (ETH 3.06→5.38R, SOL 2.77→4.44R) — bumpier ride.
3. **56% more trades** (132→206) → more commission/slippage drag live than the
   engine's gross-R shows (Pine models 0.04% + 1 tick; still small vs +15.45R).
4. Multiple testing: ~45 variants tried; mild overfit risk remains despite the
   halves + neighbor checks. The plateau shape (not spike) is the best defense.

## Recommendation → v4.4.0 "signal upgrade" (needs user approval)

Defaults change (Pine full + lite + engine + docs + baselines):
`swingLookback 10 → 8`, `maxExtAtr 1.5 → 2.0`, `breakoutBars 10 → 7`.
Expected (in-sample): BTC 65t/+12.19R · ETH 72t/+13.35R · SOL 69t/+11.88R.
Plus: new `enableLong`/`enableShort` inputs (default true, no behavior change)
so users can cut e.g. SOL longs themselves (−2.97R pocket).

Extended reject list (do not retry): closeLocMinShort=0.40 (2-trade luck);
maxRiskAtr=5.0/6.0 (unstable/dilutive); maxExtAtr=1.0; momSlopeBars≠3;
regimeBars≠10; structBufferAtr=1.0; swingLookback=15; volMinPullback≠1.10;
breakoutBars=5/8/15; closeLocMinLong≠0.70; minBodyPct>0; highVolPct≠130±;
hvMode≠StrongerConfirmation; useSessionFilter (engine can't model).
Prior standing rejects still hold: volOff; expiry12/stale10; maxRisk3;
stop≤0.5; stop1.0+looseReg; midBE-on; strictRegime; stop2.0;
stacked stop1.0+tpClose+noBtQ; exits 50/50, full@0.75R, 50%@0.75+BE.
