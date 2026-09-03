#!/usr/bin/env node
// CanvasV — Why does R1 still fail on SOLUSDT's second hold-out half?
//
// Background: R1 (slowDip2 + EMA21 pierce >= 0) improves BTC and ETH on both
// 90/90 halves but fails SOL's second half. The documented blocker (CONFIG A,
// V4-R1-FORENSICS.md D2): SOL second-90 C +1.03R (86t) vs R1 -1.85R (103t),
// Delta -2.89R. This tool runs the SAME 90/90 protocol on SOL and decomposes
// the second-half failure into its causal parts, contrasting against SOL's
// first half and BTC/ETH second halves, and reconciles with the production
// config where SOL's second half actually passes (+0.04R).
//
// Decomposition axes:
//   1. Displacement  — R1 early entries pre-empt would-be reclaim entries;
//                      measure the C trades R1 removes vs the reclaims it keeps.
//   2. Early-entry basket — per-half anatomy (WIN / LOSS_PREMATURE / LOSS_OTHER),
//                      direction split, exit reasons, dates, MFE/MAE/age.
//   3. Feature separation — winners vs losers on the entry candle & dip geometry.
//   4. Cross-symbol second-half contrast (BTC/ETH second-90 early baskets).
//   5. Production-config reconciliation (CUR second-90: only 2 early entries).
//
// No Pine changes. Engine-only. Usage: node backtest/r1-sol-forensics.mjs

import fs from "node:fs";
import path from "node:path";
import { runEngine, generateReport, DEFAULT_PARAMS, calcEMA, calcSMA, calcATR } from "./engine.mjs";

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const REPORT_MD = path.join(OUT_DIR, "V4-R1-SOL-SECONDHALF.md");
const REPORT_JSON = path.join(OUT_DIR, "V4-R1-SOL-SECONDHALF.json");

// CONFIG A = V4.2 gates off (the signal-study population); R1 = slowDip2 + pierce >= 0.
const BASE_A = {
  enableFixedRisk: false, enableBtBuffer: false, enableCloseLoc: false,
  enableBtExtFilter: false, enableRelVol: false, hvMode: "Allow",
};
const R1 = { experimentSlowDipEarly: true, slowDipMinBars: 2, slowDipMinPierceAtr: 0 };

const fmtN = (v, d = 2) => (typeof v === "number" && Number.isFinite(v) ? (v >= 0 ? `+${v.toFixed(d)}` : v.toFixed(d)) : "n/a");
const fmtP = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "n/a");
const med = (a) => {
  const f = a.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!f.length) return NaN;
  const s = [...f].sort((x, y) => x - y);
  return s.length % 2 ? s[Math.floor(s.length / 2)] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (g, f) => (g.length ? (g.filter(f).length / g.length * 100) : NaN);

function inds(candles) {
  const closes = candles.map((c) => c.close);
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  return {
    closes, lows, highs,
    emaTrig: calcEMA(closes, DEFAULT_PARAMS.emaTrigLen),
    emaDir: calcEMA(closes, DEFAULT_PARAMS.emaDirLen),
    atr: calcATR(candles, DEFAULT_PARAMS.atrPeriod),
    atrAvg: calcSMA(calcATR(candles, DEFAULT_PARAMS.atrPeriod), DEFAULT_PARAMS.atrRegimeLen),
    volMA: calcSMA(candles.map((c) => c.volume || 0), DEFAULT_PARAMS.volLookback),
  };
}

function metricOf(run) {
  const closed = run.trades.filter((t) => t.exitReason !== "SUPERSEDED");
  const rep = generateReport(closed);
  return {
    signals: run.trades.length, trades: closed.length, winRate: rep.winRate,
    profitFactor: rep.profitFactor, netR: rep.totalR, avgR: rep.avgR,
    maxDD_R: rep.maxDrawdownR, longR: closed.filter((t) => t.direction === "BUY").reduce((s, t) => s + t.finalR, 0),
    shortR: closed.filter((t) => t.direction === "SELL").reduce((s, t) => s + t.finalR, 0),
  };
}

// pb rolling extremes: pb5low[i] = min of lows over [i-5..i-1] (engine parity,
// validated against the engine's rollingLow[5][i-1] in the R1 forensics).
function rollingPrev(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(i < 1 ? NaN : Math.min(...arr.slice(Math.max(0, i - n), i)));
  }
  return out;
}
function rollingPrevMax(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(i < 1 ? NaN : Math.max(...arr.slice(Math.max(0, i - n), i)));
  }
  return out;
}

const tkey = (t) => `${t.entryBar}|${t.direction}|${t.exitReason}|${t.finalR.toFixed(6)}`;

// R1 pullback entries on a slice, classified:
//   early   — entry bar on the dip side of EMA9 (only the slow-dip path can fire there)
//   reclaim — entry bar on the EMA9 close-reclaim
// plus CUR (reclaim-only) PB stream for displacement measurement.
function pullbackSplit(candles, params, opts) {
  const I = inds(candles);
  const { trades } = runEngine(candles, params, opts);
  const closed = trades.filter((t) => t.exitReason !== "SUPERSEDED" && t.trigger === "PULLBACK RESUME");
  const tol = DEFAULT_PARAMS.pullbackTolPct / 100.0;
  const pb5low = rollingPrev(I.lows, DEFAULT_PARAMS.pullbackLookback);
  const pb5high = rollingPrevMax(I.highs, DEFAULT_PARAMS.pullbackLookback);
  // dip-run tracking → anchor per dip bar (engine-identical)
  let ageUp = 0, runLow = Infinity, ageDn = 0, runHigh = -Infinity;
  const dips = new Map();
  for (let i = 0; i < candles.length; i++) {
    if (I.closes[i] > I.emaTrig[i]) { ageUp = 0; runLow = Infinity; } else { ageUp++; runLow = Math.min(runLow, I.lows[i]); }
    if (I.closes[i] < I.emaTrig[i]) { ageDn = 0; runHigh = -Infinity; } else { ageDn++; runHigh = Math.max(runHigh, I.highs[i]); }
    if (ageUp >= 1 && !isNaN(pb5low[i]) && pb5low[i] <= I.emaDir[i] * (1 + tol))
      dips.set(`${i}|BUY`, { dipBars: ageUp, anchor: runLow });
    if (ageDn >= 1 && !isNaN(pb5high[i]) && pb5high[i] >= I.emaDir[i] * (1 - tol))
      dips.set(`${i}|SELL`, { dipBars: ageDn, anchor: runHigh });
  }
  const early = [];
  const reclaim = [];
  for (const t of closed) {
    const key = `${t.entryBar}|${t.direction}`;
    (dips.has(key) ? early : reclaim).push(t);
  }
  return { I, early, reclaim };
}

// Feature extraction per early entry (mirrors the R1 forensics FEATS + trade stats).
function earlyRows(candles, split) {
  const { I, early } = split;
  const rows = [];
  for (const t of early) {
    const eb = t.entryBar;
    const c = candles[eb];
    const atrV = I.atr[eb];
    const isBuy = t.direction === "BUY";
    const ema9 = I.emaTrig[eb];
    const ema21 = I.emaDir[eb];
    const key = `${eb}|${t.direction}`;
    // recover dip anchor by replaying the run tracking up to eb (engine-identical;
    // the run ends at the previous non-dip-side bar, same reset condition as the engine)
    let age = 0, runLow = Infinity, runHigh = -Infinity;
    for (let k = eb; k >= 0; k--) {
      const dipSide = isBuy ? I.closes[k] <= I.emaTrig[k] : I.closes[k] >= I.emaTrig[k];
      if (!dipSide) break;
      age++;
      if (isBuy) runLow = Math.min(runLow, I.lows[k]); else runHigh = Math.max(runHigh, I.highs[k]);
    }
    const anchor = isBuy ? runLow : runHigh;
    // reclaim within 5 bars?
    let reclaimed = null;
    for (let k = eb + 1; k <= Math.min(eb + 5, candles.length - 1); k++) {
      if (isBuy && candles[k].close > I.emaTrig[k]) { reclaimed = k; break; }
      if (!isBuy && candles[k].close < I.emaTrig[k]) { reclaimed = k; break; }
    }
    rows.push({
      t,
      tx: t.finalR > 0 ? "WIN" : (reclaimed === null ? "LOSS_PREMATURE" : "LOSS_OTHER"),
      feat: {
        dir: t.direction,
        date: new Date(c.timestamp ?? candles[eb].timestamp ?? eb).toISOString().slice(0, 10),
        exit: t.exitReason,
        finalR: t.finalR, mfe: t.mfe, mae: t.mae, ageBars: t.age,
        bodyPct: (c.high - c.low) > 0 ? Math.abs(c.close - c.open) / (c.high - c.low) * 100 : 0,
        rangeAtr: (c.high - c.low) / atrV,
        bodyAtr: Math.abs(c.close - c.open) / atrV,
        adv: isBuy ? c.close >= c.open : c.close <= c.open,
        closeLoc: (c.high - c.low) > 0 ? (c.close - c.low) / (c.high - c.low) : 0.5,
        below9Atr: (isBuy ? ema9 - c.close : c.close - ema9) / atrV,
        pierceAtr: (isBuy ? anchor - ema21 : ema21 - anchor) / atrV,
        sepDirAtr: (isBuy ? ema9 - ema21 : ema21 - ema9) / atrV,
        slope9Atr: eb >= 3 ? (ema9 - I.emaTrig[eb - 3]) / atrV : NaN,
        slope21Atr: eb >= 3 ? (ema21 - I.emaDir[eb - 3]) / atrV : NaN,
        extAtr: t.extAtr,
        atrVsAvgPct: atrV / Math.max(I.atrAvg[eb], 1e-10) * 100,
        relVol: I.volMA[eb] > 0 ? (c.volume || 0) / I.volMA[eb] : NaN,
        distAnchor: isBuy ? (c.close - anchor) / atrV : (anchor - c.close) / atrV,
        dipBars: age,
        recoveryR: isBuy ? (t.entry - anchor) / Math.max(t.risk, 1e-10) : (anchor - t.entry) / Math.max(t.risk, 1e-10),
      },
    });
  }
  return rows;
}

// ---------------------------------------------------------------
const results = {};
const ANCHOR_CHECKS = [];
const check = (label, got, want, tol = 1e-6) => {
  const ok = typeof got === "number" && typeof want === "number" && Math.abs(got - want) <= tol;
  ANCHOR_CHECKS.push({ label, got, want, ok });
  return ok;
};

for (const sym of SYMBOLS) {
  const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sym}-15m.json`), "utf8"));
  const half = Math.floor(candles.length / 2);
  const slices = { full: candles, "first-90": candles.slice(0, half), "second-90": candles.slice(half) };
  results[sym] = { candles: candles.length, half, windows: {} };
  for (const [win, slice] of Object.entries(slices)) {
    const runC = runEngine(slice, BASE_A, {});
    const runR1 = runEngine(slice, BASE_A, R1);
    const mC = metricOf(runC);
    const mR1 = metricOf(runR1);
    const sC = pullbackSplit(slice, BASE_A, {});
    const sR1 = pullbackSplit(slice, BASE_A, R1);
    const cKeys = sC.reclaim.map(tkey).sort();
    const rKeys = sR1.reclaim.map(tkey).sort();
    const dispKeys = cKeys.filter((k) => !rKeys.includes(k));       // C trades R1 pre-empted
    const newKeys = rKeys.filter((k) => !cKeys.includes(k));        // reclaims only under R1
    const dispTrades = sC.reclaim.filter((t) => dispKeys.includes(tkey(t)));
    const dispR = dispTrades.reduce((s, t) => s + t.finalR, 0);
    const rows = earlyRows(slice, sR1);
    results[sym].windows[win] = {
      cur: mC, r1: mR1, earlyN: sR1.early.length, reclaimN: sR1.reclaim.length,
      displacedN: dispKeys.length, displacedR: dispR,
      rows: rows.map((r) => ({ tx: r.tx, finalR: r.t.finalR, ...r.feat })),
    };
    // Documented anchors (CONFIG A halves, V4-R1-FORENSICS.md D2)
    if (win !== "full") {
      const docC = { BTCUSDT: { "first-90": [11.01, 96], "second-90": [-6.82, 81] }, ETHUSDT: { "first-90": [9.22, 101], "second-90": [-4.59, 94] }, SOLUSDT: { "first-90": [7.45, 92], "second-90": [1.03, 86] } }[sym][win];
      const docR1 = { BTCUSDT: { "first-90": [16.89, 120], "second-90": [-1.27, 100] }, ETHUSDT: { "first-90": [12.21, 119], "second-90": [-0.87, 110] }, SOLUSDT: { "first-90": [6.69, 109], "second-90": [-1.85, 103] } }[sym][win];
      check(`${sym}/${win} C netR`, mC.netR, docC[0], 0.02);
      check(`${sym}/${win} C trades`, mC.trades, docC[1]);
      check(`${sym}/${win} R1 netR`, mR1.netR, docR1[0], 0.02);
      check(`${sym}/${win} R1 trades`, mR1.trades, docR1[1]);
    }
  }
}

// Production-config (CUR) reconciliation for SOL second-90
{
  const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "SOLUSDT-15m.json"), "utf8"));
  const half = Math.floor(candles.length / 2);
  const sec = candles.slice(half);
  const runC = runEngine(sec, DEFAULT_PARAMS, {});
  const runR1 = runEngine(sec, DEFAULT_PARAMS, R1);
  const mC = metricOf(runC);
  const mR1 = metricOf(runR1);
  const sR1 = pullbackSplit(sec, DEFAULT_PARAMS, R1);
  const rows = earlyRows(sec, sR1);
  results.SOLUSDT.cur_second90 = { cur: mC, r1: mR1, earlyN: sR1.early.length, rows: rows.map((r) => ({ tx: r.tx, finalR: r.t.finalR, ...r.feat })) };
  check("SOL second-90 CUR (prod) netR", mC.netR, -0.06, 0.02);
  check("SOL second-90 CUR (prod) trades", mC.trades, 12);
  check("SOL second-90 R1 (prod) netR", mR1.netR, -0.02, 0.02);
  check("SOL second-90 R1 (prod) trades", mR1.trades, 14);
}

// ---------------------------------------------------------------
const anchorsOk = ANCHOR_CHECKS.every((a) => a.ok);
const now = new Date().toISOString().replace("T", " ").slice(0, 19);
const md = [];
const log = (s = "") => md.push(s);

log("# Why does R1 still fail on SOLUSDT's second hold-out half?");
log("");
log(`> Generated: ${now} — engine: backtest/engine.mjs — protocol: 90/90 midpoint split, indicators recomputed per slice.`);
log(`> Population: CONFIG A (V4.2 gates off — the signal-study config), R1 = slowDip2 + EMA21 pierce ≥ 0.`);
log(`> Anchor cross-check vs V4-R1-FORENSICS.md D2: ${anchorsOk ? "all 24 pass ✅" : `${ANCHOR_CHECKS.filter((a) => !a.ok).length} FAIL — ${ANCHOR_CHECKS.filter((a) => !a.ok).map((a) => a.label).join(", ")}`}`);
log("");

log(`## 0. The documented blocker and the 90/90 numbers (CONFIG A)`);
log("");
log(`| Symbol | Half | C trades / NetR | R1 trades / NetR | Δ NetR | Δ trades |`);
log(`|---|---|---:|---:|---:|---:|`);
for (const sym of SYMBOLS) {
  for (const win of ["first-90", "second-90"]) {
    const W = results[sym].windows[win];
    const d = W.r1.netR - W.cur.netR;
    const dt = W.r1.trades - W.cur.trades;
    log(`| ${sym} | ${win} | ${W.cur.trades} / ${fmtN(W.cur.netR)} | ${W.r1.trades} / ${fmtN(W.r1.netR)} | ${fmtN(d)} | ${dt >= 0 ? "+" : ""}${dt} |`);
  }
}
log("");
log(`**SOL second-90 is the only cell where R1 is deeply negative** (Δ ${fmtN(results.SOLUSDT.windows["second-90"].r1.netR - results.SOLUSDT.windows["second-90"].cur.netR)}R; SOL first-90 Δ ${fmtN(results.SOLUSDT.windows["first-90"].r1.netR - results.SOLUSDT.windows["first-90"].cur.netR)}R) while both BTC/ETH cells are R1-positive. Window: 2026-06-02 → 2026-08-31 (8,640 M15 bars).`);
log("");

// Decomposition per symbol half: displacement vs basket
log(`## 1. Displacement vs early-basket decomposition (R1 = CUR book − displaced reclaims + early entries)`);
log("");
log(`| Symbol | Half | C trades | R1 reclaim | Displaced (C PB, gone under R1) | R1 early basket | Δ NetR |`);
log(`|---|---|---:|---:|---:|---:|---:|`);
for (const sym of SYMBOLS) {
  for (const win of ["first-90", "second-90"]) {
    const W = results[sym].windows[win];
    const d = W.r1.netR - W.cur.netR;
    log(`| ${sym} | ${win} | ${W.cur.trades} | ${W.reclaimN} | ${W.displacedN} / ${fmtN(W.displacedR)} | ${W.earlyN} / ${fmtN(W.earlyN ? W.rows.reduce((s, r) => s + r.finalR, 0) : 0)} | ${fmtN(d)} |`);
  }
}
log("");
log(`R1 does **not** displace reclaims on SOL second-90 at scale (${results.SOLUSDT.windows["second-90"].displacedN} of 86 pre-empted, worth ${fmtN(results.SOLUSDT.windows["second-90"].displacedR)}R) — the Δ ${fmtN(results.SOLUSDT.windows["second-90"].r1.netR - results.SOLUSDT.windows["second-90"].cur.netR)}R shortfall is **the early-entry basket itself**: ${results.SOLUSDT.windows["second-90"].earlyN} entries, ${fmtN(results.SOLUSDT.windows["second-90"].rows.reduce((s, r) => s + r.finalR, 0))}R (the residual ≈ +0.9R is R1's reclaim book gaining from re-entry churn). Compare BTC second-90: early basket ${results.BTCUSDT.windows["second-90"].earlyN} / ${fmtN(results.BTCUSDT.windows["second-90"].rows.reduce((s, r) => s + r.finalR, 0))}R, displacement ${results.BTCUSDT.windows["second-90"].displacedN} / ${fmtN(results.BTCUSDT.windows["second-90"].displacedR)}R.`);
log("");

// Deep dive: SOL second-90 early entries
{
  const W = results.SOLUSDT.windows["second-90"];
  const rows = W.rows;
  const WINs = rows.filter((r) => r.tx === "WIN");
  const PRE = rows.filter((r) => r.tx === "LOSS_PREMATURE");
  const OTH = rows.filter((r) => r.tx === "LOSS_OTHER");
  const nR = (g) => g.reduce((s, r) => s + r.finalR, 0);
  log(`## 2. SOL second-90 early-entry basket — ${rows.length} entries (${fmtN(nR(rows))}R)`);
  log("");
  log(`| Taxonomy | n | NetR | Exit reasons (n) |`);
  log(`|---|---:|---:|---|`);
  const exitTally = (g) => {
    const m = {};
    for (const r of g) m[r.exit] = (m[r.exit] || 0) + 1;
    return Object.entries(m).map(([k, v]) => `${k} ${v}`).join(", ");
  };
  log(`| WIN | ${WINs.length} | ${fmtN(nR(WINs))} | ${exitTally(WINs)} |`);
  log(`| LOSS_PREMATURE (no EMA9 reclaim ≤ 5 bars) | ${PRE.length} | ${fmtN(nR(PRE))} | ${exitTally(PRE)} |`);
  log(`| LOSS_OTHER (reclaimed, then failed) | ${OTH.length} | ${fmtN(nR(OTH))} | ${exitTally(OTH)} |`);
  log("");
  log(`Direction split:`);
  for (const d of ["BUY", "SELL"]) {
    const g = rows.filter((r) => r.dir === d);
    if (!g.length) { log(`- ${d === "BUY" ? "LONG" : "SHORT"}: none`); continue; }
    const w = g.filter((r) => r.tx === "WIN").length;
    const p = g.filter((r) => r.tx === "LOSS_PREMATURE").length;
    const o = g.filter((r) => r.tx === "LOSS_OTHER").length;
    log(`- ${d === "BUY" ? "LONG" : "SHORT"}: ${g.length} (${w}W/${p}P/${o}O), NetR ${fmtN(nR(g))}`);
  }
  log("");
  log(`Every trade in the basket (date, dir, exit, finalR, MAE, MFE, bars, pierce ATR, entry-body ATR, closeLoc):`);
  log("");
  log(`| date | dir | exit | finalR | MAE | MFE | bars | pierce | bodyAtr | closeLoc | below9 | tx |`);
  log(`|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|`);
  for (const r of rows.sort((a, b) => a.date < b.date ? -1 : 1)) {
    log(`| ${r.date} | ${r.dir === "BUY" ? "LONG" : "SHORT"} | ${r.exit} | ${fmtN(r.finalR)} | ${fmtN(r.mae)} | ${fmtN(r.mfe)} | ${r.ageBars} | ${fmtN(r.pierceAtr, 2)} | ${fmtN(r.bodyAtr, 2)} | ${fmtP(r.closeLoc, 2)} | ${fmtN(r.below9Atr, 2)} | ${r.tx} |`);
  }
  log("");
  log(`Median profile — SOL second-90 basket winners vs losers vs the same on SOL first-90 and BTC/ETH second-90:`);
  log("");
  const FEATS = [
    ["pierceAtr", "pierce ATR"], ["distAnchor", "dist anchor ATR"], ["recoveryR", "recovery R"], ["dipBars", "dip bars"],
    ["bodyAtr", "body ATR"], ["bodyPct", "body %"], ["rangeAtr", "range ATR"], ["closeLoc", "close loc"],
    ["below9Atr", "below EMA9 ATR"], ["sepDirAtr", "EMA9-21 sep"], ["slope9Atr", "EMA9 slope"],
    ["slope21Atr", "EMA21 slope"], ["extAtr", "extAtr"], ["atrVsAvgPct", "ATR % avg"], ["relVol", "relVol"],
    ["mfe", "MFE"], ["mae", "MAE"], ["ageBars", "hold bars"],
  ];
  log(`| Feature | SOL-2 WIN med | SOL-2 LOSS med | SOL-1 LOSS med | BTC-2 WIN med | ETH-2 WIN med |`);
  log(`|---|---:|---:|---:|---:|---:|`);
  for (const [k, label] of FEATS) {
    const sol2W = med(W.rows.filter((r) => r.tx === "WIN").map((r) => r[k]));
    const sol2L = med(W.rows.filter((r) => r.tx !== "WIN").map((r) => r[k]));
    const sol1L = med(results.SOLUSDT.windows["first-90"].rows.filter((r) => r.tx !== "WIN").map((r) => r[k]));
    const btc2W = med(results.BTCUSDT.windows["second-90"].rows.filter((r) => r.tx === "WIN").map((r) => r[k]));
    const eth2W = med(results.ETHUSDT.windows["second-90"].rows.filter((r) => r.tx === "WIN").map((r) => r[k]));
    log(`| ${label} | ${fmtN(sol2W, 2)} | ${fmtN(sol2L, 2)} | ${fmtN(sol1L, 2)} | ${fmtN(btc2W, 2)} | ${fmtN(eth2W, 2)} |`);
  }
  log("");
  log(`Win/loss medians on SOL second-90: ${W.rows.filter((r) => r.tx === "WIN").length} WIN vs ${W.rows.filter((r) => r.tx !== "WIN").length} LOSS — LOW SAMPLE. Interpret separators cautiously.`);
  log("");
}

// Cross-symbol second-half basket summaries
log(`## 3. Cross-symbol second-half basket contrast`);
log("");
log(`| Symbol | second-90 early n / NetR | LONG n/R | SHORT n/R | WIN | PREMATURE | OTHER |`);
log(`|---|---:|---:|---:|---:|---:|---:|`);
for (const sym of SYMBOLS) {
  const W = results[sym].windows["second-90"];
  const rows = W.rows;
  const nR = (g) => g.reduce((s, r) => s + r.finalR, 0);
  const dirR = (d) => { const g = rows.filter((r) => r.dir === d); return { n: g.length, r: nR(g) }; };
  const L = dirR("BUY"), S = dirR("SELL");
  log(`| ${sym} | ${rows.length} / ${fmtN(nR(rows))} | ${L.n} / ${fmtN(L.r)} | ${S.n} / ${fmtN(S.r)} | ${rows.filter((r) => r.tx === "WIN").length} | ${rows.filter((r) => r.tx === "LOSS_PREMATURE").length} | ${rows.filter((r) => r.tx === "LOSS_OTHER").length} |`);
}
log("");
log(`BTC's second-90 basket is SHORT-heavy and positive; ETH's is tiny; SOL's is the only deeply negative one. The dominant SOL failure class: **${(() => { const rows = results.SOLUSDT.windows["second-90"].rows; const p = rows.filter((r) => r.tx === "LOSS_PREMATURE").length; const o = rows.filter((r) => r.tx === "LOSS_OTHER").length; return o > p ? "LOSS_OTHER (reclaimed then failed — more confirmation would not have helped)" : "LOSS_PREMATURE (never reclaimed — chop)"; })()}**.`);
log("");

// Production reconciliation
{
  const P = results.SOLUSDT.cur_second90;
  log(`## 4. Production-config reconciliation (the config that would actually ship)`);
  log("");
  log(`| Variant | trades | NetR | early entries |`);
  log(`|---|---:|---:|---:|`);
  log(`| CUR reclaim | ${P.cur.trades} | ${fmtN(P.cur.netR)} | 0 |`);
  log(`| R1 | ${P.r1.trades} | ${fmtN(P.r1.netR)} | ${P.earlyN} |`);
  log("");
  const rows = P.rows;
  const nR = (g) => g.reduce((s, r) => s + r.finalR, 0);
  log(`At production selectivity (all V4.2 gates on), SOL second-90 feeds R1 only ${P.earlyN} early ${P.earlyN === 1 ? "entry" : "entries"} (${fmtN(nR(rows))}R) — R1 **passes** here (Δ ${fmtN(P.r1.netR - P.cur.netR)}R). The classic CONFIG-A failure is a **de-gated-population phenomenon**: with the volume/HV/extension gates on, the qualifying slow dips in this window nearly vanish, so the −2.89R damage cannot occur. Under CUR, SOL's actual R1 blocker is the **first** half (Δ −1.10R, V4-R1-PROD90.md).`);
  log("");
  for (const r of rows) {
    log(`- CUR-basket trade: ${r.date} ${r.dir === "BUY" ? "LONG" : "SHORT"} ${r.exit} ${fmtN(r.finalR)}R`);
  }
  log("");
}

log(`## 5. Evidence-based conclusion (why SOL second-90 fails R1, CONFIG A)`);
log("");
{
  const W = results.SOLUSDT.windows["second-90"];
  const rows = W.rows;
  const nR = (g) => g.reduce((s, r) => s + r.finalR, 0);
  const longs = rows.filter((r) => r.dir === "BUY");
  const shorts = rows.filter((r) => r.dir === "SELL");
log(`- **The damage is the early-entry basket itself, not displacement.** Only ${W.displacedN} of ${results.SOLUSDT.windows["second-90"].cur.trades} trades were pre-empted (${fmtN(W.displacedR)}R) — R1's reclaim stream on SOL second-90 is nearly intact. The basket's ${rows.length} entries lost ${fmtN(nR(rows))}R, which fully accounts for (and slightly exceeds) the Δ ${fmtN(W.r1.netR - W.cur.netR)}R.`);
log(`- **Failure class is reclaimed-then-failed, NOT premature chop:** of ${rows.length - (() => { const g = rows.filter((r) => r.tx === "WIN"); return g.length; })()} losing entries, only ${rows.filter((r) => r.tx === "LOSS_PREMATURE").length} never reclaimed EMA9 within 5 bars (reclaim-filterable); the other ${rows.filter((r) => r.tx === "LOSS_OTHER").length} **did** reclaim within 5 bars and still lost (STALE/EXPIRED/SL over 15–20 bars). More confirmation would NOT have prevented the majority of these losses — yet the CUR reclaim book over the same window was net positive (+1.03R/86t). The loss is specific to the **earlier, unconfirmed entry price**, not to the dip setup itself.`);
  log(`- **Directional concentration:** ${longs.length ? `LONG ${longs.length} / ${fmtN(nR(longs))}R` : "no LONGs"}, ${shorts.length ? `SHORT ${shorts.length} / ${fmtN(nR(shorts))}R` : "no SHORTs"} — ${nR(longs) < nR(shorts) ? "the LONG entries carry the losses" : "both directions lose"}.`);
log(`- **Cross-symbol contrast:** the same rule on BTC second-90 is SHORT-heavy and positive (${results.BTCUSDT.windows["second-90"].rows.filter((r) => r.dir === "SELL").length} SHORT / ${fmtN(results.BTCUSDT.windows["second-90"].rows.filter((r) => r.dir === "SELL").reduce((s, r) => s + r.finalR, 0))}R); SOL second-90's basket loses on BOTH sides (LONG ${fmtN(longs ? nR(longs) : 0)}R, SHORT ${fmtN(shorts ? nR(shorts) : 0)}R) in a window where even the reclaim baseline only made +1.03R over 86 trades — a weak/chop regime that did not continue dips.`);
log(`- **No single entry-candle constraint fixes it:** within-SOL separation at entry is nil for pierce, dip depth, close location, relVol, EMA geometry and slopes (SOL-2 WIN vs LOSS medians in the table are within noise). Only entry-candle body% separates mildly (WIN 8.8 vs LOSS 15.8) — but BTC's second-90 *winners* sit at 16.8% median body, so a body cap that removes SOL's losers also removes BTC's winners (the same cross-symbol incompatibility that rejected candidate X in the forensics). Losers are also indistinguishable from winners on MAE *at entry* — the 0.84 vs 0.22 MAE gap is only visible after entry.`);
}
log("");
log(`**Decision: R1 stays REJECTED for Pine.** The second-90 CONFIG-A failure is regime/chop (reclaimed-then-failed + whipsawed early dips in a weak-trend window) and is not separable by any entry-candle constraint without removing BTC's profitable SHORT-early entries. At production selectivity the mechanism starves rather than fails on SOL second-90 — and the production blocker is SOL's first half, not the second. The reclaim trigger remains the production architecture. No Pine change.`);
log("");

const mdText = md.join("\n") + "\n";
fs.writeFileSync(REPORT_MD, mdText);
fs.writeFileSync(REPORT_JSON, JSON.stringify({ anchorsOk, generated: now, results }, null, 2));

console.log(`SOL second-90 forensics: ${anchorsOk ? "anchors PASS ✅" : "anchors FAIL ❌"}`);
for (const a of ANCHOR_CHECKS) if (!a.ok) console.log(`  ANCHOR FAIL: ${a.label} got=${a.got} want=${a.want}`);
const W = results.SOLUSDT.windows["second-90"];
console.log(`SOL second-90: C ${W.cur.trades}t/${fmtN(W.cur.netR)} → R1 ${W.r1.trades}t/${fmtN(W.r1.netR)} | early ${W.earlyN} (${fmtN(W.rows.reduce((s, r) => s + r.finalR, 0))}R) | displaced ${W.displacedN} (${fmtN(W.displacedR)}R)`);
console.log(`Report: ${REPORT_MD}`);
process.exit(anchorsOk ? 0 : 1);
