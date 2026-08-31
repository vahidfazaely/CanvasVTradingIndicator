#!/usr/bin/env node
// Fetch OHLCV data from Binance API
// Usage: node fetch-data.mjs --symbol ETHUSDT --interval 15m --days 180

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};

const symbol = getArg('symbol', 'ETHUSDT');
const interval = getArg('interval', '15m');
const days = parseInt(getArg('days', '180'));

const DATA_DIR = path.join(import.meta.dirname, 'engine', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const outFile = path.join(DATA_DIR, `${symbol}-${interval}.json`);

async function fetchKlines(symbol, interval, startTime, endTime) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function main() {
  console.log(`Fetching ${symbol} ${interval} data for ${days} days...`);
  
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60 * 1000;
  
  let allKlines = [];
  let currentStart = startTime;
  
  while (currentStart < now) {
    const klines = await fetchKlines(symbol, interval, currentStart, now);
    if (klines.length === 0) break;
    
    allKlines = allKlines.concat(klines);
    currentStart = klines[klines.length - 1][0] + 1; // Next after last close time
    
    console.log(`  Fetched ${allKlines.length} candles...`);
    
    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }
  
  // Convert to our format
  const candles = allKlines.map(k => ({
    timestamp: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
    quoteVolume: parseFloat(k[7]),
    trades: k[8],
  }));
  
  // Deduplicate by timestamp
  const seen = new Set();
  const unique = candles.filter(c => {
    if (seen.has(c.timestamp)) return false;
    seen.add(c.timestamp);
    return true;
  }).sort((a, b) => a.timestamp - b.timestamp);
  
  fs.writeFileSync(outFile, JSON.stringify(unique, null, 2));
  console.log(`\nSaved ${unique.length} candles to ${outFile}`);
  console.log(`Date range: ${new Date(unique[0].timestamp).toISOString()} to ${new Date(unique[unique.length - 1].timestamp).toISOString()}`);
  console.log(`Price range: ${Math.min(...unique.map(c => c.low)).toFixed(2)} - ${Math.max(...unique.map(c => c.high)).toFixed(2)}`);
}

main().catch(console.error);
