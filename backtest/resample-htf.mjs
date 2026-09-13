// Resample 15m candles -> exact 1H / 4H candles.
// Valid only for uniform, gap-free 15m series (verified below): HTF bar i
// covers 15m bars [i*N, i*N+N). Same-exchange aggregation, no lookahead risk.
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.join(import.meta.dirname, 'engine', 'data');
const agg = (cs) => ({
  timestamp: cs[0].timestamp,
  open: cs[0].open,
  high: Math.max(...cs.map((c) => c.high)),
  low: Math.min(...cs.map((c) => c.low)),
  close: cs[cs.length - 1].close,
  volume: cs.reduce((a, c) => a + c.volume, 0),
  closeTime: cs[cs.length - 1].closeTime,
  quoteVolume: cs.reduce((a, c) => a + (c.quoteVolume || 0), 0),
  trades: cs.reduce((a, c) => a + (c.trades || 0), 0),
});
for (const sym of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']) {
  const m15 = JSON.parse(fs.readFileSync(path.join(DIR, `${sym}-15m.json`), 'utf8'));
  if (m15.length % 16 !== 0) throw new Error(sym + ' length not divisible by 16: ' + m15.length);
  for (let i = 1; i < m15.length; i++) {
    if (m15[i].timestamp - m15[i - 1].timestamp !== 900000) throw new Error(sym + ' gap at ' + i);
  }
  const h1 = [];
  const h4 = [];
  for (let i = 0; i < m15.length; i += 4) h1.push(agg(m15.slice(i, i + 4)));
  for (let i = 0; i < m15.length; i += 16) h4.push(agg(m15.slice(i, i + 16)));
  fs.writeFileSync(path.join(DIR, `${sym}-1h.json`), JSON.stringify(h1));
  fs.writeFileSync(path.join(DIR, `${sym}-4h.json`), JSON.stringify(h4));
  const ok =
    h1.length === m15.length / 4 &&
    h4.length === m15.length / 16 &&
    h1[0].timestamp === m15[0].timestamp &&
    h4[0].timestamp === m15[0].timestamp &&
    h1[1].timestamp - h1[0].timestamp === 3600000 &&
    h4[1].timestamp - h4[0].timestamp === 14400000 &&
    h1[h1.length - 1].close === m15[m15.length - 1].close;
  console.log(sym, '15m:', m15.length, '1h:', h1.length, '4h:', h4.length, ok ? 'ALIGNED-OK' : 'MISALIGNED!');
}
