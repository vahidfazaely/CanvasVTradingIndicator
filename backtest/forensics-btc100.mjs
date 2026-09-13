// BTC 100+ signal forensics: wide-net entries joined with outcomes,
// bucketed by every captured feature to find accuracy filters.
// Research only — production defaults untouched.
import fs from 'node:fs';
import path from 'node:path';
import { runEngine, DEFAULT_PARAMS } from './engine.mjs';

const candles = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, 'engine', 'data', 'BTCUSDT-15m.json'), 'utf8')
);
const wide = {
  swingLookback: 8, maxExtAtr: 2.0, breakoutBars: 7,
  regimeMinSlope: 0.03, volMinPullback: 1.0, maxRiskAtr: 6.0,
};
const { signals, trades } = runEngine(candles, { ...DEFAULT_PARAMS, ...wide });
const side = (d) => (d === 'BUY' || d === 'LONG' || d === 1 ? 'L' : 'S');
const byKey = new Map();
for (const t of trades) byKey.set(t.entryBar + side(t.direction), t);
const rows = [];
let unmatched = 0;
for (const s of signals) {
  const t = byKey.get(s.bar + side(s.direction));
  if (!t) { unmatched++; continue; }
  rows.push({ ...s, R: t.finalR, mfe: t.mfe, mae: t.mae, exit: t.exitReason, age: t.age });
}
console.log(`signals=${signals.length} trades=${trades.length} joined=${rows.length} unmatched=${unmatched}`);

const summ = (rs) => {
  const n = rs.length;
  if (!n) return 'n=0';
  const w = rs.filter((r) => r.R > 0);
  const net = rs.reduce((a, r) => a + r.R, 0);
  const gw = w.reduce((a, r) => a + r.R, 0);
  const gl = rs.filter((r) => r.R <= 0).reduce((a, r) => a - r.R, 0);
  return `n=${n} W=${(w.length / n * 100).toFixed(0)}% Net=${net >= 0 ? '+' : ''}${net.toFixed(2)}R avg=${(net / n).toFixed(3)} PF=${gl > 0 ? (gw / gl).toFixed(2) : 'inf'}`;
};
const cut = (name, fn) => {
  console.log(`--- ${name} ---`);
  const groups = new Map();
  for (const r of rows) {
    const k = fn(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const [k, rs] of [...groups.entries()].sort((a, b) => (a[0] > b[0] ? 1 : -1))) {
    console.log(`  ${String(k).padEnd(22)} ${summ(rs)}`);
  }
};
console.log('ALL: ' + summ(rows));
cut('direction', (r) => r.direction);
cut('trigger', (r) => r.trigger);
cut('dir x trigger', (r) => r.direction + ' ' + (r.trigger === 'PULLBACK RESUME' ? 'PB' : 'BO'));
cut('relVol', (r) => {
  const v = r.relVol;
  if (v == null || Number.isNaN(v)) return 'na';
  return v < 1.0 ? '<1.0' : v < 1.2 ? '1.0-1.2' : v < 1.5 ? '1.2-1.5' : v < 2.0 ? '1.5-2.0' : '2.0+';
});
cut('extAtr', (r) => {
  const v = Math.abs(r.extAtr);
  return v < 0.5 ? '<0.5' : v < 1.0 ? '0.5-1.0' : v < 1.5 ? '1.0-1.5' : v < 2.0 ? '1.5-2.0' : '2.0+';
});
cut('hourUTC', (r) => String(new Date(r.time).getUTCHours()).padStart(2, '0'));
cut('sessionUTC', (r) => {
  const h = new Date(r.time).getUTCHours();
  return h < 4 ? '00-04' : h < 8 ? '04-08' : h < 12 ? '08-12' : h < 16 ? '12-16' : h < 20 ? '16-20' : '20-24';
});
cut('riskAtr', (r) => {
  const v = r.riskAtr;
  return v < 1.5 ? '<1.5' : v < 2.5 ? '1.5-2.5' : v < 3.5 ? '2.5-3.5' : v < 5.0 ? '3.5-5.0' : '5.0+';
});
cut('bodyPct', (r) => {
  const v = r.bodyPct;
  return v < 20 ? '<20' : v < 40 ? '20-40' : v < 60 ? '40-60' : '60+';
});
cut('exitReason', (r) => r.exit);
const mfeW = rows.filter((r) => r.R > 0).reduce((a, r) => a + r.mfe, 0) / Math.max(1, rows.filter((r) => r.R > 0).length);
const maeL = rows.filter((r) => r.R <= 0).reduce((a, r) => a + r.mae, 0) / Math.max(1, rows.filter((r) => r.R <= 0).length);
console.log(`MFE|win=${mfeW.toFixed(2)}R MAE|loss=${maeL.toFixed(2)}R`);
