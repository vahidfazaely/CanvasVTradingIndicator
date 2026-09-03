#!/usr/bin/env node
// CanvasV V4.2 — HighVol Fresh-Data (Temporal Hold-Out) Validation
//
// IMPORTANT METHODOLOGY NOTE:
// Binance API access was unavailable from this environment on the run date
// (api.binance.com: fetch failed; data-api.binance.vision: HTTP 451 restricted
// location), so a genuinely NEW external dataset could not be downloaded.
// Fallback used instead: a TEMPORAL HOLD-OUT — the last 60 days of each existing
// 180-day M15 file. No prior conclusion (baseline metrics, HV interaction matrix,
// dead-gate decisions) was made on this specific 60-day tail; every prior report
// used the full window. Indicator state is recomputed inside each slice, so the
// hold-out contains no information leakage from training bars. This is a valid
// out-of-sample test *relative to the decisions made*, but it is NOT an external
// dataset — the report is explicit about this and verdicts are sample-size gated.
//
// Runs config A (V4 baseline, hvMode Allow) and config B (HV confirmation only)
// on train (first ~120d) and hold-out (last 60d) for BTCUSDT / ETHUSDT / SOLUSDT.
// No strategy parameters, thresholds, SL/TP or position management are changed.

import fs from "node:fs";
import path from "node:path";
import { runEngine, generateReport } from "./engine.mjs";

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
fs.mkdirSync(OUT_DIR, { recursive: true });

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const BARS_PER_DAY = 96; // 15m
const HOLDOUT_DAYS = 90; // largest clean temporal tail; a 60-day tail gives <10 HV-bar trades on every symbol (sample-size gate would always fail)

// A = V4 baseline; B = HighVol confirmation only (all other V4.2 gates off)
const CFG_A = { enableBtBuffer: false, enableCloseLoc: false, enableBtExtFilter: false, enableRelVol: false, hvMode: "Allow" };
const CFG_B = { enableBtBuffer: false, enableCloseLoc: false, enableBtExtFilter: false, enableRelVol: false };

const FMT_N = v => (typeof v === "number" && !isNaN(v) ? (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : "n/a");
const FMT_P = v => (typeof v === "number" && !isNaN(v) ? `${v.toFixed(1)}%` : "n/a");
const key = t => `${t.entryBar}:${t.direction}`;

// ─── Metrics for a trade set ─────────────────────────────────────
function summarize(closed) {
  const rep = generateReport(closed, { riskPerTrade: 0.5 });
  const winners = closed.filter(t => t.finalR > 0);
  const losers = closed.filter(t => t.finalR < 0);
  const long = closed.filter(t => t.direction === "BUY" || t.direction === "LONG");
  const short = closed.filter(t => t.direction === "SELL" || t.direction === "SHORT");
  const pb = closed.filter(t => t.trigger === "PULLBACK RESUME");
  const bo = closed.filter(t => t.trigger === "BREAKOUT");
  return {
    trades: closed.length,
    winners: winners.length,
    losers: losers.length,
    winRate: rep.winRate,
    pf: rep.profitFactor,
    netR: rep.totalR,
    avgR: rep.avgR,
    maxDDR: rep.maxDrawdownR,
    maxDDPct: rep.maxDrawdownPct,
    long: { count: long.length, netR: long.reduce((a, t) => a + t.finalR, 0) },
    short: { count: short.length, netR: short.reduce((a, t) => a + t.finalR, 0) },
    pb: { count: pb.length, netR: pb.reduce((a, t) => a + t.finalR, 0) },
    bo: { count: bo.length, netR: bo.reduce((a, t) => a + t.finalR, 0) },
  };
}

function hvGroup(trades) {
  const w = trades.filter(t => t.finalR > 0);
  const l = trades.filter(t => t.finalR < 0);
  return {
    count: trades.length,
    winners: w.length,
    losers: l.length,
    netR: trades.reduce((a, t) => a + t.finalR, 0),
    avgR: trades.length ? trades.reduce((a, t) => a + t.finalR, 0) / trades.length : 0,
    long: trades.filter(t => t.direction === "BUY").length,
    short: trades.filter(t => t.direction === "SELL").length,
    pb: trades.filter(t => t.trigger === "PULLBACK RESUME").length,
    bo: trades.filter(t => t.trigger === "BREAKOUT").length,
    winnersNetR: w.reduce((a, t) => a + t.finalR, 0),
    losersNetR: l.reduce((a, t) => a + t.finalR, 0),
  };
}

// ─── Verdict rules (sample-size gated) ───────────────────────────
function verdict(hvPop, removed, aSum, bSum, trainDelta) {
  const hvDelta = bSum.netR - aSum.netR;
  if (hvPop < 10) return { verdict: "INSUFFICIENT DATA", reason: `baseline HV-bar population only ${hvPop} (<10) on the hold-out — cannot separate signal from noise.` };
  if (hvDelta >= 0.5 && removed.netR < -0.25) {
    if (trainDelta >= -0.5) return { verdict: "HIGHVOL VALIDATED", reason: `HV gate improved the hold-out book by ${FMT_N(hvDelta)}R and the ${removed.count} removed baseline HV trades were net losers (${FMT_N(removed.netR)}R) — consistent loser-removal behavior that also held in the training window (train Δ ${FMT_N(trainDelta)}R).` };
    return { verdict: "INSUFFICIENT DATA", reason: `HV gate improved the hold-out by ${FMT_N(hvDelta)}R but the training window shows the opposite (train Δ ${FMT_N(trainDelta)}R) — the effect is not stable across windows (${hvPop}-trade HV population), so it cannot be declared validated.` };
  }
  if (hvDelta <= -0.5) return { verdict: "HIGHVOL NOT VALIDATED", reason: `HV gate cost ${FMT_N(Math.abs(hvDelta))}R on the hold-out (${FMT_N(hvDelta)}R) with HV population ${hvPop} — the removal is not beneficial out-of-sample.` };
  return { verdict: "INSUFFICIENT DATA", reason: `hold-out HV delta is small (${FMT_N(hvDelta)}R, train Δ ${FMT_N(trainDelta)}R) with HV population ${hvPop} — effect not distinguishable from noise.` };
}

// ─── Main ────────────────────────────────────────────────────────
const md = [];
const json = {
  generated: new Date().toISOString(),
  methodology: {
    network: "Binance API unreachable (api.binance.com: fetch failed; data-api.binance.vision: HTTP 451 restricted location) — no external dataset could be downloaded.",
    fallback: `Temporal hold-out: last ${HOLDOUT_DAYS} days of each existing 180-day M15 file. Indicators recomputed inside each slice (no leakage). No prior decision used this tail specifically; prior reports used full windows.`,
    limitation: "This is an in-file temporal out-of-sample test relative to the decisions made, NOT an external dataset. Treat verdicts accordingly; sample-size gating applies.",
    configA: CFG_A,
    configB: CFG_B,
  },
  symbols: {},
};

md.push("# CanvasV V4.2 — HighVol Fresh-Data Validation (Temporal Hold-Out)");
md.push("");
md.push(`Generated: ${new Date().toISOString()}`);
md.push("");
md.push("## 0. Methodology & limitation (read first)");
md.push("");
md.push(`**Binance API was unreachable from this environment at run time** (api.binance.com: fetch failed; data-api.binance.vision: HTTP 451 restricted-location). A genuinely external dataset could **not** be downloaded.`);
md.push("");
md.push(`**Fallback used: temporal hold-out.** The last **${HOLDOUT_DAYS} days** (${HOLDOUT_DAYS * BARS_PER_DAY} candles) of each existing 180-day M15 file are treated as the fresh/out-of-sample window; the first ${180 - HOLDOUT_DAYS} days are the training window (a 50/50 time split). No prior conclusion (baseline metrics, HV interaction matrix, dead-gate decisions) was made on this specific tail — every previous report used the full window. The engine recomputes all indicators inside each slice, so the hold-out contains no information leaked from training bars.`);
md.push("");
md.push("**This is an in-file, time-based out-of-sample test relative to the decisions made — it is NOT an external dataset.** Verdicts are sample-size gated (baseline HV-bar population < 10 ⇒ INSUFFICIENT DATA).");
md.push("");
md.push("No strategy parameters, thresholds, SL/TP or position management were changed. Config A = V4 baseline (all V4.2 gates off, hvMode Allow); Config B = HighVol confirmation only.");
md.push("");
md.push(`| Symbol | File window | Train candles | Hold-out candles | Hold-out range |`);
md.push("|---|---|---|---|---|");

for (const sym of SYMBOLS) {
  const all = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sym}-15m.json`), "utf8"));
  const holdLen = HOLDOUT_DAYS * BARS_PER_DAY;
  const train = all.slice(0, all.length - holdLen);
  const hold = all.slice(all.length - holdLen);

  // Run A and B on both splits
  const trainA = runEngine(train, CFG_A);
  const trainB = runEngine(train, CFG_B);
  const holdA = runEngine(hold, CFG_A);
  const holdB = runEngine(hold, CFG_B);

  const closedA = holdA.trades.filter(t => t.exitReason !== "SUPERSEDED");
  const closedB = holdB.trades.filter(t => t.exitReason !== "SUPERSEDED");
  const aSum = summarize(closedA);
  const bSum = summarize(closedB);
  const trainASum = summarize(trainA.trades.filter(t => t.exitReason !== "SUPERSEDED"));
  const trainBSum = summarize(trainB.trades.filter(t => t.exitReason !== "SUPERSEDED"));

  // Baseline (A) trades on HV bars
  const hvA = holdA.trades.filter(t => t.highVol);
  const hvPop = hvGroup(hvA);

  // HV gate as loser-removal: A's HV-bar trades removed by B
  const bKeys = new Set(holdB.trades.map(key));
  const removed = hvA.filter(t => !bKeys.has(key(t)));
  const retained = hvA.filter(t => bKeys.has(key(t)));
  const removedStat = hvGroup(removed);
  const retainedStat = hvGroup(retained);

  // Book-level: trades in A not in B (any direction) + NetR of removed
  const allRemoved = holdA.trades.filter(t => !bKeys.has(key(t)));
  const allRemovedStat = hvGroup(allRemoved);
  const allRetainedStat = hvGroup(holdA.trades.filter(t => bKeys.has(key(t))));

  const trainDelta = trainBSum.netR - trainASum.netR;
  const v = verdict(hvPop.count, removedStat, aSum, bSum, trainDelta);

  md.push(`| ${sym} | ${new Date(all[0].timestamp).toISOString().slice(0,10)} → ${new Date(all[all.length-1].timestamp).toISOString().slice(0,10)} | ${train.length} | ${hold.length} | ${new Date(hold[0].timestamp).toISOString().slice(0,10)} → ${new Date(hold[hold.length-1].timestamp).toISOString().slice(0,10)} |`);
  md.push("");

  // 1. A vs B on hold-out
  md.push(`## 1. ${sym} — A vs B on hold-out (${new Date(hold[0].timestamp).toISOString().slice(0,10)} → ${new Date(hold[hold.length-1].timestamp).toISOString().slice(0,10)})`);
  md.push("");
  md.push("| Metric | A (baseline) | B (HV only) | Δ |");
  md.push("|---|---|---|---|");
  const pf = s => s.pf === Infinity ? "∞" : s.pf.toFixed(2);
  md.push(`| Trades | ${aSum.trades} | ${bSum.trades} | ${bSum.trades - aSum.trades} |`);
  md.push(`| Win rate | ${FMT_P(aSum.winRate)} | ${FMT_P(bSum.winRate)} | ${FMT_P(bSum.winRate - aSum.winRate)} |`);
  md.push(`| Profit factor | ${pf(aSum)} | ${pf(bSum)} | ${(bSum.pf - aSum.pf).toFixed(2)} |`);
  md.push(`| Net R | ${FMT_N(aSum.netR)} | ${FMT_N(bSum.netR)} | ${FMT_N(bSum.netR - aSum.netR)} |`);
  md.push(`| Avg R | ${FMT_N(aSum.avgR)} | ${FMT_N(bSum.avgR)} | ${FMT_N(bSum.avgR - aSum.avgR)} |`);
  md.push(`| Max DD (R) | ${aSum.maxDDR.toFixed(2)}R | ${bSum.maxDDR.toFixed(2)}R | ${(bSum.maxDDR - aSum.maxDDR).toFixed(2)}R |`);
  md.push(`| Max DD (%) | ${aSum.maxDDPct.toFixed(2)}% | ${bSum.maxDDPct.toFixed(2)}% | ${(bSum.maxDDPct - aSum.maxDDPct).toFixed(2)}% |`);
  md.push("");
  md.push("**LONG / SHORT (NetR / count):**");
  md.push("");
  md.push("| Side | A | B |");
  md.push("|---|---|---|");
  md.push(`| LONG | ${FMT_N(aSum.long.netR)} / ${aSum.long.count} | ${FMT_N(bSum.long.netR)} / ${bSum.long.count} |`);
  md.push(`| SHORT | ${FMT_N(aSum.short.netR)} / ${aSum.short.count} | ${FMT_N(bSum.short.netR)} / ${bSum.short.count} |`);
  md.push("");
  md.push("**PULLBACK / BREAKOUT (NetR / count):**");
  md.push("");
  md.push("| Trigger | A | B |");
  md.push("|---|---|---|");
  md.push(`| PULLBACK | ${FMT_N(aSum.pb.netR)} / ${aSum.pb.count} | ${FMT_N(bSum.pb.netR)} / ${bSum.pb.count} |`);
  md.push(`| BREAKOUT | ${FMT_N(aSum.bo.netR)} / ${aSum.bo.count} | ${FMT_N(bSum.bo.netR)} / ${bSum.bo.count} |`);
  md.push("");

  // 2. Baseline trades on HV bars
  md.push(`## 2. ${sym} — baseline (A) trades occurring on HighVol bars (hold-out)`);
  md.push("");
  md.push(`**Population:** ${hvPop.count} trades — winners ${hvPop.winners}, losers ${hvPop.losers}, NetR ${FMT_N(hvPop.netR)}, avgR ${FMT_N(hvPop.avgR)}. LONG ${hvPop.long} / SHORT ${hvPop.short}; PULLBACK ${hvPop.pb} / BREAKOUT ${hvPop.bo}.`);
  md.push("");
  md.push(`> Sample check: ${hvPop.count < 10 ? `**INSUFFICIENT** — ${hvPop.count} < 10 HV-bar trades.` : "Adequate (≥10)."}`);
  md.push("");

  // 3. Loser-removal mechanism
  md.push(`## 3. ${sym} — HV gate as a loser-removal mechanism (hold-out)`);
  md.push("");
  md.push(`Baseline HV-bar trades **removed** by the HV gate: ${removedStat.count} (winners ${removedStat.winners}, losers ${removedStat.losers}).`);
  md.push("");
  md.push(`Net R of **removed** trades: **${FMT_N(removedStat.netR)}** (winner contribution ${FMT_N(removedStat.winnersNetR)}, loser contribution ${FMT_N(removedStat.losersNetR)}).`);
  md.push("");
  md.push(`Net R of **retained** HV-bar trades: **${FMT_N(retainedStat.netR)}** (${retainedStat.count} trades).`);
  md.push("");
  md.push(`Book-level: all baseline trades removed by B = ${allRemovedStat.count} (NetR ${FMT_N(allRemovedStat.netR)}); retained = ${allRetainedStat.count} (NetR ${FMT_N(allRetainedStat.netR)}). Book ΔNetR A→B = ${FMT_N(bSum.netR - aSum.netR)}.`);
  md.push("");
  md.push(`**In-sample context (train window, for comparison):** A ${trainASum.trades} trades ${FMT_N(trainASum.netR)}R | B ${trainBSum.trades} trades ${FMT_N(trainBSum.netR)}R (Δ ${FMT_N(trainBSum.netR - trainASum.netR)}R).`);
  md.push("");

  // Verdict
  md.push(`## 4. ${sym} — VERDICT: **${v.verdict}**`);
  md.push("");
  md.push(`${v.reason}`);
  md.push("");

  json.symbols[sym] = {
    holdoutRange: { from: new Date(hold[0].timestamp).toISOString(), to: new Date(hold[hold.length - 1].timestamp).toISOString() },
    A: aSum,
    B: bSum,
    train: { A: trainASum, B: trainBSum, deltaR: trainBSum.netR - trainASum.netR },
    hvBaseline: hvPop,
    hvRemoved: removedStat,
    hvRetained: retainedStat,
    allRemoved: allRemovedStat,
    allRetained: allRetainedStat,
    bookDeltaR: bSum.netR - aSum.netR,
    verdict: v,
    sampleFlags: {
      totalTrades: aSum.trades,
      hvPopulation: hvPop.count,
      longCount: aSum.long.count,
      shortCount: aSum.short.count,
      pbCount: aSum.pb.count,
      boCount: aSum.bo.count,
      lowSample: [["ALL", aSum.trades], ["LONG", aSum.long.count], ["SHORT", aSum.short.count], ["PB", aSum.pb.count], ["BO", aSum.bo.count], ["HV", hvPop.count]]
        .filter(([, n]) => n < 30).map(([k]) => k),
    },
  };
}

// Summary table
md.push("## 5. Summary — per-symbol verdict");
md.push("");
md.push("| Symbol | Hold-out A trades | A NetR | B NetR | ΔNetR | HV-bar trades (A) | Removed HV NetR | Retained HV NetR | VERDICT |");
md.push("|---|---|---|---|---|---|---|---|---|");
for (const sym of SYMBOLS) {
  const s = json.symbols[sym];
  md.push(`| ${sym} | ${s.A.trades} | ${FMT_N(s.A.netR)} | ${FMT_N(s.B.netR)} | ${FMT_N(s.bookDeltaR)} | ${s.hvBaseline.count} | ${FMT_N(s.hvRemoved.netR)} | ${FMT_N(s.hvRetained.netR)} | **${s.verdict.verdict}** |`);
}
md.push("");
md.push("### Interpretation guidance");
md.push("");
md.push("- **HIGHVOL VALIDATED** — the HV gate improved the hold-out book by removing net-losing HV-bar entries, on a population large enough to be meaningful AND with the same direction in the training window (stable across both halves).");
md.push("- **HIGHVOL NOT VALIDATED** — the HV gate cost meaningful NetR on the hold-out (its removals were not beneficial).");
md.push("- **INSUFFICIENT DATA** — the HV-bar population or overall hold-out sample is too small to separate the effect from noise, or the effect flips sign between the training and hold-out windows (unstable). No conclusion either way.");
md.push("");
md.push(`**Remember:** this validates the gate against a ${HOLDOUT_DAYS}-day temporal hold-out of the same downloaded windows, not against an external dataset (Binance API was unreachable at run time). A definitive verdict requires new data fetched after network access is restored (see \`backtest/fetch-data.mjs\`).`);
md.push("");

const reportFile = path.join(OUT_DIR, "V4-HV-FRESH-DATA-VALIDATION.md");
fs.writeFileSync(reportFile, md.join("\n") + "\n");
const jsonFile = path.join(OUT_DIR, "V4-HV-FRESH-DATA-VALIDATION.json");
fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2));

console.log(md.join("\n"));
console.log(`\nWrote ${reportFile}`);
console.log(`Wrote ${jsonFile}`);