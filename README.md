# CanvasV V4 FAST

A single-timeframe, 15m-first **trend-following trading strategy** built in TradingView Pine Script v5, with a faithful Node.js backtest engine for local research.

| Platform | Language | File |
|---|---|---|
| TradingView | Pine Script v5 (`strategy()`) | [`TradingView/CanvasV_V4_FAST.pine`](TradingView/CanvasV_V4_FAST.pine) |
| TradingView (fast-compile) | Pine Script v5 (`strategy()`) | [`TradingView/CanvasV_V4_FAST_lite.pine`](TradingView/CanvasV_V4_FAST_lite.pine) |
| Local backtest | Node.js (no dependencies) | [`backtest/engine.mjs`](backtest/engine.mjs) |

---

## What it is

A non-repainting trend-following system built on a small, explicit rule set:

1. **Regime** — EMA 50 slope (ATR-normalized) decides trending vs ranging; ATR-vs-average flags high volatility.
2. **Direction + momentum** — EMA 9/21/50 stack plus EMA 9 slope and close-vs-EMA 21.
3. **Entry triggers** — pullback-resume (touch EMA 21, reclaim EMA 9) or breakout (prior 10-bar range + ATR buffer, close location, extension guard).
4. **Quality gates** — extension limit, candle body, relative volume, and stricter confirmation in high volatility.
5. **Risk** — structural Entry / SL / TP1 / TP2 built from market swings plus an ATR buffer, with actual-risk (R-based) targets.
6. **Position management** — `strategy.entry` / `strategy.exit` with optional partial TP, break-even moves, stale-trade exit, and time expiry.

Single timeframe only: everything runs on the chart series. No `request.security`, no multi-timeframe calls, no lookahead.

---

## TradingView version (v4.3.0)

- **Pipeline:** `REGIME → DIRECTION → SETUP → TRIGGER → RISK → STRATEGY`. A candidate must pass every stage; entries fire only on **confirmed closed candles** (`barstate.isconfirmed`).
- **Regime:** EMA 50 slope over 10 bars, normalized to ATR/bar; trending when |slope| ≥ 0.05. Trend direction needs the EMA 21/50 stack *and* a rising/falling EMA 50. High-volatility flag when ATR ≥ 130% of its 100-bar average.
- **Setup:** trend + momentum must agree — EMA 9 rising/falling over 3 bars with close on the right side of EMA 21.
- **Triggers (either one):**
  - *Pullback resume* — lowest low / highest high of the last 5 bars touched EMA 21 (±0.5%), then close reclaims EMA 9.
  - *Breakout* — close beyond the prior 10-bar range by 0.10 ATR, with close location ≥ 0.70 (long) / ≤ 0.30 (short) and within 2.0 ATR of EMA 21.
- **Entry quality:** |close − EMA 21| ≤ 1.5 ATR (strict, on by default); optional minimum candle-body %.
- **Volume (Phase 4):** relative volume vs 20-bar average — ≥ 1.20 for breakouts, ≥ 1.10 for pullbacks.
- **High volatility (Phase 5):** `Stronger Confirmation` by default — entries during high-vol regimes need relVol ≥ 1.40 and close location ≥ 0.75 / ≤ 0.25. Alternatives: `Allow`, `Block`, `Reduce Risk`.
- **Risk model:** Entry = signal close. Structural SL = 10-bar swing (signal bar excluded via `[1]`) ∓ 0.5 ATR, then a further `atrStopMult` (1.25) × ATR buffer. Too-tight structure (< 0.5 ATR) falls back to a 1.5 ATR stop; risk > 4.0 ATR **rejects the setup**. TP1 = 1.0R, TP2 = 2.5R.
- **Position sizing (Phase 2):** fixed-risk 0.5% of equity per trade (on by default), optional max-size cap.
- **Execution (Phase 3):** full exit at TP1 by default (v4.3.0 — runners give the profit back); optional 50/50 partial TP at TP1/TP2, break-even after TP1 fill, mid-trade break-even (+0.25R after 10 bars) — all off by default. **Always on:** stale-trade exit (flat ±0.25R after 15 bars → market) and time expiry (20 bars).
- **Costs modeled:** $10k capital, 0.04% commission, 1-tick slippage.
- **Visual modes:** `NORMAL` = clean chart (regime-colored trend line, ▲/▼ markers, 11-row panel); `DEBUG` = full EMA set, 15-row research panel, decisions log, per-signal record labels. Signal logic is identical in both.
- **Diagnostics:** outcome tracking (`TP2 FIRST` / `TP1 FIRST` / `SL FIRST` / `EXPIRED` / `SUPERSEDED`), MFE/MAE in R, a 10-bar post-SL observation window, and optional `V4LOG` / `V4OUT` / `V4POST` machine-readable alerts (all off by default). Session filter available, off by default.
- **Lite build:** `CanvasV_V4_FAST_lite.pine` is signal-identical (95 identifiers + 50 inputs verified equal; zero divergences on the 90/90 hold-out) with diagnostics-only trims for faster compile. Use it when the full script hits TradingView compile limits.

---

## Local backtest engine

`backtest/engine.mjs` is a dependency-free Node.js mirror of the Pine v4.3.0 signal logic — every default parameter matches the Pine input defaults exactly. It adds `AMBIGUOUS` (SL+TP hit on the same bar) and `STALE_EXIT` outcomes, which the Pine strategy can only classify by exit price. It does **not** model the default-off Pine extras (partial TP, break-even-after-TP1, session filter, commission/slippage).

```bash
cd backtest
node simple-test.mjs BTCUSDT              # production baseline, one symbol
node simple-test.mjs BTCUSDT --vs atrStopMult=1.0   # A/B against a tweak
node simple-test.mjs BTCUSDT --halves     # 90/90 split check
node run.mjs --symbol ETHUSDT             # full report + SL-failure analysis
node fetch-data.mjs --symbol ETHUSDT --interval 15m --days 180  # refresh data
node web-test.mjs --open                  # Web Test Lab dashboard
```

Windows shortcuts: `CanvasV-Test.cmd` (quick-test menu), `CanvasV-Web.cmd` (dashboard).

Research scripts (ablation, forensics, hold-outs, sweep) live in [`backtest/`](backtest/) with their reports in [`backtest/engine/output/`](backtest/engine/output/). Data: 15m Binance OHLCV, ~180 days per symbol, in [`backtest/engine/data/`](backtest/engine/data/).

**Current production baselines** (v4.3.0 defaults, full window): BTC 48 trades / +8.06R · ETH 46 trades / +7.33R · SOL 38 trades / +6.58R. See `V4-LITE-HOLDOUT90.md` and `V4-SIGNAL-QUALITY-LATENCY-AUDIT.md` (v4.2.x-era reports; re-run to refresh).

---

## Repository layout

```
TradingView/   V4.2 FAST strategy (.pine) — full + lite builds
backtest/      Node.js engine, runners, research scripts, data, reports
scripts/       Pine checks (structure, full-vs-lite parity)
docs/          Strategy spec, changelog, testing guide
tv-automation/ Playwright helpers for loading/verifying Pine in TradingView
logs/          Collected TradingView diagnostic lines (local data)
```

---

## Non-repainting requirement

This is a hard requirement, not a preference:

- Entries are generated only **after the signal candle closes** (`barstate.isconfirmed`).
- All series (EMAs, ATR, swings, volume) use confirmed chart-TF bars only; swing/range lookups exclude the signal bar via `[1]`.
- No `request.security` and no `lookahead_on` anywhere — there is no higher-timeframe data to leak.
- A signal, once printed, never moves or disappears.

See [`docs/Testing.md`](docs/Testing.md) for verification.

---

## Documentation

- [`docs/Strategy.md`](docs/Strategy.md) — precise signal logic and defaults (current baseline: v4.3.0).
- [`docs/Changelog.md`](docs/Changelog.md) — version history (V3 MTF indicator → V4 FAST strategy).
- [`docs/Testing.md`](docs/Testing.md) — how to test in TradingView and locally.

## Development status

- **TradingView:** `v4.3.0` — single-TF `strategy()` conversion with the full research stack (fixed-risk sizing, breakout quality, volume filter, high-volatility modes, full-at-TP1 / partial-TP / break-even / stale / expiry exits, NORMAL/DEBUG visuals, outcome + post-SL diagnostics). v4.3.0 makes full exit at TP1 the default and credits exact limit fills (see changelog). Working and compiling in the Pine Editor.
- **Local engine:** mirrors Pine v4.3.0 signal logic exactly; used for all backtest reports.
- **V3 note:** the legacy V3 MTF indicator (`MyBuySellIndicator.pine`) is described in the changelog but is **not present** in this repository checkout — only the V4 line ships here.
- **Open research:** all 6 halves are positive in v4.3.0 (BTC +6.49 → +1.57R, ETH +3.25 → +4.09R, SOL +6.10 → +0.49R). Remaining signal-side question: SOL longs −1.38R with no causal entry filter found yet; see `V4-R1-SOL-SECONDHALF.md` and `r1-sol-forensics.mjs`.
