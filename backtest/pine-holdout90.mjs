#!/usr/bin/env node
// CanvasV V4.2 — Lite 90/90 Hold-Out Protocol Verification
//
// Confirms the Lite V4.2 port preserves the documented BTC/ETH/SOL baseline:
//
//   1. Parse the input declarations out of BOTH Pine files (FULL and LITE)
//      so the simulation is driven by what the scripts actually declare.
//   2. Run the engine (the pre-validated Pine mirror) with full-parsed params
//      and with lite-parsed params on each symbol over THREE windows:
//        full     — entire dataset
//        first-90 — candles[0 .. floor(len/2))   (indicators recomputed per slice)
//        second-90 — candles[floor(len/2) .. ]    (indicators recomputed per slice)
//      The midpoint split + per-slice recomputation is exactly the 90/90
//      protocol used by r1-forensics.mjs / slow-dip-refine.mjs.
//   3. For every window compare the FULL and LITE metric vector — any
//      divergence means the Lite port changed behavior.
//   4. On the full window, assert the LITE (= FULL) results reproduce the
//      documented V4.2 production baseline (CUR: BTC 36/+6.43R, ETH
//      39/+4.75R, SOL 29/+3.96R) within rounding tolerance.
//
// PASS = FULL ≡ LITE on all 3 windows of all 3 symbols AND the full-window
// run reproduces the documented baseline for every symbol.
//
// Usage: node backtest/pine-holdout90.mjs

import fs from "node:fs";
import path from "node:path";
import { runEngine, generateReport, DEFAULT_PARAMS } from "./engine.mjs";
import { parsePineInputs, sanityParse } from "./pine-parse.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const PINE_FULL = path.join(ROOT, "TradingView", "CanvasV_V4_FAST.pine");
const PINE_LITE = path.join(ROOT, "TradingView", "CanvasV_V4_FAST_lite.pine");
const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const REPORT_MD = path.join(OUT_DIR, "V4-LITE-HOLDOUT90.md");
const REPORT_JSON = path.join(OUT_DIR, "V4-LITE-HOLDOUT90.json");

// Documented V4.2 production (CUR) baselines — V4-R1-FORENSICS.md prod table
// and V4-SIGNAL-QUALITY-LATENCY-AUDIT.md (full window, closed trades, R).
const DOC_REF = {
  BTCUSDT: { trades: 36, winRate: 58.3, pf: 1.7, netR: 6.43, avgR: 0.179, maxDD: 1.52, longN: 22, longR: 7.86, shortN: 14, shortR: -1.43 },
  ETHUSDT: { trades: 39, winRate: 56.4, pf: 1.7, netR: 4.75, avgR: 0.122, maxDD: 2.09, longN: 23, longR: 3.76, shortN: 16, shortR: 0.98 },
  SOLUSDT: { trades: 29, winRate: 62.1, pf: 1.8, netR: 3.96, avgR: 0.137, maxDD: 2.07, longN: 12, longR: -1.15, shortN: 17, shortR: 5.11 },
};
// Rounding tolerance for each compared field (docs print 1–3 significant digits).
const TOL = {
  trades: 0, winRate: 0.1, pf: 0.1, netR: 0.01, avgR: 0.001, maxDD: 0.01,
  longN: 0, longR: 0.01, shortN: 0, shortR: 0.01,
};

//--------------------------------------------------------------
// Parse + overlay (identical overlay logic to pine-marker-parity.mjs)
//--------------------------------------------------------------
const fullParsed = parsePineInputs(PINE_FULL);
const liteParsed = parsePineInputs(PINE_LITE);
sanityParse(fullParsed, PINE_FULL);
sanityParse(liteParsed, PINE_LITE);

const SIGNAL_KEYS = Object.keys(DEFAULT_PARAMS).filter((k) => fullParsed[k] && liteParsed[k]);
const paramsFull = { ...DEFAULT_PARAMS };
const paramsLite = { ...DEFAULT_PARAMS };
for (const k of SIGNAL_KEYS) {
  paramsFull[k] = fullParsed[k].value;
  paramsLite[k] = liteParsed[k].value;
}

//--------------------------------------------------------------
// Metrics (mirrors prodMetric semantics in r1-forensics.mjs:
// closed = trades excluding SUPERSEDED)
//--------------------------------------------------------------
function metricOf(run) {
  const closed = run.trades.filter((t) => t.exitReason !== "SUPERSEDED");
  const rep = generateReport(closed);
  const sum = (arr) => arr.reduce((s, t) => s + t.finalR, 0);
  const dirs = (d) => {
    const g = closed.filter((t) => t.direction === d);
    return { n: g.length, netR: sum(g) };
  };
  const fams = (f) => {
    const g = closed.filter((t) => (f === "PULLBACK" ? t.trigger === "PULLBACK RESUME" : t.trigger === "BREAKOUT"));
    return { n: g.length, netR: sum(g) };
  };
  const L = dirs("BUY"), S = dirs("SELL");
  const pb = fams("PULLBACK"), bo = fams("BREAKOUT");
  return {
    signals: run.trades.length,
    trades: closed.length,
    superseded: run.trades.length - closed.length,
    winRate: rep.winRate,
    profitFactor: rep.profitFactor,
    netR: rep.totalR,
    avgR: rep.avgR,
    maxDD_R: rep.maxDrawdownR,
    maxDD_Pct: rep.maxDrawdownPct,
    longN: L.n, longR: L.netR, shortN: S.n, shortR: S.netR,
    pbN: pb.n, pbR: pb.netR, boN: bo.n, boR: bo.netR,
  };
}

const COMPARE_FIELDS = [
  "signals", "trades", "superseded", "winRate", "profitFactor", "netR", "avgR",
  "maxDD_R", "maxDD_Pct", "longN", "longR", "shortN", "shortR", "pbN", "pbR", "boN", "boR",
];

function fieldDiffs(a, b) {
  const d = [];
  for (const f of COMPARE_FIELDS) {
    const av = a[f], bv = b[f];
    const eq = (av === bv) || (typeof av === "number" && typeof bv === "number" && Math.abs(av - bv) < 1e-9);
    if (!eq) d.push(`${f}: F=${fmtN(av)} L=${fmtN(bv)}`);
  }
  return d;
}

const fmtN = (v, d = 2) => (typeof v === "number" && Number.isFinite(v) ? (v >= 0 ? `+${v.toFixed(d)}` : v.toFixed(d)) : (v === Infinity ? "∞" : "n/a"));
const fmtP = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "n/a");
const fmtV = (v, d) => (typeof v === "number" && Number.isFinite(v) ? (d === 0 ? String(v) : v.toFixed(d)) : "n/a");

//--------------------------------------------------------------
// Run all symbols × windows
//--------------------------------------------------------------
const results = {};   // sym -> { candles, half, windows: { name: {F, L} } }
const allDiffs = [];  // { sym, window, diffs[] }
const baselineFails = []; // { sym, field, got, want }

for (const sym of SYMBOLS) {
  const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sym}-15m.json`), "utf8"));
  const half = Math.floor(candles.length / 2);
  const slices = {
    "full": candles,
    "first-90": candles.slice(0, half),
    "second-90": candles.slice(half),
  };
  results[sym] = { candles: candles.length, half, windows: {} };
  for (const [win, slice] of Object.entries(slices)) {
    const rF = runEngine(slice, paramsFull, {});
    const rL = runEngine(slice, paramsLite, {});
    const mF = metricOf(rF);
    const mL = metricOf(rL);
    const diffs = fieldDiffs(mF, mL);
    results[sym].windows[win] = { full: mF, lite: mL, diffs };
    if (diffs.length) allDiffs.push({ sym, win, diffs });
  }

  // Baseline check on the FULL window only (docs report full-window numbers).
  // DOC_REF keys differ from metric keys for two fields (pf / maxDD) — map them
  // so every row is a REAL comparison; a missing/non-finite value is a FAIL, not a pass.
  const KEYMAP = { pf: "profitFactor", maxDD: "maxDD_R" };
  const m = results[sym].windows["full"].full;
  const ref = DOC_REF[sym];
  for (const f of Object.keys(ref)) {
    const got = m[KEYMAP[f] || f];
    const want = ref[f];
    if (!(typeof got === "number" && Number.isFinite(got)) || Math.abs(got - want) > TOL[f]) {
      baselineFails.push({ sym, field: f, got: typeof got === "number" ? got : null, want });
    }
  }
}

const pass = allDiffs.length === 0 && baselineFails.length === 0;
const now = new Date().toISOString().replace("T", " ").slice(0, 19);

//--------------------------------------------------------------
// Report
//--------------------------------------------------------------
const md = [];
const log = (s = "") => md.push(s);

log(`# V4.2 Lite — 90/90 Hold-Out Protocol Verification`);
log(``);
log(`> Generated: ${now} — engine: backtest/engine.mjs (pre-validated Pine mirror) — protocol: r1-forensics 90/90 midpoint split, indicators recomputed per slice.`);
log(`> Builds compared: FULL Pine (CanvasV_V4_FAST.pine) vs LITE Pine (CanvasV_V4_FAST_lite.pine), ${SIGNAL_KEYS.length} parsed signal-affecting inputs each (identical overlay).`);
log(``);
log(`## Verdict: ${pass ? "✅ PASS" : "❌ FAIL"}`);
log(``);
if (pass) {
  log(`- **FULL ≡ LITE** on all 3 windows (full / first-90 / second-90) of all 3 symbols — ${COMPARE_FIELDS.length} metrics per window, zero divergence.`);
  log(`- **Full-window baselines reproduce the documented V4.2 production (CUR) results** for BTC, ETH and SOL within rounding tolerance.`);
} else {
  if (allDiffs.length) log(`- **${allDiffs.length} FULL-vs-LITE divergence(s):** ${allDiffs.map((d) => `${d.sym}/${d.win}: ${d.diffs.join("; ")}`).join(" | ")}`);
  if (baselineFails.length) log(`- **${baselineFails.length} baseline mismatch(es):** ${baselineFails.map((b) => `${b.sym} ${b.field}: got ${fmtN(b.got, 4)} want ${fmtN(b.want, 4)}`).join(" | ")}`);
}
log(``);

for (const sym of SYMBOLS) {
  const R = results[sym];
  const ref = DOC_REF[sym];
  const KEYMAP = { pf: "profitFactor", maxDD: "maxDD_R" };
  log(`### ${sym} — ${R.candles.toLocaleString()} candles (half = ${R.half.toLocaleString()})`);
  log(``);
  log(`#### Full window vs documented V4.2 production baseline (CUR)`);
  log(``);
  log(`| Field | Documented | Lite (= FULL) | Status |`);
  log(`|---|---|---|---|`);
  // [refKey, label, decimals]
  const blFields = [
    ["trades", "Trades", 0], ["winRate", "Win rate %", 1], ["pf", "PF", 1],
    ["netR", "Net R", 2], ["avgR", "Avg R", 3], ["maxDD", "Max DD (R)", 2],
    ["longN", "LONG n", 0], ["longR", "LONG netR", 2], ["shortN", "SHORT n", 0], ["shortR", "SHORT netR", 2],
  ];
  for (const [f, label, dec] of blFields) {
    const got = R.windows["full"].full[KEYMAP[f] || f];
    const ok = Number.isFinite(got) && Math.abs(got - ref[f]) <= TOL[f];
    log(`| ${label} | ${fmtV(ref[f], dec)} | ${fmtV(got, dec)} | ${ok ? "✅" : "❌"} |`);
  }
  log(``);
  log(`#### 90/90 hold-out — FULL vs LITE per window`);
  log(``);
  log(`| Window | Candles | Signals | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R | F≡L |`);
  log(`|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---|---|`);
  for (const [win, W] of Object.entries(R.windows)) {
    const m = W.lite; // equal to W.full (verified) — show lite values
    const candlesN = win === "full" ? R.candles : (win === "first-90" ? R.half : R.candles - R.half);
    log(`| ${win} | ${candlesN.toLocaleString()} | ${m.signals} | ${m.trades} | ${fmtP(m.winRate)} | ${fmtP(m.profitFactor)} | ${fmtN(m.netR)} | ${fmtN(m.avgR)} | ${fmtN(m.maxDD_R)} | ${m.longN} / ${fmtN(m.longR)} | ${m.shortN} / ${fmtN(m.shortR)} | ${m.pbN} / ${fmtN(m.pbR)} | ${m.boN} / ${fmtN(m.boR)} | ${W.diffs.length === 0 ? "✅" : `❌ ${W.diffs.length}`} |`);
  }
  log(``);
}

log(`## Fields compared per window (FULL vs LITE)`);
log(``);
log(`\`${COMPARE_FIELDS.join(", ")}\``);
log(``);
if (allDiffs.length === 0) {
  log(`Zero FULL-vs-LITE divergences across all ${SYMBOLS.length} symbols × 3 windows. The Lite port is behaviorally identical to the full build under the hold-out protocol.`);
} else {
  log(`Divergences found — see verdict header.`);
}
log(``);
log(`## Baseline reference`);
log(``);
log(`Documented V4.2 production (CUR) baselines reproduced on the full window: **BTC 36 trades / +6.43R**, **ETH 39 trades / +4.75R**, **SOL 29 trades / +3.96R** (V4-R1-FORENSICS.md prod table, V4-SIGNAL-QUALITY-LATENCY-AUDIT.md).`);
log(`First-90 / second-90 per-half results above are the new Lite hold-out reference (not previously documented for the CUR config).`);

const mdText = md.join("\n") + "\n";
fs.writeFileSync(REPORT_MD, mdText);
fs.writeFileSync(REPORT_JSON, JSON.stringify({ verdict: pass ? "PASS" : "FAIL", generated: now, results, baselineFails }, null, 2));

console.log(`Lite 90/90 hold-out: ${pass ? "PASS ✅" : "FAIL ❌"}`);
for (const sym of SYMBOLS) {
  const R = results[sym];
  const line = R.windows["full"].lite;
  const h1 = R.windows["first-90"].lite;
  const h2 = R.windows["second-90"].lite;
  console.log(`  ${sym}: full ${line.trades}t/${fmtN(line.netR)}  first-90 ${h1.trades}t/${fmtN(h1.netR)}  second-90 ${h2.trades}t/${fmtN(h2.netR)}`);
}
console.log(`Report: ${REPORT_MD}`);
process.exit(pass ? 0 : 1);
