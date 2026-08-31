#!/usr/bin/env node
// CanvasV V4 FAST — Hypothesis Testing
// Tests the 4 hypotheses from the forensic report.
// Read-only: results saved, no production code modified.

import fs from "node:fs";
import path from "node:path";
import { runEngine, analyzeSLFailures, DEFAULT_PARAMS } from "./engine.mjs";

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUTPUT_DIR = path.join(import.meta.dirname, "engine", "output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "BTCUSDT-15m.json"), "utf8"));
console.log(`Loaded ${candles.length} candles`);

const P = DEFAULT_PARAMS;

// ─── Run engine with post-filter ──────────────────────────────────
function runWithFilter(label, filterFn) {
  const result = runEngine(candles, P);
  // Apply filter to signals before they enter position tracking
  // We need to re-run with filtered signals
  const filtered = runEngineFiltered(candles, P, filterFn);
  const closed = filtered.trades.filter(t => t.exitReason !== "SUPERSEDED");
  const winners = closed.filter(t => t.finalR > 0);
  const losers = closed.filter(t => t.finalR < 0);
  const totalR = closed.reduce((s, t) => s + t.finalR, 0);
  const avgR = closed.length > 0 ? totalR / closed.length : 0;
  const pf = losers.length > 0
    ? Math.abs(winners.reduce((s, t) => s + t.finalR, 0) / losers.reduce((s, t) => s + t.finalR, 0))
    : Infinity;
  let peak = 0, dd = 0, maxDD = 0;
  for (const t of closed) { peak += t.finalR; dd = Math.min(dd, peak - Math.max(peak, 0)); maxDD = Math.min(maxDD, dd); }
  const avgMFE = closed.length > 0 ? closed.reduce((s, t) => s + t.mfe, 0) / closed.length : 0;
  const avgMAE = closed.length > 0 ? closed.reduce((s, t) => s + t.mae, 0) / closed.length : 0;
  const slCount = closed.filter(t => t.exitReason === "SL FIRST").length;
  const tpCount = closed.filter(t => t.exitReason.includes("TP")).length;
  const expCount = closed.filter(t => t.exitReason === "EXPIRED").length;

  // Direction split
  const buyTrades = closed.filter(t => t.direction === "BUY" || t.direction === "LONG");
  const sellTrades = closed.filter(t => t.direction === "SELL" || t.direction === "SHORT");
  const buyR = buyTrades.reduce((s, t) => s + t.finalR, 0);
  const sellR = sellTrades.reduce((s, t) => s + t.finalR, 0);

  return {
    label, trades: closed.length, winners: winners.length, losers: losers.length,
    winRate: closed.length > 0 ? winners.length / closed.length * 100 : 0,
    pf, totalR, avgR, maxDD, avgMFE, avgMAE, slCount, tpCount, expCount,
    buyCount: buyTrades.length, sellCount: sellTrades.length, buyR, sellR,
  };
}

// ─── Filtered engine run ──────────────────────────────────────────
// We need to modify the engine to accept a signal filter
// For now, we'll use a simpler approach: run engine, then filter trades by signal characteristics

import { calcEMA, calcATR, calcSMA, rollingLow, rollingHigh } from "./engine.mjs";

function runEngineFiltered(candles, params, signalFilter) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const len = candles.length;

  const opens = candles.map(c => c.open);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  const emaTrig = calcEMA(closes, p.emaTrigLen);
  const emaDir = calcEMA(closes, p.emaDirLen);
  const emaSlow = calcEMA(closes, p.emaSlowLen);
  const atr = calcATR(candles, p.atrPeriod);
  const atrAvg = calcSMA(atr, p.atrRegimeLen);

  const swingLow = rollingLow(lows, p.swingLookback);
  const swingHigh = rollingHigh(highs, p.swingLookback);
  const lowestLowPB = rollingLow(lows, p.pullbackLookback);
  const highestHighPB = rollingHigh(highs, p.pullbackLookback);
  const highestHighBO = rollingHigh(highs, p.breakoutBars);
  const lowestLowBO = rollingLow(lows, p.breakoutBars);

  const signals = [];
  const trades = [];

  let posState = 0;
  let posEntry = 0, posSL = 0, posTP1 = 0, posTP2 = 0;
  let posRisk = 0, posRiskAtr = 0;
  let posBar = -1, posAge = 0;
  let posMFE = 0, posMAE = 0;
  let posDir = "";
  let posExtAtr = 0, posBodyPct = 0, posEma21 = 0, posAtrVal = 0;
  let posStructSL = 0, posRR1 = 0, posRR2 = 0;
  let posTrigger = "";

  for (let i = 0; i < len; i++) {
    const c = candles[i];
    const barIdx = i;
    const warmup = Math.max(p.emaSlowLen, p.atrRegimeLen, p.swingLookback) + 5;
    if (i < warmup) continue;

    const atrVal = atr[i];
    if (isNaN(atrVal) || atrVal <= 0) continue;

    const atrVsAvg = atrVal / Math.max(atrAvg[i], 1e-10) * 100;
    const regimeSlope = (emaSlow[i] - emaSlow[i - p.regimeBars]) / Math.max(atrVal * p.regimeBars, 1e-10);
    const trending = Math.abs(regimeSlope) >= p.regimeMinSlope;
    const highVol = atrVsAvg >= p.highVolPct;

    const trendUp = trending && emaDir[i] > emaSlow[i] && emaSlow[i] > emaSlow[i - p.regimeBars];
    const trendDn = trending && emaDir[i] < emaSlow[i] && emaSlow[i] < emaSlow[i - p.regimeBars];

    const momUp = emaTrig[i] > emaTrig[i - p.momSlopeBars] && c.close >= emaDir[i];
    const momDn = emaTrig[i] < emaTrig[i - p.momSlopeBars] && c.close <= emaDir[i];

    const setupUp = trendUp && momUp;
    const setupDn = trendDn && momDn;

    const pullbackTol = p.pullbackTolPct / 100.0;
    const touchLowUp = i >= 1 && !isNaN(lowestLowPB[i - 1]) && lowestLowPB[i - 1] <= emaDir[i] * (1 + pullbackTol);
    const touchHighDn = i >= 1 && !isNaN(highestHighPB[i - 1]) && highestHighPB[i - 1] >= emaDir[i] * (1 - pullbackTol);
    const reclaimUp = c.close > emaTrig[i] && candles[i - 1].close <= emaTrig[i - 1];
    const reclaimDn = c.close < emaTrig[i] && candles[i - 1].close >= emaTrig[i - 1];

    const pullbackUp = p.enablePullback && touchLowUp && reclaimUp;
    const pullbackDn = p.enablePullback && touchHighDn && reclaimDn;
    const breakUp = p.enableBreakout && !isNaN(highestHighBO[i - 1]) && c.close > highestHighBO[i - 1];
    const breakDn = p.enableBreakout && !isNaN(lowestLowBO[i - 1]) && c.close < lowestLowBO[i - 1];

    const triggerUp = pullbackUp || breakUp;
    const triggerDn = pullbackDn || breakDn;

    const candleRange = c.high - c.low;
    const bodyPct = candleRange > 0 ? Math.abs(c.close - c.open) / candleRange * 100 : 0;
    const bodyOkUp = p.minBodyPct <= 0 || (c.close > c.open && bodyPct >= p.minBodyPct);
    const bodyOkDn = p.minBodyPct <= 0 || (c.close < c.open && bodyPct >= p.minBodyPct);

    const extAtrUp = (c.close - emaDir[i]) / Math.max(atrVal, 1e-10);
    const extAtrDn = (emaDir[i] - c.close) / Math.max(atrVal, 1e-10);
    const extOkUp = extAtrUp <= p.maxExtAtr;
    const extOkDn = extAtrDn <= p.maxExtAtr;

    const entry = c.close;
    const sl = i >= 1 ? swingLow[i - 1] : NaN;
    const sh = i >= 1 ? swingHigh[i - 1] : NaN;
    const structSLBuy = sl - atrVal * p.structBufferAtr;
    const structSLSell = sh + atrVal * p.structBufferAtr;

    const riskStructBuy = entry - structSLBuy;
    const slModeBuy = riskStructBuy >= p.minRiskAtr * atrVal;
    const slBuy = slModeBuy ? structSLBuy : entry - p.atrFallbackMult * atrVal;
    const riskBuy = entry - slBuy;
    const riskAtrBuy = riskBuy / Math.max(atrVal, 1e-10);
    const riskGateBuyOk = !isNaN(atrVal) && atrVal > 0 && slBuy < entry && riskAtrBuy <= p.maxRiskAtr;
    const tp1Buy = entry + riskBuy * p.tp1R;
    const tp2Buy = entry + riskBuy * p.tp2R;

    const riskStructSell = structSLSell - entry;
    const slModeSell = riskStructSell >= p.minRiskAtr * atrVal;
    const slSell = slModeSell ? structSLSell : entry + p.atrFallbackMult * atrVal;
    const riskSell = slSell - entry;
    const riskAtrSell = riskSell / Math.max(atrVal, 1e-10);
    const riskGateSellOk = !isNaN(atrVal) && atrVal > 0 && slSell > entry && riskAtrSell <= p.maxRiskAtr;
    const tp1Sell = entry - riskSell * p.tp1R;
    const tp2Sell = entry - riskSell * p.tp2R;

    // Position tracking
    if (posState !== 0 && barIdx > posBar) {
      posAge++;
      const favR = posState === 1 ? (c.high - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.low) / Math.max(posRisk, 1e-10);
      const advR = posState === 1 ? (posEntry - c.low) / Math.max(posRisk, 1e-10) : (c.high - posEntry) / Math.max(posRisk, 1e-10);
      posMFE = Math.max(posMFE, favR);
      posMAE = Math.max(posMAE, advR);

      const slHit = posState === 1 ? c.low <= posSL : c.high >= posSL;
      const tp1Hit = posState === 1 ? c.high >= posTP1 : c.low <= posTP1;
      const tp2Hit = posState === 1 ? c.high >= posTP2 : c.low <= posTP2;

      let outcome = null;
      let finalR = 0;

      if (slHit && (tp1Hit || tp2Hit)) {
        outcome = "AMBIGUOUS";
        finalR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
      } else if (slHit) {
        outcome = "SL FIRST";
        finalR = -1.0;
      } else if (tp2Hit) {
        outcome = "TP2 FIRST";
        finalR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
      } else if (tp1Hit) {
        outcome = "TP1 FIRST";
        finalR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
      } else if (posAge >= p.outcomeBars) {
        outcome = "EXPIRED";
        finalR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
      }

      if (outcome) {
        trades.push({
          direction: posDir, entry: posEntry, sl: posSL, tp1: posTP1, tp2: posTP2,
          risk: posRisk, riskAtr: posRiskAtr, exitPrice: outcome === "SL FIRST" ? posSL : c.close,
          exitReason: outcome, exitBar: barIdx, exitTime: c.timestamp,
          entryTime: candles[posBar].timestamp, entryBar: posBar, finalR,
          mfe: posMFE, mae: posMAE, age: posAge, extAtr: posExtAtr, bodyPct: posBodyPct,
          ema21: posEma21, atr: posAtrVal, structSL: posStructSL,
          rr1: posRR1, rr2: posRR2, trigger: posTrigger,
        });
        posState = 0;
      }
    }

    // New entries
    const cfgOk = p.emaTrigLen < p.emaDirLen && p.emaDirLen < p.emaSlowLen && p.swingLookback >= 2 && p.tp1R > 0 && p.tp2R > p.tp1R && p.maxRiskAtr > p.minRiskAtr;
    const canEnterLong = posState === 0 || posState === -1;
    const canEnterShort = posState === 0 || posState === 1;

    // Compute features for filter (raw values: distEMA21 is negative for SELL, slope21 is negative for downtrend)
    const distEMA21Val = (c.close - emaDir[i]) / Math.max(atrVal, 1e-10);
    const slope21Val = (emaDir[i] - emaDir[i - 3]) / Math.max(atrVal * 3, 1e-10);
    const structSLDistVal = (structSLSell - c.close) / Math.max(atrVal, 1e-10);

    const entryUp = cfgOk && setupUp && triggerUp && extOkUp && bodyOkUp && riskGateBuyOk && canEnterLong;
    const entryDn = cfgOk && setupDn && triggerDn && extOkDn && bodyOkDn && riskGateSellOk && canEnterShort
      && signalFilter({ direction: "SELL", trigger: pullbackDn ? "PULLBACK RESUME" : "BREAKOUT", distEMA21: distEMA21Val, slope21: slope21Val, structSLDist: structSLDistVal });

    if (entryUp) {
      if (posState === -1) {
        const supR = (c.close - posEntry) / Math.max(posRisk, 1e-10);
        trades.push({
          direction: "SHORT", entry: posEntry, sl: posSL, tp1: posTP1, tp2: posTP2,
          risk: posRisk, riskAtr: posRiskAtr, exitPrice: c.close, exitReason: "SUPERSEDED",
          exitBar: barIdx, exitTime: c.timestamp, entryTime: candles[posBar].timestamp,
          entryBar: posBar, finalR: supR, mfe: posMFE, mae: posMAE, age: posAge,
          extAtr: posExtAtr, bodyPct: posBodyPct, ema21: posEma21, atr: posAtrVal,
          structSL: posStructSL, rr1: posRR1, rr2: posRR2, trigger: posTrigger,
        });
      }
      posState = 1;
      posBar = barIdx;
      posEntry = entry;
      posSL = slBuy;
      posTP1 = tp1Buy;
      posTP2 = tp2Buy;
      posRisk = riskBuy;
      posRiskAtr = riskAtrBuy;
      posAge = 0;
      posMFE = 0;
      posMAE = 0;
      posDir = "BUY";
      posExtAtr = extAtrUp;
      posBodyPct = bodyPct;
      posEma21 = emaDir[i];
      posAtrVal = atrVal;
      posStructSL = structSLBuy;
      posRR1 = p.tp1R;
      posRR2 = p.tp2R;
      posTrigger = pullbackUp ? "PULLBACK RESUME" : "BREAKOUT";
      signals.push({
        bar: barIdx, time: c.timestamp, direction: "BUY", trigger: posTrigger,
        entry, sl: slBuy, tp1: tp1Buy, tp2: tp2Buy, riskAtr: riskAtrBuy,
        extAtr: extAtrUp, bodyPct, ema21: emaDir[i], atr: atrVal,
        structSL: structSLBuy,
        regime: trendUp ? "TREND UP" : trendDn ? "TREND DOWN" : highVol ? "HIGH VOL" : "RANGING",
        setupState: setupUp ? "LONG" : "NONE",
      });
    }

    if (entryDn) {
      if (posState === 1) {
        const supR = (posEntry - c.close) / Math.max(posRisk, 1e-10);
        trades.push({
          direction: "LONG", entry: posEntry, sl: posSL, tp1: posTP1, tp2: posTP2,
          risk: posRisk, riskAtr: posRiskAtr, exitPrice: c.close, exitReason: "SUPERSEDED",
          exitBar: barIdx, exitTime: c.timestamp, entryTime: candles[posBar].timestamp,
          entryBar: posBar, finalR: supR, mfe: posMFE, mae: posMAE, age: posAge,
          extAtr: posExtAtr, bodyPct: posBodyPct, ema21: posEma21, atr: posAtrVal,
          structSL: posStructSL, rr1: posRR1, rr2: posRR2, trigger: posTrigger,
        });
      }
      posState = -1;
      posBar = barIdx;
      posEntry = entry;
      posSL = slSell;
      posTP1 = tp1Sell;
      posTP2 = tp2Sell;
      posRisk = riskSell;
      posRiskAtr = riskAtrSell;
      posAge = 0;
      posMFE = 0;
      posMAE = 0;
      posDir = "SELL";
      posExtAtr = extAtrDn;
      posBodyPct = bodyPct;
      posEma21 = emaDir[i];
      posAtrVal = atrVal;
      posStructSL = structSLSell;
      posRR1 = p.tp1R;
      posRR2 = p.tp2R;
      posTrigger = pullbackDn ? "PULLBACK RESUME" : "BREAKOUT";
      signals.push({
        bar: barIdx, time: c.timestamp, direction: "SELL", trigger: posTrigger,
        entry, sl: slSell, tp1: tp1Sell, tp2: tp2Sell, riskAtr: riskAtrSell,
        extAtr: extAtrDn, bodyPct, ema21: emaDir[i], atr: atrVal,
        structSL: structSLSell,
        regime: trendUp ? "TREND UP" : trendDn ? "TREND DOWN" : highVol ? "HIGH VOL" : "RANGING",
        setupState: setupDn ? "SHORT" : "NONE",
      });
    }
  }

  return { signals, trades, candles };
}

// ═══════════════════════════════════════════════════════════════════
// EXPERIMENTS
// ═══════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(80));
console.log("HYPOTHESIS TESTING");
console.log("=".repeat(80));

const experiments = [];

// Baseline
const baseline = runWithFilter("EXP-001: Baseline", () => true);
experiments.push(baseline);

// Hypothesis A: distEMA21 < -1.0 filter on SELL
const expA = runWithFilter("EXP-005: distEMA21 > -1.0 (SELL only)", (sig) => {
  if (sig.direction !== "SELL" || sig.trigger !== "PULLBACK RESUME") return true;
  return sig.distEMA21 > -1.0;
});
experiments.push(expA);

// Hypothesis B: slope21 < -0.25 filter on SELL
const expB = runWithFilter("EXP-006: slope21 > -0.25 (SELL only)", (sig) => {
  if (sig.direction !== "SELL" || sig.trigger !== "PULLBACK RESUME") return true;
  return sig.slope21 > -0.25;
});
experiments.push(expB);

// Hypothesis C: Combined filter
const expC = runWithFilter("EXP-007: Combined (distEMA21 > -1.0 AND slope21 > -0.25)", (sig) => {
  if (sig.direction !== "SELL" || sig.trigger !== "PULLBACK RESUME") return true;
  return sig.distEMA21 > -1.0 && sig.slope21 > -0.25;
});
experiments.push(expC);

// Hypothesis D: structSLDist > 2.0 filter
const expD = runWithFilter("EXP-008: structSLDist < 2.0 (SELL only)", (sig) => {
  if (sig.direction !== "SELL" || sig.trigger !== "PULLBACK RESUME") return true;
  return sig.structSLDist < 2.0;
});
experiments.push(expD);

// Hypothesis E: distEMA21 > -0.8 (more aggressive)
const expE = runWithFilter("EXP-009: distEMA21 > -0.8 (SELL only)", (sig) => {
  if (sig.direction !== "SELL" || sig.trigger !== "PULLBACK RESUME") return true;
  return sig.distEMA21 > -0.8;
});
experiments.push(expE);

// Hypothesis F: structSLDist < 1.8 (more aggressive)
const expF = runWithFilter("EXP-010: structSLDist < 1.8 (SELL only)", (sig) => {
  if (sig.direction !== "SELL" || sig.trigger !== "PULLBACK RESUME") return true;
  return sig.structSLDist < 1.8;
});
experiments.push(expF);

// Hypothesis G: Combined best filters
const expG = runWithFilter("EXP-011: Combined (distEMA21 > -1.0 AND structSLDist < 2.0)", (sig) => {
  if (sig.direction !== "SELL" || sig.trigger !== "PULLBACK RESUME") return true;
  return sig.distEMA21 > -1.0 && sig.structSLDist < 2.0;
});
experiments.push(expG);

// Print results
console.log("\n  Results:");
console.log("  " + "-".repeat(110));
console.log(`  ${"Experiment".padEnd(45)} ${"Trades".padStart(7)} ${"Win%".padStart(7)} ${"PF".padStart(7)} ${"Net R".padStart(10)} ${"Avg R".padStart(8)} ${"MaxDD".padStart(10)} ${"BUY R".padStart(8)} ${"SELL R".padStart(8)}`);
console.log("  " + "-".repeat(110));

for (const e of experiments) {
  console.log(`  ${e.label.padEnd(45)} ${String(e.trades).padStart(7)} ${e.winRate.toFixed(1).padStart(7)} ${(e.pf === Infinity ? "∞" : e.pf.toFixed(2)).padStart(7)} ${e.totalR.toFixed(2).padStart(10)} ${e.avgR.toFixed(3).padStart(8)} ${e.maxDD.toFixed(2).padStart(10)} ${e.buyR.toFixed(2).padStart(8)} ${e.sellR.toFixed(2).padStart(8)}`);
}
console.log("  " + "-".repeat(110));

// Delta analysis
console.log("\n  Delta from Baseline:");
console.log("  " + "-".repeat(90));
const bl = experiments[0];
for (let i = 1; i < experiments.length; i++) {
  const e = experiments[i];
  const deltaSignals = e.trades - bl.trades;
  const deltaWR = e.winRate - bl.winRate;
  const deltaR = e.totalR - bl.totalR;
  const deltaPF = (e.pf === Infinity ? 999 : e.pf) - (bl.pf === Infinity ? 999 : bl.pf);
  console.log(`  ${e.label.padEnd(45)} Δsignals=${deltaSignals > 0 ? "+" : ""}${deltaSignals}  ΔWR=${deltaWR > 0 ? "+" : ""}${deltaWR.toFixed(1)}%  ΔR=${deltaR > 0 ? "+" : ""}${deltaR.toFixed(2)}  ΔPF=${deltaPF > 0 ? "+" : ""}${deltaPF.toFixed(2)}`);
}
console.log("  " + "-".repeat(90));

// Save
const output = {
  timestamp: new Date().toISOString(),
  experiments: experiments.map(e => ({
    label: e.label, trades: e.trades, winners: e.winners, losers: e.losers,
    winRate: e.winRate, pf: e.pf, totalR: e.totalR, avgR: e.avgR, maxDD: e.maxDD,
    avgMFE: e.avgMFE, avgMAE: e.avgMAE, slCount: e.slCount, tpCount: e.tpCount,
    expCount: e.expCount, buyCount: e.buyCount, sellCount: e.sellCount,
    buyR: e.buyR, sellR: e.sellR,
  })),
};

fs.writeFileSync(path.join(OUTPUT_DIR, "HYPOTHESIS-RESULTS.json"), JSON.stringify(output, null, 2));
console.log(`\nSaved to ${path.join(OUTPUT_DIR, "HYPOTHESIS-RESULTS.json")}`);
