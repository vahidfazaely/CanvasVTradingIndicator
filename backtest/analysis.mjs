#!/usr/bin/env node
// CanvasV V4 FAST — Failure Decomposition & Parameter Sensitivity Analysis
// All 13 phases in one script. Read-only on production Pine.
// Usage: node analysis.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runEngine, analyzeSLFailures, generateReport, DEFAULT_PARAMS } from "./engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Load data ───────────────────────────────────────────────────
const dataPath = path.join(__dirname, "engine/data/BTCUSDT-15m.json");
const candles = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
console.log(`Loaded ${candles.length} candles: ${new Date(candles[0].timestamp).toISOString().slice(0,10)} to ${new Date(candles[candles.length-1].timestamp).toISOString().slice(0,10)}`);

// ─── Helper: run engine + analyze ────────────────────────────────
function runWithParams(params) {
  const result = runEngine(candles, params);
  const analyzed = analyzeSLFailures(result.trades, candles, 20);
  const report = generateReport(result.trades);
  return { signals: result.signals, trades: result.trades, analyzed, report };
}

// ─── Phase 1: Freeze Baseline ────────────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 1: BASELINE");
console.log("=".repeat(70));
const baseline = runWithParams(DEFAULT_PARAMS);
const B = baseline.report;
console.log(`Total signals: ${B.totalSignals}`);
console.log(`Total trades: ${B.totalTrades}`);
console.log(`BUY trades: ${B.buyTrades} | SELL trades: ${B.sellTrades}`);
console.log(`Winners: ${B.winners} | Losers: ${B.losers}`);
console.log(`Win rate: ${B.winRate.toFixed(1)}%`);
console.log(`Profit factor: ${B.profitFactor.toFixed(2)}`);
console.log(`Net R: ${B.totalR.toFixed(2)}R`);
console.log(`Avg R: ${B.avgR.toFixed(3)}R`);
console.log(`Avg winner: ${B.avgWinner.toFixed(3)}R | Avg loser: ${B.avgLoser.toFixed(3)}R`);
console.log(`Max drawdown: ${B.maxDrawdownR.toFixed(2)}R`);
console.log(`SL hit: ${B.slHitPct.toFixed(1)}% (${B.slTrades}) | TP hit: ${B.tpHitPct.toFixed(1)}% (${B.tpTrades}) | Expired: ${B.expiredTrades} | Superseded: ${B.supersededTrades}`);
console.log(`Avg MFE: ${B.avgMFE.toFixed(3)}R | Avg MAE: ${B.avgMAE.toFixed(3)}R`);
console.log(`Avg holding: ${B.avgHoldingBars.toFixed(1)} bars`);

// ─── Phase 2: Failure Decomposition ──────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 2: FAILURE DECOMPOSITION");
console.log("=".repeat(70));

const closed = baseline.analyzed.filter(t => t.exitReason !== "SUPERSEDED");
const winners = closed.filter(t => t.finalR > 0);
const losers = closed.filter(t => t.finalR < 0);

console.log("\n--- By Exit Reason ---");
const byExit = {};
for (const t of closed) {
  if (!byExit[t.exitReason]) byExit[t.exitReason] = { count: 0, totalR: 0, mfeSum: 0, maeSum: 0, ages: [] };
  byExit[t.exitReason].count++;
  byExit[t.exitReason].totalR += t.finalR;
  byExit[t.exitReason].mfeSum += t.mfe;
  byExit[t.exitReason].maeSum += t.mae;
  byExit[t.exitReason].ages.push(t.age);
}
for (const [reason, d] of Object.entries(byExit).sort((a,b) => b[1].count - a[1].count)) {
  const avgR = (d.totalR / d.count).toFixed(3);
  const avgMFE = (d.mfeSum / d.count).toFixed(3);
  const avgMAE = (d.maeSum / d.count).toFixed(3);
  const avgAge = (d.ages.reduce((s,v)=>s+v,0)/d.ages.length).toFixed(1);
  console.log(`  ${reason}: ${d.count} trades, ${d.totalR.toFixed(2)}R total, avg ${avgR}R, MFE ${avgMFE}, MAE ${avgMAE}, ${avgAge} bars`);
}

console.log("\n--- SL Failure Classification (post-SL analysis) ---");
const slTrades = closed.filter(t => t.exitReason === "SL FIRST");
const byClass = {};
for (const t of slTrades) {
  const cls = t.slFailure?.classification || "UNKNOWN";
  if (!byClass[cls]) byClass[cls] = { count: 0, postMFEs: [], mfeSum: 0, maeSum: 0, extSum: 0 };
  byClass[cls].count++;
  byClass[cls].mfeSum += t.mfe;
  byClass[cls].maeSum += t.mae;
  byClass[cls].extSum += t.extAtr;
  if (t.slFailure) byClass[cls].postMFEs.push(t.slFailure.postMFE);
}
for (const [cls, d] of Object.entries(byClass).sort((a,b) => b[1].count - a[1].count)) {
  const avgPost = d.postMFEs.length > 0 ? (d.postMFEs.reduce((s,v)=>s+v,0)/d.postMFEs.length).toFixed(3) : "N/A";
  const avgMFE = (d.mfeSum/d.count).toFixed(3);
  const avgMAE = (d.maeSum/d.count).toFixed(3);
  const avgExt = (d.extSum/d.count).toFixed(3);
  console.log(`  ${cls}: ${d.count} trades, avg post-SL MFE ${avgPost}R, in-trade MFE ${avgMFE}, MAE ${avgMAE}, ext ${avgExt} ATR`);
}

console.log("\n--- Winner Characteristics ---");
const wByTrigger = {};
for (const t of winners) {
  const key = `${t.direction}/${t.trigger}`;
  if (!wByTrigger[key]) wByTrigger[key] = { count: 0, totalR: 0, mfeSum: 0 };
  wByTrigger[key].count++;
  wByTrigger[key].totalR += t.finalR;
  wByTrigger[key].mfeSum += t.mfe;
}
for (const [k, d] of Object.entries(wByTrigger).sort((a,b) => b[1].count - a[1].count)) {
  console.log(`  ${k}: ${d.count} trades, ${(d.totalR/d.count).toFixed(3)}R avg, MFE ${(d.mfeSum/d.count).toFixed(3)}`);
}

console.log("\n--- Loser Characteristics ---");
const lByTrigger = {};
for (const t of losers) {
  const key = `${t.direction}/${t.trigger}`;
  if (!lByTrigger[key]) lByTrigger[key] = { count: 0, totalR: 0, maeSum: 0, extSum: 0 };
  lByTrigger[key].count++;
  lByTrigger[key].totalR += t.finalR;
  lByTrigger[key].maeSum += t.mae;
  lByTrigger[key].extSum += t.extAtr;
}
for (const [k, d] of Object.entries(lByTrigger).sort((a,b) => b[1].count - a[1].count)) {
  console.log(`  ${k}: ${d.count} trades, ${(d.totalR/d.count).toFixed(3)}R avg, MAE ${(d.maeSum/d.count).toFixed(3)}, ext ${(d.extSum/d.count).toFixed(3)} ATR`);
}

// ─── Phase 3: Hypothetical Wider Stops ───────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 3: HYPOTHETICAL WIDER STOP ANALYSIS");
console.log("=".repeat(70));

const slOnly = baseline.trades.filter(t => t.exitReason === "SL FIRST");
const multipliers = [0.75, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 2.0];

for (const mult of multipliers) {
  let savedCount = 0;
  let reachTP = 0;
  let stillLose = 0;
  let savedR = 0;
  let savedTrades = [];

  for (const t of slOnly) {
    const origSL = t.sl;
    const origEntry = t.entry;
    const origRisk = t.risk;
    const direction = t.direction;
    const newRisk = origRisk * mult;
    const newSL = direction === "BUY"
      ? origEntry - newRisk
      : origEntry + newRisk;

    // Check if the new SL would have survived the bar that killed the original SL
    const exitBar = t.exitBar;
    const exitCandle = candles[exitBar];

    // Would the new SL have been hit on the exit bar?
    const slHitNew = direction === "BUY"
      ? exitCandle.low <= newSL
      : exitCandle.high >= newSL;

    if (!slHitNew) {
      savedCount++;
      savedTrades.push(t);
      // Track forward to find actual outcome with wider SL
      let bestR = -Infinity;
      let worstR = Infinity;
      let hitTP = false;
      for (let j = exitBar + 1; j < Math.min(exitBar + 25, candles.length); j++) {
        const cc = candles[j];
        const r = direction === "BUY"
          ? (cc.close - origEntry) / Math.max(newRisk, 1e-10)
          : (origEntry - cc.close) / Math.max(newRisk, 1e-10);
        bestR = Math.max(bestR, r);
        worstR = Math.min(worstR, r);
        const tpHit = direction === "BUY" ? cc.high >= origEntry + newRisk * DEFAULT_PARAMS.tp2R : cc.low <= origEntry - newRisk * DEFAULT_PARAMS.tp2R;
        const slHitLater = direction === "BUY" ? cc.low <= newSL : cc.high >= newSL;
        if (tpHit) { hitTP = true; break; }
        if (slHitLater) { break; }
      }
      if (hitTP) {
        reachTP++;
        savedR += 2.5; // tp2R
      } else {
        savedR += Math.max(bestR, -1.0);
        stillLose++;
      }
    }
  }

  const totalSavedR = savedR;
  const winRate = savedCount > 0 ? (reachTP / savedCount * 100) : 0;
  console.log(`  ${mult.toFixed(2)}x SL: saved ${savedCount}/${slOnly.length} trades (${(savedCount/slOnly.length*100).toFixed(1)}%), TP reach ${reachTP}, still-lose ${stillLose}, saved R ${totalSavedR.toFixed(2)}R, win rate ${winRate.toFixed(1)}%`);
}

// ─── Phase 4: Risk Parameter Sensitivity ─────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 4: RISK PARAMETER SENSITIVITY");
console.log("=".repeat(70));

function runParamSweep(paramName, values, label) {
  console.log(`\n--- ${label} ---`);
  const baselineVal = DEFAULT_PARAMS[paramName];
  console.log(`  Baseline: ${paramName} = ${baselineVal}`);
  for (const val of values) {
    const p = { ...DEFAULT_PARAMS, [paramName]: val };
    const r = runWithParams(p);
    const R = r.report;
    const changed = val !== baselineVal ? " *" : "";
    console.log(`  ${paramName}=${val.toFixed(2)}: signals=${R.totalSignals} win=${R.winRate.toFixed(1)}% PF=${R.profitFactor.toFixed(2)} net=${R.totalR.toFixed(2)}R avg=${R.avgR.toFixed(3)}R DD=${R.maxDrawdownR.toFixed(2)}R SL=${R.slHitPct.toFixed(1)}%${changed}`);
  }
}

runParamSweep("structBufferAtr", [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0], "Struct Buffer ATR");
runParamSweep("atrFallbackMult", [1.0, 1.25, 1.5, 2.0, 2.5, 3.0], "ATR Fallback Multiplier");
runParamSweep("maxExtAtr", [1.5, 2.0, 2.5, 3.0, 3.5, 4.0], "Max Extension ATR");
runParamSweep("maxRiskAtr", [1.5, 2.0, 2.5, 3.0, 3.5, 4.0], "Max Risk ATR");
runParamSweep("minRiskAtr", [0.3, 0.5, 0.75, 1.0, 1.5], "Min Risk ATR");

// ─── Phase 5: Entry Timing Analysis ──────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 5: ENTRY TIMING ANALYSIS");
console.log("=".repeat(70));

const slTradesAnalyzed = closed.filter(t => t.exitReason === "SL FIRST");
const winningTrades = closed.filter(t => t.finalR > 0);

console.log("\n--- Extension distribution (all SL trades vs winners) ---");
function histogram(values, buckets) {
  const counts = new Array(buckets.length - 1).fill(0);
  for (const v of values) {
    for (let i = 0; i < buckets.length - 1; i++) {
      if (v >= buckets[i] && v < buckets[i + 1]) { counts[i]++; break; }
    }
  }
  return counts;
}

const extBuckets = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 5.0];
const slExts = slTradesAnalyzed.map(t => t.extAtr);
const wExts = winningTrades.map(t => t.extAtr);
const slExtHist = histogram(slExts, extBuckets);
const wExtHist = histogram(wExts, extBuckets);
console.log("  Ext ATR range | SL trades | Winners");
for (let i = 0; i < extBuckets.length - 1; i++) {
  console.log(`  ${extBuckets[i].toFixed(1)}-${extBuckets[i+1].toFixed(1)}       | ${String(slExtHist[i]).padStart(9)} | ${String(wExtHist[i]).padStart(7)}`);
}

console.log("\n--- MFE before SL (LATE_ENTRY threshold analysis) ---");
const mfeBuckets = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 2.0, 5.0];
const slMFEs = slTradesAnalyzed.map(t => t.mfe);
const slMFEHist = histogram(slMFEs, mfeBuckets);
console.log("  MFE range | Count");
for (let i = 0; i < mfeBuckets.length - 1; i++) {
  console.log(`  ${mfeBuckets[i].toFixed(2)}-${mfeBuckets[i+1].toFixed(2)}   | ${slMFEHist[i]}`);
}

console.log("\n--- Body % distribution (SL vs winners) ---");
const bodyBuckets = [0, 20, 40, 60, 80, 100];
const slBodies = slTradesAnalyzed.map(t => t.bodyPct);
const wBodies = winningTrades.map(t => t.bodyPct);
const slBodyHist = histogram(slBodies, bodyBuckets);
const wBodyHist = histogram(wBodies, bodyBuckets);
console.log("  Body %  | SL trades | Winners");
for (let i = 0; i < bodyBuckets.length - 1; i++) {
  console.log(`  ${String(bodyBuckets[i]).padStart(2)}-${String(bodyBuckets[i+1]).padStart(3)}  | ${String(slBodyHist[i]).padStart(9)} | ${String(wBodyHist[i]).padStart(7)}`);
}

// ─── Phase 6: Trigger Comparison ─────────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 6: TRIGGER COMPARISON");
console.log("=".repeat(70));

function analyzeSubset(label, subset) {
  if (subset.length === 0) { console.log(`  ${label}: 0 trades`); return; }
  const w = subset.filter(t => t.finalR > 0);
  const l = subset.filter(t => t.finalR < 0);
  const sl = subset.filter(t => t.exitReason === "SL FIRST");
  const tp = subset.filter(t => t.exitReason.includes("TP"));
  const totalR = subset.reduce((s,t) => s + t.finalR, 0);
  const avgR = totalR / subset.length;
  const avgMFE = subset.reduce((s,t) => s + t.mfe, 0) / subset.length;
  const avgMAE = subset.reduce((s,t) => s + t.mae, 0) / subset.length;
  const wr = w.length / subset.length * 100;
  const slPct = sl.length / subset.length * 100;
  const pf = l.length > 0 ? Math.abs(w.reduce((s,t)=>s+t.finalR,0) / l.reduce((s,t)=>s+t.finalR,0)) : Infinity;
  console.log(`  ${label}: ${subset.length} trades, win=${wr.toFixed(1)}% PF=${pf.toFixed(2)} net=${totalR.toFixed(2)}R avg=${avgR.toFixed(3)}R SL=${slPct.toFixed(1)}% TP=${tp.length} MFE=${avgMFE.toFixed(3)} MAE=${avgMAE.toFixed(3)}`);

  // Sub-classification of SL trades
  const byClass = {};
  for (const t of sl) {
    const cls = t.slFailure?.classification || "UNKNOWN";
    byClass[cls] = (byClass[cls] || 0) + 1;
  }
  if (sl.length > 0) {
    const classStr = Object.entries(byClass).map(([k,v]) => `${k}:${v}`).join(", ");
    console.log(`    SL breakdown: ${classStr}`);
  }
}

for (const trigger of ["PULLBACK RESUME", "BREAKOUT"]) {
  const subset = closed.filter(t => t.trigger === trigger);
  analyzeSubset(trigger, subset);
}

// ─── Phase 7: Direction Comparison ───────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 7: DIRECTION COMPARISON");
console.log("=".repeat(70));

for (const dir of ["BUY", "SELL"]) {
  const subset = closed.filter(t => t.direction === dir);
  analyzeSubset(dir, subset);
}

// ─── Phase 8: Regime Analysis ────────────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 8: REGIME ANALYSIS");
console.log("=".repeat(70));

const regimes = {};
for (const t of baseline.signals) {
  if (!regimes[t.regime]) regimes[t.regime] = [];
  regimes[t.regime].push(t.time);
}

// Match signals to trades by time
for (const t of closed) {
  // Find the signal that generated this trade
  const sig = baseline.signals.find(s => s.time === t.entryTime && s.direction === t.direction);
  t.regime = sig?.regime || "UNKNOWN";
}

for (const regime of Object.keys(regimes).sort()) {
  const subset = closed.filter(t => t.regime === regime);
  analyzeSubset(regime, subset);
}

// ─── Phase 9: Direction × Trigger Matrix ─────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 9: DIRECTION × TRIGGER MATRIX");
console.log("=".repeat(70));

for (const dir of ["BUY", "SELL"]) {
  for (const trig of ["PULLBACK RESUME", "BREAKOUT"]) {
    const subset = closed.filter(t => t.direction === dir && t.trigger === trig);
    analyzeSubset(`${dir}/${trig}`, subset);
  }
}

// ─── Phase 10: Robustness (split halves) ─────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 10: ROBUSTNESS (Half A vs Half B)");
console.log("=".repeat(70));

const midpoint = Math.floor(candles.length / 2);
const candlesA = candles.slice(0, midpoint);
const candlesB = candles.slice(midpoint);

function runOnSubset(subCandles, label) {
  const result = runEngine(subCandles, DEFAULT_PARAMS);
  const R = generateReport(result.trades);
  console.log(`  ${label} (${subCandles.length} bars, ${new Date(subCandles[0].timestamp).toISOString().slice(0,10)} to ${new Date(subCandles[subCandles.length-1].timestamp).toISOString().slice(0,10)}):`);
  console.log(`    signals=${R.totalSignals} trades=${R.totalTrades} win=${R.winRate.toFixed(1)}% PF=${R.profitFactor.toFixed(2)} net=${R.totalR.toFixed(2)}R avg=${R.avgR.toFixed(3)}R SL=${R.slHitPct.toFixed(1)}%`);
  return R;
}

const RA = runOnSubset(candlesA, "Period A (older)");
const RB = runOnSubset(candlesB, "Period B (newer)");

// ─── Phase 11: Parameter sensitivity on split periods ────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 11: PARAMETER ROBUSTNESS (best candidates, split)");
console.log("=".repeat(70));

const candidates = [
  { name: "structBufferAtr", values: [0.5, 0.75, 1.0] },
  { name: "atrFallbackMult", values: [1.5, 2.0] },
  { name: "maxExtAtr", values: [2.0, 2.5, 3.0] },
];

for (const { name, values } of candidates) {
  for (const val of values) {
    const p = { ...DEFAULT_PARAMS, [name]: val };
    const rA = runEngine(candlesA, p);
    const rB = runEngine(candlesB, p);
    const RA2 = generateReport(rA.trades);
    const RB2 = generateReport(rB.trades);
    const isDefault = val === DEFAULT_PARAMS[name] ? " (baseline)" : "";
    console.log(`  ${name}=${val}${isDefault}: A: net=${RA2.totalR.toFixed(2)}R win=${RA2.winRate.toFixed(1)}% | B: net=${RB2.totalR.toFixed(2)}R win=${RB2.winRate.toFixed(1)}%`);
  }
}

// ─── Phase 12: Score Bucket Analysis ─────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("PHASE 12: SCORE ANALYSIS");
console.log("=".repeat(70));

// V4 FAST doesn't have a numerical score — signals are binary (pass/fail gates).
// But we can bucket by extension (entry quality proxy) and riskAtr (risk quality proxy)
console.log("  V4 FAST has no numerical score — signals pass binary gates.");
console.log("  Using riskAtr (distance from entry to SL in ATR) as quality proxy:");
const riskBuckets = [0, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 5.0];
const riskHist = histogram(closed.map(t => t.riskAtr), riskBuckets);
for (let i = 0; i < riskBuckets.length - 1; i++) {
  const subset = closed.filter(t => t.riskAtr >= riskBuckets[i] && t.riskAtr < riskBuckets[i+1]);
  if (subset.length === 0) continue;
  const w = subset.filter(t => t.finalR > 0);
  const wr = (w.length / subset.length * 100).toFixed(1);
  const netR = subset.reduce((s,t) => s + t.finalR, 0).toFixed(2);
  const avgR = (subset.reduce((s,t) => s + t.finalR, 0) / subset.length).toFixed(3);
  console.log(`  Risk ${riskBuckets[i].toFixed(1)}-${riskBuckets[i+1].toFixed(1)} ATR: ${subset.length} trades, win=${wr}% net=${netR}R avg=${avgR}R`);
}

// ─── Final Summary ───────────────────────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("EXPERIMENT LOG SUMMARY");
console.log("=".repeat(70));
console.log(`  Total experiments run: ~${5 + 5 + 3 + multipliers.length} parameter variants + 2 period splits + cross-tabulations`);
console.log(`  All on same dataset: BTCUSDT M15, ${candles.length} candles`);
console.log(`  No production Pine modified`);

// ─── Save full results to JSON ───────────────────────────────────
const experimentLog = {
  baseline: B,
  dataset: { symbol: "BTCUSDT", timeframe: "M15", candles: candles.length, start: candles[0].timestamp, end: candles[candles.length-1].timestamp },
  slClassification: Object.fromEntries(Object.entries(byClass).map(([k,v]) => [k, { count: v.count, avgPostMFE: v.postMFEs.length > 0 ? v.postMFEs.reduce((s,x)=>s+x,0)/v.postMFEs.length : null }])),
  periodA: RA,
  periodB: RB,
};
fs.writeFileSync(path.join(__dirname, "engine/output/ANALYSIS.json"), JSON.stringify(experimentLog, null, 2));
console.log(`\nFull analysis saved to engine/output/ANALYSIS.json`);
console.log("Done.");
