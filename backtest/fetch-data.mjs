#!/usr/bin/env node
// Fetch historical BTCUSDT M15 OHLCV data from Binance public API.
// Usage: node fetch-data.mjs [--symbol BTCUSDT] [--interval 15m] [--days 180]
// Saves to engine/data/BTCUSDT-15m.json

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};

const SYMBOL = getArg("symbol", "BTCUSDT");
const INTERVAL = getArg("interval", "15m");
const DAYS = parseInt(getArg("days", "180"), 10);
const DATA_DIR = path.join(import.meta.dirname, "engine", "data");

fs.mkdirSync(DATA_DIR, { recursive: true });

async function fetchBinance(symbol, interval, startTime, endTime) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Binance API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

async function fetchAll(symbol, interval, startMs, endMs) {
  const all = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const batch = await fetchBinance(symbol, interval, cursor, endMs);
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    cursor = batch[batch.length - 1][0] + 1; // next ms after last candle
    process.stderr.write(`\r  fetched ${all.length} candles...`);
    await new Promise(r => setTimeout(r, 250)); // rate limit
  }
  process.stderr.write("\n");
  return all;
}

function parseCandle(k) {
  return {
    timestamp: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
    quoteVolume: parseFloat(k[7]),
    trades: k[8],
  };
}

const now = Date.now();
const startMs = now - DAYS * 24 * 60 * 60 * 1000;

console.log(`Fetching ${SYMBOL} ${INTERVAL} data for ${DAYS} days...`);
console.log(`From: ${new Date(startMs).toISOString()}`);
console.log(`To:   ${new Date(now).toISOString()}`);

const raw = await fetchAll(SYMBOL, INTERVAL, startMs, now);
const candles = raw.map(parseCandle);

const outFile = path.join(DATA_DIR, `${SYMBOL}-${INTERVAL}.json`);
fs.writeFileSync(outFile, JSON.stringify(candles, null, 2));

console.log(`\nSaved ${candles.length} candles to ${outFile}`);
console.log(`Date range: ${new Date(candles[0].timestamp).toISOString()} to ${new Date(candles[candles.length - 1].timestamp).toISOString()}`);
console.log(`Price range: ${Math.min(...candles.map(c => c.low)).toFixed(2)} - ${Math.max(...candles.map(c => c.high)).toFixed(2)}`);
