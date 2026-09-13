# V4 research track 2 — BTC-100 forensics + HTF/session gates + money management

Date: 2026-09-12. Status: RESEARCH COMPLETE — no production defaults changed (v4.3.4 + `entryFilter` hook only).
Prior track: `V4-SIGNAL-UPGRADE-v44.md` (triple-combo, ON HOLD). This track answers the user ask:
100+ BTC signals examined, signal accuracy, money management, no 1m/5m signals, HTF confirmation.

## 1. Method (reproduce)

1. `node resample-htf.mjs` — builds 1H (4320) + 4H (1080) bars × 3 symbols from tracked 15m data
   (verified: timestamps hour/4H-aligned, closes match, zero gaps; Binance 1H ≡ aggregated 15m).
2. `node forensics-btc100.mjs` — 167 BTC signals (wide-net config), issue-by-issue buckets.
   Wide-net exists ONLY to generate hypotheses (167 signals); every hypothesis is then
   TESTED on production configs below. Wide-net cuts are not production evidence.
3. `node research-gates.mjs [exp]` — 11 gate experiments × base/triple × 3 symbols = 66 runs,
   via the research-only `opts.entryFilter(bar,side,isPullback)` hook in `engine.mjs`
   (hook absent by default → production path bit-identical, re-verified BTC 48t/+8.06R).
   HTF mapping uses the last CONFIRMED HTF bar (no lookahead); indicator warmup ⇒ block.
4. `node mm-ladder.mjs` — fixed-fractional compounding curves, per-symbol + merged 3-symbol portfolio.

## 2. BTC-100 forensics (wide-net, 167/167 joined, net +3.04R, PF 1.06)

| cut | finding (WIDE-NET CONTEXT ONLY) |
|---|---|
| direction | BUY +11.04R/55% vs SELL −7.99R/43% |
| trigger | BUY-PB +13.68R/63%/PF2.10 vs SELL-PB −6.29R/42%; BO both sides ≈ −2R |
| session UTC | 00–04 −3.99R/31t, 04–08 −2.17R, 08–12 +1.51R, 12–16 +3.82R, 16–20 +3.95R/70%, 20–24 −0.08R |
| extAtr 1.5–2.0 | −7.60R/52t (but production maxExtAtr sweep already rejected 1.0 — do not stack) |
| riskAtr 5+ | −1.77R/9t · bodyPct 20–40 −7.44R/23t · relVol flat (0.99–1.24, no edge) |
| exits | TP1 43/+43R, SL 38/−38R, STALE-70t 70/−1.95R, EXP 16/±0 · MFE|win 0.94R, MAE|loss 0.86R |

Hypotheses generated: H1 session filter 08–20 UTC · H2 kill SELL pullback-fills · H3 HTF veto (user ask).
Verdict on EACH hypothesis comes from §3 (production configs), not from this table.

## 3. Gate tests — ALL 11 variants fail or are noise (ΔR vs ungated, halves green = both halves ≥ 0)

Base total 21.97R (132 trades) · Triple total 37.42R (206 trades). Halves detail in console output.

| # | gate | base ΔR | triple ΔR | verdict |
|---|---|---|---|---|
| 1 | h1stack (1H close vs EMA50) | −1.23 | −3.51 | REJECT |
| 2 | h1ema (1H EMA21 vs 50) | −6.92 | −9.99 | REJECT |
| 3 | h4slope (4H EMA50 5-bar slope) | −10.16 | −15.26 | REJECT |
| 4 | h1h4 (stack + slope) | −8.95 | −14.08 | REJECT |
| 5 | h4pos (4H close vs EMA50) | −7.91 | −13.16 | REJECT |
| 6 | h1slope (1H EMA50 5-bar slope) | −0.42 | −0.89 | NOISE (helps SOL, hurts ETH — inconsistent) |
| 7 | h1soft (veto only beyond 0.25 ATR wrong side) | +0.51 | −2.28 | NOISE (blocks ~8% trades, ±0.5R) |
| 8 | h1stack-pb (stack veto on pullbacks only) | −1.42 | −3.11 | REJECT |
| 9 | sess0820 (08–20 UTC only) | −9.50 | −18.13 | REJECT — H1 dead |
| 10 | sess1220 (12–20 UTC only) | −17.93 | −28.52 | REJECT — H1 dead |
| 11 | nosellpb (kill SELL pullback-fills) | −9.63 | −14.94 | REJECT — H2 dead |

Key observations:

- **H2 (SELL-PB toxic) was a wide-net artifact.** Under production filters SELL pullback-fills
  are FINE (BTC Δ−0.51 ≈ neutral) to GREAT (SOL Δ−7.01 of value destroyed by killing them).
  The loosened wide-net regime (0.03 chop) is what killed SELL-PBs, not the trigger itself.
- **H1 (dead hours bleed) was a wide-net artifact.** Production filters (volume gate etc.)
  already select the tradeable dead-hour moves (+9.5R of value lives outside 08–20 UTC on base).
  Curiosity: sess0820 on triple keeps BTC +11.29R/25t (Δ−0.90) but ETH/SOL collapse — no transfer ⇒ reject.
- **HTF veto fails structurally, not by tuning.** 8 variants (stack/EMA/slope/position/soft/PB-only,
  1H/4H/both) × 2 configs: every one ≤ noise. Reason: V4-15m IS already a trend filter
  (EMA50 slope + regime gates). A slower HTF veto adds lag and deletes valid early-trend entries —
  the most profitable ones, where HTF has not turned yet. The softer the veto, the closer to
  zero the effect (h1soft blocks 8% of trades for +0.51R base / −2.28R triple = noise).
- **This empirically confirms the V3→V4 decision.** V3 WAS a 4H+1H+15M MTF stack and was retired
  for single-TF V4. Re-adding MTF as a veto reproduces the old weakness (−10 to −28R damage).

## 4. Money management ladder (fixed-fractional compounding, 6 months)

| config | risk/trade | BTC %Net/%DD | ETH %Net/%DD | SOL %Net/%DD | PORT %Net/%DD/Calmar |
|---|---|---|---|---|---|
| base | 0.25% | — | — | — | ≈+5.6 / 1.1 |
| base | 0.5% | +4.1 / 1.0 | +3.7 / 1.5 | +3.3 / 1.4 | **+11.5 / 2.1 / 5.6** |
| base | 1% | — | — | — | **+24.1 / 4.1** |
| base | 2% | — | — | — | +53 / 8.1 |
| triple | 0.5% | — | — | — | +20.4 / 3.1 |
| triple | 1% | — | — | — | **+44.5 / 6.2** |
| triple | 2% | — | — | — | +106 / 12.1 |

- Portfolio R-drawdown (base 4.17R) ≪ sum of symbols (7.83R) ⇒ diversification works:
  run all 3 symbols, not one.
- Drawdowns are small because the edge is smooth (win-every-month profile on base).
  Tentative recommendation (needs approval — it is your risk tolerance):
  **riskPerTrade default 0.5% → 1.0%** (+24.1%/4.1% DD base, +44.5%/6.2% DD triple).

## 5. Recommendations → user decisions 2026-09-12: R1 REJECTED (no MTF package at all), R2 kept (session tool, default OFF — unchanged), R3 APPROVED + IMPLEMENTED (risk 1.0%), R4 decided: v4.3.4 base kept, triple v4.4.0 REJECTED. The standalone minChartTF lock (default 15, v4.3.5) implements the "no 1m/5m signals" ask without the rejected MTF package.

R1. **Do NOT ship any HTF veto as default** (11/11 fail). Ship instead an MTF package:
   (a) MTF bias DISPLAY — 1H/4H trend state in the dashboard (LuxAlgo-style context, zero backtest harm);
   (b) optional `useMTFFilter` veto inputs, default OFF, for TradingView experimentation;
   (c) `minChartTF` entry guard, default "15" — implements the explicit no-1m/5m-signals ask
   (signals print only on 15m+ charts; user can lower the input).
R2. **Keep the Pine session filter as user tool, default OFF** (production needs no session gate).
R3. **MM: risk default → 1.0% + run 3-symbol portfolio** (pending your approval).
R4. Signal core still pending: adopt triple-combo (v4.4.0, +15.45R evidence) or keep v4.3.4 base.
   This track's gates were tested on BOTH — neither needs HTF.

## 6. Files

Scripts: `resample-htf.mjs`, `forensics-btc100.mjs`, `research-gates.mjs`, `mm-ladder.mjs`
(all research-only, root of `backtest/`). Data: `engine/data/*-{1h,4h}.json` (regenerable via §1.1).
Engine: `entryFilter` hook in `engine.mjs` (research-only, production-identical when absent).
