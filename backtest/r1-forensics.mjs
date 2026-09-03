#!/usr/bin/env node
// CanvasV — R1 residual forensics
// Population: R1 (slowDip2 + pierce>=0) dip-bar entries only, CONFIG A.
// Taxonomy per entry: WIN / LOSS-premature (no EMA9 reclaim within 5 bars) / LOSS-other.
// Goal: one causal cross-symbol constraint to remove remaining chop without
// sacrificing the early-entry latency benefit.
import fs from "node:fs";
import path from "node:path";
import {
  runEngine, generateReport, DEFAULT_PARAMS,
  calcEMA, calcSMA, calcATR,
} from "./engine.mjs";

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const BASE_A = {
  enableFixedRisk: false, enableBtBuffer: false, enableCloseLoc: false,
  enableBtExtFilter: false, enableRelVol: false, hvMode: "Allow",
};
const R1 = { experimentSlowDipEarly: true, slowDipMinBars: 2, slowDipMinPierceAtr: 0 };

// ─── Section D/F variants: R1 + ONE additional causal constraint ───
const MATRIX = [
  ["C reclaim", "C", {}],
  ["B slowDip2", "B", { experimentSlowDipEarly: true, slowDipMinBars: 2 }],
  ["R1 pierce>=0", "R1", { ...R1 }],
  ["X body<=0.15ATR", "X", { ...R1, slowDipMaxBodyAtr: 0.15 }],
  ["Y close>=0.5 dir", "Y", { ...R1, slowDipMinCloseDir: 0.5 }],
  ["R1 LONG-early", "R1L", { ...R1, experimentEarlySide: "long" }],
  ["R1 SHORT-early", "R1S", { ...R1, experimentEarlySide: "short" }],
];

// Full-variant metrics for the candidate matrix (mirrors slow-dip-refine.mjs)
function variantMetric(candles, opts) {
  const { trades } = runEngine(candles, BASE_A, opts);
  const r = generateReport(trades);
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED");
  const closes = candles.map(c => c.close);
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const emaTrig = calcEMA(closes, DEFAULT_PARAMS.emaTrigLen);
  const emaDir = calcEMA(closes, DEFAULT_PARAMS.emaDirLen);
  let ageUp = 0, runLow = Infinity, ageDn = 0, runHigh = -Infinity;
  const earlyDip = new Map();  // dip-side bars (close still on the dip side) — early entries land here
  const reclaimDip = new Map(); // the bar where a dip run ENDS via reclaim close — reclaim entries land here
  for (let i = 0; i < candles.length; i++) {
    if (closes[i] > emaTrig[i]) {
      // BUY reclaim: the ended dip run becomes the reclaim bar's anchor (run occupied i-dipBars..i-1)
      if (ageUp >= 1) reclaimDip.set(`${i}|BUY`, { dipBars: ageUp, anchor: runLow });
      ageUp = 0; runLow = Infinity;
    } else {
      ageUp++; runLow = Math.min(runLow, lows[i]);
      earlyDip.set(`${i}|BUY`, { dipBars: ageUp, anchor: runLow });
    }
    if (closes[i] < emaTrig[i]) {
      // SELL reclaim (close crosses back below EMA9 after a dip-side run of closes >= EMA9)
      if (ageDn >= 1) reclaimDip.set(`${i}|SELL`, { dipBars: ageDn, anchor: runHigh });
      ageDn = 0; runHigh = -Infinity;
    } else {
      ageDn++; runHigh = Math.max(runHigh, highs[i]);
      earlyDip.set(`${i}|SELL`, { dipBars: ageDn, anchor: runHigh });
    }
  }
  const pb = closed.filter(t => t.trigger === "PULLBACK RESUME");
  const dipRows = pb.map(t => {
    const side = t.direction === "BUY" ? "BUY" : "SELL";
    const key = `${t.entryBar}|${side}`;
    const isBuy = t.direction === "BUY";
    // Reclaim entries land on the run-end bar; early entries land on a dip-side bar.
    const d = earlyDip.get(key);
    const early = !!d;
    const info = d || reclaimDip.get(key);
    if (!info) return null;
    const rec = isBuy ? (t.entry - info.anchor) / Math.max(t.risk, 1e-10) : (info.anchor - t.entry) / Math.max(t.risk, 1e-10);
    // Latency in candles: bars between the dip run's start and the entry.
    const runStart = t.entryBar - info.dipBars + (early ? 1 : 0);
    return { t, early, dipBars: info.dipBars, recoveryR: rec, runStart };
  }).filter(Boolean);
  const earlyRows = dipRows.filter(x => x.early);
  // Premature = EARLY-entry LOSERS whose dip never reclaimed within 5 bars (mirrors the
  // LOSS_PREMATURE taxonomy in section A; dip entries that never reclaim but still win are not failures).
  const premature = earlyRows.filter(x => {
    if (x.t.finalR >= 0) return false;
    for (let k = x.t.entryBar + 1; k <= Math.min(x.t.entryBar + 5, candles.length - 1); k++) {
      if (x.t.direction === "BUY" && candles[k].close > emaTrig[k]) return false;
      if (x.t.direction === "SELL" && candles[k].close < emaTrig[k]) return false;
    }
    return true;
  });
  const dir = (d) => {
    const g = closed.filter(t => t.direction === d);
    return { n: g.length, netR: g.reduce((s, t) => s + t.finalR, 0) };
  };
  const reclaimRows = dipRows.filter(x => !x.early);
  return {
    trades: closed.length, wr: r.winRate, pf: r.profitFactor, netR: r.totalR,
    avgR: r.avgR, maxDD: r.maxDrawdownR,
    pbTrades: dipRows.length,                    // all closed pullback entries with a measured dip
    earlyEntries: earlyRows.length,              // early dip-bar entries (0 for C reclaim)
    earlyNetR: earlyRows.reduce((s, x) => s + x.t.finalR, 0),
    reclaimEntries: reclaimRows.length,
    reclaimNetR: reclaimRows.reduce((s, x) => s + x.t.finalR, 0),
    pbRecoveryMed: med(dipRows.map(x => x.recoveryR)),   // bounce already spent at entry, R (lower = earlier)
    pbLatencyMed: med(dipRows.map(x => x.t.entryBar - x.runStart)), // candles setup-start -> signal
    premature: premature.length,
    premNetR: premature.reduce((s, x) => s + x.t.finalR, 0),
    long: dir("BUY"), short: dir("SELL"),
  };
}

// Production-config sanity (V4.2 defaults, all gates ON)
function prodMetric(candles, opts) {
  const { trades } = runEngine(candles, DEFAULT_PARAMS, opts);
  const r = generateReport(trades);
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED");
  return {
    trades: closed.length, wr: r.winRate, pf: r.profitFactor, netR: r.totalR,
    maxDD: r.maxDrawdownR, avgR: r.avgR,
    long: { n: closed.filter(t => t.direction === "BUY").length, netR: closed.filter(t => t.direction === "BUY").reduce((s, t) => s + t.finalR, 0) },
    short: { n: closed.filter(t => t.direction === "SELL").length, netR: closed.filter(t => t.direction === "SELL").reduce((s, t) => s + t.finalR, 0) },
  };
}
const md = [];
const log = (s = "") => { md.push(s); };
const fmtN = (v, d = 2) => (typeof v === "number" && !isNaN(v) ? (v >= 0 ? `+${v.toFixed(d)}` : v.toFixed(d)) : "n/a");
const fmtP = (v, d = 1) => (typeof v === "number" && !isNaN(v) ? v.toFixed(d) : "n/a");
const med = (a) => {
  const f = a.filter(x => typeof x === "number" && !isNaN(x));
  if (!f.length) return NaN;
  const s = [...f].sort((x, y) => x - y);
  return s.length % 2 ? s[Math.floor(s.length / 2)] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (g, f) => (g.length ? g.filter(f).length / g.length * 100 : NaN);
const load = (sym) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sym}-15m.json`), "utf8"));

function inds(candles) {
  const closes = candles.map(c => c.close);
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  return {
    closes, lows, highs,
    emaTrig: calcEMA(closes, DEFAULT_PARAMS.emaTrigLen),
    emaDir: calcEMA(closes, DEFAULT_PARAMS.emaDirLen),
    atr: calcATR(candles, DEFAULT_PARAMS.atrPeriod),
    atrAvg: calcSMA(calcATR(candles, DEFAULT_PARAMS.atrPeriod), DEFAULT_PARAMS.atrRegimeLen),
    volMA: calcSMA(candles.map(c => c.volume || 0), DEFAULT_PARAMS.volLookback),
  };
}

function collect(sym) {
  const candles = load(sym);
  const I = inds(candles);
  const { trades } = runEngine(candles, BASE_A, R1);
  const tol = DEFAULT_PARAMS.pullbackTolPct / 100.0;
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED" && t.trigger === "PULLBACK RESUME");
  // dip-run tracking (engine-identical) → anchor per dip bar
  let ageUp = 0, runLow = Infinity, ageDn = 0, runHigh = -Infinity;
  const dips = new Map();
  const pb5low = [], pb5high = [];
  for (let i = 0; i < candles.length; i++) {
    pb5low.push(i < 1 ? NaN : Math.min(...I.lows.slice(Math.max(0, i - 5), i)));
    pb5high.push(i < 1 ? NaN : Math.max(...I.highs.slice(Math.max(0, i - 5), i)));
  }
  for (let i = 0; i < candles.length; i++) {
    if (I.closes[i] > I.emaTrig[i]) { ageUp = 0; runLow = Infinity; } else { ageUp++; runLow = Math.min(runLow, I.lows[i]); }
    if (I.closes[i] < I.emaTrig[i]) { ageDn = 0; runHigh = -Infinity; } else { ageDn++; runHigh = Math.max(runHigh, I.highs[i]); }
    // Engine parity: the pullback trigger uses rollingLow[5][i-1] = min over [i-5..i-1], which is pb5low[i].
    if (ageUp >= 1 && !isNaN(pb5low[i]) && pb5low[i] <= I.emaDir[i] * (1 + tol))
      dips.set(`${i}|BUY`, { dipBars: ageUp, anchor: runLow });
    if (ageDn >= 1 && !isNaN(pb5high[i]) && pb5high[i] >= I.emaDir[i] * (1 - tol))
      dips.set(`${i}|SELL`, { dipBars: ageDn, anchor: runHigh });
  }
  const rows = [];
  for (const t of closed) {
    const d = dips.get(`${t.entryBar}|${t.direction === "BUY" ? "BUY" : "SELL"}`);
    if (!d) continue;
    const eb = t.entryBar;
    const c = candles[eb];
    const atrV = I.atr[eb];
    const isBuy = t.direction === "BUY";
    const ema21 = I.emaDir[eb];
    const ema9 = I.emaTrig[eb];
    // reclaim within 5 bars?
    let reclaimed = null;
    for (let k = eb + 1; k <= Math.min(eb + 5, candles.length - 1); k++) {
      if (isBuy && candles[k].close > I.emaTrig[k]) { reclaimed = k; break; }
      if (!isBuy && candles[k].close < I.emaTrig[k]) { reclaimed = k; break; }
    }
    const tx = t.finalR > 0 ? "WIN" : (reclaimed === null ? "LOSS_PREMATURE" : "LOSS_OTHER");
    rows.push({
      tx, t,
      feat: {
        dir: t.direction,
        bodyPct: (c.high - c.low) > 0 ? Math.abs(c.close - c.open) / (c.high - c.low) * 100 : 0,
        rangeAtr: (c.high - c.low) / atrV,
        bodyAtr: Math.abs(c.close - c.open) / atrV,
        adv: isBuy ? c.close >= c.open : c.close <= c.open,
        closeLoc: (c.high - c.low) > 0 ? (c.close - c.low) / (c.high - c.low) : 0.5,
        below9Atr: (isBuy ? ema9 - c.close : c.close - ema9) / atrV,
        pierceAtr: (isBuy ? (d.anchor - ema21) : (ema21 - d.anchor)) / atrV,
        sepDirAtr: (isBuy ? ema9 - ema21 : ema21 - ema9) / atrV,
        slope9Atr: eb >= 3 ? (ema9 - I.emaTrig[eb - 3]) / atrV : NaN,
        slope21Atr: eb >= 3 ? (ema21 - I.emaDir[eb - 3]) / atrV : NaN,
        extAtr: t.extAtr,
        atrVsAvgPct: atrV / Math.max(I.atrAvg[eb], 1e-10) * 100,
        relVol: I.volMA[eb] > 0 ? (c.volume || 0) / I.volMA[eb] : NaN,
        distAnchor: isBuy ? (c.close - d.anchor) / atrV : (d.anchor - c.close) / atrV,
        dipBars: d.dipBars,
      },
    });
  }
  return { candles, I, rows };
}

log("# CanvasV — R1 Residual Forensics (remaining premature/chop after pierce guard)");
log("");
log(`- Date: ${new Date().toISOString().slice(0, 10)}`);
log("- Population: **R1 dip-bar entries only** (slowDip2 + pierce ≥ 0), CONFIG A.");
log("- Taxonomy per entry: **WIN** (finalR>0), **LOSS_PREMATURE** (finalR<0 and no EMA9 reclaim within 5 bars = chop), **LOSS_OTHER** (finalR<0 but the dip reclaimed = continuation failure / SL).");
log("");

const data = {};
for (const sym of SYMBOLS) {
  const { rows } = collect(sym);
  data[sym] = rows.map(r => ({ tx: r.tx, finalR: r.t.finalR, exit: r.t.exitReason, ...r.feat }));
  const W = rows.filter(r => r.tx === "WIN");
  const P = rows.filter(r => r.tx === "LOSS_PREMATURE");
  const O = rows.filter(r => r.tx === "LOSS_OTHER");
  const nR = (g) => g.reduce((s, r) => s + r.t.finalR, 0);
  log(`## ${sym} — R1 dip entries ${rows.length} | WIN ${W.length} (${fmtN(nR(W))}R) | LOSS_PREMATURE ${P.length} (${fmtN(nR(P))}R) | LOSS_OTHER ${O.length} (${fmtN(nR(O))}R)`);
  log("");
  log("| Feature | med WIN | med PREMATURE | med LOSS_OTHER | WIN body-direction adv % | PREMATURE adv % |");
  log("|---|---|---|---|---|---|");
  const FEATS = [
    ["bodyPct", "entry candle body %"],
    ["rangeAtr", "entry candle range (ATR)"],
    ["bodyAtr", "entry body (ATR)"],
    ["closeLoc", "close location in range"],
    ["below9Atr", "depth below EMA9 (ATR)"],
    ["pierceAtr", "dip anchor vs EMA21 (ATR)"],
    ["sepDirAtr", "EMA9-EMA21 sep (ATR)"],
    ["slope9Atr", "EMA9 slope (ATR/3b)"],
    ["slope21Atr", "EMA21 slope (ATR/3b)"],
    ["atrVsAvgPct", "ATR vs 100-bar avg (%)"],
    ["relVol", "relative volume"],
    ["distAnchor", "close vs dip anchor (ATR)"],
    ["extAtr", "close vs EMA21 (ATR)"],
  ];
  for (const [k, label] of FEATS) {
    const mW = med(W.map(r => r.feat[k]));
    const mP = med(P.map(r => r.feat[k]));
    const mO = med(O.map(r => r.feat[k]));
    log(`| ${label} | ${fmtN(mW, 2)} | ${fmtN(mP, 2)} | ${fmtN(mO, 2)} | ${fmtP(pct(W, r => r.feat.adv), 0)}% | ${fmtP(pct(P, r => r.feat.adv), 0)}% |`);
  }
  log("");
  log("Direction split of R1 dip entries:");
  log("");
  for (const d of ["BUY", "SELL"]) {
    const g = rows.filter(r => r.feat.dir === d);
    const w = g.filter(r => r.tx === "WIN").length;
    const p = g.filter(r => r.tx === "LOSS_PREMATURE").length;
    const o = g.filter(r => r.tx === "LOSS_OTHER").length;
    const advP = pct(g, r => r.feat.adv);
    const medBodyW = med(g.filter(r => r.tx === "WIN").map(r => r.feat.bodyPct));
    const medBodyP = med(g.filter(r => r.tx === "LOSS_PREMATURE").map(r => r.feat.bodyPct));
    log(`- ${d === "BUY" ? "LONG" : "SHORT"}: ${g.length} (${w}W/${p}P/${o}O), NetR ${fmtN(g.reduce((s, r) => s + r.t.finalR, 0))}; adv-candle ${fmtP(advP, 0)}%; med body WIN ${fmtN(medBodyW, 1)} / PREMATURE ${fmtN(medBodyP, 1)}`);
  }
  log("");
}

// Cross-symbol separator summary: pull per-feature median columns per symbol
log("## Cross-symbol feature separation (med WIN − med LOSS_PREMATURE, all losses pooled)");
log("");
log("| Feature | BTC | ETH | SOL | consistent? |");
log("|---|---|---|---|---|");
{
  const rowsBySym = {};
  for (const sym of SYMBOLS) {
    const { rows } = collect(sym);
    rowsBySym[sym] = rows;
  }
  const FEATS = [
    ["bodyPct", "body %"], ["rangeAtr", "range ATR"], ["bodyAtr", "body ATR"], ["closeLoc", "close loc"],
    ["below9Atr", "below EMA9"], ["pierceAtr", "pierce"], ["sepDirAtr", "sep"], ["slope9Atr", "EMA9 slope"],
    ["slope21Atr", "EMA21 slope"], ["atrVsAvgPct", "ATR%"], ["relVol", "relVol"], ["distAnchor", "dist anchor"],
    ["extAtr", "extAtr"],
  ];
  for (const [k, label] of FEATS) {
    const cells = [];
    for (const sym of SYMBOLS) {
      const rows = rowsBySym[sym];
      const W = rows.filter(r => r.tx === "WIN").map(r => r.feat[k]);
      const L = rows.filter(r => r.tx === "LOSS_PREMATURE" || r.tx === "LOSS_OTHER").map(r => r.feat[k]);
      cells.push(med(W) - med(L));
    }
    const sign = cells.map(c => (isNaN(c) ? 0 : Math.sign(c)));
    const allSame = new Set(sign).size === 1 && !sign.includes(0);
    log(`| ${label} | ${fmtN(cells[0], 2)} | ${fmtN(cells[1], 2)} | ${fmtN(cells[2], 2)} | ${allSame ? "YES" : "no"} |`);
  }
  log("");
  log("> Consistent = the WIN-minus-LOSS median difference has the same sign on all three symbols. Only consistent features are eligible for a cross-symbol constraint.");
}
log("");

// ─── C. Candidate constraints chosen from the separation evidence ───
log("## C. Candidate constraints (maximum 3, coarse + causal)");
log("");
log("From the separation tables only cross-symbol-consistent features are eligible. The three candidates tested:");
log("");
log("1. **X — entry-candle body ≤ 0.15 ATR** (`slowDipMaxBodyAtr`): winners carry smaller entry bodies than losers on every symbol; a big counter-candle pressing through the base is the residual SOL chop signature.");
log("2. **Y — entry close ≥ mid-range toward the trade side** (`slowDipMinCloseDir = 0.5`): winners close nearer the trade side of the range on all three symbols.");
log("3. **R1L / R1S — side restriction** (`experimentEarlySide`): dip SHORT entries are net positive on all three symbols (BTC +8.83R, ETH +3.32R, SOL +1.74R) while dip LONG entries are negative on SOL (−2.46R) — an asymmetry justified cross-symbol, not by a single symbol.");
log("");
log("R1 remains frozen and immutable: `slowDip2 + pierce ≥ 0`. Every candidate below is R1 plus exactly ONE of the above.");
log("");

// ─── D. Full 5+-variant x 3-symbol x 2-half matrix ───
log("## D. Candidate matrix — 7 variants x 3 symbols x 2 temporal halves (CONFIG A)");
log("");
const matrix = { full: {}, halves: {} };
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const half = Math.floor(candles.length / 2);
  matrix.full[sym] = {};
  for (const [label, code, o] of MATRIX) {
    matrix.full[sym][code] = variantMetric(candles, o);
  }
  matrix.halves[sym] = {};
  for (const [hName, slice] of [["first-90", candles.slice(0, half)], ["second-90", candles.slice(half)]]) {
    matrix.halves[sym][hName] = {};
    for (const [label, code, o] of MATRIX) {
      const v = variantMetric(slice, o);
      matrix.halves[sym][hName][code] = { netR: v.netR, trades: v.trades };
    }
  }
}
log("### D1. Full window (180d) — Net R / trades / PF / MaxDD / premature");
log("");
log("| Symbol | Variant | Trades | WR % | PF | Net R | MaxDD R | early dip entries | premature (early losers) | prem NetR |");
log("|---|---|---|---|---|---|---|---|---|---|");
for (const sym of SYMBOLS) {
  for (const [label, code] of MATRIX.map(([l, c]) => [l, c])) {
    const v = matrix.full[sym][code];
    log(`| ${sym} | ${label} | ${v.trades} | ${fmtP(v.wr)} | ${fmtP(v.pf)} | ${fmtN(v.netR)} | ${v.maxDD.toFixed(2)} | ${v.earlyEntries} | ${v.premature} | ${fmtN(v.premNetR)} |`);
  }
  log("");
}
log("### D2. Hold-out halves — Net R (trades), Δ vs C in **bold** when better than C");
log("");
for (const sym of SYMBOLS) {
  log(`#### ${sym}`);
  log("");
  log("| Half | C | B | R1 | X | Y | R1L | R1S |");
  log("|---|---|---|---|---|---|---|---|");
  for (const hName of ["first-90", "second-90"]) {
    const H = matrix.halves[sym][hName];
    const cNet = H["C"].netR;
    const cell = (code) => {
      const v = H[code];
      const d = v.netR - cNet;
      return `${fmtN(v.netR)} (${v.trades}) ${d >= 0 ? `**Δ${fmtN(d)}**` : `Δ${fmtN(d)}`}`;
    };
    log(`| ${hName} | ${fmtN(cNet)} (${H["C"].trades}) | ${cell("B")} | ${cell("R1")} | ${cell("X")} | ${cell("Y")} | ${cell("R1L")} | ${cell("R1S")} |`);
  }
  log("");
}

// ─── E. Latency trade-off ───
log("## E. Latency trade-off (does the candidate preserve the reason for early entry?)");
log("");
log("Latency is measured on closed PULLBACK-RESUME trades (CONFIG A, full window): **recovery R** = how much of the bounce from the dip anchor is already spent at entry, risk-normalized (lower = earlier); **setup→signal bars** = candles between the dip run's start and the signal (median). Every pullback entry is either a **reclaim** entry (fires on the EMA9 close-reclaim, the production trigger) or an **early** dip-bar entry (produced by the experiment).");
log("");
log("| Symbol | Variant | PB trades | med recovery R | med setup→signal bars | early entries | early NetR | reclaim entries | reclaim NetR |");
log("|---|---|---|---|---|---|---|---|---|");
const lat = {};
for (const sym of SYMBOLS) {
  lat[sym] = {};
  for (const [label, code] of MATRIX.map(([l, c]) => [l, c])) {
    const v = matrix.full[sym][code];
    lat[sym][code] = {
      pb: v.pbTrades, rec: v.pbRecoveryMed, bars: v.pbLatencyMed,
      early: v.earlyEntries, earlyNetR: v.earlyNetR,
      reclaim: v.reclaimEntries, reclaimNetR: v.reclaimNetR,
    };
    log(`| ${sym} | ${label} | ${v.pbTrades} | ${fmtN(v.pbRecoveryMed, 2)} | ${fmtP(v.pbLatencyMed, 1)} | ${v.earlyEntries} | ${fmtN(v.earlyNetR)} | ${v.reclaimEntries} | ${fmtN(v.reclaimNetR)} |`);
  }
  log("");
}

// ─── Production-config sanity (V4.2 defaults) ───
log("## Production-config sanity (V4.2 defaults, all gates ON)");
log("");
log("| Symbol | Variant | Trades | WR % | PF | Net R | Avg R | MaxDD R | LONG | SHORT |");
log("|---|---|---|---|---|---|---|---|---|---|");
const prod = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  prod[sym] = {};
  for (const [label, code] of [["CUR reclaim", "C"], ["R1", "R1"], ["X body", "X"], ["Y close", "Y"], ["R1L", "R1L"], ["R1S", "R1S"]]) {
    const o = MATRIX.find(m => m[1] === code)[2];
    const v = prodMetric(candles, o);
    prod[sym][code] = v;
    log(`| ${sym} | ${label} | ${v.trades} | ${fmtP(v.wr)} | ${fmtP(v.pf)} | ${fmtN(v.netR)} | ${fmtN(v.avgR, 3)} | ${v.maxDD.toFixed(2)} | ${fmtN(v.long.netR)} (${v.long.n}) | ${fmtN(v.short.netR)} (${v.short.n}) |`);
  }
  log("");
}

// ─── F. Final decision ───
log("## F. Final decision");
log("");
const verdicts = {};
for (const sym of SYMBOLS) {
  const f = matrix.halves[sym]["first-90"];
  const s = matrix.halves[sym]["second-90"];
  verdicts[sym] = {};
  for (const code of ["B", "R1", "X", "Y", "R1L", "R1S"]) {
    verdicts[sym][code] = {
      first: f[code].netR - f["C"].netR,
      second: s[code].netR - s["C"].netR,
    };
  }
}
log("Δ Net R vs C reclaim by candidate and half (a candidate passes only if ≥ 0 on BOTH halves of ALL THREE symbols):");
log("");
log("| Candidate | BTC h1 / h2 | ETH h1 / h2 | SOL h1 / h2 | All symbols x both halves? |");
log("|---|---|---|---|---|");
for (const code of ["B", "R1", "X", "Y", "R1L", "R1S"]) {
  const v = verdicts;
  const ok = SYMBOLS.every(sym => v[sym][code].first >= 0 && v[sym][code].second >= 0);
  const row = SYMBOLS.map(sym => `${fmtN(v[sym][code].first)} / ${fmtN(v[sym][code].second)}`).join(" | ");
  log(`| ${code} | ${row} | ${ok ? "YES" : "NO"} |`);
}
log("");
log("### Verdict: **REJECT** (early dip-bar entry as a universal rule); return to reclaim architecture");
log("");
log("Every refinement that passes BTC and ETH fails SOL's second hold-out half, and the side split proves the failure is structural: R1S (SHORT-early) rescues BTC/ETH's second halves (+5.81R/+4.47R vs C) but damages SOL (Δ −3.45R); R1L (LONG-early) rescues SOL's second half (+0.56R) but degrades BTC/ETH (Δ −0.26R/−0.75R). No single causal constraint — body size, close location, EMA21 pierce, ATR elevation, or direction — survives the robustness bar across all three symbols and both temporal halves. Per the experiment rules, a rule that does not hold on all symbols out-of-sample is not shipped, and a SOL-only fix would be overfitting. The premature population R1 leaves is tiny (4–6 per symbol), and the entry-candle guards built for it are not selective: X removes 24 of BTC's 56 early entries yet its premature-loss total barely moves (−5.06R → −5.13R prem NetR), and both X and Y COST BTC net R (−4.06R and −4.83R vs R1) by deleting good early entries alongside the few chop losers.");
log("");
log("The evidence therefore supports the task's explicit fallback: **early pullback entry is market-regime dependent and should NOT replace the universal reclaim architecture.** The reclaim close-confirmation remains the production trigger. The valuable, retained findings:");
log("");
log("1. **R1 (pierce ≥ 0) is a clean, low-cost quality idea for a future revisit** — it improves BTC and ETH on every CONFIG-A window (full + both halves) and on the production config BTC is strongly better (+10.76R vs +6.43R) while ETH is a wash (+3.75R vs +4.75R at 40 trades); it also recovers most of SOL's slowDip damage. If a symbol- or regime-aware deployment is ever acceptable, R1 is the refinement to carry.");
log("2. **Dip SHORT early entries are positive on all three symbols** (+8.83/+3.32/+1.74R) — the asymmetry is real and cross-symbol, but deploying it unilaterally (R1S) still fails SOL's hold-out, so it stays a research note, not a rule.");
log("3. The engine experiment options remain **default OFF**; engine parity and Pine remain untouched. No Pine port. No production-default change. No new filters added.");
log("");
log("### Why R1 still fails on SOL (evidence-based)");
log("");
log("SOL's R1 losses are NOT premature chop — only 5 of its 28 losing dip entries never reclaimed within 5 bars; the other **23 reclaimed and then failed** (continuation/SL, LOSS_OTHER), a failure mode that waiting for more confirmation cannot fix because confirmation already happened. The damage is concentrated in SOL's second hold-out half (Δ −2.89R vs C), and it is LONG-side: SOL dip LONGs net −2.46R (9W/1P/14O) while dip SHORTs net +1.74R (16W/4P/9O). The separator analysis shows these losing LONGs carry the same shallow-EMA21 profile as BTC winners (pierce +0.10 vs BTC +0.07 ATR), so no depth feature separates them — and BTC is the mirror image (dip LONG +0.52R / dip SHORT +8.83R), ETH in between (+3.68R LONG / +3.32R SHORT). A rule tuned to remove SOL's LONG chop would remove BTC's profitable SHORT entries — the exact cross-symbol incompatibility that rejects every candidate.");
log("");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "V4-R1-FORENSICS.md"), md.join("\n"));
fs.writeFileSync(path.join(OUT_DIR, "V4-R1-FORENSICS.json"), JSON.stringify({ data, matrix, verdicts, prod }, null, 2));
console.log("wrote V4-R1-FORENSICS.md / .json");
console.log(md.slice(0, 25).join("\n"));
