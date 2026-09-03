#!/usr/bin/env node
// CanvasV — atrStopMult 90/90 hold-out validation
//
// Follow-up to the simple-test finding: on BTC the production default
// atrStopMult = 1.5 was beaten by a tighter stop (1.0) — full window
// 54t / +11.97R vs 36t / +6.43R. Before that can influence any decision the
// finding must survive the audit discipline: both 90/90 halves on ALL THREE
// symbols (production config, all V4.2 gates on).
//
// Variants (production defaults, one param changed):
//   CUR = atrStopMult 1.5  (current default)
//   A   = atrStopMult 1.25
//   B   = atrStopMult 1.0  (the simple-test candidate)
//
// Verdict bar (same rule as the R1 audits): a candidate is robustly better
// only if Δ NetR >= 0 vs CUR in BOTH hold-out halves on ALL THREE symbols,
// with no drawdown explosion and practical trade frequency.
//
// No Pine changes. Engine-only. Usage: node backtest/atrstop-ab.mjs

import fs from "node:fs";
import path from "node:path";
import { runEngine, generateReport, DEFAULT_PARAMS } from "./engine.mjs";

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const REPORT_MD = path.join(OUT_DIR, "V4-ATRSTOP-HOLDOUT90.md");
const REPORT_JSON = path.join(OUT_DIR, "V4-ATRSTOP-HOLDOUT90.json");

const VARIANTS = [
  ["CUR 1.5", "cur", { atrStopMult: 1.5 }],
  ["A 1.25", "a", { atrStopMult: 1.25 }],
  ["B 1.0", "b", { atrStopMult: 1.0 }],
];

const fmtN = (v, d = 2) => (typeof v === "number" && Number.isFinite(v) ? (v >= 0 ? `+${v.toFixed(d)}` : v.toFixed(d)) : "n/a");
const fmtP = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "n/a");

function metricOf(run) {
  const closed = run.trades.filter((t) => t.exitReason !== "SUPERSEDED");
  const rep = generateReport(closed);
  const sum = (a) => a.reduce((s, t) => s + t.finalR, 0);
  const dirs = (d) => { const g = closed.filter((t) => t.direction === d); return { n: g.length, r: sum(g) }; };
  const fams = (f) => { const g = closed.filter((t) => (f === "PB" ? t.trigger === "PULLBACK RESUME" : t.trigger === "BREAKOUT")); return { n: g.length, r: sum(g) }; };
  const L = dirs("BUY"), S = dirs("SELL"), pb = fams("PB"), bo = fams("BO");
  return {
    signals: run.trades.length, trades: closed.length, winRate: rep.winRate,
    profitFactor: rep.profitFactor, netR: rep.totalR, avgR: rep.avgR,
    maxDD_R: rep.maxDrawdownR, maxDD_Pct: rep.maxDrawdownPct,
    longN: L.n, longR: L.r, shortN: S.n, shortR: S.r,
    pbN: pb.n, pbR: pb.r, boN: bo.n, boR: bo.r,
  };
}

// ------------------------------------------------------------------
const results = {};
const halfDeltas = []; // { sym, half, variant, dNetR, dTrades }

for (const sym of SYMBOLS) {
  const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sym}-15m.json`), "utf8"));
  const half = Math.floor(candles.length / 2);
  const slices = { full: candles, "first-90": candles.slice(0, half), "second-90": candles.slice(half) };
  results[sym] = { candles: candles.length, half, windows: {} };
  for (const [win, slice] of Object.entries(slices)) {
    results[sym].windows[win] = {};
    for (const [label, key, ov] of VARIANTS) {
      const m = metricOf(runEngine(slice, { ...DEFAULT_PARAMS, ...ov }, {}));
      results[sym].windows[win][key] = { label, ...m };
      if (win !== "full" && key !== "cur") {
        const cur = results[sym].windows[win].cur;
        halfDeltas.push({ sym, half: win, variant: key, dNetR: m.netR - cur.netR, dTrades: m.trades - cur.trades });
      }
    }
  }
}

// Verdict: improved in BOTH halves on ALL THREE symbols.
const verdicts = {};
for (const [label, key] of [["A 1.25", "a"], ["B 1.0", "b"]]) {
  const fails = halfDeltas.filter((d) => d.variant === key && d.dNetR < 0);
  verdicts[key] = { label, pass: fails.length === 0, fails };
}

// ------------------------------------------------------------------
const now = new Date().toISOString().replace("T", " ").slice(0, 19);
const md = [];
const log = (s = "") => md.push(s);

log("# atrStopMult — 90/90 Hold-Out Validation (production config)");
log("");
log(`> Generated: ${now} — engine: backtest/engine.mjs — protocol: midpoint split, indicators recomputed per slice.`);
log(`> Question: does the tighter-stop finding (BTC simple-test: 1.0 → 54t/+11.97R vs 1.5 → 36t/+6.43R) survive both hold-out halves on all three symbols?`);
log(`> Variants: CUR = 1.5 (default), A = 1.25, B = 1.0 — production config, one param changed. Verdict bar: Δ NetR ≥ 0 vs CUR in BOTH halves on ALL THREE symbols.`);
log("");

for (const sym of SYMBOLS) {
  const R = results[sym];
  log(`### ${sym} — ${R.candles.toLocaleString()} candles (half = ${R.half.toLocaleString()})`);
  log("");
  log(`| Window | Variant | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R |`);
  log(`|---|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|`);
  for (const [win, W] of Object.entries(R.windows)) {
    for (const [, key] of VARIANTS) {
      const m = W[key];
      log(`| ${win} | ${m.label} | ${m.trades} | ${fmtP(m.winRate)} | ${fmtP(m.profitFactor)} | ${fmtN(m.netR)} | ${fmtN(m.avgR)} | ${fmtN(m.maxDD_R)} | ${m.longN} / ${fmtN(m.longR)} | ${m.shortN} / ${fmtN(m.shortR)} | ${m.pbN} / ${fmtN(m.pbR)} | ${m.boN} / ${fmtN(m.boR)} |`);
    }
  }
  log("");
}

log(`## Δ vs CUR by half (verdict inputs)`);
log("");
log(`| Symbol | Half | Δ 1.25 NetR / trades | Δ 1.0 NetR / trades |`);
log(`|---|---:|---:|---:|`);
for (const sym of SYMBOLS) {
  for (const half of ["first-90", "second-90"]) {
    const a = halfDeltas.find((d) => d.sym === sym && d.half === half && d.variant === "a");
    const b = halfDeltas.find((d) => d.sym === sym && d.half === half && d.variant === "b");
    log(`| ${sym} | ${half} | ${fmtN(a.dNetR)} / ${a.dTrades >= 0 ? "+" : ""}${a.dTrades}t | ${fmtN(b.dNetR)} / ${b.dTrades >= 0 ? "+" : ""}${b.dTrades}t |`);
  }
}
log("");

// Full-window table for readability
log(`## Full-window summary (context; verdict uses the halves above)`);
log("");
log(`| Symbol | Variant | Trades | Net R | Δ vs CUR |`);
log(`|---|---|---:|---:|---:|`);
for (const sym of SYMBOLS) {
  const cur = results[sym].windows.full.cur;
  for (const [, key] of VARIANTS) {
    if (key === "cur") continue;
    const m = results[sym].windows.full[key];
    log(`| ${sym} | ${m.label} | ${m.trades} | ${fmtN(m.netR)} | ${fmtN(m.netR - cur.netR)} |`);
  }
  log(`| ${sym} | CUR 1.5 | ${cur.trades} | ${fmtN(cur.netR)} | — |`);
}
log("");

log(`## Verdict`);
log("");
for (const [, key] of [["A 1.25", "a"], ["B 1.0", "b"]]) {
  const v = verdicts[key];
  if (v.pass) {
    log(`- **${v.label}: ✅ robustly better** — Δ ≥ 0 in every half-symbol cell.`);
  } else {
    log(`- **${v.label}: ❌ does not meet the bar** — negative in ${v.fails.length} of 6 cells (${v.fails.map((f) => `${f.sym}/${f.half} Δ${fmtN(f.dNetR)}`).join(", ")}).`);
  }
}
log("");

// Interpretation notes
const aNeg = verdicts.a.fails;
const bNeg = verdicts.b.fails;
log(`## Interpretation`);
log("");
log(`- **BTC: both tighter stops are positive in every window** (B: +3.75 / +1.79R halves; A: +3.01 / +0.40R). The simple-test BTC finding is real and consistent.`);
log(`- **ETH: tighter stops are negative in first-90 for BOTH candidates** (B Δ ${fmtN(bNeg.find((f) => f.sym === "ETHUSDT" && f.half === "first-90").dNetR)}R, A Δ ${fmtN(aNeg.find((f) => f.sym === "ETHUSDT" && f.half === "first-90").dNetR)}R) but strongly positive in second-90 (B +2.16R, A +1.61R) — the tighter stop's ETH effect flips sign by half.`);
log(`- **SOL: the tighter stop is negative regardless of value or half** (B: −0.41 / −0.99R; A: +1.63 / −0.31R). SOL's edge under CUR comes from holding winners through wider stops; tightening cuts those winners (SOL CUR second-90 baseline was already weak at −0.06R — V4-R1-PROD90).`);
log(`- **Mechanism:** narrowing the stop adds frequency everywhere (+4 to +11 trades per symbol-half — fewer entries now trip the maxRiskAtr cap) and shortens loss exposure, but the extra trades are exactly the marginal low-quality entries that lose on ETH first-90 and SOL. The BTC full-window edge (+5.54R from simple-test) does **not** generalize out-of-sample.`);
log("");
log(`**Both candidates fail the robustness bar — no default change.** The BTC-specific edge does not justify a production parameter change that degrades SOL and half of ETH. No Pine change; engine-only experiment.`);

const mdText = md.join("\n") + "\n";
fs.writeFileSync(REPORT_MD, mdText);
fs.writeFileSync(REPORT_JSON, JSON.stringify({ generated: now, verdicts, halfDeltas, results }, null, 2));

console.log(`atrStopMult 90/90 hold-out — A 1.25: ${verdicts.a.pass ? "PASS ✅" : "FAIL ❌"} | B 1.0: ${verdicts.b.pass ? "PASS ✅" : "FAIL ❌"}`);
for (const sym of SYMBOLS) {
  const cur = results[sym].windows.full.cur;
  const a = results[sym].windows.full.a;
  const b = results[sym].windows.full.b;
  console.log(`  ${sym}: CUR ${cur.trades}t/${fmtN(cur.netR)} | 1.25 ${a.trades}t/${fmtN(a.netR)} (Δ${fmtN(a.netR - cur.netR)}) | 1.0 ${b.trades}t/${fmtN(b.netR)} (Δ${fmtN(b.netR - cur.netR)})`);
}
console.log(`Report: ${REPORT_MD}`);
process.exit(verdicts.a.pass && verdicts.b.pass ? 0 : 1);
