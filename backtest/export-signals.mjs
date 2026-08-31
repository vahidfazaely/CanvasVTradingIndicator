// Export all signals as a Gemini-friendly analysis file
// Usage: node backtest/export-signals.mjs
import fs from 'node:fs';
import path from 'node:path';
import { runEngine, analyzeSLFailures, generateReport } from './engine.mjs';

const DATA_DIR = path.join(import.meta.dirname, 'engine', 'data');
const OUTPUT_DIR = path.join(import.meta.dirname, 'engine', 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Load data
const dataFile = path.join(DATA_DIR, 'BTCUSDT-15m.json');
console.log(`Loading ${dataFile}...`);
const candles = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
console.log(`Loaded ${candles.length} candles`);

// Run engine
console.log('Running V4 FAST signal engine...');
const { signals, trades } = runEngine(candles);
const analyzedTrades = analyzeSLFailures(trades, candles, 20);
const report = generateReport(trades);

// Build export
let out = '';

out += '# CanvasV V4 FAST — Complete Signal Export\n';
out += `# Generated: ${new Date().toISOString()}\n`;
out += `# Symbol: BTCUSDT | Timeframe: M15 | Period: 180 days\n`;
out += `# Candles: ${candles.length} | Signals: ${signals.length} | Trades: ${trades.length}\n`;
out += '#\n';
out += '# === SUMMARY ===\n';
out += `# Win Rate: ${report.winRate.toFixed(1)}% | Profit Factor: ${report.profitFactor === Infinity ? '∞' : report.profitFactor.toFixed(2)} | Net R: ${report.totalR >= 0 ? '+' : ''}${report.totalR.toFixed(2)}\n`;
out += `# Winners: ${report.winners} | Losers: ${report.losers} | Expired: ${report.expiredTrades}\n`;
out += `# Avg Winner: ${report.avgWinner >= 0 ? '+' : ''}${report.avgWinner.toFixed(3)}R | Avg Loser: ${report.avgLser?.toFixed(3) || report.avgLoser?.toFixed(3)}R\n`;
out += `# Avg MFE: ${report.avgMFE.toFixed(3)}R | Avg MAE: ${report.avgMAE.toFixed(3)}R | Avg Hold: ${report.avgHoldingBars.toFixed(1)} bars\n`;
out += '#\n';
out += '# === COLUMN LEGEND ===\n';
out += '# # | Direction | Trigger | Entry | SL | TP1 | TP2 | ExitPrice | ExitType | R | MFE | MAE | Bars | RiskATR | ExtATR | Body% | Regime\n';
out += '#\n';
out += '='.repeat(160) + '\n\n';

// Write every trade as a structured line
analyzedTrades.forEach((t, i) => {
  const entryDate = new Date(t.entryTime > 1e12 ? t.entryTime : t.entryTime * 1000);
  const exitDate = t.exitTime ? new Date(t.exitTime > 1e12 ? t.exitTime : t.exitTime * 1000) : null;
  
  const entryDateStr = entryDate.toISOString().slice(0, 16);
  const exitDateStr = exitDate ? exitDate.toISOString().slice(0, 16) : '—';

  out += `--- TRADE ${String(i + 1).padStart(3, '0')} ---\n`;
  out += `Direction:     ${t.direction}\n`;
  out += `Trigger:       ${t.trigger}\n`;
  out += `Entry Date:    ${entryDateStr}\n`;
  out += `Exit Date:     ${exitDateStr}\n`;
  out += `Entry Price:   ${t.entry.toFixed(2)}\n`;
  out += `Stop Loss:     ${t.sl.toFixed(2)}\n`;
  out += `Take Profit 1: ${t.tp1 ? t.tp1.toFixed(2) : 'N/A'}\n`;
  out += `Take Profit 2: ${t.tp2 ? t.tp2.toFixed(2) : 'N/A'}\n`;
  out += `Exit Price:    ${t.exitPrice ? t.exitPrice.toFixed(2) : 'N/A'}\n`;
  out += `Exit Type:     ${t.exitReason || t.exit}\n`;
  out += `R Result:      ${(t.finalR || t.r) >= 0 ? '+' : ''}${(t.finalR || t.r).toFixed(3)}R\n`;
  out += `MFE:           +${t.mfe.toFixed(3)}R\n`;
  out += `MAE:           -${t.mae.toFixed(3)}R\n`;
  out += `Bars Held:     ${t.age}\n`;
  out += `Risk (ATR):    ${t.riskAtr ? t.riskAtr.toFixed(3) : 'N/A'}\n`;
  out += `Extension:     ${t.extAtr ? t.extAtr.toFixed(3) : 'N/A'} ATR\n`;
  out += `Body %:        ${t.bodyPct ? t.bodyPct.toFixed(1) : 'N/A'}%\n`;
  out += `EMA21:         ${t.ema21 ? t.ema21.toFixed(2) : 'N/A'}\n`;
  out += `ATR:           ${t.atr ? t.atr.toFixed(2) : 'N/A'}\n`;
  out += `Struct SL:     ${t.structSL ? t.structSL.toFixed(2) : 'N/A'}\n`;
  out += `RR1:           ${t.rr1 ? t.rr1.toFixed(2) : 'N/A'}\n`;
  out += `RR2:           ${t.rr2 ? t.rr2.toFixed(2) : 'N/A'}\n`;
  if (t.slFailure) {
    out += `SL Failure:    ${t.slFailure.classification}\n`;
    out += `Post-SL MFE:   +${t.slFailure.postMFE.toFixed(3)}R over ${t.slFailure.postBars} bars\n`;
  }
  out += '\n';
});

// Add SL failure summary
const slFailures = analyzedTrades.filter(t => t.slFailure);
out += '='.repeat(160) + '\n';
out += '# SL FAILURE BREAKDOWN\n';
out += '='.repeat(160) + '\n\n';

const categories = ['STOP_TOO_TIGHT', 'MARGINAL_STOP', 'LATE_ENTRY', 'OVEREXTENDED', 'CONTINUATION'];
for (const cat of categories) {
  const catTrades = slFailures.filter(t => t.slFailure.classification === cat);
  if (catTrades.length === 0) continue;
  const avgR = catTrades.reduce((s, t) => s + (t.finalR || t.r), 0) / catTrades.length;
  const avgPostMFE = catTrades.reduce((s, t) => s + t.slFailure.postMFE, 0) / catTrades.length;
  const avgBars = catTrades.reduce((s, t) => s + t.slFailure.postBars, 0) / catTrades.length;
  
  out += `## ${cat} (${catTrades.length} trades)\n`;
  out += `   Avg R: ${avgR.toFixed(3)} | Avg Post-SL MFE: +${avgPostMFE.toFixed(3)}R | Avg bars to MFE: ${avgBars.toFixed(1)}\n`;
  out += `   Trades: ${catTrades.map((t, i) => `#${analyzedTrades.indexOf(t) + 1}`).join(', ')}\n\n`;
}

// Add analysis prompt
out += '='.repeat(160) + '\n';
out += '# ANALYSIS PROMPT FOR GEMINI\n';
out += '='.repeat(160) + '\n\n';
out += 'I am trading BTCUSDT on 15-minute charts using the CanvasV V4 FAST indicator.\n';
out += 'The indicator uses a 5-stage pipeline: Regime → Direction/Momentum → Trigger → Entry Quality → Risk.\n\n';
out += 'The current results show:\n';
out += `- ${report.totalTrades} trades over 180 days\n`;
out += `- ${report.winRate.toFixed(1)}% win rate\n`;
out += `- ${report.profitFactor === Infinity ? '∞' : report.profitFactor.toFixed(2)} profit factor\n`;
out += `- ${report.totalR >= 0 ? '+' : ''}${report.totalR.toFixed(2)}R net\n\n`;
out += 'Please analyze the complete signal export above and identify:\n';
out += '1. What do winning trades have in common vs losing trades?\n';
out += '2. Are there specific market conditions where the indicator performs better/worse?\n';
out += '3. Which trigger type (PULLBACK RESUME vs BREAKOUT) is more profitable?\n';
out += '4. Is there a directional bias (BUY vs SELL)?\n';
out += '5. What changes to filters, parameters, or entry rules could improve the system?\n';
out += '6. Are there any patterns in the STOP_TOO_TIGHT or LATE_ENTRY failures?\n';
out += '7. What additional filters or conditions would you suggest?\n';

// Write file
const outFile = path.join(OUTPUT_DIR, 'SIGNALS-FOR-GEMINI.txt');
fs.writeFileSync(outFile, out);
console.log(`\nExported ${analyzedTrades.length} signals to ${outFile}`);
console.log(`File size: ${(out.length / 1024).toFixed(1)} KB`);

// Also export a compact CSV version
let csv = 'Trade#,Direction,Trigger,EntryDate,Entry,SL,TP1,TP2,ExitPrice,ExitType,R,MFE,MAE,Bars,RiskATR,ExtATR,BodyPct\n';
analyzedTrades.forEach((t, i) => {
  const d = new Date(t.entryTime > 1e12 ? t.entryTime : t.entryTime * 1000);
  const ds = d.toISOString().slice(0, 16);
  csv += `${i+1},${t.direction},${t.trigger},${ds},${t.entry.toFixed(2)},${t.sl.toFixed(2)},${t.tp1?.toFixed(2) || ''},${t.tp2?.toFixed(2) || ''},${t.exitPrice?.toFixed(2) || ''},${t.exitReason || t.exit},${(t.finalR || t.r).toFixed(3)},${t.mfe.toFixed(3)},${t.mae.toFixed(3)},${t.age},${t.riskAtr?.toFixed(3) || ''},${t.extAtr?.toFixed(3) || ''},${t.bodyPct?.toFixed(1) || ''}\n`;
});
const csvFile = path.join(OUTPUT_DIR, 'SIGNALS.csv');
fs.writeFileSync(csvFile, csv);
console.log(`CSV export: ${csvFile}`);

console.log('\nDone! Share SIGNALS-FOR-GEMINI.txt with Gemini for analysis.');
