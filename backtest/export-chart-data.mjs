// Export backtest results in the format the chart viewer expects
// Usage: node backtest/export-chart-data.mjs
import { runEngine } from './engine.mjs';
import fs from 'node:fs';

const SYMBOL = 'BTCUSDT';
const TIMEFRAME = '15m';
const DAYS = 180;

console.log(`Running engine for ${SYMBOL} ${TIMEFRAME} (${DAYS} days)...`);
const result = await runEngine(SYMBOL, TIMEFRAME, DAYS);

// Map candles
const candles = result.candles.map(c => ({
  time: c.timestamp,
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
  volume: c.volume,
}));

// Map trades
const trades = result.trades.map(t => ({
  direction: t.direction,
  entry: t.entry,
  sl: t.sl,
  tp1: t.tp1,
  tp2: t.tp2,
  risk: t.risk,
  riskAtr: t.riskAtr,
  exitPrice: t.exitPrice,
  exit: t.exitReason,
  r: t.finalR,
  mfe: t.mfe,
  mae: t.mae,
  bars: t.age,
  entryTime: t.entryTime,
  exitTime: t.exitTime,
  entryBar: t.entryBar,
  trigger: t.trigger,
  regime: t.regime || '',
  extAtr: t.extAtr,
  bodyPct: t.bodyPct,
}));

// Stats
const wins = trades.filter(t => t.r > 0);
const losses = trades.filter(t => t.r <= 0 && t.exit !== 'EXPIRED');
const netR = trades.reduce((s, t) => s + t.r, 0);
const pfNum = wins.reduce((s, t) => s + t.r, 0);
const pfDenom = losses.reduce((s, t) => s + Math.abs(t.r), 0);

const stats = {
  total: trades.length,
  wins: wins.length,
  losses: losses.length,
  winRate: (wins.length / trades.length * 100).toFixed(1) + '%',
  netR: netR.toFixed(2),
  profitFactor: pfDenom > 0 ? (pfNum / pfDenom).toFixed(2) : '∞',
  avgR: (netR / trades.length).toFixed(3),
};

const output = { candles, trades, stats };

// Write to chart viewer directory
const outPath = new URL('./engine/output/chart-data.json', import.meta.url);
fs.writeFileSync(outPath, JSON.stringify(output));
console.log(`Exported ${candles.length} candles, ${trades.length} trades to ${outPath.pathname}`);
console.log('Stats:', stats);

// Also inject into the HTML
const htmlPath = new URL('./chart-viewer.html', import.meta.url);
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace the loadData function to use embedded data
const dataScript = `<script>window.__DATA__ = ${JSON.stringify(output)};</script>`;
html = html.replace('// ============================================================\n// DATA INJECTION', dataScript + '\n// ============================================================\n// DATA INJECTION');

const outHtml = new URL('./engine/output/chart-viewer.html', import.meta.url);
fs.writeFileSync(outHtml, html);
console.log(`Chart viewer saved to ${outHtml.pathname}`);
