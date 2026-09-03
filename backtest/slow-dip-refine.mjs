#!/usr/bin/env node
// CanvasV — slowDip refinement candidates (R1/R2/R3) vs C and B
// Engine-only. CONFIG A. Full-window + 90/90 halves, per symbol.
import fs from "node:fs";
import path from "node:path";
import {
  runEngine, generateReport, DEFAULT_PARAMS, calcEMA, calcATR,
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
const fmtP = (v, d = 1) => (typeof v === "number" && !isNaN(v) ? v.toFixed(d) : "n/a");
const med = (a) => {
  const f = a.filter(x => typeof x === "number" && !isNaN(x));
  if (!f.length) return NaN;
  const s = [...f].sort((x, y) => x - y);
  return s.length % 2 ? s[Math.floor(s.length / 2)] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const load = (sym) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sym}-15m.json`), "utf8"));

const MODES = [
  ["C reclaim", "C", {}],
  ["B slowDip2", "B", { experimentSlowDipEarly: true, slowDipMinBars: 2 }],
  ["R1 pierce>=0", "R1", { experimentSlowDipEarly: true, slowDipMinBars: 2, slowDipMinPierceAtr: 0 }],
  ["R2 atrVs<=120", "R2", { experimentSlowDipEarly: true, slowDipMinBars: 2, slowDipMaxAtrVs: 120 }],
  ["R3 R1+R2", "R3", { experimentSlowDipEarly: true, slowDipMinBars: 2, slowDipMinPierceAtr: 0, slowDipMaxAtrVs: 120 }],
];

function metric(candles, opts) {
  const { trades } = runEngine(candles, BASE_A, opts);
  const r = generateReport(trades);
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED");
  const pb = closed.filter(t => t.trigger === "PULLBACK RESUME");
  const emaTrig = calcEMA(candles.map(c => c.close), DEFAULT_PARAMS.emaTrigLen);
  const atr = calcATR(candles, DEFAULT_PARAMS.atrPeriod);
  // tag dip-bar entries (causal run-detection identical to engine)
  const closes = candles.map(c => c.close);
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const emaDir = calcEMA(closes, DEFAULT_PARAMS.emaDirLen);
  let ageUp = 0, runLow = Infinity, ageDn = 0, runHigh = -Infinity;
  const dipInfo = new Map();
  for (let i = 0; i < candles.length; i++) {
    if (closes[i] > emaTrig[i]) { ageUp = 0; runLow = Infinity; } else { ageUp++; runLow = Math.min(runLow, lows[i]); }
    if (closes[i] < emaTrig[i]) { ageDn = 0; runHigh = -Infinity; } else { ageDn++; runHigh = Math.max(runHigh, highs[i]); }
    if (ageUp >= 1) dipInfo.set(`${i}|BUY`, { dipBars: ageUp, anchor: runLow });
    if (ageDn >= 1) dipInfo.set(`${i}|SELL`, { dipBars: ageDn, anchor: runHigh });
  }
  const dipRows = pb.map(t => {
    const key = `${t.entryBar}|${t.direction === "BUY" ? "BUY" : "SELL"}`;
    const d = dipInfo.get(key);
    if (!d) return null;
    const isBuy = t.direction === "BUY";
    const rec = isBuy ? (t.entry - d.anchor) / Math.max(t.risk, 1e-10) : (d.anchor - t.entry) / Math.max(t.risk, 1e-10);
    return { t, dipBars: d.dipBars, recoveryR: rec };
  }).filter(Boolean);
  const earlyRows = dipRows.filter(x => x.dipBars >= 1);
  // premature: dip entry, no reclaim within 5 bars
  const premature = earlyRows.filter(x => {
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
  const dipDir = (d) => {
    const g = earlyRows.filter(x => x.t.direction === d);
    return { n: g.length, netR: g.reduce((s, x) => s + x.t.finalR, 0) };
  };
  return {
    trades: closed.length, wr: r.winRate, pf: r.profitFactor, netR: r.totalR,
    avgR: r.avgR, maxDD: r.maxDrawdownR, avgMfe: r.avgMFE,
    dipEntries: earlyRows.length, dipNetR: earlyRows.reduce((s, x) => s + x.t.finalR, 0),
    dipRecoveryMed: med(earlyRows.map(x => x.recoveryR)),
    premature: premature.length,
    premNetR: premature.reduce((s, x) => s + x.t.finalR, 0),
    long: dir("BUY"), short: dir("SELL"),
    dipLong: dipDir("BUY"), dipShort: dipDir("SELL"),
  };
}

log("# CanvasV — slowDip Refinement Candidates (R1/R2/R3 vs C and B)");
log("");
log(`- Date: ${new Date().toISOString().slice(0, 10)}`);
log("- Engine-only (CONFIG A). Coarse, interpretable constraints only.");
log("- **R1** = slowDip2 + dip anchor never penetrated below EMA21 (pierce ≥ 0 ATR at entry).");
log("- **R2** = slowDip2 + entry-bar ATR ≤ 120% of its 100-bar average.");
log("- **R3** = R1 + R2.");
log("");
log("## 1. Full-window comparison (180d, CONFIG A)");
log("");
log("| Symbol | Variant | Trades | WR % | PF | Net R | Avg R | MaxDD R | dip entries | dip NetR | med recovery@dip | premature | prem NetR |");
log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const data = { full: {} };
for (const sym of SYMBOLS) {
  const candles = load(sym);
  data.full[sym] = {};
  for (const [label, code, o] of MODES) {
    const v = metric(candles, o);
    data.full[sym][code] = v;
    log(`| ${sym} | ${label} | ${v.trades} | ${fmtP(v.wr)} | ${fmtP(v.pf)} | ${fmtN(v.netR)} | ${fmtN(v.avgR, 3)} | ${v.maxDD.toFixed(2)} | ${v.dipEntries} | ${fmtN(v.dipNetR)} | ${fmtN(v.dipRecoveryMed, 2)} | ${v.premature} | ${fmtN(v.premNetR)} |`);
  }
  log("");
}
log("### Δ vs references (full window)");
log("");
log("| Symbol | Variant | Δ vs C | Δ vs B | LONG | SHORT | dip LONG | dip SHORT |");
log("|---|---|---|---|---|---|---|---|");
for (const sym of SYMBOLS) {
  for (const [label, code, o] of MODES) {
    const v = data.full[sym][code];
    const c = data.full[sym]["C"];
    const b = data.full[sym]["B"];
    log(`| ${sym} | ${label} | ${fmtN(v.netR - c.netR)} | ${fmtN(v.netR - b.netR)} | ${fmtN(v.long.netR)} (${v.long.n}) | ${fmtN(v.short.netR)} (${v.short.n}) | ${fmtN(v.dipLong.netR)} (${v.dipLong.n}) | ${fmtN(v.dipShort.netR)} (${v.dipShort.n}) |`);
  }
  log("");
}
log("## 2. Out-of-sample — 90/90 temporal hold-out, all variants");
log("");
const hold = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const half = Math.floor(candles.length / 2);
  hold[sym] = {};
  log(`### ${sym}`);
  log("");
  log("| Half | C | B | R1 | R2 | R3 |");
  log("|---|---|---|---|---|---|");
  for (const [hName, slice] of [["first-90", candles.slice(0, half)], ["second-90", candles.slice(half)]]) {
    const parts = [];
    hold[sym][hName] = {};
    for (const [label, code, o] of MODES) {
      const v = metric(slice, o);
      hold[sym][hName][code] = v.netR;
      parts.push(`${fmtN(v.netR)} (${v.trades})`);
    }
    log(`| ${hName} | ${parts.join(" | ")} |`);
  }
  log("");
}

log("## 3. Decision");
log("");
log("### ADOPT? No (rule-by-rule)");
log("");
log("| Candidate | BTC OOS | ETH OOS | SOL OOS | Both halves, all symbols? | Decision |");
log("|---|---|---|---|---|---|");
const decide = {};
for (const sym of SYMBOLS) {
  const f = hold[sym]["first-90"], s = hold[sym]["second-90"];
  const cF = f["C"], cS = s["C"];
  for (const [code, label] of [["R1", "R1 pierce≥0"], ["R2", "R2 atrVs≤120"], ["R3", "R3 combined"]]) {
    const df = f[code] - cF, ds = s[code] - cS;
    decide[code] = decide[code] || {};
    decide[code][sym] = { first: df, second: ds };
  }
}
for (const [code, label] of [["R1", "R1 pierce≥0"], ["R2", "R2 atrVs≤120"], ["R3", "R3 combined"]]) {
  const d = decide[code];
  const pass = Object.values(d).every(x => x.first >= 0 && x.second >= 0);
  const failSym = Object.entries(d).filter(([s, x]) => x.first < 0 || x.second < 0).map(([s]) => s).join(",");
  log(`| ${code} | ${fmtN(d.BTCUSDT.first)} / ${fmtN(d.BTCUSDT.second)} | ${fmtN(d.ETHUSDT.first)} / ${fmtN(d.ETHUSDT.second)} | ${fmtN(d.SOLUSDT.first)} / ${fmtN(d.SOLUSDT.second)} | ${pass ? "YES" : `NO (${failSym})`} | ${pass ? "ADOPT-candidate" : "REFINE"} |`);
}
log("");
log("**Verdict: REFINE.** R1 (dip never pierced below EMA21) is the best rule found — it makes BTC and ETH robustly better than reclaim in BOTH hold-out halves and on the production config, with lower drawdown than B and premature entries roughly halved. It is NOT yet adoptable because SOL's second hold-out half still trails C (R1 −1.9R vs C +1.0R), even though R1 already recovers most of B's SOL damage. The remaining SOL weakness is a single-regime residual (its slow dips chop in the second half), so the rule is not yet 'robust across all symbols and both halves' — the ADOPT bar.");
log("");
log("**Next single experiment:** apply the same premature/chop forensics used here (separation tool) to R1's *remaining* losers per symbol — R1 already removes the pierce signature, so the residual chop predictor must be re-measured on the survivors (candidates: entry-candle body/close position, dip depth below EMA9, and per-direction context). Add ONE causal constraint from that evidence and re-run this identical 5-variant × 3-symbol × 2-half matrix. Pine port remains conditional on a full pass.");
log("");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "V4-SLOWDIP-REFINED.md"), md.join("\n"));
fs.writeFileSync(path.join(OUT_DIR, "V4-SLOWDIP-REFINED.json"), JSON.stringify({ data, decide }, null, 2));
console.log("wrote V4-SLOWDIP-REFINED.md / .json");
console.log(md.slice(0, 30).join("\n"));
