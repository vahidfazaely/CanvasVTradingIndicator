// Research gates: HTF confirmation (1H/4H), session hours, SELL-PB kill.
// Uses opts.entryFilter (research-only hook). HTF series from resampled data;
// mapping uses last CONFIRMED HTF bar only (no lookahead), na => block.
import fs from 'node:fs';
import path from 'node:path';
import { runEngine, DEFAULT_PARAMS } from './engine.mjs';

const DIR = path.join(import.meta.dirname, 'engine', 'data');
const SYMS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const BASE = {};
const TRIPLE = { swingLookback: 8, maxExtAtr: 2.0, breakoutBars: 7 };

// Plain EMA with SMA seed (matches engine semantics).
const ema = (xs, len) => {
  const k = 2 / (len + 1);
  const out = new Array(xs.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    if (i < len - 1) { s += xs[i]; continue; }
    if (i === len - 1) { s = (s + xs[i]) / len; out[i] = s; continue; }
    s = xs[i] * k + s * (1 - k);
    out[i] = s;
  }
  return out;
};

const load = (s, tf) => JSON.parse(fs.readFileSync(path.join(DIR, `${s}-${tf}.json`), 'utf8'));

// Precompute per-symbol gate arrays aligned to 15m bars.
const buildGates = (s) => {
  const m15 = load(s, '15m');
  const h1 = load(s, '1h');
  const h4 = load(s, '4h');
  const h1c = h1.map((c) => c.close);
  const h4c = h4.map((c) => c.close);
  const h1e21 = ema(h1c, 21);
  const h1e50 = ema(h1c, 50);
  const h4e50 = ema(h4c, 50);
  // Wilder ATR(14) on 1H for the soft tolerance band.
  const h1atr = (() => {
    const tr = h1.map((c, i) => {
      if (i === 0) return c.high - c.low;
      const pc = h1[i - 1].close;
      return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    });
    const out = new Array(tr.length).fill(NaN);
    let s = 0;
    for (let i = 0; i < tr.length; i++) {
      if (i < 13) { s += tr[i]; continue; }
      if (i === 13) { s = (s + tr[i]) / 14; out[i] = s; continue; }
      s = (s * 13 + tr[i]) / 14;
      out[i] = s;
    }
    return out;
  })();
  const N = m15.length;
  const allowL = { h1stack: new Array(N), h1ema: new Array(N), h4slope: new Array(N), h1h4: new Array(N), h4pos: new Array(N), h1slope: new Array(N), h1soft: new Array(N) };
  const allowS = { h1stack: new Array(N), h1ema: new Array(N), h4slope: new Array(N), h1h4: new Array(N), h4pos: new Array(N), h1slope: new Array(N), h1soft: new Array(N) };
  for (let i = 0; i < N; i++) {
    const i1 = Math.floor(i / 4) - 1; // last confirmed 1H bar
    const i4 = Math.floor(i / 16) - 1; // last confirmed 4H bar
    let l1 = false;
    let s1 = false;
    let l4 = false;
    let s4 = false;
    if (i1 >= 50 && !Number.isNaN(h1e50[i1])) {
      l1 = h1c[i1] > h1e50[i1];
      s1 = h1c[i1] < h1e50[i1];
    }
    let l1e = false;
    let s1e = false;
    if (i1 >= 50 && !Number.isNaN(h1e21[i1]) && !Number.isNaN(h1e50[i1])) {
      l1e = h1e21[i1] > h1e50[i1];
      s1e = h1e21[i1] < h1e50[i1];
    }
    if (i4 >= 55 && !Number.isNaN(h4e50[i4]) && !Number.isNaN(h4e50[i4 - 5])) {
      l4 = h4e50[i4] > h4e50[i4 - 5];
      s4 = h4e50[i4] < h4e50[i4 - 5];
    }
    allowL.h1stack[i] = l1; allowS.h1stack[i] = s1;
    allowL.h1ema[i] = l1e; allowS.h1ema[i] = s1e;
    allowL.h4slope[i] = l4; allowS.h4slope[i] = s4;
    allowL.h1h4[i] = l1 && l4; allowS.h1h4[i] = s1 && s4;
    // Round 2: 4H position, 1H slope, 1H soft band.
    allowL.h4pos[i] = i4 >= 50 && !Number.isNaN(h4e50[i4]) ? h4c[i4] > h4e50[i4] : false;
    allowS.h4pos[i] = i4 >= 50 && !Number.isNaN(h4e50[i4]) ? h4c[i4] < h4e50[i4] : false;
    allowL.h1slope[i] = i1 >= 55 && !Number.isNaN(h1e50[i1]) && !Number.isNaN(h1e50[i1 - 5]) ? h1e50[i1] > h1e50[i1 - 5] : false;
    allowS.h1slope[i] = i1 >= 55 && !Number.isNaN(h1e50[i1]) && !Number.isNaN(h1e50[i1 - 5]) ? h1e50[i1] < h1e50[i1 - 5] : false;
    if (i1 >= 50 && !Number.isNaN(h1e50[i1]) && !Number.isNaN(h1atr[i1])) {
      allowL.h1soft[i] = !(h1c[i1] < h1e50[i1] - 0.25 * h1atr[i1]);
      allowS.h1soft[i] = !(h1c[i1] > h1e50[i1] + 0.25 * h1atr[i1]);
    } else { allowL.h1soft[i] = false; allowS.h1soft[i] = false; }
  }
  return { m15, allowL, allowS };
};

const EXPS = {
  h1stack: (g) => (bar, side) => (side === 1 ? g.allowL.h1stack[bar] : g.allowS.h1stack[bar]),
  h1ema: (g) => (bar, side) => (side === 1 ? g.allowL.h1ema[bar] : g.allowS.h1ema[bar]),
  h4slope: (g) => (bar, side) => (side === 1 ? g.allowL.h4slope[bar] : g.allowS.h4slope[bar]),
  h1h4: (g) => (bar, side) => (side === 1 ? g.allowL.h1h4[bar] : g.allowS.h1h4[bar]),
  sess0820: (g) => (bar) => { const h = new Date(g.m15[bar].timestamp).getUTCHours(); return h >= 8 && h < 20; },
  sess1220: (g) => (bar) => { const h = new Date(g.m15[bar].timestamp).getUTCHours(); return h >= 12 && h < 20; },
  nosellpb: () => (bar, side, isPB) => !(side === -1 && isPB),
  h4pos: (g) => (bar, side) => (side === 1 ? g.allowL.h4pos[bar] : g.allowS.h4pos[bar]),
  h1slope: (g) => (bar, side) => (side === 1 ? g.allowL.h1slope[bar] : g.allowS.h1slope[bar]),
  h1soft: (g) => (bar, side) => (side === 1 ? g.allowL.h1soft[bar] : g.allowS.h1soft[bar]),
  'h1stack-pb': (g) => (bar, side, isPB) => (!isPB || (side === 1 ? g.allowL.h1stack[bar] : g.allowS.h1stack[bar])),
};

const summ = (trades) => {
  const Rs = trades.map((t) => t.finalR);
  const net = Rs.reduce((a, x) => a + x, 0);
  const w = Rs.filter((r) => r > 0).length;
  return { n: Rs.length, net, wr: Rs.length ? ((w / Rs.length) * 100).toFixed(0) : '-' };
};

const only = process.argv[2]; // optional: run one experiment
for (const [expName, mkFilter] of Object.entries(EXPS)) {
  if (only && only !== expName) continue;
  for (const [cfgName, ov] of Object.entries({ base: BASE, triple: TRIPLE })) {
    const parts = [];
    let tot = 0;
    for (const s of SYMS) {
      const g = buildGates(s);
      const base = runEngine(g.m15, { ...DEFAULT_PARAMS, ...ov });
      const b = summ(base.trades);
      const gated = runEngine(g.m15, { ...DEFAULT_PARAMS, ...ov }, { entryFilter: mkFilter(g) });
      const v = summ(gated.trades);
      const d = v.net - b.net;
      tot += v.net;
      const mid = g.m15[Math.floor(g.m15.length / 2)].timestamp;
      const h1 = summ(gated.trades.filter((t) => t.exitTime < mid));
      const h2 = summ(gated.trades.filter((t) => t.exitTime >= mid));
      parts.push(`${s} ${v.n}t/${v.net >= 0 ? '+' : ''}${v.net.toFixed(2)}R(Δ${d >= 0 ? '+' : ''}${d.toFixed(2)}) H1:${h1.n}/${h1.net.toFixed(1)} H2:${h2.n}/${h2.net.toFixed(1)}`);
    }
    console.log(`T=${tot.toFixed(2)} :: ${expName} on ${cfgName} :: ${parts.join(' | ')}`);
  }
}
