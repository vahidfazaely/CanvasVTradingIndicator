#!/usr/bin/env node
// CanvasV V4 FAST — Trigger Forensic Analysis
// 6 experiments investigating WHY PULLBACK RESUME fails, especially SELL/PULLBACK.
// Read-only: no production code changes.

import fs from "node:fs";
import path from "node:path";
import {
  runEngine, analyzeSLFailures, generateReport,
  DEFAULT_PARAMS, calcEMA, calcATR, calcSMA, rollingLow, rollingHigh,
} from "./engine.mjs";

// ─── Data loading ──────────────────────────────────────────────────
const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUTPUT_DIR = path.join(import.meta.dirname, "engine", "output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "BTCUSDT-15m.json"), "utf8"));
console.log(`Loaded ${candles.length} candles`);

const closes = candles.map(c => c.close);
const highs  = candles.map(c => c.high);
const lows   = candles.map(c => c.low);
const opens  = candles.map(c => c.open);

// ─── Indicator pre-computation (for feature extraction) ────────────
const P = DEFAULT_PARAMS;
const ema9  = calcEMA(closes, P.emaTrigLen);
const ema21 = calcEMA(closes, P.emaDirLen);
const ema50 = calcEMA(closes, P.emaSlowLen);
const atr   = calcATR(candles, P.atrPeriod);
const atrAvg = calcSMA(atr, P.atrRegimeLen);
const swingLow  = rollingLow(lows, P.swingLookback);
const swingHigh = rollingHigh(highs, P.swingLookback);
const lowestLowPB  = rollingLow(lows, P.pullbackLookback);
const highestHighPB = rollingHigh(highs, P.pullbackLookback);

// ─── Run baseline ──────────────────────────────────────────────────
console.log("Running baseline engine...");
const baseline = runEngine(candles, P);
const analyzed = analyzeSLFailures(baseline.trades, candles, 20);

// ─── Helper: compute extended features for a signal ────────────────
function extractFeatures(sig) {
  const i = sig.bar;
  const c = candles[i];
  const atrVal = atr[i];
  const candleRange = c.high - c.low;
  const bodyPct = candleRange > 0 ? Math.abs(c.close - c.open) / candleRange * 100 : 0;

  // EMA slopes (3-bar)
  const slope9  = (ema9[i]  - ema9[i - 3])  / Math.max(atrVal, 1e-10);
  const slope21 = (ema21[i] - ema21[i - 3]) / Math.max(atrVal, 1e-10);
  const slope50 = (ema50[i] - ema50[i - 3]) / Math.max(atrVal, 1e-10);

  // Price distances from EMAs (ATR-normalized)
  const distEMA9  = (c.close - ema9[i])  / Math.max(atrVal, 1e-10);
  const distEMA21 = (c.close - ema21[i]) / Math.max(atrVal, 1e-10);
  const distEMA50 = (c.close - ema50[i]) / Math.max(atrVal, 1e-10);

  // Pullback analysis
  const isBuy = sig.direction === "BUY";
  let pullbackDepth = 0, pullbackBars = 0;
  if (sig.trigger === "PULLBACK RESUME") {
    // Find the lowest low in pullbackLookback bars before trigger
    const lookback = P.pullbackLookback;
    let pbLow = c.close, pbHigh = c.close;
    for (let j = i - lookback; j < i; j++) {
      if (j >= 0) {
        pbLow  = Math.min(pbLow,  lows[j]);
        pbHigh = Math.max(pbHigh, highs[j]);
      }
    }
    pullbackDepth = isBuy
      ? (c.close - pbLow) / Math.max(atrVal, 1e-10)
      : (pbHigh - c.close) / Math.max(atrVal, 1e-10);

    // Pullback duration: bars where price was below/above EMA21
    pullbackBars = 0;
    for (let j = i - 1; j >= Math.max(0, i - lookback); j--) {
      if (isBuy && candles[j].close < ema21[j]) pullbackBars++;
      else if (!isBuy && candles[j].close > ema21[j]) pullbackBars++;
      else break;
    }
  }

  // Bars since impulse (bars since EMA9 last crossed EMA21)
  let barsSinceImpulse = 0;
  for (let j = i - 1; j >= Math.max(0, i - 30); j--) {
    if (isBuy && ema9[j] > ema21[j] && ema9[j - 1] <= ema21[j - 1]) { barsSinceImpulse = i - j; break; }
    if (!isBuy && ema9[j] < ema21[j] && ema9[j - 1] >= ema21[j - 1]) { barsSinceImpulse = i - j; break; }
  }

  // Bars since recent swing
  let barsSinceSwing = 0;
  if (isBuy) {
    for (let j = i - 1; j >= Math.max(0, i - P.swingLookback); j--) {
      if (lows[j] <= swingLow[j]) { barsSinceSwing = i - j; break; }
    }
  } else {
    for (let j = i - 1; j >= Math.max(0, i - P.swingLookback); j--) {
      if (highs[j] >= swingHigh[j]) { barsSinceSwing = i - j; break; }
    }
  }

  // Candle wick ratios
  const upperWick = isBuy
    ? (c.high - Math.max(c.open, c.close)) / Math.max(candleRange, 1e-10)
    : (c.high - Math.min(c.open, c.close)) / Math.max(candleRange, 1e-10);
  const lowerWick = isBuy
    ? (Math.min(c.open, c.close) - c.low) / Math.max(candleRange, 1e-10)
    : (Math.max(c.open, c.close) - c.low) / Math.max(candleRange, 1e-10);

  // Trigger candle direction
  const candleDir = c.close > c.open ? "BULL" : c.close < c.open ? "BEAR" : "DOJI";

  // Distance to recent swing
  const distToSwing = isBuy
    ? (c.close - swingLow[i - 1]) / Math.max(atrVal, 1e-10)
    : (swingHigh[i - 1] - c.close) / Math.max(atrVal, 1e-10);

  // Structural SL distance
  const structSLDist = isBuy
    ? (c.close - sig.structSL) / Math.max(atrVal, 1e-10)
    : (sig.structSL - c.close) / Math.max(atrVal, 1e-10);

  // Regime slope
  const regimeSlope = (ema50[i] - ema50[i - P.regimeBars]) / Math.max(atrVal * P.regimeBars, 1e-10);

  // EMA fan alignment (how spread out are the EMAs)
  const emaFan = isBuy
    ? (ema9[i] - ema21[i]) / Math.max(atrVal, 1e-10) + (ema21[i] - ema50[i]) / Math.max(atrVal, 1e-10)
    : (ema21[i] - ema9[i]) / Math.max(atrVal, 1e-10) + (ema50[i] - ema21[i]) / Math.max(atrVal, 1e-10);

  // Previous candle range (momentum context)
  const prevRange = i >= 1 ? (candles[i - 1].high - candles[i - 1].low) / Math.max(atrVal, 1e-10) : 0;

  return {
    // Raw
    atrVal, candleRange, bodyPct,
    // EMA
    slope9, slope21, slope50,
    distEMA9, distEMA21, distEMA50,
    emaFan,
    // Pullback
    pullbackDepth, pullbackBars,
    // Structure
    barsSinceImpulse, barsSinceSwing, distToSwing, structSLDist,
    // Candle
    upperWick, lowerWick, candleDir, prevRange,
    // Regime
    regimeSlope,
  };
}

// ═══════════════════════════════════════════════════════════════════
// EXPERIMENT 1 — Trigger Ablation
// ═══════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(70));
console.log("EXPERIMENT 1: TRIGGER ABLATION");
console.log("=".repeat(70));

function runVariant(label, paramOverrides) {
  const result = runEngine(candles, { ...P, ...paramOverrides });
  const closed = result.trades.filter(t => t.exitReason !== "SUPERSEDED");
  const winners = closed.filter(t => t.finalR > 0);
  const losers = closed.filter(t => t.finalR < 0);
  const totalR = closed.reduce((s, t) => s + t.finalR, 0);
  const avgR = closed.length > 0 ? totalR / closed.length : 0;
  const pf = losers.length > 0
    ? Math.abs(winners.reduce((s, t) => s + t.finalR, 0) / losers.reduce((s, t) => s + t.finalR, 0))
    : Infinity;
  const slCount = closed.filter(t => t.exitReason === "SL FIRST").length;
  const tpCount = closed.filter(t => t.exitReason.includes("TP")).length;
  const expCount = closed.filter(t => t.exitReason === "EXPIRED").length;
  const ambCount = closed.filter(t => t.exitReason === "AMBIGUOUS").length;

  // Max drawdown
  let peak = 0, dd = 0, maxDD = 0;
  for (const t of closed) { peak += t.finalR; dd = Math.min(dd, peak - Math.max(peak, 0)); maxDD = Math.min(maxDD, dd); }

  const avgMFE = closed.length > 0 ? closed.reduce((s, t) => s + t.mfe, 0) / closed.length : 0;
  const avgMAE = closed.length > 0 ? closed.reduce((s, t) => s + t.mae, 0) / closed.length : 0;

  return {
    label, trades: closed.length, winners: winners.length, losers: losers.length,
    winRate: closed.length > 0 ? winners.length / closed.length * 100 : 0,
    pf, totalR, avgR, maxDD, slCount, tpCount, expCount, ambCount, avgMFE, avgMAE,
  };
}

const ablation = [
  runVariant("A. Baseline (all signals)", {}),
  runVariant("B. BREAKOUT ONLY", { enablePullback: false }),
  runVariant("C. BUY/PULLBACK + BREAKOUT", { enableBreakout: true, enablePullback: true, __filterDir: "BUY" }),
  runVariant("D. SELL/PULLBACK + BREAKOUT", { enableBreakout: true, enablePullback: true, __filterDir: "SELL" }),
];

// For C and D, we need to manually filter — rerun with filter
function runFiltered(label, dirFilter, paramOverrides) {
  const result = runEngine(candles, { ...P, ...paramOverrides });
  const closed = result.trades.filter(t => {
    if (t.exitReason === "SUPERSEDED") return false;
    const dir = t.direction === "BUY" || t.direction === "LONG" ? "BUY" : "SELL";
    return dir === dirFilter;
  });
  const winners = closed.filter(t => t.finalR > 0);
  const losers = closed.filter(t => t.finalR < 0);
  const totalR = closed.reduce((s, t) => s + t.finalR, 0);
  const avgR = closed.length > 0 ? totalR / closed.length : 0;
  const pf = losers.length > 0
    ? Math.abs(winners.reduce((s, t) => s + t.finalR, 0) / losers.reduce((s, t) => s + t.finalR, 0))
    : Infinity;
  const slCount = closed.filter(t => t.exitReason === "SL FIRST").length;
  const tpCount = closed.filter(t => t.exitReason.includes("TP")).length;
  const expCount = closed.filter(t => t.exitReason === "EXPIRED").length;
  let peak = 0, dd = 0, maxDD = 0;
  for (const t of closed) { peak += t.finalR; dd = Math.min(dd, peak - Math.max(peak, 0)); maxDD = Math.min(maxDD, dd); }
  const avgMFE = closed.length > 0 ? closed.reduce((s, t) => s + t.mfe, 0) / closed.length : 0;
  const avgMAE = closed.length > 0 ? closed.reduce((s, t) => s + t.mae, 0) / closed.length : 0;

  return {
    label, trades: closed.length, winners: winners.length, losers: losers.length,
    winRate: closed.length > 0 ? winners.length / closed.length * 100 : 0,
    pf, totalR, avgR, maxDD, slCount, tpCount, expCount, avgMFE, avgMAE,
  };
}

// Rerun C and D properly (need to filter after engine run since engine handles position state)
const fullResult = runEngine(candles, P);
const closedAll = fullResult.trades.filter(t => t.exitReason !== "SUPERSEDED");

// Manual split by direction+trigger
function splitByDirTrig(dir, trig) {
  return closedAll.filter(t => {
    const d = t.direction === "BUY" || t.direction === "LONG" ? "BUY" : "SELL";
    return d === dir && t.trigger === trig;
  });
}

function splitByTrig(trig) {
  return closedAll.filter(t => t.trigger === trig);
}

function calcStats(trades, label) {
  if (trades.length === 0) return { label, trades: 0, winners: 0, losers: 0, winRate: 0, pf: Infinity, totalR: 0, avgR: 0, maxDD: 0, slCount: 0, tpCount: 0, expCount: 0, avgMFE: 0, avgMAE: 0, expectancy: 0 };
  const winners = trades.filter(t => t.finalR > 0);
  const losers = trades.filter(t => t.finalR < 0);
  const totalR = trades.reduce((s, t) => s + t.finalR, 0);
  const avgR = totalR / trades.length;
  const pf = losers.length > 0
    ? Math.abs(winners.reduce((s, t) => s + t.finalR, 0) / losers.reduce((s, t) => s + t.finalR, 0))
    : Infinity;
  let peak = 0, dd = 0, maxDD = 0;
  for (const t of trades) { peak += t.finalR; dd = Math.min(dd, peak - Math.max(peak, 0)); maxDD = Math.min(maxDD, dd); }
  const avgMFE = trades.reduce((s, t) => s + t.mfe, 0) / trades.length;
  const avgMAE = trades.reduce((s, t) => s + t.mae, 0) / trades.length;
  const expectancy = totalR / trades.length;

  return {
    label, trades: trades.length, winners: winners.length, losers: losers.length,
    winRate: winners.length / trades.length * 100,
    pf, totalR, avgR, maxDD, expectancy,
    slCount: trades.filter(t => t.exitReason === "SL FIRST").length,
    tpCount: trades.filter(t => t.exitReason.includes("TP")).length,
    expCount: trades.filter(t => t.exitReason === "EXPIRED").length,
    avgMFE, avgMAE,
  };
}

// A: Baseline
const statA = calcStats(closedAll, "A. Baseline (all signals)");
// B: BREAKOUT ONLY (all directions)
const statB = calcStats(splitByTrig("BREAKOUT"), "B. BREAKOUT ONLY");
// C: BUY/PULLBACK (only pullback, BUY direction)
const statC = calcStats(splitByDirTrig("BUY", "PULLBACK RESUME"), "C. BUY/PULLBACK only");
// D: SELL/PULLBACK (only pullback, SELL direction)
const statD = calcStats(splitByDirTrig("SELL", "PULLBACK RESUME"), "D. SELL/PULLBACK only");
// Also: BUY ALL vs SELL ALL
const statBuyAll = calcStats(closedAll.filter(t => t.direction === "BUY" || t.direction === "LONG"), "BUY (all triggers)");
const statSellAll = calcStats(closedAll.filter(t => t.direction === "SELL" || t.direction === "SHORT"), "SELL (all triggers)");
// BUY/BREAKOUT vs SELL/BREAKOUT
const statBuyBO = calcStats(splitByDirTrig("BUY", "BREAKOUT"), "BUY/BREAKOUT");
const statSellBO = calcStats(splitByDirTrig("SELL", "BREAKOUT"), "SELL/BREAKOUT");

const ablationResults = [statA, statB, statC, statD, statBuyAll, statSellAll, statBuyBO, statSellBO];

console.log("\n  Ablation Results:");
console.log("  " + "-".repeat(100));
console.log(`  ${"Variant".padEnd(30)} ${"Trades".padStart(7)} ${"Win%".padStart(7)} ${"PF".padStart(7)} ${"Net R".padStart(10)} ${"Avg R".padStart(8)} ${"MaxDD".padStart(10)} ${"SL".padStart(5)} ${"TP".padStart(5)} ${"Exp".padStart(5)} ${"MFE".padStart(7)} ${"MAE".padStart(7)}`);
for (const s of ablationResults) {
  console.log(`  ${s.label.padEnd(30)} ${String(s.trades).padStart(7)} ${s.winRate.toFixed(1).padStart(7)} ${(s.pf === Infinity ? "∞" : s.pf.toFixed(2)).padStart(7)} ${s.totalR.toFixed(2).padStart(10)} ${s.avgR.toFixed(3).padStart(8)} ${s.maxDD.toFixed(2).padStart(10)} ${String(s.slCount).padStart(5)} ${String(s.tpCount).padStart(5)} ${String(s.expCount).padStart(5)} ${s.avgMFE.toFixed(3).padStart(7)} ${s.avgMAE.toFixed(3).padStart(7)}`);
}
console.log("  " + "-".repeat(100));

// ═══════════════════════════════════════════════════════════════════
// EXPERIMENT 2 — SELL/PULLBACK Forensic Decomposition
// ═══════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(70));
console.log("EXPERIMENT 2: SELL/PULLBACK FORENSIC DECOMPOSITION");
console.log("=".repeat(70));

const sellPullback = analyzed.filter(t =>
  (t.direction === "SELL" || t.direction === "SHORT") && t.trigger === "PULLBACK RESUME"
);

console.log(`\n  SELL/PULLBACK trades: ${sellPullback.length}`);

// Extract features for all SELL/PULLBACK signals
// We need to match signals to trades by timestamp
const sellPBSignals = baseline.signals.filter(s =>
  s.direction === "SELL" && s.trigger === "PULLBACK RESUME"
);

// Build signal→features map
const signalFeatures = new Map();
for (const sig of sellPBSignals) {
  const features = extractFeatures(sig);
  signalFeatures.set(sig.time, features);
}

// Match trades to features
const sellPBWithFeatures = sellPullback.map(t => {
  const features = signalFeatures.get(t.entryTime) || {};
  return { ...t, features };
});

// Print feature distributions
function printDistribution(trades, featureName, bins) {
  console.log(`\n  ${featureName}:`);
  for (const [lo, hi, label] of bins) {
    const subset = trades.filter(t => {
      const v = t.features[featureName];
      return v !== undefined && v >= lo && v < hi;
    });
    const winners = subset.filter(t => t.finalR > 0);
    const winRate = subset.length > 0 ? (winners.length / subset.length * 100) : 0;
    const totalR = subset.reduce((s, t) => s + t.finalR, 0);
    console.log(`    ${label.padEnd(18)} ${String(subset.length).padStart(5)} trades, WR ${winRate.toFixed(1).padStart(5)}%, R ${totalR.toFixed(2).padStart(8)}`);
  }
}

// Key features
printDistribution(sellPBWithFeatures, "riskAtr", [
  [0, 1.0, "0.0-1.0"], [1.0, 1.5, "1.0-1.5"], [1.5, 2.0, "1.5-2.0"],
  [2.0, 2.5, "2.0-2.5"], [2.5, 10, "2.5+"],
]);
printDistribution(sellPBWithFeatures, "extAtr", [
  [0, 0.5, "0.0-0.5"], [0.5, 1.0, "0.5-1.0"], [1.0, 1.5, "1.0-1.5"],
  [1.5, 2.0, "1.5-2.0"], [2.0, 10, "2.0+"],
]);
printDistribution(sellPBWithFeatures, "slope21", [
  [-10, -0.5, "slope<-0.5"], [-0.5, -0.1, "-0.5 to -0.1"], [-0.1, 0.1, "-0.1 to 0.1"],
  [0.1, 0.5, "0.1 to 0.5"], [0.5, 10, "slope>0.5"],
]);
printDistribution(sellPBWithFeatures, "distEMA21", [
  [-10, -1.5, "<-1.5"], [-1.5, -0.5, "-1.5 to -0.5"], [-0.5, 0.5, "-0.5 to 0.5"],
  [0.5, 1.5, "0.5 to 1.5"], [1.5, 10, ">1.5"],
]);
printDistribution(sellPBWithFeatures, "distEMA50", [
  [-10, -2.0, "<-2.0"], [-2.0, -0.5, "-2.0 to -0.5"], [-0.5, 0.5, "-0.5 to 0.5"],
  [0.5, 2.0, "0.5 to 2.0"], [2.0, 10, ">2.0"],
]);
printDistribution(sellPBWithFeatures, "pullbackDepth", [
  [0, 0.3, "0-0.3"], [0.3, 0.6, "0.3-0.6"], [0.6, 1.0, "0.6-1.0"],
  [1.0, 1.5, "1.0-1.5"], [1.5, 10, "1.5+"],
]);
printDistribution(sellPBWithFeatures, "pullbackBars", [
  [0, 1, "0 bars"], [1, 2, "1 bar"], [2, 3, "2 bars"],
  [3, 4, "3 bars"], [4, 10, "4+ bars"],
]);
printDistribution(sellPBWithFeatures, "barsSinceImpulse", [
  [0, 3, "0-2"], [3, 6, "3-5"], [6, 10, "6-9"], [10, 30, "10+"],
]);
printDistribution(sellPBWithFeatures, "bodyPct", [
  [0, 30, "0-30%"], [30, 50, "30-50%"], [50, 70, "50-70%"],
  [70, 90, "70-90%"], [90, 101, "90-100%"],
]);
printDistribution(sellPBWithFeatures, "structSLDist", [
  [0, 0.8, "0-0.8"], [0.8, 1.2, "0.8-1.2"], [1.2, 1.8, "1.2-1.8"],
  [1.8, 2.5, "1.8-2.5"], [2.5, 10, "2.5+"],
]);
printDistribution(sellPBWithFeatures, "regimeSlope", [
  [-10, -0.3, "strong dn"], [-0.3, -0.1, "mild dn"], [-0.1, 0.1, "flat"],
  [0.1, 0.3, "mild up"], [0.3, 10, "strong up"],
]);
printDistribution(sellPBWithFeatures, "emaFan", [
  [-10, -1.0, "<-1.0"], [-1.0, -0.3, "-1.0 to -0.3"], [-0.3, 0.3, "-0.3 to 0.3"],
  [0.3, 1.0, "0.3 to 1.0"], [1.0, 10, ">1.0"],
]);
printDistribution(sellPBWithFeatures, "prevRange", [
  [0, 0.5, "0-0.5"], [0.5, 1.0, "0.5-1.0"], [1.0, 1.5, "1.0-1.5"],
  [1.5, 2.0, "1.5-2.0"], [2.0, 10, "2.0+"],
]);
printDistribution(sellPBWithFeatures, "upperWick", [
  [0, 0.1, "0-0.1"], [0.1, 0.25, "0.1-0.25"], [0.25, 0.4, "0.25-0.4"],
  [0.4, 1.01, "0.4-1.0"],
]);
printDistribution(sellPBWithFeatures, "lowerWick", [
  [0, 0.1, "0-0.1"], [0.1, 0.25, "0.1-0.25"], [0.25, 0.4, "0.25-0.4"],
  [0.4, 1.01, "0.4-1.0"],
]);

// ═══════════════════════════════════════════════════════════════════
// EXPERIMENT 3 — Winner vs Loser Feature Analysis
// ═══════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(70));
console.log("EXPERIMENT 3: SELL/PULLBACK WINNER vs LOSER FEATURE ANALYSIS");
console.log("=".repeat(70));

const spbWinners = sellPBWithFeatures.filter(t => t.finalR > 0);
const spbLosers  = sellPBWithFeatures.filter(t => t.finalR < 0);

const featureList = [
  "riskAtr", "extAtr", "slope9", "slope21", "slope50",
  "distEMA9", "distEMA21", "distEMA50", "emaFan",
  "pullbackDepth", "pullbackBars", "barsSinceImpulse", "barsSinceSwing",
  "distToSwing", "structSLDist", "bodyPct", "candleRange",
  "upperWick", "lowerWick", "prevRange", "regimeSlope", "atrVal",
];

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(arr) {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : NaN;
}

function std(arr) {
  const m = mean(arr);
  return arr.length > 1 ? Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)) : 0;
}

console.log("\n  Feature              | Winner Mean | Winner Med | Loser Mean  | Loser Med  | Diff    | Separation");
console.log("  " + "-".repeat(105));

const featureAnalysis = [];
for (const feat of featureList) {
  const wVals = spbWinners.map(t => t.features[feat]).filter(v => v !== undefined && isFinite(v));
  const lVals = spbLosers.map(t => t.features[feat]).filter(v => v !== undefined && isFinite(v));

  if (wVals.length === 0 || lVals.length === 0) continue;

  const wMean = mean(wVals), lMean = mean(lVals);
  const wMed = median(wVals), lMed = median(lVals);
  const wStd = std(wVals), lStd = std(lVals);
  const diff = wMean - lMean;
  const pooledStd = Math.sqrt((wStd ** 2 + lStd ** 2) / 2);
  const cohensD = pooledStd > 0 ? Math.abs(diff) / pooledStd : 0;

  let separation = "NONE";
  if (cohensD >= 0.8) separation = "STRONG";
  else if (cohensD >= 0.5) separation = "MODERATE";
  else if (cohensD >= 0.3) separation = "WEAK";

  featureAnalysis.push({
    feature: feat, wMean, wMed, lMean, lMed, diff, cohensD, separation,
    wCount: wVals.length, lCount: lVals.length,
  });

  console.log(`  ${feat.padEnd(20)} | ${wMean.toFixed(3).padStart(11)} | ${wMed.toFixed(3).padStart(10)} | ${lMean.toFixed(3).padStart(11)} | ${lMed.toFixed(3).padStart(10)} | ${diff.toFixed(3).padStart(7)} | ${separation} (d=${cohensD.toFixed(2)})`);
}

// Sort by Cohen's d
featureAnalysis.sort((a, b) => b.cohensD - a.cohensD);
console.log("\n  Top predictive features (by Cohen's d):");
for (const f of featureAnalysis.slice(0, 8)) {
  console.log(`    ${f.feature}: d=${f.cohensD.toFixed(2)} (${f.separation}) — W:${f.wMean.toFixed(3)} vs L:${f.lMean.toFixed(3)}`);
}

// ═══════════════════════════════════════════════════════════════════
// EXPERIMENT 4 — LATE_ENTRY Upstream Cause Analysis
// ═══════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(70));
console.log("EXPERIMENT 4: LATE_ENTRY UPSTREAM CAUSE ANALYSIS");
console.log("=".repeat(70));

const lateEntry = analyzed.filter(t => t.exitReason === "SL FIRST" && t.slFailure?.classification === "LATE_ENTRY");
const nonLateSL = analyzed.filter(t => t.exitReason === "SL FIRST" && t.slFailure?.classification !== "LATE_ENTRY");
const allWinners = analyzed.filter(t => t.finalR > 0 && t.exitReason !== "SUPERSEDED");

console.log(`\n  LATE_ENTRY trades: ${lateEntry.length}`);
console.log(`  Non-LATE SL trades: ${nonLateSL.length}`);
console.log(`  Winners: ${allWinners.length}`);

// Extract features for late entry trades
const lateFeatures = lateEntry.map(t => {
  const features = signalFeatures.get(t.entryTime) || {};
  return { ...t, features };
});

const nonLateFeatures = nonLateSL.map(t => {
  const features = signalFeatures.get(t.entryTime) || {};
  return { ...t, features };
});

const winnerFeatures = allWinners.map(t => {
  const features = signalFeatures.get(t.entryTime) || {};
  return { ...t, features };
});

// Compare LATE_ENTRY vs winners
console.log("\n  LATE_ENTRY vs WINNER vs OTHER_SL:");
console.log("  " + "-".repeat(100));
console.log(`  ${"Feature".padEnd(20)} ${"Late Mean".padStart(10)} ${"Winner Mean".padStart(12)} ${"OtherSL Mean".padStart(13)} ${"Late vs Win".padStart(12)}`);
console.log("  " + "-".repeat(100));

const lateUpstreamAnalysis = [];
for (const feat of featureList) {
  const lVals = lateFeatures.map(t => t.features[feat]).filter(v => v !== undefined && isFinite(v));
  const wVals = winnerFeatures.map(t => t.features[feat]).filter(v => v !== undefined && isFinite(v));
  const oVals = nonLateFeatures.map(t => t.features[feat]).filter(v => v !== undefined && isFinite(v));

  if (lVals.length === 0 || wVals.length === 0) continue;

  const lMean = mean(lVals), wMean = mean(wVals), oMean = oVals.length > 0 ? mean(oVals) : NaN;
  const diff = lMean - wMean;

  let suspect = "";
  if (feat === "pullbackDepth" && lMean < wMean) suspect = " ← INSUFFICIENT PULLBACK";
  if (feat === "barsSinceImpulse" && lMean > wMean) suspect = " ← TOO FAR FROM IMPULSE";
  if (feat === "extAtr" && lMean > wMean) suspect = " ← EXCESSIVE EXTENSION";
  if (feat === "distEMA21" && Math.abs(lMean) > Math.abs(wMean)) suspect = " ← POOR EMA GEOMETRY";
  if (feat === "slope21" && lMean > wMean) suspect = " ← WEAK MOMENTUM";
  if (feat === "bodyPct" && lMean < wMean) suspect = " ← WEAK TRIGGER CANDLE";
  if (feat === "structSLDist" && lMean < wMean) suspect = " ← SL TOO FAR (structure issue)";

  lateUpstreamAnalysis.push({ feature: feat, lateMean: lMean, winnerMean: wMean, otherMean: oMean, diff, suspect });

  console.log(`  ${feat.padEnd(20)} ${lMean.toFixed(3).padStart(10)} ${wMean.toFixed(3).padStart(12)} ${(isNaN(oMean) ? "N/A" : oMean.toFixed(3)).padStart(13)} ${diff.toFixed(3).padStart(12)}${suspect}`);
}

// ═══════════════════════════════════════════════════════════════════
// EXPERIMENT 5 — STOP_TOO_TIGHT Structural Analysis
// ═══════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(70));
console.log("EXPERIMENT 5: STOP_TOO_TIGHT STRUCTURAL ANALYSIS");
console.log("=".repeat(70));

const stopTight = analyzed.filter(t => t.exitReason === "SL FIRST" && t.slFailure?.classification === "STOP_TOO_TIGHT");
console.log(`\n  STOP_TOO_TIGHT trades: ${stopTight.length}`);

const stFeatures = stopTight.map(t => {
  const features = signalFeatures.get(t.entryTime) || {};
  return { ...t, features };
});

// Compare STOP_TOO_TIGHT vs normal winners
console.log("\n  STOP_TOO_TIGHT vs WINNER characteristics:");
console.log("  " + "-".repeat(100));
console.log(`  ${"Feature".padEnd(20)} ${"ST Mean".padStart(10)} ${"Winner Mean".padStart(12)} ${"Diff".padStart(10)} ${"Interpretation".padEnd(30)}`);
console.log("  " + "-".repeat(100));

const stopTightAnalysis = [];
for (const feat of featureList) {
  const stVals = stFeatures.map(t => t.features[feat]).filter(v => v !== undefined && isFinite(v));
  const wVals = winnerFeatures.map(t => t.features[feat]).filter(v => v !== undefined && isFinite(v));

  if (stVals.length === 0 || wVals.length === 0) continue;

  const stMean = mean(stVals), wMean = mean(wVals);
  const diff = stMean - wMean;

  let interp = "";
  if (feat === "structSLDist" && stMean < wMean) interp = "SL placed closer to entry";
  if (feat === "riskAtr" && stMean < wMean) interp = "Tighter risk = more vulnerable";
  if (feat === "pullbackDepth" && Math.abs(stMean - wMean) < 0.1) interp = "Similar pullback structure";
  if (feat === "bodyPct" && stMean > wMean) interp = "Stronger candles (unexpected)";
  if (feat === "extAtr" && stMean > wMean) interp = "More extended (expected)";
  if (feat === "distEMA21" && Math.abs(stMean) < Math.abs(wMean)) interp = "Closer to EMA21";
  if (feat === "slope21" && Math.abs(stMean) < Math.abs(wMean)) interp = "Weaker trend momentum";

  stopTightAnalysis.push({ feature: feat, stMean, wMean, diff, interp });

  console.log(`  ${feat.padEnd(20)} ${stMean.toFixed(3).padStart(10)} ${wMean.toFixed(3).padStart(12)} ${diff.toFixed(3).padStart(10)} ${interp.padEnd(30)}`);
}

// ═══════════════════════════════════════════════════════════════════
// EXPERIMENT 6 — RiskAtr Anomaly Investigation
// ═══════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(70));
console.log("EXPERIMENT 6: RISKATR ANOMALY (1.5-2.0 vs 2.0-2.5)");
console.log("=".repeat(70));

const riskBuckets = closedAll.map(t => {
  const features = signalFeatures.get(t.entryTime) || {};
  return { ...t, features };
});

const bucket15 = riskBuckets.filter(t => t.riskAtr >= 1.5 && t.riskAtr < 2.0);
const bucket20 = riskBuckets.filter(t => t.riskAtr >= 2.0 && t.riskAtr < 2.5);

function detailedStats(trades, label) {
  if (trades.length === 0) return { label, count: 0 };
  const winners = trades.filter(t => t.finalR > 0);
  const losers = trades.filter(t => t.finalR < 0);
  const totalR = trades.reduce((s, t) => s + t.finalR, 0);
  const avgR = totalR / trades.length;
  const pf = losers.length > 0
    ? Math.abs(winners.reduce((s, t) => s + t.finalR, 0) / losers.reduce((s, t) => s + t.finalR, 0))
    : Infinity;
  const avgMFE = trades.reduce((s, t) => s + t.mfe, 0) / trades.length;
  const avgMAE = trades.reduce((s, t) => s + t.mae, 0) / trades.length;

  // Direction split
  const buys = trades.filter(t => t.direction === "BUY" || t.direction === "LONG");
  const sells = trades.filter(t => t.direction === "SELL" || t.direction === "SHORT");
  const buyR = buys.reduce((s, t) => s + t.finalR, 0);
  const sellR = sells.reduce((s, t) => s + t.finalR, 0);

  // Trigger split
  const pb = trades.filter(t => t.trigger === "PULLBACK RESUME");
  const bo = trades.filter(t => t.trigger === "BREAKOUT");
  const pbR = pb.reduce((s, t) => s + t.finalR, 0);
  const boR = bo.reduce((s, t) => s + t.finalR, 0);

  // SL failure
  const slTrades = trades.filter(t => t.exitReason === "SL FIRST");
  const lateCount = slTrades.filter(t => t.slFailure?.classification === "LATE_ENTRY").length;
  const tightCount = slTrades.filter(t => t.slFailure?.classification === "STOP_TOO_TIGHT").length;
  const contCount = slTrades.filter(t => t.slFailure?.classification === "CONTINUATION").length;

  return {
    label, count: trades.length, winners: winners.length, losers: losers.length,
    winRate: winners.length / trades.length * 100, pf, totalR, avgR, avgMFE, avgMAE,
    buyCount: buys.length, sellCount: sells.length, buyR, sellR,
    pbCount: pb.length, boCount: bo.length, pbR, boR,
    slCount: slTrades.length, lateCount, tightCount, contCount,
  };
}

const stats15 = detailedStats(bucket15, "Risk 1.5-2.0 ATR");
const stats20 = detailedStats(bucket20, "Risk 2.0-2.5 ATR");

console.log("\n  Bucket Comparison:");
console.log("  " + "-".repeat(90));
console.log(`  ${"Metric".padEnd(30)} ${"1.5-2.0 ATR".padStart(15)} ${"2.0-2.5 ATR".padStart(15)} ${"Delta".padStart(10)}`);
console.log("  " + "-".repeat(90));

const metrics = [
  ["Trades", s => s.count],
  ["Win rate %", s => s.winRate?.toFixed(1)],
  ["Net R", s => s.totalR?.toFixed(2)],
  ["Avg R", s => s.avgR?.toFixed(4)],
  ["PF", s => s.pf === Infinity ? "∞" : s.pf?.toFixed(2)],
  ["BUY trades", s => s.buyCount],
  ["SELL trades", s => s.sellCount],
  ["BUY net R", s => s.buyR?.toFixed(2)],
  ["SELL net R", s => s.sellR?.toFixed(2)],
  ["PULLBACK trades", s => s.pbCount],
  ["BREAKOUT trades", s => s.boCount],
  ["PULLBACK net R", s => s.pbR?.toFixed(2)],
  ["BREAKOUT net R", s => s.boR?.toFixed(2)],
  ["SL hits", s => s.slCount],
  ["LATE_ENTRY", s => s.lateCount],
  ["STOP_TOO_TIGHT", s => s.tightCount],
  ["CONTINUATION", s => s.contCount],
  ["Avg MFE", s => s.avgMFE?.toFixed(3)],
  ["Avg MAE", s => s.avgMAE?.toFixed(3)],
];

for (const [name, fn] of metrics) {
  const v15 = fn(stats15);
  const v20 = fn(stats20);
  const num15 = parseFloat(v15), num20 = parseFloat(v20);
  const delta = (isFinite(num15) && isFinite(num20)) ? (num20 - num15).toFixed(2) : "N/A";
  console.log(`  ${name.padEnd(30)} ${String(v15).padStart(15)} ${String(v20).padStart(15)} ${String(delta).padStart(10)}`);
}
console.log("  " + "-".repeat(90));

// Check SL geometry differences
console.log("\n  SL Geometry Analysis:");
console.log("  " + "-".repeat(60));
for (const bucket of [stats15, stats20]) {
  console.log(`\n  ${bucket.label} (${bucket.count} trades):`);
  const trades = bucket === stats15 ? bucket15 : bucket20;
  const slDists = trades.map(t => {
    const features = signalFeatures.get(t.entryTime) || {};
    return features.structSLDist;
  }).filter(v => v !== undefined && isFinite(v));
  if (slDists.length > 0) {
    console.log(`    structSLDist: mean=${mean(slDists).toFixed(3)}, median=${median(slDists).toFixed(3)}, std=${std(slDists).toFixed(3)}`);
  }

  // Price distance from structure
  const priceFromSwing = trades.map(t => {
    const features = signalFeatures.get(t.entryTime) || {};
    return features.distToSwing;
  }).filter(v => v !== undefined && isFinite(v));
  if (priceFromSwing.length > 0) {
    console.log(`    distToSwing:  mean=${mean(priceFromSwing).toFixed(3)}, median=${median(priceFromSwing).toFixed(3)}`);
  }

  // EMA distances
  const d21 = trades.map(t => {
    const features = signalFeatures.get(t.entryTime) || {};
    return features.distEMA21;
  }).filter(v => v !== undefined && isFinite(v));
  if (d21.length > 0) {
    console.log(`    distEMA21:    mean=${mean(d21).toFixed(3)}, median=${median(d21).toFixed(3)}`);
  }

  const d50 = trades.map(t => {
    const features = signalFeatures.get(t.entryTime) || {};
    return features.distEMA50;
  }).filter(v => v !== undefined && isFinite(v));
  if (d50.length > 0) {
    console.log(`    distEMA50:    mean=${mean(d50).toFixed(3)}, median=${median(d50).toFixed(3)}`);
  }

  const s21 = trades.map(t => {
    const features = signalFeatures.get(t.entryTime) || {};
    return features.slope21;
  }).filter(v => v !== undefined && isFinite(v));
  if (s21.length > 0) {
    console.log(`    slope21:      mean=${mean(s21).toFixed(3)}, median=${median(s21).toFixed(3)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// SAVE RESULTS
// ═══════════════════════════════════════════════════════════════════
const forensicData = {
  timestamp: new Date().toISOString(),
  engine: "CanvasV V4 FAST v4.1.0",
  dataset: { symbol: "BTCUSDT", timeframe: "M15", candles: candles.length },
  experiment1_ablation: ablationResults,
  experiment2_sellPB: {
    count: sellPullback.length,
    features: sellPBWithFeatures.map(t => ({
      time: t.entryTime, direction: t.direction, trigger: t.trigger,
      entry: t.entry, sl: t.sl, tp1: t.tp1, exitReason: t.exitReason,
      finalR: t.finalR, mfe: t.mfe, mae: t.mae, age: t.age,
      riskAtr: t.riskAtr, extAtr: t.extAtr,
      slFailure: t.slFailure,
      features: t.features,
    })),
  },
  experiment3_featureAnalysis: featureAnalysis,
  experiment4_lateEntry: {
    count: lateEntry.length,
    analysis: lateUpstreamAnalysis,
  },
  experiment5_stopTight: {
    count: stopTight.length,
    analysis: stopTightAnalysis,
  },
  experiment6_riskAnomaly: {
    bucket_1_5_2_0: stats15,
    bucket_2_0_2_5: stats20,
  },
  fullTrades: analyzed.map(t => ({
    time: t.entryTime, exitTime: t.exitTime, direction: t.direction, trigger: t.trigger,
    entry: t.entry, sl: t.sl, tp1: t.tp1, exitPrice: t.exitPrice,
    exitReason: t.exitReason, finalR: t.finalR, mfe: t.mfe, mae: t.mae, age: t.age,
    riskAtr: t.riskAtr, extAtr: t.extAtr, bodyPct: t.bodyPct, atr: t.atr,
    structSL: t.structSL,
    slFailure: t.slFailure,
    features: signalFeatures.get(t.entryTime) || {},
  })),
};

const outFile = path.join(OUTPUT_DIR, "TRIGGER-FORENSIC.json");
fs.writeFileSync(outFile, JSON.stringify(forensicData, null, 2));
console.log(`\n\nSaved forensic data to ${outFile}`);
console.log("Done.");
