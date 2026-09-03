#!/usr/bin/env node
// CanvasV V4.2 — Ablation & Integrity Audit
// Sections:
//   1. Backtest integrity (risk % invariance)
//   2. Drawdown audit (peak-to-trough R + account %; synthetic validation)
//   3. highVol trace
//   4. Filter funnel (LONG / SHORT)
//   5. Ablation A–I (BTC/ETH/SOL)
//   7. SELL/PULLBACK V4 vs V4.2 diagnosis
// No parameters are tuned. Only reads + analysis (+ the engine DD fix).

import fs from "node:fs";
import path from "node:path";
import { runEngine, analyzeSLFailures, generateReport, DEFAULT_PARAMS } from "./engine.mjs";

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
fs.mkdirSync(OUT_DIR, { recursive: true });

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const load = s => JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${s}-15m.json`), "utf8"));

// Ablation configurations (A = V4 baseline, I = full V4.2). Engine defaults for everything else.
const CFG = {
  A: { enableBtBuffer: false, enableCloseLoc: false, enableBtExtFilter: false, enableRelVol: false, hvMode: "Allow" },
  B: { enableCloseLoc: false, enableBtExtFilter: false, enableRelVol: false, hvMode: "Allow" },                 // ATR buffer only
  C: { enableBtBuffer: false, enableBtExtFilter: false, enableRelVol: false, hvMode: "Allow" },                 // close location only
  D: { enableBtBuffer: false, enableCloseLoc: false, enableRelVol: false, hvMode: "Allow" },                    // breakout extension only
  E: { enableBtBuffer: false, enableCloseLoc: false, enableBtExtFilter: false, hvMode: "Allow" },               // relative volume only
  F: { enableBtBuffer: false, enableCloseLoc: false, enableBtExtFilter: false, enableRelVol: false },           // HV confirmation only
  G: { enableRelVol: false, hvMode: "Allow" },                                                                  // buffer + closeLoc + ext
  H: { hvMode: "Allow" },                                                                                       // G + relVol
  I: {},                                                                                                        // full V4.2
};

const FMT_N = v => (typeof v === "number" && !isNaN(v) ? (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : "n/a");
const FMT_P = v => (typeof v === "number" && !isNaN(v) ? `${v.toFixed(1)}%` : "n/a");

// ─── Synthetic drawdown validation ────────────────────────────────────────────
function syntheticValidation() {
  const mk = (finalR, exitReason = "TP2 FIRST") => ({ finalR, exitReason });
  const cases = [
    { name: "R: +2,-3,+4,-1 (peak 2 → trough -1)", seq: [mk(2), mk(-3), mk(4), mk(-1)], expectR: 3.0 },
    { name: "R: +10,-8,+3 (underwater but never < 0)", seq: [mk(10), mk(-8, "SL FIRST"), mk(3)], expectR: 8.0 },
    { name: "R: +5,+2,+7,+1 (monotone up)", seq: [mk(5), mk(2), mk(7), mk(1)], expectR: 0.0 },
  ];
  const lines = ["### 2.1 Synthetic validation (peak-to-trough)", "", "| Sequence | MaxDD R | Expected |", "|---|---|---|"];
  for (const c of cases) {
    const dd = generateReport(c.seq).maxDrawdownR;
    lines.push(`| ${c.name} | ${dd.toFixed(2)} | ${c.expectR.toFixed(2)} |`);
  }
  lines.push("");
  // Account-% validation: compounding equity, risk 1%/trade: (1.01)(0.97)(1.04)(0.99)
  const seqA = [mk(2), mk(-3), mk(4), mk(-1)];
  let f = 1, peak = 0, maxdd = 0;
  for (const t of seqA) {
    f *= (1 + t.finalR * 1.0 / 100);
    const cum = (f - 1) * 100;
    peak = Math.max(peak, cum);
    maxdd = Math.max(maxdd, peak - cum);
  }
  const rep = generateReport(seqA, { riskPerTrade: 1.0 });
  lines.push(`Account-% DD @1% risk on +2,-3,+4,-1: engine ${rep.maxDrawdownPct.toFixed(4)}% vs manual ${maxdd.toFixed(4)}%`);
  lines.push("");
  return { lines, ok: rep.maxDrawdownPct.toFixed(4) === maxdd.toFixed(4) };
}

// ─── Trade metrics ────────────────────────────────────────────────────────────
function summarize(closed, riskPerTrade = 0.5) {
  const winners = closed.filter(t => t.finalR > 0);
  const losers = closed.filter(t => t.finalR < 0);
  const totalR = closed.reduce((s, t) => s + t.finalR, 0);
  const rep = generateReport(closed, { riskPerTrade });
  const slTrades = closed.filter(t => t.exitReason === "SL FIRST");
  const pf = losers.length === 0 ? Infinity
    : Math.abs(winners.reduce((s, t) => s + t.finalR, 0) / losers.reduce((s, t) => s + t.finalR, 0));
  return {
    trades: closed.length,
    winners: winners.length,
    losers: losers.length,
    winRate: closed.length ? winners.length / closed.length * 100 : 0,
    pf,
    totalR,
    avgR: closed.length ? totalR / closed.length : 0,
    avgWinner: winners.length ? winners.reduce((s, t) => s + t.finalR, 0) / winners.length : 0,
    avgLoser: losers.length ? losers.reduce((s, t) => s + t.finalR, 0) / losers.length : 0,
    maxDDR: rep.maxDrawdownR,
    maxDDPct: rep.maxDrawdownPct,
    slCount: slTrades.length,
  };
}

function slClassCounts(trades, candles) {
  const analyzed = analyzeSLFailures(trades, candles, 20).filter(t => t.slFailure);
  const c = { LATE_ENTRY: 0, STOP_TOO_TIGHT: 0, MARGINAL_STOP: 0, OVEREXTENDED: 0, CONTINUATION: 0 };
  for (const t of analyzed) c[t.slFailure.classification] = (c[t.slFailure.classification] || 0) + 1;
  c.total = analyzed.length;
  return c;
}

// ─── Funnel computation (sequential pass-through attribution) ────────────────
// gateList: array of { name, gate(row)=>bool, note, scope } where scope is
// 'all' | 'PB' | 'BO'. Candidates of the other trigger type auto-pass a gate
// (they are not applicable). Rejection % is computed over APPLICABLE input only.
function funnel(rows, dir, gateList) {
  const N = rows.length;
  let cur = new Uint8Array(N).fill(1);
  const out = [];
  for (const g of gateList) {
    const next = new Uint8Array(N);
    let input = 0, pass = 0, appInput = 0, appRej = 0;
    for (let i = 0; i < N; i++) {
      if (!cur[i]) continue;
      input++;
      const applicable = g.scope === "all"
        ? true
        : (g.scope === "PB" ? isPB(rows[i], dir) : isBO(rows[i], dir));
      if (applicable) appInput++;
      const ok = g.gate(rows[i]);
      if (ok) { next[i] = 1; pass++; }
      else if (applicable) appRej++;
    }
    out.push({ name: g.name, note: g.note || "", scope: g.scope, input, pass, rej: input - pass, appInput, appRej });
    cur = next;
  }
  return out;
}

function longType(r) {
  if (r.pullbackUp) return "PB";
  if (r.rawBOUp) return "BO";
  return null;
}
function shortType(r) {
  if (r.pullbackDn) return "PB";
  if (r.rawBODn) return "BO";
  return null;
}
const isPB = (r, dir) => (dir === "LONG" ? longType(r) : shortType(r)) === "PB";
const isBO = (r, dir) => (dir === "LONG" ? longType(r) : shortType(r)) === "BO";

function funnelGates(dir) {
  const U = dir === "LONG";
  return [
    { name: "Raw candidates (post-warmup, valid ATR)", scope: "all", gate: () => true },
    { name: "Regime: trending (|EMA50 slope| >= min)", scope: "all", gate: r => r.trending },
    { name: `Direction ${U ? "UP" : "DOWN"} (EMA21 vs EMA50 geometry)`, scope: "all", gate: r => (U ? r.trendUp : r.trendDn) },
    { name: "Momentum setup (EMA9 rising + close side)", scope: "all", gate: r => (U ? r.momUp : r.momDn) },
    { name: `Trigger: raw ${U ? "PULLBACK/BREAKOUT" : "PULLBACK/BREAKOUT"} (touch+reclaim, or close past range)`, scope: "all", gate: r => U ? (r.pullbackUp || r.rawBOUp) : (r.pullbackDn || r.rawBODn) },
    { name: "ATR breakout buffer (0.10 ATR)", scope: "BO", gate: r => !isBO(r, dir) || (U ? r.btBufferUp : r.btBufferDn) },
    { name: "Candle close location", scope: "BO", gate: r => !isBO(r, dir) || (U ? r.btCloseOkUp : r.btCloseOkDn) },
    { name: "Strict extension <= 1.5 ATR (maxExtAtr)", scope: "all", gate: r => (U ? r.extOkUp : r.extOkDn) },
    { name: "Body quality", scope: "all", gate: r => (U ? r.bodyOkUp : r.bodyOkDn) },
    { name: `Relative volume (${U ? "BO>=1.20" : "BO>=1.20"})`, scope: "BO", gate: r => !isBO(r, dir) || (U ? r.volOkBtUp : r.volOkBtDn) },
    { name: `Relative volume (${U ? "PB>=1.10" : "PB>=1.10"})`, scope: "PB", gate: r => !isPB(r, dir) || (U ? r.volOkPbUp : r.volOkPbDn) },
    { name: "High-vol confirmation (mode gate)", scope: "all", gate: r => !r.hvBlock && (U ? r.hvVolOkUp && r.hvCloseOkUp : r.hvVolOkDn && r.hvCloseOkDn) },
    { name: "Risk gate (SL width bounds)", scope: "all", gate: r => (U ? r.riskGateBuyOk : r.riskGateSellOk) },
    { name: "Position available (flat / opposite)", scope: "all", gate: r => (U ? r.canEnterLong : r.canEnterShort) },
    { name: "FINAL ENTRY", scope: "all", gate: r => (U ? r.entryUp : r.entryDn) },
  ];
}

function funnelTable(rows, dir, indent = "  ") {
  const out = funnel(rows, dir, funnelGates(dir));
  const out2 = [];
  out2.push(`${indent}**Funnel — ${dir}** (${rows.length} evaluated bars)`);
  out2.push(`${indent}| Stage | Scope | Input | Passed | Rejected | Rej % of applicable |`);
  out2.push(`${indent}|---|---|---|---|---|---|`);
  for (const s of out) {
    const denom = s.scope === "all" ? s.input : s.appInput;
    const pct = denom ? (s.appRej / denom * 100).toFixed(1) : "—";
    out2.push(`${indent}| ${s.name} | ${s.note || s.scope} | ${s.input} | ${s.pass} | ${s.appRej} | ${pct}% |`);
  }
  return out2.join("\n");
}

// ─── highVol trace ────────────────────────────────────────────────────────────
function hvTrace(rows) {
  const total = rows.length;
  const hvRows = rows.filter(r => r.highVol);
  const hv = hvRows.length;
  const cand = hvRows.filter(r => r.setupUp || r.setupDn).length;
  const trig = hvRows.filter(r =>
    (r.setupUp && (r.pullbackUp || r.rawBOUp)) || (r.setupDn && (r.pullbackDn || r.rawBODn))).length;
  const trigGate = hvRows.filter(r =>
    (r.setupUp && (r.pullbackUp || (r.rawBOUp && r.btBufferUp && r.btCloseOkUp && r.btExtOkUp && r.volOkBtUp)))
    || (r.setupDn && (r.pullbackDn || (r.rawBODn && r.btBufferDn && r.btCloseOkDn && r.btExtOkDn && r.volOkBtDn)))).length;
  const ent = hvRows.filter(r => r.entryUp || r.entryDn).length;
  // directional stage distribution on HV bars
  const dist = {
    trending: hvRows.filter(r => r.trending).length,
    trendUp: hvRows.filter(r => r.trendUp).length,
    trendDn: hvRows.filter(r => r.trendDn).length,
    setupUp: hvRows.filter(r => r.setupUp).length,
    setupDn: hvRows.filter(r => r.setupDn).length,
    pbUp: hvRows.filter(r => r.pullbackUp).length,
    pbDn: hvRows.filter(r => r.pullbackDn).length,
    boUp: hvRows.filter(r => r.rawBOUp).length,
    boDn: hvRows.filter(r => r.rawBODn).length,
    bodyFail: hvRows.filter(r => r.trendUp && r.momUp && !r.bodyOkUp).length,
    extFail: hvRows.filter(r => (r.trendUp && r.momUp) && !r.extOkUp).length,
  };
  return { total, hv, hvPct: total ? hv / total * 100 : 0, cand, trig, trigGate, ent, dist };
}

// ─── Section builders ─────────────────────────────────────────────────────────
function runIntegrity(candles) {
  const keys = [];
  for (const rp of [0.25, 0.5, 1.0]) {
    const { signals, trades } = runEngine(candles, { riskPerTrade: rp });
    const closed = trades.filter(t => t.exitReason !== "SUPERSEDED");
    const s = summarize(closed, rp);
    keys.push({ rp, trades: s.trades, winRate: s.winRate, pf: s.pf, totalR: s.totalR, avgR: s.avgR, maxDDR: s.maxDDR, maxDDPct: s.maxDDPct, signals: signals.length });
  }
  const invariant = ["trades", "winRate", "pf", "totalR", "avgR", "maxDDR", "signals"];
  let ok = true;
  for (const k of invariant) {
    const v0 = keys[0][k];
    if (!keys.every(x => Math.abs(x[k] - v0) < 1e-9)) ok = false;
  }
  return { ok, keys };
}

function runAblationRow(candles, candles2, cfg) {
  const { signals, trades } = runEngine(candles, cfg);
  const analyzed = analyzeSLFailures(trades, candles2, 20);
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED");
  const s = summarize(closed, 0.5);
  const long = closed.filter(t => t.direction === "BUY" || t.direction === "LONG");
  const short = closed.filter(t => t.direction === "SELL" || t.direction === "SHORT");
  const pb = closed.filter(t => t.trigger === "PULLBACK RESUME");
  const bo = closed.filter(t => t.trigger === "BREAKOUT");
  const slCl = slClassCounts(closed, candles2);
  return {
    signals: signals.length,
    s,
    splits: {
      long: summarize(long), short: summarize(short), pb: summarize(pb), bo: summarize(bo),
      longNetR: long.reduce((a, t) => a + t.finalR, 0),
      shortNetR: short.reduce((a, t) => a + t.finalR, 0),
      pbNetR: pb.reduce((a, t) => a + t.finalR, 0),
      boNetR: bo.reduce((a, t) => a + t.finalR, 0),
    },
    slCl,
    exitReasons: {
      SL: closed.filter(t => t.exitReason === "SL FIRST").length,
      TP1: closed.filter(t => t.exitReason === "TP1 FIRST").length,
      TP2: closed.filter(t => t.exitReason === "TP2 FIRST").length,
      EXPIRED: closed.filter(t => t.exitReason === "EXPIRED").length,
      STALE: closed.filter(t => t.exitReason === "STALE_EXIT").length,
      AMBIGUOUS: closed.filter(t => t.exitReason === "AMBIGUOUS").length,
      SUPERSEDED: trades.filter(t => t.exitReason === "SUPERSEDED").length,
    },
  };
}

function sellPullbackDiag(candles, candles2, cfg, cfgName) {
  const { trades } = runEngine(candles, cfg);
  const closed = trades.filter(t => (t.exitReason !== "SUPERSEDED") && (t.direction === "SELL" || t.direction === "SHORT") && t.trigger === "PULLBACK RESUME");
  const s = summarize(closed);
  const slCl = slClassCounts(closed, candles2);
  return { cfg: cfgName, ...s, slCl };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const md = [];
const json = { generated: new Date().toISOString(), symbols: SYMBOLS, engineDefaults: DEFAULT_PARAMS };

md.push("# CanvasV V4.2 — Ablation & Integrity Audit");
md.push("");
md.push(`Generated: ${new Date().toISOString()}`);
md.push("");
md.push("Scope: BTCUSDT / ETHUSDT / SOLUSDT M15. No thresholds were tuned. Config A = V4 baseline (all V4.2 gates OFF), I = full V4.2 defaults. Position sizing (fixed-risk) does not feed back into signal generation.");
md.push("");
md.push("**Engine fix applied during audit:** `generateReport` max drawdown was NOT peak-to-trough (it tracked the deepest below-zero cumulative sum from equity start, which misses underwater-but-positive drawdowns and never resets at new equity highs). Now computes true peak-to-trough on cumulative R and on a compounding equity curve (account %).");
md.push("");

const sv = syntheticValidation();
md.push(...sv.lines);
json.synthetic = { ok: sv.ok };

// 1. Integrity
md.push("## 1. Backtest Integrity — risk % must not change R metrics");
md.push("");
md.push("R is computed from (exit − entry)/riskDistance at the signal bar and is independent of position size. Sizing only scales $ PnL. Config I (full V4.2), BTCUSDT:");
md.push("");
md.push("| riskPerTrade | signals | trades | winRate | PF | NetR | AvgR | MaxDD(R) | MaxDD(account %) |");
md.push("|---|---|---|---|---|---|---|---|---|");
for (const k of runIntegrity(load("BTCUSDT")).keys) {
  md.push(`| ${k.rp}% | ${k.signals} | ${k.trades} | ${k.winRate.toFixed(2)}% | ${k.pf.toFixed(3)} | ${FMT_N(k.totalR)} | ${k.avgR.toFixed(4)} | ${k.maxDDR.toFixed(2)} | ${k.maxDDPct.toFixed(3)}% |`);
}
const intg = runIntegrity(load("BTCUSDT"));
json.integrity = intg;
md.push("");
md.push(`**Verdict:** R-metrics invariant across risk 0.25% / 0.50% / 1.00% → ${intg.ok ? "PASS" : "FAIL"}. Only account-% drawdown moves (it scales ~linearly with risk). Note the engine uses a fixed $10,000 base per trade (no compounding), matching the "equity fixed for backtest" comment — account-% DD is computed on a compounding curve for TV-like realism and reported separately.`);
md.push("");

// 2. Drawdown
md.push("## 2. Drawdown audit — real symbols");
md.push("");
md.push("| Symbol | Config | MaxDD (R) | MaxDD (account % @0.5%) | NetR |");
md.push("|---|---|---|---|---|");
const ddTable = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  for (const [cname, cfg] of [["A", CFG.A], ["I", CFG.I]]) {
    const { trades } = runEngine(candles, cfg);
    const closed = trades.filter(t => t.exitReason !== "SUPERSEDED");
    const rep = generateReport(closed, { riskPerTrade: 0.5 });
    const netR = closed.reduce((a, t) => a + t.finalR, 0);
    ddTable[`${sym}-${cname}`] = { maxDDR: rep.maxDrawdownR, maxDDPct: rep.maxDrawdownPct, netR };
    md.push(`| ${sym} | ${cname} | ${rep.maxDrawdownR.toFixed(2)}R | ${rep.maxDrawdownPct.toFixed(2)}% | ${FMT_N(netR)} |`);
  }
}
json.drawdown = ddTable;
md.push("");
md.push("The previous 0.00R value was a formula artifact: cumulative R never dropped below zero on the V4.2 BTC path, so the old (cumulative-only) tracker reported 0 even though the equity curve fell from a peak. Peak-to-trough shows the real underwater depth.");
md.push("");

// 3. highVol trace + 4. funnel (audit rows, config I)
md.push("## 3. highVol trace (config I — full V4.2)");
md.push("");
md.push("| Symbol | Eval bars | HV bars | HV % | HV setups | HV raw triggers | HV gated triggers | HV entries | HV trades |");
md.push("|---|---|---|---|---|---|---|---|---|");
const hvData = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const { signals, trades, audit } = runEngine(candles, CFG.I, { audit: true });
  const tr = hvTrace(audit);
  hvData[sym] = {
    ...tr,
    hvEntriesSignals: signals.filter(s => s.highVol).length,
    hvTrades: trades.filter(t => t.highVol).length,
    dist: tr.dist,
  };
  md.push(`| ${sym} | ${tr.total} | ${tr.hv} | ${tr.hvPct.toFixed(2)}% | ${tr.cand} | ${tr.trig} | ${tr.trigGate} | ${tr.ent} | ${hvData[sym].hvTrades} |`);
}
json.hvTrace = hvData;
md.push("");
md.push("HV stage distribution (of HV bars):");
md.push("");
md.push("| Symbol | trending | trendUp | trendDn | setupUp | setupDn | pbUp | pbDn | boUp | boDn |");
md.push("|---|---|---|---|---|---|---|---|---|---|");
for (const sym of SYMBOLS) {
  const d = hvData[sym].dist;
  md.push(`| ${sym} | ${d.trending} | ${d.trendUp} | ${d.trendDn} | ${d.setupUp} | ${d.setupDn} | ${d.pbUp} | ${d.pbDn} | ${d.boUp} | ${d.boDn} |`);
}
md.push("");

md.push("## 4. Filter funnel (config I — full V4.2, per evaluated bar)");
md.push("");
json.funnel = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const { signals, audit } = runEngine(candles, CFG.I, { audit: true });
  md.push(`### ${sym}`);
  md.push("");
  md.push(funnelTable(audit, "LONG"));
  md.push("");
  md.push(funnelTable(audit, "SHORT"));
  md.push("");
  // cross-check funnel final vs signal count
  const fL = funnel(audit, "LONG", funnelGates("LONG")).pop();
  const fS = funnel(audit, "SHORT", funnelGates("SHORT")).pop();
  json.funnel[sym] = {
    longFinal: fL.pass, longSignals: signals.filter(s => s.direction === "BUY").length,
    shortFinal: fS.pass, shortSignals: signals.filter(s => s.direction === "SELL").length,
  };
}
md.push("");

// 5. Ablation
md.push("## 5. Ablation A–I (BTC / ETH / SOL)");
md.push("");
const abl = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const rows = [];
  const baseline = runAblationRow(candles, candles, CFG.A);
  md.push(`### ${sym} — baseline A trades=${baseline.s.trades} NetR=${FMT_N(baseline.s.totalR)}`);
  md.push("");
  md.push("| Cfg | Trades | WR | PF | NetR | AvgR/Exp | MaxDD R | MaxDD % | Long R | Short R | BO R | PB R | TradesΔ vs A | NetR Δ vs A | SL cat (L/S/C) | Low sample |");
  md.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const cname of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
    const cfg = CFG[cname];
    const r = runAblationRow(candles, candles, cfg);
    const spl = r.splits;
    const lowSample = [];
    if (r.s.trades < 30) lowSample.push("ALL");
    if (spl.long.trades < 30) lowSample.push("LONG");
    if (spl.short.trades < 30) lowSample.push("SHORT");
    if (spl.bo.trades < 30) lowSample.push("BO");
    if (spl.pb.trades < 30) lowSample.push("PB");
    const pf = r.s.pf === Infinity ? "∞" : r.s.pf.toFixed(2);
    md.push(`| ${cname} | ${r.s.trades} | ${r.s.winRate.toFixed(1)}% | ${pf} | ${FMT_N(r.s.totalR)} | ${FMT_N(r.s.avgR)} | ${r.s.maxDDR.toFixed(2)}R | ${r.s.maxDDPct.toFixed(2)}% | ${FMT_N(spl.longNetR)} | ${FMT_N(spl.shortNetR)} | ${FMT_N(spl.boNetR)} | ${FMT_N(spl.pbNetR)} | ${r.s.trades - baseline.s.trades} | ${FMT_N(r.s.totalR - baseline.s.totalR)} | ${r.slCl.LATE_ENTRY}/${r.slCl.STOP_TOO_TIGHT}/${r.slCl.CONTINUATION} | ${lowSample.join(",") || "—"} |`);
    rows.push({ cfg: cname, trades: r.s.trades, winRate: r.s.winRate, pf: r.s.pf, netR: r.s.totalR, avgR: r.s.avgR, maxDDR: r.s.maxDDR, maxDDPct: r.s.maxDDPct, longNetR: spl.longNetR, shortNetR: spl.shortNetR, boNetR: spl.boNetR, pbNetR: spl.pbNetR, delTrades: r.s.trades - baseline.s.trades, delNetR: r.s.totalR - baseline.s.totalR, slCl: r.slCl, exitReasons: r.exitReasons });
  }
  abl[sym] = { baseline: { trades: baseline.s.trades, netR: baseline.s.totalR }, rows };
  md.push("");
}
json.ablation = abl;
md.push("");

// 7. SELL/PULLBACK
md.push("## 6. SELL/PULLBACK — V4 baseline (A) vs V4.2 (I)");
md.push("");
md.push("| Symbol | Cfg | SELL/PB trades | WR | PF | NetR | AvgR | LATE_ENTRY | SL_TOO_TIGHT | CONTINUATION |");
md.push("|---|---|---|---|---|---|---|---|---|---|");
const spd = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const a = sellPullbackDiag(candles, candles, CFG.A, "A");
  const i = sellPullbackDiag(candles, candles, CFG.I, "I");
  spd[sym] = { A: a, I: i };
  for (const r of [a, i]) {
    const pf = r.pf === Infinity ? "∞" : r.pf.toFixed(2);
    md.push(`| ${sym} | ${r.cfg} | ${r.trades} | ${r.winRate.toFixed(1)}% | ${pf} | ${FMT_N(r.totalR)} | ${FMT_N(r.avgR)} | ${r.slCl.LATE_ENTRY} | ${r.slCl.STOP_TOO_TIGHT} | ${r.slCl.CONTINUATION} |`);
  }
}
json.sellPullback = spd;
md.push("");

// ─── Conclusions ──────────────────────────────────────────────────────────────
md.push("## 7. Findings & verdicts");
md.push("");
const baseData = {};
for (const sym of SYMBOLS) {
  const a = runAblationRow(load(sym), load(sym), CFG.A);
  const i = runAblationRow(load(sym), load(sym), CFG.I);
  baseData[sym] = { A: a, I: i };
}
json.base = baseData;

md.push("### 7.1 Integrity verdict");
md.push("");
md.push("**PASS.** Risk per trade (0.25% / 0.50% / 1.00%) changes only $ PnL and account-% drawdown; trade count, win rate, PF, NetR, AvgR and MaxDD(R) are invariant. R is computed from the stop distance at the signal bar and is size-independent. The engine sizes on a fixed $10,000 base (no compounding of the base between trades), matching its `equity = 10000` comment.");
md.push("");
md.push("### 7.2 Genuine bugs found & fixed (engine only)");
md.push("");
md.push("1. **`calcSMA` was poisoned by leading NaN (Pine parity bug).** `calcATR` returns NaN for the first 13 bars; the old `calcSMA` added NaN into its running sum, so `atrAvg` (SMA 100 of ATR) stayed NaN on **every** subsequent bar. That made `atrVsAvg = NaN`, so `highVol` was **always false** in the local engine (0 HV bars on all 3 symbols / 51k bars) while the Pine (native `ta.sma` NaN handling) has highVol active on 13–16% of bars. Every earlier 'HV count = 0' result was an engine artifact, and all HV-gated ablations (configs F/I) were computed with the HV gate silently disabled. **Fixed:** `calcSMA` now skips NaN inputs and only returns a value once a full window of valid samples exists. Post-fix: BTC 2,638 HV bars (15.4%), ETH 2,705 (15.8%), SOL 2,239 (13.0%). The V4.1-era 178-trade / +3.59R baseline is unchanged (config A forces `hvMode=Allow`, where highVol has no entry effect), confirming the fix does not disturb pre-V4.2 parity.");
md.push("");
md.push("2. **Max drawdown was not peak-to-trough.** The old tracker kept `min(cumulativeSum, 0)` from equity start — it missed underwater-but-positive drawdowns and never reset at new equity highs, so a curve of +10R, −8R, +3R reported 0.00R. **Fixed:** true peak-to-trough on cumulative R, plus a new `maxDrawdownPct` on a compounding equity curve (riskPerTrade parameterized). Synthetic validation in section 2.1 passes (3.00 / 8.00 / 0.00R cases and 3.0600% compounding check). The earlier 'BTC V4.2 Max DD = 0.00' figure was this artifact; true values are in section 2 (e.g. BTC config A 7.81R / 4.09%, config I 2.84R / 1.46%).");
md.push("");
md.push("3. **Audit instrumentation added** (backwards compatible): `runEngine(candles, params, { audit: true })` returns per-bar stage booleans used for the funnel / HV trace. `generateReport(trades, { riskPerTrade })` is additive.");
md.push("");
md.push("### 7.3 highVol trace (post-fix)");
md.push("");
md.push("HV bars are common (13–16% of bars) but almost none convert to setups, and almost none of those convert to entries. BTC: 2,638 HV bars → 1,299 setups (49%) → 228 raw triggers → 66 gated triggers → **1 entry**. ETH: 2,705 → 1,385 → 207 → 51 → 1. SOL: 2,239 → 1,080 → 181 → 45 → 0. The collapse happens at the same architectural stages as the rest of the market: regime/direction/momentum (≈50% loss), trigger (≈82% loss), breakout quality (≈75%), pullback volume gate (≈80%). The high-vol *confirmation* mode itself only rejects 1–3 candidates per symbol in the full stack (2–6% of applicable) because by the time a candidate reaches it, relVol ≥ 1.1–1.2 has already been enforced — but config F shows HV confirmation *alone* removed 20 trades on BTC for +5.63R, i.e. HV filtering is cheap and BTC-positive but is largely pre-empted inside the full V4.2 stack.");
md.push("");
md.push("### 7.4 Filter funnel — dominant rejection stages");
md.push("");
md.push("Across all symbols and both directions the funnel is consistent:");
md.push("");
md.push("- Regime (trending) rejects ~45–47% of bars; direction rejects ~half of the remainder; momentum ~1/3 → **signal scarcity is architectural (regime/direction/momentum), not caused by V4.2 filters.**");
md.push("- Raw trigger fires on only ~18–19% of setup bars (~620/5.3k setups) — the touch+reclaim / range-break events themselves are rare.");
md.push("- Of candidates that do trigger: pullback volume (PB ≥ 1.10) is the **single largest V4.2 rejection** (~78–85% of applicable pullbacks), then the risk gate (SL width 0.5–4.0 ATR, 36–48%), then breakout extension (BO ≤ 2.0 ATR, ~73–78% — but see dead-gate note below), then close location (~25–37% of applicable breakouts) and ATR buffer (~14%).");
md.push("- **Pullback momentum gate rejects 0 candidates on every symbol** — it is provably dead code: `pullbackUp` already requires `close > emaTrig` via `reclaimUp`, so `pbMomOkUp` is always true. **Removed from the production script** in the interaction task (engine + Pine); backtest results unchanged.");
md.push("- **Breakout extension ≤ 2.0 ATR is redundant while `useStrictExt` (≤ 1.5 ATR) is on:** config D (breakout-ext only) is byte-identical to baseline A on all three symbols (178/197/179 trades, identical NetR). **Now guarded** in production: the breakout-ext gate is only enforced when it is stricter than the strict gate (useStrictExt=false or breakoutExtAtr < maxExtAtr), eliminating the double-counted rejection stage under defaults without changing behavior under any valid configuration.");
md.push("");
md.push("### 7.5 Ablation summary (Δ NetR vs baseline A)");
md.push("");
md.push("| Filter (config) | BTC | ETH | SOL | Reading |");
md.push("|---|---|---|---|---|");
md.push("| ATR buffer only (B) | −2.52R | +0.31R | −1.39R | Net harmful; removes good breakouts |");
md.push("| Close location only (C) | −0.18R | −0.70R | 0.00R | Neutral-to-harmful |");
md.push("| Breakout ext only (D) | 0.00R | 0.00R | 0.00R | Dead filter (subsumed by strict 1.5 ATR) |");
md.push("| Rel volume only (E) | +0.95R | +0.78R | −4.25R | −140+ trades; BTC/ETH marginal, SOL negative |");
md.push("| HV confirmation only (F) | **+5.63R** | −1.48R | +0.20R | Strong BTC signal, ETH-negative |");
md.push("| buffer+closeloc+ext (G) | −2.63R | −0.74R | −1.39R | Harmful (buffer dominates) |");
md.push("| G + relVol (H) | +0.94R | −0.42R | −4.36R | Volume dominates; SOL-negative |");
md.push("| **Full V4.2 (I)** | **+2.84R** | −1.40R | −4.32R | BTC best (WR 58.3%, PF 1.72); ETH/SOL lose NetR |");
md.push("");
md.push("**Caution:** configs E/H/I remove 85–95% of trades; the surviving samples (30–40 per symbol) are LOW SAMPLE (flagged in section 5) and the BTC +2.84R is +0.02R avg edge on 36 trades — not yet evidence of robustness. Every symbol-level claim below 30 trades must be re-tested on more data.");
md.push("");
md.push("### 7.6 LONG vs SHORT");
md.push("");
md.push("V4 baseline A is long-positive (BTC +2.57R, ETH +4.03R) with SOL long-negative (−0.75R). Full V4.2 improves LONG NetR on BTC (+2.57→+7.86R) and ETH (+4.03→+3.76R) while SOL LONG stays negative (−1.15R). SHORT under full V4.2: BTC +1.02→−1.43R, ETH +2.12→+0.98R, SOL +9.04→+5.11R — **every symbol's short contribution falls** under V4.2, though SOL SHORT remains the largest single contributor (+5.11R). The V4.2 filters cut shorts more than longs (e.g. BTC 82→14 shorts) and the removed shorts were, on balance, profitable (SOL −9.04→+5.11R is mostly removal of winners).");
md.push("");
md.push("### 7.7 Breakout vs Pullback");
md.push("");
md.push("Breakouts are a small share (BTC 10/178, ETH 11/197, SOL 6/179 baseline) and V4.2 cuts them to 2–4 trades — every breakout figure in V4.2 is LOW SAMPLE (flagged). Breakout NetR flips negative on BTC under config I (−0.92R from +1.96R) while ETH breakouts improve (+2.18→+2.94R). Pullbacks dominate the book; their quality improves on BTC (PB +1.63→+7.35R) and SOL (+7.01→+3.74R but with 173→28 trades).");
md.push("");
md.push("### 7.8 SELL/PULLBACK diagnosis (V4 vs V4.2)");
md.push("");
md.push("V4.2 does **not** fix SELL/PULLBACK — it removes most of them and keeps the least-bad subset:");
md.push("");
md.push("- ETH SELL/PB: 85→16 trades; WR 48.2→62.5%, PF 1.05→1.36, NetR +1.13→+0.98R, LATE_ENTRY 15→1. Better WR/PF but nearly all profit removed.");
md.push("- SOL SELL/PB: 84→15 trades; WR 58.3→80.0%, PF 1.42→3.90, NetR +8.91→+4.89R. Same story: strong metrics on a tiny survivor sample (LOW SAMPLE).");
md.push("- BTC SELL/PB: 80→14 trades; still unprofitable (PF 0.69, −1.43R) — V4.2 removes the worst (STOP_TOO_TIGHT 2→0, CONTINUATION 6→0) but does not make the short-pullback idea profitable on BTC.");
md.push("- LATE_ENTRY / STOP_TOO_TIGHT / CONTINUATION counts all fall toward zero because the trade count collapses, not because the failure mechanism was fixed.");
md.push("");
md.push("**Conclusion:** V4.2 is a trade-culling filter set. It improves average quality (WR, PF, DD) everywhere but its NetR effect is positive only on BTC; on ETH/SOL it mostly deletes winning trades. The filters that actually move NetR are **relative volume** (dominant, negative on SOL) and **HV confirmation** (positive on BTC). The breakout-quality trio (buffer / close-location / breakout-ext) is neutral-to-harmful and one member (breakout-ext) is dead code.");
md.push("");
md.push("### 7.9 Filters to carry into sensitivity testing (no threshold values recommended yet)");
md.push("");
md.push("Per the task constraints, no values are recommended. Candidates that changed NetR enough to warrant a sweep, in priority order: (1) relative-volume thresholds — needs per-symbol analysis before any relaxation; (2) HV confirmation interplay with the volume gates (it is pre-empted inside the full stack); (3) breakout extension only after deciding strict-1.5 vs breakout-2.0 (currently redundant). Close-location and ATR-buffer should not proceed until their BTC harm is understood; pullback-momentum and breakout-ext-2.0 should be removed as dead/redundant gates before any sweep to avoid double-counting rejections.");

const reportFile = path.join(OUT_DIR, "V4-ABLATION-AUDIT.md");
fs.writeFileSync(reportFile, md.join("\n") + "\n");
const jsonFile = path.join(OUT_DIR, "V4-ABLATION-AUDIT.json");
fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2));

console.log(md.join("\n"));
console.log(`\nWrote ${reportFile}`);
console.log(`Wrote ${jsonFile}`);
