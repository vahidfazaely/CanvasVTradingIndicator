#!/usr/bin/env node
// CanvasV V4 FAST — Local Backtest Runner
// Usage: node run.mjs [--symbol BTCUSDT] [--timeframe 15m] [--days 180]
//       node run.mjs --data path/to/candles.json

import fs from "node:fs";
import path from "node:path";
import { runEngine, analyzeSLFailures, generateReport } from "./engine.mjs";

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUTPUT_DIR = path.join(import.meta.dirname, "engine", "output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Load data
let candles;
const dataPath = getArg("data", null);
if (dataPath) {
  console.log(`Loading data from ${dataPath}...`);
  candles = JSON.parse(fs.readFileSync(dataPath, "utf8"));
} else {
  const symbol = getArg("symbol", "BTCUSDT");
  const tf = getArg("timeframe", "15m");
  const dataFile = path.join(DATA_DIR, `${symbol}-${tf}.json`);
  if (!fs.existsSync(dataFile)) {
    console.error(`Data file not found: ${dataFile}`);
    console.error(`Run: node fetch-data.mjs --symbol ${symbol} --interval ${tf}`);
    process.exit(1);
  }
  console.log(`Loading ${dataFile}...`);
  candles = JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

console.log(`Loaded ${candles.length} candles`);
console.log(`Date range: ${new Date(candles[0].timestamp).toISOString()} to ${new Date(candles[candles.length - 1].timestamp).toISOString()}`);
console.log(`Price range: ${Math.min(...candles.map(c => c.low)).toFixed(2)} - ${Math.max(...candles.map(c => c.high)).toFixed(2)}`);

// Run engine
console.log("\nRunning V4 FAST signal engine...");
const { signals, trades } = runEngine(candles);

console.log(`\nGenerated ${signals.length} signals, ${trades.length} trades`);

// Analyze SL failures
console.log("Analyzing SL failures...");
const analyzedTrades = analyzeSLFailures(trades, candles, 20);

// Generate report
const report = generateReport(trades);

// Print report
console.log("\n" + "=".repeat(60));
console.log("  CanvasV V4 FAST — Baseline Backtest Report");
console.log("=".repeat(60));
console.log(`  Total signals:     ${report.totalSignals}`);
console.log(`  BUY signals:       ${report.buyTrades}`);
console.log(`  SELL signals:      ${report.sellTrades}`);
console.log(`  Total trades:      ${report.totalTrades}`);
console.log(`  Winners:           ${report.winners}`);
console.log(`  Losers:            ${report.losers}`);
console.log(`  Win rate:          ${report.winRate.toFixed(1)}%`);
console.log(`  Profit factor:     ${report.profitFactor === Infinity ? "∞" : report.profitFactor.toFixed(2)}`);
console.log(`  Net R:             ${report.totalR >= 0 ? "+" : ""}${report.totalR.toFixed(2)}`);
console.log(`  Average R:         ${report.avgR >= 0 ? "+" : ""}${report.avgR.toFixed(3)}`);
console.log(`  Average winner:    ${report.avgWinner >= 0 ? "+" : ""}${report.avgWinner.toFixed(3)}R`);
console.log(`  Average loser:     ${report.avgLoser.toFixed(3)}R`);
console.log(`  Max drawdown:      ${report.maxDrawdownR.toFixed(2)}R`);
console.log(`  SL hit %:          ${report.slHitPct.toFixed(1)}%`);
console.log(`  TP hit %:          ${report.tpHitPct.toFixed(1)}%`);
console.log(`  Avg MFE:           ${report.avgMFE.toFixed(3)}R`);
console.log(`  Avg MAE:           ${report.avgMAE.toFixed(3)}R`);
console.log(`  Avg holding:       ${report.avgHoldingBars.toFixed(1)} bars`);
console.log(`  Superseded:        ${report.supersededTrades}`);
console.log("=".repeat(60));

// SL failure summary
const slFailures = analyzedTrades.filter(t => t.slFailure);
if (slFailures.length > 0) {
  const tight = slFailures.filter(t => t.slFailure.classification === "STOP_TOO_TIGHT").length;
  const marginal = slFailures.filter(t => t.slFailure.classification === "MARGINAL_STOP").length;
  const late = slFailures.filter(t => t.slFailure.classification === "LATE_ENTRY").length;
  const overext = slFailures.filter(t => t.slFailure.classification === "OVEREXTENDED").length;
  const cont = slFailures.filter(t => t.slFailure.classification === "CONTINUATION").length;
  const avgPostMFE = slFailures.reduce((s, t) => s + t.slFailure.postMFE, 0) / slFailures.length;

  console.log("\n  SL-Failure Analysis:");
  console.log(`  Total SL hits:     ${slFailures.length}`);
  console.log(`  STOP_TOO_TIGHT:    ${tight} (${(tight / slFailures.length * 100).toFixed(1)}%)`);
  console.log(`  MARGINAL_STOP:     ${marginal} (${(marginal / slFailures.length * 100).toFixed(1)}%)`);
  console.log(`  LATE_ENTRY:        ${late} (${(late / slFailures.length * 100).toFixed(1)}%)`);
  console.log(`  OVEREXTENDED:      ${overext} (${(overext / slFailures.length * 100).toFixed(1)}%)`);
  console.log(`  CONTINUATION:      ${cont} (${(cont / slFailures.length * 100).toFixed(1)}%)`);
  console.log(`  Avg post-SL MFE:   ${avgPostMFE.toFixed(3)}R`);
  console.log("=".repeat(60));
}

// Export data
const symbol = getArg("symbol", "BTCUSDT");
const tf = getArg("timeframe", "15m");

const exportData = {
  engine: "CanvasV V4 FAST v4.1.0",
  symbol,
  timeframe: tf,
  dateRange: {
    from: new Date(candles[0].timestamp).toISOString(),
    to: new Date(candles[candles.length - 1].timestamp).toISOString(),
  },
  candleCount: candles.length,
  candles,
  report,
  signals,
  trades: analyzedTrades,
};

const jsonFile = path.join(OUTPUT_DIR, `${symbol}-${tf}-results.json`);
fs.writeFileSync(jsonFile, JSON.stringify(exportData, null, 2));
console.log(`\nExported results to ${jsonFile}`);
