#!/usr/bin/env node
// CanvasV — What separates BTC's good slow dips from SOL's bad ones?
// Engine-only. Collects every dip-bar entry created by slowDip2 (CONFIG A),
// attaches causal entry-bar features, and compares winner/loser distributions
// BTC vs ETH vs SOL to find cross-symbol separators.
import fs from "node:fs";
import path from "node:path";
import {
  runEngine, DEFAULT_PARAMS,
  calcEMA, calcSMA, calcATR,
} from "./engine.mjs";

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const BASE_A = {
  enableFixedRisk: false, enableBtBuffer: false, enableCloseLoc: false,
  enableBtExtFilter: false, enableRelVol: false, hvMode: "Allow",
};
const md = [];
const log = (s = "") => { md.push(s); };
const fmtN = (v, d = 2) => (typeof v === "number" && !isNaN(v) ? (v >= 0 ? `+${v.toFixed(d)}` : v.toFixed(d)) : "n/a");
const fmtP = (v, d = 0) => (typeof v === "number" && !isNaN(v) ? v.toFixed(d) : "n/a");
const med = (a) => {
  const f = a.filter(x => typeof x === "number" && !isNaN(x));
  if (!f.length) return NaN;
  const s = [...f].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const load = (sym) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sym}-15m.json`), "utf8"));

// Causal dip-run tracking identical to the engine's slowDip mode
function inds(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const emaTrig = calcEMA(closes, DEFAULT_PARAMS.emaTrigLen);
  const emaDir = calcEMA(closes, DEFAULT_PARAMS.emaDirLen);
  const emaSlow = calcEMA(closes, DEFAULT_PARAMS.emaSlowLen);
  const atr = calcATR(candles, DEFAULT_PARAMS.atrPeriod);
  const atrAvg = calcSMA(atr, DEFAULT_PARAMS.atrRegimeLen);
  const volMA = calcSMA(candles.map(c => c.volume || 0), DEFAULT_PARAMS.volLookback);
  return { closes, highs, lows, emaTrig, emaDir, emaSlow, atr, atrAvg, volMA };
}

function featureAt(candles, I, eb, dir, dipBars, runMin, runMax) {
  const c = candles[eb];
  const atrV = I.atr[eb];
  const isBuy = dir === "BUY";
  const ema21 = I.emaDir[eb];
  const ema9 = I.emaTrig[eb];
  const anchor = isBuy ? runMin : runMax;
  return {
    eb, dir,
    dipBars,
    pierceAtr: isBuy ? (anchor - ema21) / atrV : (ema21 - anchor) / atrV,   // <0 = pierced EMA21
    distFromAnchor: isBuy ? (c.close - runMin) / atrV : (runMax - c.close) / atrV,
    extAtr: isBuy ? (c.close - ema21) / atrV : (ema21 - c.close) / atrV,
    sepDirAtr: (isBuy ? ema9 - ema21 : ema21 - ema9) / atrV,                // stack separation, trade direction signed
    below9Atr: (isBuy ? ema9 - c.close : c.close - ema9) / atrV,           // distance below EMA9 (dip side)
    slope9Atr: eb >= 3 ? (ema9 - I.emaTrig[eb - 3]) / atrV : NaN,
    slope21Atr: eb >= 3 ? (ema21 - I.emaDir[eb - 3]) / atrV : NaN,
    atrVsAvgPct: (atrV / Math.max(I.atrAvg[eb], 1e-10)) * 100,
    relVol: I.volMA[eb] > 0 ? (c.volume || 0) / I.volMA[eb] : NaN,
    bodyPct: (c.high - c.low) > 0 ? Math.abs(c.close - c.open) / (c.high - c.low) * 100 : 0,
    closeLoc: (c.high - c.low) > 0 ? (c.close - c.low) / (c.high - c.low) : 0.5,
    rangeAtr: (c.high - c.low) / atrV,
    candleUp: c.close >= c.open,
  };
}

function collect(sym) {
  const candles = load(sym);
  const I = inds(candles);
  const { trades } = runEngine(candles, BASE_A, { experimentSlowDipEarly: true, slowDipMinBars: 2 });
  const tol = DEFAULT_PARAMS.pullbackTolPct / 100.0;
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED" && t.trigger === "PULLBACK RESUME");
  // Track dip runs over the whole series (engine-identical) to recover anchor min/max per dip bar
  const dips = new Map(); // bar -> {dir, runMinLow?, runMaxHigh?, dipBars, touched}
  let ageUp = 0, runLow = Infinity, ageDn = 0, runHigh = -Infinity;
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const closes = candles.map(c => c.close);
  // rolling 5-low/high with [1] shift (touch semantics)
  const pb5low = []; const pb5high = [];
  for (let i = 0; i < candles.length; i++) {
    pb5low.push(i < 1 ? NaN : Math.min(...lows.slice(Math.max(0, i - 5), i)));
    pb5high.push(i < 1 ? NaN : Math.max(...highs.slice(Math.max(0, i - 5), i)));
  }
  for (let i = 0; i < candles.length; i++) {
    if (closes[i] > I.emaTrig[i]) { ageUp = 0; runLow = Infinity; } else { ageUp++; runLow = Math.min(runLow, lows[i]); }
    if (closes[i] < I.emaTrig[i]) { ageDn = 0; runHigh = -Infinity; } else { ageDn++; runHigh = Math.max(runHigh, highs[i]); }
    if (ageUp >= 1) {
      const touched = !isNaN(pb5low[i - 1]) && pb5low[i - 1] <= I.emaDir[i] * (1 + tol);
      if (touched) dips.set(`${i}|BUY`, { dir: "BUY", dipBars: ageUp, runMin: runLow });
    }
    if (ageDn >= 1) {
      const touched = !isNaN(pb5high[i - 1]) && pb5high[i - 1] >= I.emaDir[i] * (1 - tol);
      if (touched) dips.set(`${i}|SELL`, { dir: "SELL", dipBars: ageDn, runMax: runHigh });
    }
  }
  const rows = [];
  for (const t of closed) {
    const key = `${t.entryBar}|${t.direction === "BUY" ? "BUY" : "SELL"}`;
    const d = dips.get(key);
    if (!d) continue; // reclaim-bar entries (not dip-bar entries)
    const feat = featureAt(candles, I, t.entryBar, d.dir, d.dipBars, d.runMin, d.runMax);
    rows.push({ t, feat });
  }
  return { candles, I, rows };
}

log("# CanvasV — Slow-Dip Entry Separation: BTC vs ETH vs SOL");
log("");
log(`- Date: ${new Date().toISOString().slice(0, 10)}`);
log("- Population: every **dip-bar entry** created by `slowDip2` (early entries only — reclaim-bar entries excluded), CONFIG A, 180d per symbol.");
log("- All features are causal (data ≤ entry bar). Coarse buckets only; no threshold search.");
log("");
const data = {};
for (const sym of SYMBOLS) {
  const { candles, I, rows } = collect(sym);
  data[sym] = rows.map(r => ({ dir: r.feat.dir, finalR: r.t.finalR, mfe: r.t.mfe,
    exitReason: r.t.exitReason, ...r.feat }));
  const win = rows.filter(r => r.t.finalR > 0);
  const lose = rows.filter(r => r.t.finalR < 0);
  const netR = rows.reduce((s, r) => s + r.t.finalR, 0);
  log(`## ${sym} — ${rows.length} dip-bar entries, ${win.length}W / ${lose.length}L, NetR ${fmtN(netR)}`);
  log("");
  log("| Feature | med WIN | med LOSS | notes |");
  log("|---|---|---|---|");
  const feats = [
    ["pierceAtr", "EMA21 penetration (ATR; <0 = pierced below)"],
    ["dipBars", "dip-run bars at entry"],
    ["atrVsAvgPct", "ATR vs 100-bar avg (%)"],
    ["relVol", "relative volume"],
    ["sepDirAtr", "EMA9-EMA21 separation (dir-signed ATR)"],
    ["below9Atr", "distance below EMA9 (ATR)"],
    ["slope9Atr", "EMA9 slope (ATR/3b)"],
    ["slope21Atr", "EMA21 slope (ATR/3b)"],
    ["extAtr", "close vs EMA21 (ATR)"],
    ["bodyPct", "body %"],
    ["rangeAtr", "range (ATR)"],
  ];
  for (const [k, label] of feats) {
    const wv = win.map(r => r.feat[k]);
    const lv = lose.map(r => r.feat[k]);
    const mw = med(wv), ml = med(lv);
    const note = Math.abs(mw - ml) > 0.15 || k === "dipBars" || k === "atrVsAvgPct" ? (Math.abs(mw - ml) > 0.3 ? "distinct" : "hint") : "";
    log(`| ${label} | ${fmtN(mw, 2)} | ${fmtN(ml, 2)} | ${note} |`);
  }
  log("");
  log("Pierce buckets (EMA21 penetration, ATR):");
  log("");
  log("| Bucket | n | W | L | NetR |");
  log("|---|---|---|---|---|");
  const buckets = [["deep pierce ≤ −0.75", r => r.feat.pierceAtr <= -0.75],
                   ["moderate (−0.75, −0.25]", r => r.feat.pierceAtr > -0.75 && r.feat.pierceAtr <= -0.25],
                   ["shallow (−0.25, 0.25]", r => r.feat.pierceAtr > -0.25 && r.feat.pierceAtr <= 0.25],
                   ["held above > 0.25", r => r.feat.pierceAtr > 0.25]];
  for (const [label, f] of buckets) {
    const g = rows.filter(f);
    if (!g.length) { log(`| ${label} | 0 | — | — | — |`); continue; }
    const w = g.filter(r => r.t.finalR > 0).length;
    log(`| ${label} | ${g.length} | ${w} | ${g.length - w} | ${fmtN(g.reduce((s, r) => s + r.t.finalR, 0))} |`);
  }
  log("");
  log("Volatility buckets (ATR vs 100-bar avg):");
  log("");
  log("| Bucket | n | W | L | NetR |");
  log("|---|---|---|---|---|");
  for (const [label, f] of [["compressed < 80%", r => r.feat.atrVsAvgPct < 80],
                            ["normal 80–120%", r => r.feat.atrVsAvgPct >= 80 && r.feat.atrVsAvgPct <= 120],
                            ["elevated > 120%", r => r.feat.atrVsAvgPct > 120]]) {
    const g = rows.filter(f);
    if (!g.length) { log(`| ${label} | 0 | — | — | — |`); continue; }
    const w = g.filter(r => r.t.finalR > 0).length;
    log(`| ${label} | ${g.length} | ${w} | ${g.length - w} | ${fmtN(g.reduce((s, r) => s + r.t.finalR, 0))} |`);
  }
  log("");
  log("Direction split:");
  log("");
  for (const d of ["BUY", "SELL"]) {
    const g = rows.filter(r => r.feat.dir === d);
    if (!g.length) { log(`- ${d}: 0 entries`); continue; }
    const w = g.filter(r => r.t.finalR > 0).length;
    log(`- ${d === "BUY" ? "LONG" : "SHORT"}: ${g.length} entries, ${w}W/${g.length - w}L, NetR ${fmtN(g.reduce((s, r) => s + r.t.finalR, 0))}, med pierce ${fmtN(med(g.map(r => r.feat.pierceAtr)), 2)}, med atrVsAvg ${fmtN(med(g.map(r => r.feat.atrVsAvgPct)), 0)}%`);
  }
  log("");
  // outcome mix: premature (never reclaimed within 5 bars)
  const end = candles.length;
  const prem = rows.filter(r => {
    const dir = r.feat.dir;
    for (let k = r.feat.eb + 1; k <= Math.min(r.feat.eb + 5, end - 1); k++) {
      if (dir === "BUY" && candles[k].close > I.emaTrig[k]) return false;
      if (dir === "SELL" && candles[k].close < I.emaTrig[k]) return false;
    }
    return true;
  });
  const premW = prem.filter(r => r.t.finalR > 0).length;
  log(`- Premature (no reclaim within 5 bars): ${prem.length} (${premW}W / ${prem.length - premW}L), NetR ${fmtN(prem.reduce((s, r) => s + r.t.finalR, 0))}`);
  log("");
  // Causal predictors of prematurity: premature vs reclaimed dip entries
  const reclaim = rows.filter(r => !prem.includes(r));
  log("Predictors of prematurity (chop): median feature by eventual outcome — premature (no EMA9 reclaim within 5 bars) vs reclaimed");
  log("");
  log("| Feature | med PREMATURE | med RECLAIMED |");
  log("|---|---|---|");
  for (const [k, label] of feats) {
    const mp = med(prem.map(r => r.feat[k]));
    const mr = med(reclaim.map(r => r.feat[k]));
    log(`| ${label} | ${fmtN(mp, 2)} | ${fmtN(mr, 2)} |`);
  }
  log("");
  log("Entry-candle direction (candle closes toward the trade side?):");
  log("");
  log("| Candle | premature n | premature NetR | reclaimed n | reclaimed NetR |");
  log("|---|---|---|---|---|");
  for (const [label, f] of [["adv-candle", r => r.feat.dir === "BUY" ? r.feat.candleUp : !r.feat.candleUp],
                            ["counter-candle", r => r.feat.dir === "BUY" ? !r.feat.candleUp : r.feat.candleUp]]) {
    const gP = prem.filter(f), gR = reclaim.filter(f);
    const rsum = (g) => g.reduce((s, r) => s + r.t.finalR, 0);
    log(`| ${label} | ${gP.length} | ${fmtN(rsum(gP))} | ${gR.length} | ${fmtN(rsum(gR))} |`);
  }
  log("");
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const mdPath = path.join(OUT_DIR, "V4-SLOWDIP-SEPARATION.md");
fs.writeFileSync(mdPath, md.join("\n"));
fs.writeFileSync(path.join(OUT_DIR, "V4-SLOWDIP-SEPARATION.json"), JSON.stringify({ data }, null, 2));
console.log("wrote V4-SLOWDIP-SEPARATION.md / .json");
console.log(md.slice(0, 20).join("\n"));
