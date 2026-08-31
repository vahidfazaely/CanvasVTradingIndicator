#!/usr/bin/env node
// Parameter sweep for atrStopMult
// Usage: node sweep.mjs

import fs from 'node:fs';
import path from 'node:path';
import { runEngine } from './engine.mjs';

const DATA_DIR = path.join(import.meta.dirname, 'engine', 'data');

const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const atrValues = [1.0, 1.25, 1.5, 1.75, 2.0];

console.log('='.repeat(80));
console.log('  CanvasV V4 FAST — Parameter Sweep: atrStopMult');
console.log('='.repeat(80));
console.log('');

// Header
const header = ['atrStopMult', ...symbols.map(s => `${s} NetR`), ...symbols.map(s => `${s} WR%`), 'Avg NetR'].join(' | ');
console.log(header);
console.log('-'.repeat(header.length));

const results = [];

for (const atrStop of atrValues) {
  const row = [atrStop.toFixed(2)];
  const netRs = [];
  
  for (const symbol of symbols) {
    const dataFile = path.join(DATA_DIR, `${symbol}-15m.json`);
    if (!fs.existsSync(dataFile)) {
      row.push('N/A');
      row.push('N/A');
      continue;
    }
    
    const candles = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const { trades } = runEngine(candles, { atrStopMult: atrStop });
    
    const wins = trades.filter(t => t.finalR > 0);
    const netR = trades.reduce((s, t) => s + t.finalR, 0);
    const wr = (wins.length / trades.length * 100).toFixed(1);
    
    row.push((netR >= 0 ? '+' : '') + netR.toFixed(2));
    row.push(wr + '%');
    netRs.push(netR);
  }
  
  const avgNetR = netRs.reduce((s, r) => s + r, 0) / netRs.length;
  row.push((avgNetR >= 0 ? '+' : '') + avgNetR.toFixed(2));
  
  results.push({ atrStop, netRs, avgNetR });
  console.log(row.join(' | '));
}

console.log('');
console.log('='.repeat(80));
console.log('  Best avg NetR:');
const best = results.reduce((a, b) => a.avgNetR > b.avgNetR ? a : b);
console.log(`    atrStopMult = ${best.atrStop} → Avg NetR = ${best.avgNetR >= 0 ? '+' : ''}${best.avgNetR.toFixed(2)}R`);
console.log('='.repeat(80));
