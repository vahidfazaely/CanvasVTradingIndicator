// Money-management ladder: account curves (compounding) from trade R series,
// per symbol and merged 3-symbol portfolio, at several risk-% levels.
// Research only — reads runEngine trades, changes nothing.
import fs from 'node:fs';
import path from 'node:path';
import { runEngine, DEFAULT_PARAMS } from './engine.mjs';

const DIR = path.join(import.meta.dirname, 'engine', 'data');
const SYMS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const CFGS = {
  base: {},
  triple: { swingLookback: 8, maxExtAtr: 2.0, breakoutBars: 7 },
};
const RISKS = [0.25, 0.5, 1.0, 2.0];

const curve = (Rs, risk) => {
  let eq = 1;
  let peak = 1;
  let maxDD = 0;
  for (const R of Rs) {
    eq *= 1 + (R * risk) / 100;
    if (eq > peak) peak = eq;
    const dd = ((peak - eq) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return { net: (eq - 1) * 100, dd: maxDD };
};
const rdd = (Rs) => {
  let c = 0;
  let peak = 0;
  let mdd = 0;
  for (const R of Rs) {
    c += R;
    if (c > peak) peak = c;
    if (peak - c > mdd) mdd = peak - c;
  }
  return mdd;
};

for (const [name, ov] of Object.entries(CFGS)) {
  console.log(`### ${name} ${JSON.stringify(ov)}`);
  const all = [];
  for (const s of SYMS) {
    const candles = JSON.parse(fs.readFileSync(path.join(DIR, `${s}-15m.json`), 'utf8'));
    const { trades } = runEngine(candles, { ...DEFAULT_PARAMS, ...ov });
    const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime);
    const Rs = sorted.map((t) => t.finalR);
    const sumR = Rs.reduce((a, x) => a + x, 0);
    const cells = RISKS.map((r) => {
      const c = curve(Rs, r);
      return `${r}%: Net ${c.net >= 0 ? '+' : ''}${c.net.toFixed(1)}% DD ${c.dd.toFixed(1)}%`;
    }).join(' | ');
    console.log(`  ${s} n=${Rs.length} sumR=${sumR >= 0 ? '+' : ''}${sumR.toFixed(2)} Rdd=${rdd(Rs).toFixed(2)}R :: ${cells}`);
    for (const t of sorted) all.push(t);
  }
  all.sort((a, b) => a.exitTime - b.exitTime);
  const Rs = all.map((t) => t.finalR);
  const sumR = Rs.reduce((a, x) => a + x, 0);
  const cells = RISKS.map((r) => {
    const c = curve(Rs, r);
    return `${r}%: Net ${c.net >= 0 ? '+' : ''}${c.net.toFixed(1)}% DD ${c.dd.toFixed(1)}% Calmar ${(c.dd > 0 ? c.net / c.dd : 99).toFixed(1)}`;
  }).join(' | ');
  console.log(`  PORT n=${Rs.length} sumR=${sumR >= 0 ? '+' : ''}${sumR.toFixed(2)} Rdd=${rdd(Rs).toFixed(2)}R :: ${cells}`);
}
