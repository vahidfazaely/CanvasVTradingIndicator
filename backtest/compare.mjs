#!/usr/bin/env node
// CanvasV V4.2 — Before vs After comparison
import fs from 'node:fs';
import path from 'node:path';
import { runEngine, analyzeSLFailures, generateReport } from './engine.mjs';

const DATA_DIR = path.join(import.meta.dirname, 'engine', 'data');
const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

// BEFORE: original parameters (Phase 1 baseline)
const BEFORE = {
  enableFixedRisk: false,
  enableBtBuffer: false,
  enableCloseLoc: false,
  enableBtExtFilter: false,
  enableRelVol: false,
  hvMode: 'Allow',
};

// AFTER: new V4.2 defaults
const AFTER = {};  // Use engine defaults

function runBenchmark(label, params, symbol) {
  const dataFile = path.join(DATA_DIR, `${symbol}-15m.json`);
  if (!fs.existsSync(dataFile)) return null;
  const candles = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const { signals, trades } = runEngine(candles, params);
  const analyzed = analyzeSLFailures(trades, candles, 20);
  const report = generateReport(trades);
  
  // Breakdown by direction and trigger
  const buyTrades = trades.filter(t => t.direction === 'BUY' || t.direction === 'LONG');
  const sellTrades = trades.filter(t => t.direction === 'SELL' || t.direction === 'SHORT');
  const buyR = buyTrades.reduce((s, t) => s + t.finalR, 0);
  const sellR = sellTrades.reduce((s, t) => s + t.finalR, 0);
  
  const pbTrades = trades.filter(t => t.trigger === 'PULLBACK RESUME');
  const btTrades = trades.filter(t => t.trigger === 'BREAKOUT');
  const pbR = pbTrades.reduce((s, t) => s + t.finalR, 0);
  const btR = btTrades.reduce((s, t) => s + t.finalR, 0);
  
  // High-vol breakdown
  const hvTrades = trades.filter(t => t.highVol);
  const normalTrades = trades.filter(t => !t.highVol);
  const hvR = hvTrades.reduce((s, t) => s + t.finalR, 0);
  const normalR = normalTrades.reduce((s, t) => s + t.finalR, 0);
  
  // SL failure types
  const slFails = analyzed.filter(t => t.slFailure);
  const tight = slFails.filter(t => t.slFailure.classification === 'STOP_TOO_TIGHT').length;
  const late = slFails.filter(t => t.slFailure.classification === 'LATE_ENTRY').length;
  const cont = slFails.filter(t => t.slFailure.classification === 'CONTINUATION').length;
  
  return {
    label, symbol,
    trades: report.totalTrades,
    winners: report.winners,
    losers: report.losers,
    winRate: report.winRate,
    pf: report.profitFactor,
    netR: report.totalR,
    avgR: report.avgR,
    avgWinner: report.avgWinner,
    avgLoser: report.avgLoser,
    maxDD: report.maxDrawdownR,
    slPct: report.slHitPct,
    buyR, sellR,
    buyCount: buyTrades.length,
    sellCount: sellTrades.length,
    pbR, btR,
    pbCount: pbTrades.length,
    btCount: btTrades.length,
    hvR, normalR,
    hvCount: hvTrades.length,
    normalCount: normalTrades.length,
    slTight: tight,
    slLate: late,
    slCont: cont,
    slTotal: slFails.length,
  };
}

console.log('='.repeat(90));
console.log('  CanvasV V4.2 — Before vs After Comparison');
console.log('='.repeat(90));

for (const symbol of symbols) {
  console.log(`\n${'─'.repeat(90)}`);
  console.log(`  ${symbol}`);
  console.log(`${'─'.repeat(90)}`);
  
  const before = runBenchmark('BEFORE', BEFORE, symbol);
  const after = runBenchmark('AFTER', AFTER, symbol);
  
  if (!before || !after) {
    console.log('  Missing data file, skipping.');
    continue;
  }
  
  const fmt = (v, dec = 2) => {
    if (typeof v !== 'number' || isNaN(v)) return 'N/A';
    return v >= 0 ? `+${v.toFixed(dec)}` : v.toFixed(dec);
  };
  const fmtPct = v => typeof v === 'number' ? v.toFixed(1) + '%' : 'N/A';
  
  const rows = [
    ['Metric', 'BEFORE', 'AFTER', 'Change'],
    ['─'.repeat(20), '─'.repeat(12), '─'.repeat(12), '─'.repeat(12)],
    ['Trades', before.trades, after.trades, after.trades - before.trades],
    ['Winners', before.winners, after.winners, after.winners - before.winners],
    ['Losers', before.losers, after.losers, after.losers - before.losers],
    ['Win Rate', fmtPct(before.winRate), fmtPct(after.winRate), fmtPct(after.winRate - before.winRate)],
    ['Profit Factor', before.pf.toFixed(2), after.pf.toFixed(2), (after.pf - before.pf).toFixed(2)],
    ['Net R', fmt(before.netR), fmt(after.netR), fmt(after.netR - before.netR)],
    ['Avg R', fmt(before.avgR, 3), fmt(after.avgR, 3), fmt(after.avgR - before.avgR, 3)],
    ['Avg Winner', fmt(before.avgWinner, 3), fmt(after.avgWinner, 3), ''],
    ['Avg Loser', fmt(before.avgLoser, 3), fmt(after.avgLoser, 3), ''],
    ['Max Drawdown', fmt(before.maxDD), fmt(after.maxDD), ''],
    ['SL Hit %', fmtPct(before.slPct), fmtPct(after.slPct), ''],
    ['', '', '', ''],
    ['BUY Net R', fmt(before.buyR), fmt(after.buyR), fmt(after.buyR - before.buyR)],
    ['SELL Net R', fmt(before.sellR), fmt(after.sellR), fmt(after.sellR - before.sellR)],
    ['BUY Count', before.buyCount, after.buyCount, ''],
    ['SELL Count', before.sellCount, after.sellCount, ''],
    ['', '', '', ''],
    ['PULLBACK Net R', fmt(before.pbR), fmt(after.pbR), fmt(after.pbR - before.pbR)],
    ['BREAKOUT Net R', fmt(before.btR), fmt(after.btR), fmt(after.btR - before.btR)],
    ['PULLBACK Count', before.pbCount, after.pbCount, ''],
    ['BREAKOUT Count', before.btCount, after.btCount, ''],
    ['', '', '', ''],
    ['HV Net R', fmt(before.hvR), fmt(after.hvR), fmt(after.hvR - before.hvR)],
    ['Normal Net R', fmt(before.normalR), fmt(after.normalR), fmt(after.normalR - before.normalR)],
    ['HV Count', before.hvCount, after.hvCount, ''],
    ['Normal Count', before.normalCount, after.normalCount, ''],
    ['', '', '', ''],
    ['SL TOO TIGHT', before.slTight, after.slTight, after.slTight - before.slTight],
    ['SL LATE ENTRY', before.slLate, after.slLate, after.slLate - before.slLate],
    ['SL CONTINUATION', before.slCont, after.slCont, after.slCont - before.slCont],
  ];
  
  for (const row of rows) {
    console.log(`  ${String(row[0]).padEnd(20)} ${String(row[1]).padStart(12)} ${String(row[2]).padStart(12)} ${String(row[3]).padStart(12)}`);
  }
}

console.log(`\n${'='.repeat(90)}`);
console.log('  Summary:');
console.log('  BEFORE = original signal logic (no vol, no close-loc, no bt-buffer)');
console.log('  AFTER  = V4.2 defaults (relVol, close-loc, bt-buffer, hv-mode)');
console.log(`${'='.repeat(90)}`);
