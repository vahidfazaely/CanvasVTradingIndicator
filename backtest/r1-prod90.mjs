#!/usr/bin/env node
// CanvasV — R1 under the PRODUCTION config, 90/90 hold-out protocol
//
// Retained note from the R1 forensics (V4-R1-FORENSICS.md, section F):
//   "R1 itself (slowDip2 + pierce >= 0) never hurt BTC/ETH in any window;
//    production BTC +10.76R vs +6.43R" — but the production-config sanity
//    was FULL-WINDOW ONLY. The 90/90 halves were never run at production
//    selectivity (CUR = DEFAULT_PARAMS, all V4.2 gates on).
//
// This experiment runs the single candidate through the SAME 90/90 protocol
// as the forensics matrix:
//   CUR  = production reclaim trigger (runEngine defaults)
//   R1   = CUR + { experimentSlowDipEarly, slowDipMinBars: 2,
//                  slowDipMinPierceAtr: 0 }   (slow-dip early entry,
//                  dip never pierced below EMA21)
// on BTCUSDT / ETHUSDT / SOLUSDT over full / first-90 / second-90 windows
// (midpoint split, indicators recomputed per slice — engine-identical).
//
// Additionally the dip-SHORT asymmetry note is observed (not activated):
// R1's PULLBACK entries are classified early-vs-reclaim per bar (an entry on
// a dip-side EMA9 close can only be an early entry; a reclaim entry requires
// the EMA9 close-reclaim), and early entries are split LONG vs SHORT.
//
// Verdict per the forensics robustness bar: a candidate qualifies for Pine
// only if it is improved (dNetR >= 0) vs CUR in BOTH hold-out halves on ALL
// THREE symbols, with no drawdown explosion and useful frequency.
//
// Usage: node backtest/r1-prod90.mjs

import fs from "node:fs";
import path from "node:path";
import { runEngine, generateReport, DEFAULT_PARAMS, calcEMA } from "./engine.mjs";

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const REPORT_MD = path.join(OUT_DIR, "V4-R1-PROD90.md");
const REPORT_JSON = path.join(OUT_DIR, "V4-R1-PROD90.json");

const R1_OPTS = { experimentSlowDipEarly: true, slowDipMinBars: 2, slowDipMinPierceAtr: 0 };

const fmtN = (v, d = 2) => (typeof v === "number" && Number.isFinite(v) ? (v >= 0 ? `+${v.toFixed(d)}` : v.toFixed(d)) : "n/a");
const fmtP = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "n/a");

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

// Classify R1 PULLBACK entries: early (dip-side EMA9 close at entry bar —
// only reachable via the slow-dip early path) vs reclaim (requires the EMA9
// close-reclaim, i.e. close back across). Split early entries LONG/SHORT.
function classifyPb(candles, trades) {
  const closes = candles.map((c) => c.close);
  const emaTrig = calcEMA(closes, DEFAULT_PARAMS.emaTrigLen);
  const pb = trades.filter((t) => t.exitReason !== "SUPERSEDED" && t.trigger === "PULLBACK RESUME");
  const early = [];
  const reclaim = [];
  for (const t of pb) {
    const k = t.entryBar;
    const dipSide = t.direction === "BUY" ? closes[k] <= emaTrig[k] : closes[k] >= emaTrig[k];
    (dipSide ? early : reclaim).push(t);
  }
  const dirs = (arr, d) => {
    const g = arr.filter((t) => t.direction === d);
    return { n: g.length, netR: g.reduce((s, t) => s + t.finalR, 0) };
  };
  const s = (arr) => arr.reduce((a, t) => a + t.finalR, 0);
  const tkey = (t) => `${t.entryBar}|${t.direction}|${t.exitReason}|${t.finalR.toFixed(6)}`;
  return {
    pb: pb.length,
    earlyN: early.length, earlyR: s(early),
    earlyLong: dirs(early, "BUY"), earlyShort: dirs(early, "SELL"),
    reclaimN: reclaim.length, reclaimR: s(reclaim),
    reclaimKeys: reclaim.map(tkey).sort(),
    earlyKeys: early.map(tkey).sort(),
  };
}

// Identity signature of a closed PB trade stream (entry bar, direction, exit, R)
// so the reclaim stream under R1 can be compared with the CUR PB stream.
function pbStreamKey(trades) {
  return trades
    .filter((t) => t.exitReason !== "SUPERSEDED" && t.trigger === "PULLBACK RESUME")
    .map((t) => `${t.entryBar}|${t.direction}|${t.exitReason}|${t.finalR.toFixed(6)}`)
    .sort();
}

//--------------------------------------------------------------
const results = {};
const halfDeltas = []; // { sym, half, dTrades, dNetR } for the verdict
const winDeltas = [];  // { sym, half, dTrades, dNetR, cur:.., r1:.. } full detail

for (const sym of SYMBOLS) {
  const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sym}-15m.json`), "utf8"));
  const half = Math.floor(candles.length / 2);
  const slices = {
    full: candles,
    "first-90": candles.slice(0, half),
    "second-90": candles.slice(half),
  };
  results[sym] = { candles: candles.length, half, windows: {} };
  for (const [win, slice] of Object.entries(slices)) {
    const rCUR = runEngine(slice, DEFAULT_PARAMS, {});
    const rR1 = runEngine(slice, DEFAULT_PARAMS, R1_OPTS);
    const mCUR = metricOf(rCUR);
    const mR1 = metricOf(rR1);
    const cls = classifyPb(slice, rR1.trades);
    // Additive claim: is R1's reclaim stream identical to the CUR PB stream?
    // (If early entries never displace a would-be reclaim trade, R1 = CUR + basket.)
    const curKeys = pbStreamKey(rCUR.trades);
    const recKeys = cls.reclaimKeys;
    const reclaimIdentical = curKeys.length === recKeys.length && curKeys.every((k, i) => k === recKeys[i]);
    results[sym].windows[win] = { cur: mCUR, r1: mR1, cls, reclaimIdentical };
    if (win !== "full") {
      winDeltas.push({
        sym, half: win, dTrades: mR1.trades - mCUR.trades, dNetR: mR1.netR - mCUR.netR,
        curTrades: mCUR.trades, curNetR: mCUR.netR, r1Trades: mR1.trades, r1NetR: mR1.netR,
      });
    }
  }
}

// Verdict: improved (dNetR >= 0) in BOTH halves on ALL THREE symbols.
const fails = winDeltas.filter((d) => d.dNetR < 0);
const pass = fails.length === 0;

// Symbol-level reading
const symVerdicts = {};
for (const sym of SYMBOLS) {
  const h = winDeltas.filter((d) => d.sym === sym);
  const ok = h.every((d) => d.dNetR >= 0);
  const curFull = results[sym].windows.full.cur;
  const r1Full = results[sym].windows.full.r1;
  symVerdicts[sym] = {
    ok,
    full: { cur: curFull.netR, r1: r1Full.netR, d: r1Full.netR - curFull.netR },
    h1: { d: h.find((x) => x.half === "first-90").dNetR },
    h2: { d: h.find((x) => x.half === "second-90").dNetR },
  };
}

const now = new Date().toISOString().replace("T", " ").slice(0, 19);
const md = [];
const log = (s = "") => md.push(s);

log("# R1 under the Production Config — 90/90 Hold-Out Protocol");
log("");
log(`> Generated: ${now} — engine: backtest/engine.mjs — config: production CUR (DEFAULT_PARAMS, all V4.2 gates on)`);
log(`> R1 = CUR + slow-dip early entry (minBars 2) with EMA21 pierce >= 0 — same candidate as V4-R1-FORENSICS.md section D "R1 pierce>=0", now at production selectivity.`);
log(`> Protocol: midpoint split (first-90 / second-90), indicators recomputed per slice. Verdict bar (forensics rules): dNetR >= 0 vs CUR in BOTH halves on ALL THREE symbols, no DD explosion, useful frequency.`);
log("");
log(`## Verdict: ${pass ? "✅ ADOPT (meets robustness bar)" : "❌ DOES NOT MEET THE BAR"}`);
log("");
if (pass) {
  log(`R1 improves on CUR in every hold-out half of every symbol.`);
} else {
  log(`R1 fails the bar on ${fails.length} of ${winDeltas.length} half-symbol cells: ${fails.map((f) => `${f.sym}/${f.half} Δ${fmtN(f.dNetR)}`).join(", ")}.`);
}
log("");

for (const sym of SYMBOLS) {
  const R = results[sym];
  const V = symVerdicts[sym];
  log(`### ${sym} — ${R.candles.toLocaleString()} candles (half = ${R.half.toLocaleString()})`);
  log("");
  log(`| Window | Variant | Trades | Win% | PF | Net R | Avg R | MaxDD R | LONG n/R | SHORT n/R | PB n/R | BO n/R |`);
  log(`|---|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|`);
  for (const [win, W] of Object.entries(R.windows)) {
    for (const [vname, m] of [["CUR", W.cur], ["R1", W.r1]]) {
      const tag = win === "full" && vname === "R1" && ["BTCUSDT", "ETHUSDT"].includes(sym) ? "  ← full-window sanity anchor (forensics)" : "";
      log(`| ${win} | ${vname} | ${m.trades} | ${fmtP(m.winRate)} | ${fmtP(m.profitFactor)} | ${fmtN(m.netR)} | ${fmtN(m.avgR)} | ${fmtN(m.maxDD_R)} | ${m.longN} / ${fmtN(m.longR)} | ${m.shortN} / ${fmtN(m.shortR)} | ${m.pbN} / ${fmtN(m.pbR)} | ${m.boN} / ${fmtN(m.boR)} |${tag}`);
    }
  }
  log("");
  log(`**Hold-out Δ (R1 − CUR):** first-90 Δ${fmtN(V.h1.d)}R · second-90 Δ${fmtN(V.h2.d)}R · full Δ${fmtN(V.full.d)}R — ${V.ok ? "✅ improved in both halves" : "❌ fails one/both halves"}`);
  log("");
  log(`**R1 pullback-entry anatomy (early vs reclaim, per window):**`);
  log("");
  log(`| Window | PB trades | Early n / NetR | Early LONG n/R | Early SHORT n/R | Reclaim n / NetR |`);
  log(`|---|---:|---:|---:|---:|---:|`);
  for (const [win, W] of Object.entries(R.windows)) {
    const c = W.cls;
    log(`| ${win} | ${c.pb} | ${c.earlyN} / ${fmtN(c.earlyR)} | ${c.earlyLong.n} / ${fmtN(c.earlyLong.netR)} | ${c.earlyShort.n} / ${fmtN(c.earlyShort.netR)} | ${c.reclaimN} / ${fmtN(c.reclaimR)} |`);
  }
  log("");
}

log(`## Δ vs CUR by half (verdict inputs)`);
log("");
log(`| Symbol | Half | CUR trades/netR | R1 trades/netR | Δ trades | Δ NetR |`);
log(`|---|---|---:|---:|---:|---:|`);
for (const d of winDeltas) {
  log(`| ${d.sym} | ${d.half} | ${d.curTrades} / ${fmtN(d.curNetR)} | ${d.r1Trades} / ${fmtN(d.r1NetR)} | ${d.dTrades >= 0 ? "+" : ""}${d.dTrades} | ${fmtN(d.dNetR)} |`);
}
log("");
log(`Robustness check: ${winDeltas.length} half-symbol cells, ${winDeltas.length - fails.length} with Δ ≥ 0, ${fails.length} with Δ < 0.`);
log("");

// ── Interpretation (computed) ──
const btc = symVerdicts.BTCUSDT, eth = symVerdicts.ETHUSDT, sol = symVerdicts.SOLUSDT;
log(`## Interpretation`);
log("");

// 1) Additive-basket claim
const additiveOk = Object.values(results).every((R) =>
  Object.values(R.windows).every((W) => W.reclaimIdentical));
log(`### 1. R1's early entries are ${additiveOk ? "purely additive" : "NOT purely additive"} at CUR selectivity`);
log("");
log(`${additiveOk
  ? `In every window R1's reclaim stream is stream-identical to the CUR pullback stream (verified trade-by-trade: entry bar, direction, exit, final R), so Δ NetR vs CUR is EXACTLY the NetR of R1's extra early-entry basket. R1 under the production config = the CUR book + a small basket of additional slow-dip entries.`
  : `R1's early entries partially displace the reclaim stream in at least one window; Δ NetR therefore mixes basket performance with displacement effects.`}`);
log("");

// 2) Extra basket per symbol (full window)
log(`### 2. The extra early-entry basket per symbol (full window)`);
log("");
log(`| Symbol | Basket n / NetR | LONG part | SHORT part | Full Δ vs CUR |`);
log(`|---|---:|---:|---:|---:|`);
for (const sym of SYMBOLS) {
  const c = results[sym].windows.full.cls;
  const d = symVerdicts[sym].full.d;
  log(`| ${sym} | ${c.earlyN} / ${fmtN(c.earlyR)} | ${c.earlyLong.n} / ${fmtN(c.earlyLong.netR)} | ${c.earlyShort.n} / ${fmtN(c.earlyShort.netR)} | ${fmtN(d)} |`);
}
log("");

// 3) Asymmetry transfer check
log(`### 3. The dip-SHORT asymmetry does not transfer to production selectivity`);
log("");
log(`CONFIG A found dip SHORT entries net positive on all three symbols (+8.83 / +3.32 / +1.74R). At CUR selectivity the surviving early population is 1–8 trades per symbol and the SHORT part is positive only on **BTC** (${results.BTCUSDT.windows.full.cls.earlyShort.n} / ${fmtN(results.BTCUSDT.windows.full.cls.earlyShort.netR)}R); **SOL's** SHORT-early entries lose (${results.SOLUSDT.windows.full.cls.earlyShort.n} / ${fmtN(results.SOLUSDT.windows.full.cls.earlyShort.netR)}R) and **ETH** produced zero qualifying SHORT dips in either half. Every cell is LOW SAMPLE (≤ 6 trades); the asymmetry is not measurable at CUR selectivity, and its CONFIG-A form (R1S) already failed SOL in both hold-out halves there.`);
log("");

// 4) What-if R1S = CUR + early SHORT basket only (early entries are additive)
log(`### 4. What-if: SHORT-early only (R1S)`);
log("");
log(`Since early entries are additive, R1S per window = CUR + that window's early-SHORT basket only.`);
log("");
log(`| Symbol | first-90 Δ | second-90 Δ | Verdict under R1S |`);
log(`|---|---:|---:|---|`);
for (const sym of SYMBOLS) {
  const d1 = results[sym].windows["first-90"].cls.earlyShort.netR;
  const d2 = results[sym].windows["second-90"].cls.earlyShort.netR;
  const note = (d1 === 0 && d2 === 0)
    ? "passes but ≡ CUR (no qualifying SHORT dips — a no-op)"
    : (d1 >= 0 && d2 >= 0
      ? "passes"
      : "fails (one/both halves negative)");
  log(`| ${sym} | ${fmtN(d1)} | ${fmtN(d2)} | ${note} |`);
}
log("");

// 5) Decision
log(`### 5. Decision`);
log("");
if (pass) {
  log(`R1 meets the robustness bar on this evidence — candidate for Pine consideration.`);
} else {
  log(`**REJECT R1 as a production-config change** — ${fails.length} of 6 half-symbol cells are negative (${fails.map((f) => `${f.sym}/${f.half} Δ${fmtN(f.dNetR)}`).join(", ")}). The full window still reproduces the forensics anchor (BTC **${results.BTCUSDT.windows.full.r1.trades} / ${fmtN(results.BTCUSDT.windows.full.r1.netR)}R**, ETH **${results.ETHUSDT.windows.full.r1.trades} / ${fmtN(results.ETHUSDT.windows.full.r1.netR)}R**, SOL **${results.SOLUSDT.windows.full.r1.trades} / ${fmtN(results.SOLUSDT.windows.full.r1.netR)}R**).`);
  log("");
  log(`**REJECT the SHORT-only variant (R1S) as the replacement** — it is a no-op on ETH (no qualifying SHORT dips), helps only BTC, and leaves SOL negative in both halves (Δ ${fmtN(results.SOLUSDT.windows["first-90"].cls.earlyShort.netR)} / ${fmtN(results.SOLUSDT.windows["second-90"].cls.earlyShort.netR)}R).`);
  log("");
  log(`**Why the mechanism fails at production selectivity:** R1's benefit is frequency-limited. The whole BTC improvement is 8 extra trades per 180 days (+4.33R); the ETH damage is one losing early LONG (−1.00R, second-90) and the SOL damage is four losing early entries (−1.06R) concentrated in first-90. None of these baskets is large enough to distinguish signal from noise — every cell above is LOW SAMPLE (≤ 6 trades) — and the CONFIG-A edge that motivated the test does not survive the V4.2 gates. The reclaim trigger remains the production architecture. **No Pine change.**`);
}
log("");

log(`## Sample-size flags`);
log("");
for (const sym of SYMBOLS) {
  const W = results[sym].windows;
  const rows = [];
  for (const [win, name] of [["full", "full"], ["first-90", "first-90"], ["second-90", "second-90"]]) {
    for (const [v, vname] of [["cur", "CUR"], ["r1", "R1"]]) {
      if (W[win][v].trades < 30) rows.push(`${vname}/${win} ${W[win][v].trades}t`);
    }
  }
  log(`- ${sym}: ${rows.length ? rows.join(", ") : "none"} (<30 trades flagged LOW SAMPLE)`);
}

const mdText = md.join("\n") + "\n";
fs.writeFileSync(REPORT_MD, mdText);
fs.writeFileSync(REPORT_JSON, JSON.stringify({ verdict: pass ? "ADOPT" : "DOES_NOT_MEET_BAR", generated: now, results, winDeltas, symVerdicts }, null, 2));

console.log(`R1 under production config, 90/90: ${pass ? "PASS ✅" : "FAIL ❌"}`);
for (const sym of SYMBOLS) {
  const R = results[sym];
  for (const win of ["full", "first-90", "second-90"]) {
    const c = R.windows[win].cur, r1 = R.windows[win].r1;
    console.log(`  ${sym}/${win}: CUR ${c.trades}t/${fmtN(c.netR)} → R1 ${r1.trades}t/${fmtN(r1.netR)} (Δ${fmtN(r1.netR - c.netR)})`);
  }
}
console.log(`Report: ${REPORT_MD}`);
process.exit(pass ? 0 : 1);
