#!/usr/bin/env node
// CanvasV — Signal Quality & Latency Audit
// Read-only diagnostic over the existing engine. No production logic changes.
// Outputs: engine/output/V4-SIGNAL-QUALITY-LATENCY-AUDIT.md + .json
//
// Method notes:
//  - "CONFIG A" = original signal logic (all V4.2 quality toggles OFF, hvMode Allow)
//    — the unfiltered setup detector with the largest sample (178 BTC trades).
//  - "CONFIG CUR" = current production defaults (V4.2 full).
//  - P&L comes from engine runs. Hypothetical entries (gate rejections, earlier
//    entries) use a standalone bar-walk simulator first calibrated to match engine
//    trades exactly.
import fs from "node:fs";
import path from "node:path";
import {
  runEngine, generateReport, DEFAULT_PARAMS,
  calcEMA, calcSMA, calcATR, rollingLow, rollingHigh,
} from "./engine.mjs";

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const BASE_A = {
  enableFixedRisk: false, enableBtBuffer: false, enableCloseLoc: false,
  enableBtExtFilter: false, enableRelVol: false, hvMode: "Allow",
};
const md = [];
const log = (s = "") => { md.push(s); };

const fmtN = (v, d = 2) => (typeof v === "number" && !isNaN(v) ? (v >= 0 ? `+${v.toFixed(d)}` : v.toFixed(d)) : "n/a");
const fmtP = (v, d = 1) => (typeof v === "number" && !isNaN(v) ? v.toFixed(d) : "n/a");
const med = (a) => {
  if (!a || a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const load = (sym) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sym}-15m.json`), "utf8"));

// ────────────────────────────────────────────────────────────────────────────
// Indicator arrays + per-bar context
// ────────────────────────────────────────────────────────────────────────────
function indicators(candles, p) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const emaTrig = calcEMA(closes, p.emaTrigLen);
  const emaDir = calcEMA(closes, p.emaDirLen);
  const emaSlow = calcEMA(closes, p.emaSlowLen);
  const atr = calcATR(candles, p.atrPeriod);
  const atrAvg = calcSMA(atr, p.atrRegimeLen);
  return { closes, highs, lows, emaTrig, emaDir, emaSlow, atr, atrAvg };
}

// Context features at entry bar eb (uses only data <= eb).
function ctxAt(candles, ind, p, eb, dir) {
  const { closes, highs, lows, emaTrig, emaDir, emaSlow, atr, atrAvg } = ind;
  const c = candles[eb];
  const atrV = atr[eb];
  const out = {
    eb, time: c.timestamp,
    atr: atrV,
    atrVsAvgPct: atrV > 0 ? (atrV / Math.max(atrAvg[eb], 1e-10)) * 100 : NaN,
    extAtr: dir === "BUY" ? (c.close - emaDir[eb]) / atrV : (emaDir[eb] - c.close) / atrV,
    distEma9Atr: dir === "BUY" ? (c.close - emaTrig[eb]) / atrV : (emaTrig[eb] - c.close) / atrV,
    sepAtr: Math.abs(emaTrig[eb] - emaDir[eb]) / atrV,                       // EMA9/21 stack separation
    slope9Atr: eb >= 3 ? (emaTrig[eb] - emaTrig[eb - 3]) / atrV : NaN,        // EMA9 slope (3 bars, ATR)
    slope21Atr: eb >= 3 ? (emaDir[eb] - emaDir[eb - 3]) / atrV : NaN,         // EMA21 slope (3 bars, ATR)
    regimeSlopeAtr: eb >= 10 ? (emaSlow[eb] - emaSlow[eb - 10]) / (atrV * 10) : NaN,
    bodyPct: (c.high - c.low) > 0 ? (Math.abs(c.close - c.open) / (c.high - c.low)) * 100 : 0,
    closeLoc: (c.high - c.low) > 0 ? (c.close - c.low) / (c.high - c.low) : 0.5,
    candleRangeAtr: (c.high - c.low) / atrV,
  };
  // pullback-specific: dip episode before the reclaim bar (direction-aware)
  // BUY  pullback: price dipped DOWN toward EMA21, signal = close-reclaim back above EMA9
  // SELL pullback: price rallied UP toward EMA21,  signal = close-reclaim back below EMA9
  const tol = p.pullbackTolPct / 100.0;
  if (eb >= 6) {
    const isBuy = dir === "BUY";
    let start = null;
    for (let k = eb - 1; k >= eb - 10; k--) {
      const win = Math.max(0, k - p.pullbackLookback);
      let extreme = isBuy ? Infinity : -Infinity;
      for (let w = win; w < k; w++) extreme = isBuy ? Math.min(extreme, lows[w]) : Math.max(extreme, highs[w]);
      const touched = isBuy ? extreme <= emaDir[eb] * (1 + tol) : extreme >= emaDir[eb] * (1 - tol);
      const inDip = isBuy ? closes[k] <= emaTrig[k] : closes[k] >= emaTrig[k];
      if (!touched) { if (start !== null) break; }
      else if (inDip) { start = k; }
      if (start !== null && !inDip) break; // episode already reclaimed before k
    }
    if (start === null) start = eb - 1; // dip confined to the last bar
    const from = Math.max(0, Math.min(start, eb - 1) - 1);
    let anchor = isBuy ? Infinity : -Infinity; // dip low (BUY) / rally high (SELL)
    for (let k = from; k <= eb - 1; k++) anchor = isBuy ? Math.min(anchor, lows[k]) : Math.max(anchor, highs[k]);
    out.dipAnchor = anchor;
    out.touchAge = eb - Math.min(start, eb - 1);                  // dip bars before the reclaim signal
    out.pierceAtr = isBuy ? (anchor - emaDir[eb]) / atrV : (emaDir[eb] - anchor) / atrV; // <0 = pierced EMA21
    out.recoveryAtr = isBuy ? (c.close - anchor) / atrV : (anchor - c.close) / atrV;     // bounce already spent at entry
  }
  // breakout-specific: lead beyond the 10-bar box (signal bar itself crosses the box)
  const hh = rollingHigh(highs, p.breakoutBars); // reuse full arrays cheaply here
  const ll = rollingLow(lows, p.breakoutBars);
  if (eb >= 1 && !isNaN(hh[eb - 1]) && !isNaN(ll[eb - 1])) {
    out.boxHigh = hh[eb - 1];
    out.boxLow = ll[eb - 1];
    out.boxAtr = (hh[eb - 1] - ll[eb - 1]) / atrV;
    out.leadAtr = dir === "BUY" ? (c.close - hh[eb - 1]) / atrV : (ll[eb - 1] - c.close) / atrV;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Standalone bar-walk simulator — mirrors engine exit rules exactly.
// simFromParams uses explicit levels (calibration path); simAtBar derives them
// with the engine's risk formulas (hypothetical path).
// ────────────────────────────────────────────────────────────────────────────
function walk(candles, p, eb, dir, entry, sl, tp1, tp2, risk) {
  const res = { outcome: null, finalR: NaN, age: 0, mfe: 0, mae: 0, exitBar: eb,
                mfe1Age: null, mfe05Age: null, slAge: null, curRAtExit: NaN };
  let posSL = sl;
  for (let j = eb + 1; j < candles.length; j++) {
    const age = j - eb;
    const c = candles[j];
    const favR = dir === "BUY" ? (c.high - entry) / risk : (entry - c.low) / risk;
    const advR = dir === "BUY" ? (entry - c.low) / risk : (c.high - entry) / risk;
    res.mfe = Math.max(res.mfe, favR);
    res.mae = Math.max(res.mae, advR);
    if (res.mfe1Age === null && favR >= 1.0) res.mfe1Age = age;
    if (res.mfe05Age === null && favR >= 0.5) res.mfe05Age = age;
    const slHit = dir === "BUY" ? c.low <= posSL : c.high >= posSL;
    const tp1Hit = dir === "BUY" ? c.high >= tp1 : c.low <= tp1;
    const tp2Hit = dir === "BUY" ? c.high >= tp2 : c.low <= tp2;
    if (res.slAge === null && slHit) res.slAge = age;
    if (p.enableMidTradeBE && age >= p.beBarThreshold && !slHit && !tp1Hit && !tp2Hit) {
      const curR = dir === "BUY" ? (c.close - entry) / risk : (entry - c.close) / risk;
      if (curR >= 0.25) posSL = entry;
    }
    const slHitU = dir === "BUY" ? c.low <= posSL : c.high >= posSL;
    const curR = dir === "BUY" ? (c.close - entry) / risk : (entry - c.close) / risk;
    let done = false;
    if (age >= p.staleBarLimit && !slHit && !tp1Hit && !tp2Hit && curR > -0.25 && curR < 0.25) {
      res.outcome = "STALE_EXIT"; res.finalR = curR; done = true;
    } else if (slHitU && (tp1Hit || tp2Hit)) {
      res.outcome = "AMBIGUOUS"; res.finalR = curR; done = true;
    } else if (slHitU) {
      res.outcome = "SL FIRST";
      res.finalR = Math.abs(posSL - entry) < 0.01 ? 0.0 : -1.0;
      done = true;
    } else if (tp2Hit) {
      res.outcome = "TP2 FIRST"; res.finalR = curR; done = true;
    } else if (tp1Hit) {
      res.outcome = "TP1 FIRST"; res.finalR = curR; done = true;
    } else if (age >= p.outcomeBars) {
      res.outcome = "EXPIRED"; res.finalR = curR; done = true;
    }
    if (done) {
      res.age = age; res.exitBar = j; res.curRAtExit = curR;
      return res;
    }
  }
  return res;
}

function levelsAt(candles, ind, p, eb, dir) {
  // Mirror engine risk formulas exactly (config-A aware: toggles inside params p).
  const { emaDir, atr } = ind;
  const c = candles[eb];
  const entry = c.close;
  const atrV = atr[eb];
  const swingLowA = rollingLow(candles.map(x => x.low), p.swingLookback);
  const swingHighA = rollingHigh(candles.map(x => x.high), p.swingLookback);
  const sl = eb >= 1 ? swingLowA[eb - 1] : NaN;
  const sh = eb >= 1 ? swingHighA[eb - 1] : NaN;
  const structBuy = sl - atrV * p.structBufferAtr;
  const structSell = sh + atrV * p.structBufferAtr;
  if (dir === "BUY") {
    const slRaw = structBuy - atrV * p.atrStopMult;
    const ok = (entry - slRaw) >= p.minRiskAtr * atrV;
    const slF = ok ? slRaw : entry - p.atrFallbackMult * atrV;
    const risk = entry - slF;
    return { entry, sl: slF, tp1: entry + risk * p.tp1R, tp2: entry + risk * p.tp2R, risk,
             riskAtr: risk / atrV, structSL: structBuy };
  }
  const slRaw = structSell + atrV * p.atrStopMult;
  const ok = (slRaw - entry) >= p.minRiskAtr * atrV;
  const slF = ok ? slRaw : entry + p.atrFallbackMult * atrV;
  const risk = slF - entry;
  return { entry, sl: slF, tp1: entry - risk * p.tp1R, tp2: entry - risk * p.tp2R, risk,
           riskAtr: risk / atrV, structSL: structSell };
}

// post-SL favorable excursion over `win` bars (analyzeSLFailures equivalent)
function postSLMFE(candles, t, win = 20) {
  if (t.exitReason !== "SL FIRST") return null;
  let best = 0;
  const end = Math.min(t.exitBar + win, candles.length - 1);
  for (let i = t.exitBar + 1; i <= end; i++) {
    const c = candles[i];
    const favR = t.direction === "BUY" ? (c.high - t.entry) / Math.max(t.risk, 1e-10)
      : (t.entry - c.low) / Math.max(t.risk, 1e-10);
    best = Math.max(best, favR);
  }
  return best;
}

// retrace below the breakout box within 4 bars (FALSE_BREAKOUT evidence)
function boxRetrace(candles, ind, p, t) {
  if (t.trigger !== "BREAKOUT") return false;
  const eb = t.entryBar;
  const hh = rollingHigh(candles.map(x => x.high), p.breakoutBars);
  const ll = rollingLow(candles.map(x => x.low), p.breakoutBars);
  if (eb < 1 || isNaN(hh[eb - 1]) || isNaN(ll[eb - 1])) return false;
  const anchor = t.direction === "BUY" ? hh[eb - 1] : ll[eb - 1];
  const end = Math.min(t.exitBar, eb + 4);
  for (let j = eb + 1; j <= end; j++) {
    const c = candles[j];
    if ((t.direction === "BUY" && c.close <= anchor) || (t.direction === "SELL" && c.close >= anchor)) return true;
  }
  return false;
}

// Evidence-based failure taxonomy over LOSING closed trades.
// LATE_ENTRY is measured against the *origin of the move*, not the absolute EMA21
// distance: for PULLBACKS the origin is the dip anchor (recoveryAtr = bounce already
// spent at entry); for BREAKOUTS the origin is the box (extAtr = excess beyond EMA21).
function classify(t, candles, ind, p) {
  const post = postSLMFE(candles, t);
  const ctx = t.ctx || {};
  const chaseMetric = t.trigger === "BREAKOUT" ? (ctx.extAtr ?? NaN) : (ctx.recoveryAtr ?? NaN);
  const chaseLabel = t.trigger === "BREAKOUT" ? "entry ext" : "bounce spent";
  const late = t.mfe < 0.3 && chaseMetric >= 0.5;
  if (t.exitReason === "SL FIRST") {
    if (post >= 1.0) return { cls: "STOP_TOO_TIGHT", ev: `post-SL MFE ${post.toFixed(2)}R` };
    if (post >= 0.5) return { cls: "MARGINAL_STOP", ev: `post-SL MFE ${post.toFixed(2)}R` };
    if (late) return { cls: "LATE_ENTRY", ev: `MFE ${t.mfe.toFixed(2)}R, ${chaseLabel} ${chaseMetric.toFixed(2)} ATR` };
    if (t.mfe < 0.3) return { cls: "WEAK_MOMENTUM", ev: `MFE ${t.mfe.toFixed(2)}R, ${chaseLabel} ${isNaN(chaseMetric) ? "n/a" : chaseMetric.toFixed(2)} ATR` };
    return { cls: "CONTINUATION_FAILURE", ev: `MFE ${t.mfe.toFixed(2)}R then SL` };
  }
  // non-SL exits (EXPIRED / STALE / AMBIGUOUS) that lost
  if (t.trigger === "BREAKOUT" && t.mfe < 0.5 && boxRetrace(candles, ind, p, t))
    return { cls: "FALSE_BREAKOUT", ev: `MFE ${t.mfe.toFixed(2)}R, close back inside box` };
  if (late) return { cls: "LATE_ENTRY", ev: `MFE ${t.mfe.toFixed(2)}R, ${chaseLabel} ${chaseMetric.toFixed(2)} ATR` };
  if (t.mfe < 0.3) return { cls: "WEAK_MOMENTUM", ev: `MFE ${t.mfe.toFixed(2)}R, ${chaseLabel} ${isNaN(chaseMetric) ? "n/a" : chaseMetric.toFixed(2)} ATR` };
  if (t.mfe >= 0.3) return { cls: "CONTINUATION_FAILURE", ev: `MFE ${t.mfe.toFixed(2)}R, exit ${t.exitReason}` };
  return { cls: "OTHER", ev: t.exitReason };
}

// ────────────────────────────────────────────────────────────────────────────
// Runners
// ────────────────────────────────────────────────────────────────────────────
function baselineRow(sym, name, params, candles) {
  const { signals, trades } = runEngine(candles, params);
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED");
  const r = generateReport(trades);
  const fam = {};
  for (const t of closed) {
    const k = `${t.direction}/${t.trigger}`;
    (fam[k] = fam[k] || []).push(t);
  }
  const famRows = Object.fromEntries(Object.entries(fam).map(([k, f]) => {
    const w = f.filter(t => t.finalR > 0).length;
    return [k, { n: f.length, wr: w / f.length * 100, netR: f.reduce((s, t) => s + t.finalR, 0),
                 avgMfe: f.reduce((s, t) => s + t.mfe, 0) / f.length }];
  }));
  const slF = closed.filter(t => t.exitReason === "SL FIRST");
  return {
    symbol: sym, config: name, signals: signals.length, trades: closed.length,
    wr: r.winRate, pf: r.profitFactor, netR: r.totalR, avgR: r.avgR,
    avgW: r.avgWinner, avgL: r.avgLoser, maxDDR: r.maxDrawdownR, maxDDPct: r.maxDrawdownPct,
    avgMfe: r.avgMFE, avgAge: r.avgHoldingBars, superseded: trades.length - closed.length,
    slFirst: slF.length, slHitPct: r.slHitPct, tp: r.tpTrades, expired: r.expiredTrades,
    fam: famRows,
  };
}

function enrichTrades(candles, params, symbol, configName) {
  const { signals, trades } = runEngine(candles, params);
  const ind = indicators(candles, { ...DEFAULT_PARAMS, ...params });
  const p = { ...DEFAULT_PARAMS, ...params };
  const byBar = new Map();
  for (const s of signals) byBar.set(`${s.bar}|${s.direction}`, s);
  let simOk = 0, simBad = 0;
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED").map(t => {
    const ctx = ctxAt(candles, ind, p, t.entryBar, t.direction === "BUY" ? "BUY" : "SELL");
    const sig = byBar.get(`${t.entryBar}|${t.direction === "BUY" ? "BUY" : "SELL"}`);
    const enriched = { ...t, ctx, relVol: sig ? sig.relVol : NaN, highVolSig: sig ? sig.highVol : t.highVol };
    // Calibrated bar-walk (mirrors engine exits) — gives mfe1Age and doubles as parity check
    const sim = walk(candles, p, t.entryBar, t.direction === "BUY" ? "BUY" : "SELL",
                     t.entry, t.sl, t.tp1, t.tp2, t.risk);
    enriched.mfe1Age = sim.mfe1Age;
    enriched.simOutcome = sim.outcome;
    const same = sim.outcome === t.exitReason && Math.abs(sim.finalR - t.finalR) < 1e-9
      && sim.age === t.age && Math.abs(sim.mfe - t.mfe) < 1e-9;
    if (same) simOk++; else simBad++;
    const cls = enriched.finalR < 0 ? classify(enriched, candles, ind, p) : null;
    return { ...enriched, cls: cls ? cls.cls : (enriched.finalR > 0 ? "WIN" : "BE"), ev: cls ? cls.ev : "" };
  });
  return { signals, trades, closed, ind, p, simOk, simBad, total: closed.length };
}

// ────────────────────────────────────────────────────────────────────────────
// Report assembly
// ────────────────────────────────────────────────────────────────────────────
const data = {};

log("# CanvasV — Signal Quality & Latency Audit");
log("");
log(`- Date: ${new Date().toISOString().slice(0, 10)}`);
log("- Engine: unchanged production code + one opt-in audit experiment (`opts.experimentEarlyPullback`, default OFF, parity-verified identical when off).");
log("- Datasets: BTCUSDT / ETHUSDT / SOLUSDT M15, 180 days each (same windows as all prior reports).");
log("- CONFIG A = original signal logic (all V4.2 quality toggles OFF) — the unfiltered setup detector, largest sample.");
log("- CONFIG CUR = current production defaults (V4.2 full).");
log("");
log("---");
log("");
log("## 1. Baseline (as-is, no modifications)");
log("");

{
  const rows = [];
  for (const sym of SYMBOLS) {
    const candles = load(sym);
    for (const [cfg, prm] of [["A", BASE_A], ["CUR", {}]]) {
      const b = baselineRow(sym, cfg, prm, candles);
      data[`${sym}|${cfg}|base`] = b;
      const famTxt = Object.entries(b.fam).map(([k, f]) =>
        `${k}: ${f.n} (WR ${fmtP(f.wr, 0)}%, ${fmtN(f.netR)}R)`).join("  |  ");
      rows.push([sym, cfg, b.signals, b.trades, fmtP(b.wr), fmtP(b.pf), fmtN(b.netR), fmtN(b.avgR, 3),
                 fmtN(b.avgW, 2), fmtN(b.avgL, 2), fmtN(b.maxDDR), fmtP(b.avgAge, 1), famTxt]);
    }
  }
  log("| Symbol | Cfg | Signals | Trades | WR % | PF | Net R | Avg R | Avg W | Avg L | MaxDD R | Avg hold |");
  log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) log(`| ${r.join(" | ")} |`);
  log("");
  log("Family net-R breakdown (closed trades):");
  for (const r of rows) log(`- **${r[0]} ${r[1]}** — ${r[12]}`);
  log("");
  log("> Current production config (CUR) is very selective: 29–39 trades per 180d symbol. Every per-family verdict below is **LOW SAMPLE** on CUR (≤20 per family). CONFIG A is the only configuration with enough population (178–197 trades) to separate signal-quality and latency effects from noise — the deep diagnostics use A, with CUR shown where the number permits.");
  log("");
}

log("## 2. Signal latency — measurement definitions");
log("");
log("Latency is measured with two ATR-normalised entry-quality metrics plus one candle metric, all computed **without future data** at the signal bar:");
log("");
log("- **`extAtr`** = |close − EMA21| / ATR at entry — how far the entry has already run *past* the direction EMA (chasing distance).");
log("- **`recoveryAtr`** (PULLBACK only) = how much of the bounce from the dip low is already spent at entry. Near 0 = entered at the bottom; large = the reclaim came late.");
log("- **`touchAge`** (PULLBACK only) = dip bars between first EMA21 touch and the EMA9-close reclaim that fires the signal. ≥2 means the market sat at the level before the signal appeared.");
log("- **`leadAtr`** (BREAKOUT only) = close vs the 10-bar box boundary in ATR — breakout entries are *same-bar by construction* (close must exceed the box on the signal candle), so their latency shows up as this excess, not as candle lag.");
log("- **`mfe1Age`** = bars from entry to first favorable excursion ≥ 1.0R (from the bar-walk simulator). Short = the move responded immediately; null = it never reached 1R.");
log("");

const DEEP = {}; // BTC A deep-dive structures

for (const sym of SYMBOLS) {
  const candles = load(sym);
  const eA = enrichTrades(candles, BASE_A, sym, "A");
  data[`${sym}|A|enriched`] = eA.closed.map(t => ({
    dir: t.direction, trig: t.trigger, exitReason: t.exitReason, finalR: t.finalR,
    mfe: t.mfe, age: t.age, cls: t.cls, ev: t.ev, mfe1Age: t.mfe1Age ?? null,
    extAtr: t.ctx.extAtr, touchAge: t.ctx.touchAge, recoveryAtr: t.ctx.recoveryAtr,
    leadAtr: t.ctx.leadAtr, sepAtr: t.ctx.sepAtr, slope9Atr: t.ctx.slope9Atr,
    atrVsAvgPct: t.ctx.atrVsAvgPct, riskAtr: t.riskAtr,
  }));
  if (sym === "BTCUSDT") DEEP.A = eA;
}

// ── BTC A: simulator calibration (mfe1Age was attached inside enrichTrades) ──
data["BTC|A|simCalibration"] = { matched: DEEP.A.simOk, mismatched: DEEP.A.simBad, total: DEEP.A.total };
log(`**Simulator calibration (BTC A, ${DEEP.A.total} closed trades): ${DEEP.A.simOk}/${DEEP.A.total} exact match** (outcome + finalR + age + MFE, computed inside enrichTrades). Mismatches: ${DEEP.A.simBad}.`);
log("");

// ── 3. Failure taxonomy (BTC A + ETH/SOL A) ────────────────────────────────
log("## 3. Losing-trade decomposition (evidence-based taxonomy, CONFIG A)");
log("");
log("Classification order: STOP_TOO_TIGHT (SL hit, then price ≥1R favorable within 20 bars) → MARGINAL_STOP (0.5–1R post) → FALSE_BREAKOUT (breakout loss, MFE<0.5R, close back inside the box) → LATE_ENTRY (never moved AND entry was chasing — for PULLBACKS: bounce from the dip anchor already ≥0.5 ATR spent at entry; for BREAKOUTS: entry ≥0.5 ATR past EMA21) → WEAK_MOMENTUM (never moved, not chasing) → CONTINUATION_FAILURE (got ≥0.3R then reversed).");
log("");

const taxSummary = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const eA = enrichTrades(candles, BASE_A, sym, "A");
  const losses = eA.closed.filter(t => t.finalR < 0);
  const byCls = {};
  for (const t of losses) (byCls[t.cls] = byCls[t.cls] || []).push(t);
  taxSummary[sym] = { total: losses.length, classes: {} };
  log(`### ${sym} (${losses.length} losing closed trades)`);
  log(`Simulator parity: **${eA.simOk}/${eA.total}** closed trades reproduced exactly (${eA.simBad} mismatches).`);
  log("");
  log("| Class | N | % losses | Net R | Avg R | median extAtr | median touchAge | % reached 1R (med bars) | typical evidence |");
  log("|---|---|---|---|---|---|---|---|---|---|");
  for (const cls of ["STOP_TOO_TIGHT", "MARGINAL_STOP", "FALSE_BREAKOUT", "LATE_ENTRY", "WEAK_MOMENTUM", "CONTINUATION_FAILURE", "OTHER"]) {
    const g = byCls[cls] || [];
    if (!g.length) continue;
    const netR = g.reduce((s, t) => s + t.finalR, 0);
    const medExt = med(g.map(t => (t.ctx.extAtr === undefined ? NaN : t.ctx.extAtr)));
    const medAge = med(g.map(t => (t.ctx.touchAge === undefined ? NaN : t.ctx.touchAge)));
    const reached1 = g.filter(t => t.mfe1Age !== null && t.mfe1Age !== undefined).length;
    const medM1 = med(g.map(t => (t.mfe1Age === null || t.mfe1Age === undefined ? NaN : t.mfe1Age)));
    const evs = {};
    for (const t of g) evs[t.ev] = (evs[t.ev] || 0) + 1;
    const topEv = Object.entries(evs).sort((a, b) => b[1] - a[1])[0];
    const reachTxt = reached1 > 0 ? `${fmtP(reached1 / g.length * 100, 0)} (${fmtN(medM1, 1)}b)` : `${fmtP(reached1 / g.length * 100, 0)}`;
    log(`| ${cls} | ${g.length} | ${fmtP(g.length / losses.length * 100)} | ${fmtN(netR)} | ${fmtN(netR / g.length, 3)} | ${fmtN(medExt, 2)} | ${fmtN(medAge, 1)} | ${reachTxt} | ${g.length >= 5 ? topEv[0].slice(0, 60) : "—"} |`);
    taxSummary[sym].classes[cls] = { n: g.length, netR, medExt, medTouchAge: medAge, mfe1ReachPct: g.length ? reached1 / g.length * 100 : NaN, medMfe1Age: medM1 };
  }
  log("");
}

// ── 4. Four signal families ─────────────────────────────────────────────────
log("## 4. The four signal families (CONFIG A)");
log("");
const famSummary = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const eA = enrichTrades(candles, BASE_A, sym, "A");
  const fams = ["BUY/BREAKOUT", "SELL/BREAKOUT", "BUY/PULLBACK RESUME", "SELL/PULLBACK RESUME"];
  famSummary[sym] = {};
  log(`### ${sym}`);
  log("");
  log("| Family | N | WR % | PF | Net R | Avg R | avg extAtr | avg touchAge (PB) | avg recoveryAtr (PB) | avg leadAtr (BO) | % reached 1R (med bars) | dominant loss class |");
  log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const fk of fams) {
    const g = eA.closed.filter(t => `${t.direction}/${t.trigger}` === fk);
    if (!g.length) { log(`| ${fk} | 0 | — | — | — | — | — | — | — | — | — | — |`); continue; }
    const w = g.filter(t => t.finalR > 0);
    const l = g.filter(t => t.finalR < 0);
    const netR = g.reduce((s, t) => s + t.finalR, 0);
    const grossW = w.reduce((s, t) => s + t.finalR, 0);
    const grossL = l.reduce((s, t) => s + t.finalR, 0);
    const pf = grossL !== 0 ? Math.abs(grossW / grossL) : Infinity;
    const clsCount = {};
    for (const t of l) clsCount[t.cls] = (clsCount[t.cls] || 0) + 1;
    const top = Object.entries(clsCount).sort((a, b) => b[1] - a[1])[0];
    const getF = (t, k) => (k in t.ctx ? t.ctx[k] : t[k]);
    const avg = (f, k) => { const v = f.map(t => getF(t, k)).filter(x => typeof x === "number" && !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
    const reach1 = g.filter(t => t.mfe1Age !== null && t.mfe1Age !== undefined);
    const avgM1 = reach1.length ? reach1.reduce((s, t) => s + t.mfe1Age, 0) / reach1.length : NaN;
    const low = g.length < 30 ? " ⚠️ LOW SAMPLE" : "";
    const isBO = fk.includes("BREAKOUT");
    const isPB = fk.includes("PULLBACK");
    const reachTxt = reach1.length ? `${fmtP(reach1.length / g.length * 100, 0)} (${fmtN(avgM1, 1)}b)` : `${fmtP(reach1.length / g.length * 100, 0)}`;
    log(`| ${fk}${low} | ${g.length} | ${fmtP(w.length / g.length * 100)} | ${fmtP(pf)} | ${fmtN(netR)} | ${fmtN(netR / g.length, 3)} | ${fmtN(avg(g, "extAtr"), 2)} | ${isPB ? fmtN(avg(g, "touchAge"), 1) : "—"} | ${isPB ? fmtN(avg(g, "recoveryAtr"), 2) : "—"} | ${isBO ? fmtN(avg(g, "leadAtr"), 2) : "—"} | ${reachTxt} | ${top ? `${top[0]} (${top[1]})` : "—"} |`);
    famSummary[sym][fk] = { n: g.length, wr: w.length / g.length * 100, pf, netR,
      avgExtAtr: avg(g, "extAtr"), avgTouchAge: avg(g, "touchAge"),
      avgRecovery: avg(g, "recoveryAtr"), avgLead: avg(g, "leadAtr"),
      avgMfe1Age: avgM1, reach1Pct: g.length ? reach1.length / g.length * 100 : NaN, topLoss: top ? top[0] : "" };
  }
  log("");
}
data["taxonomy"] = taxSummary;
data["families"] = famSummary;

// ── 5. Winner vs loser features (BTC A) ─────────────────────────────────────
log("## 5. Winner vs loser feature separation (BTC CONFIG A, n=" + DEEP.A.closed.length + ")");
log("");
log("Median-split test: for each feature, trades are split at the pooled median; WR / NetR of the LOW bucket vs the HIGH bucket. A feature is useful when the two buckets differ materially in net R and the split is not an artifact of a tiny side. All splits are in-sample descriptions, not optimised thresholds.");
log("");

const FEATS = [
  ["extAtr", "Entry extension (ATR beyond EMA21)"],
  ["recoveryAtr", "Bounce already spent at entry (PB, ATR)"],
  ["touchAge", "Dip bars before reclaim (PB)"],
  ["leadAtr", "Excess beyond breakout box (BO, ATR)"],
  ["sepAtr", "EMA9/EMA21 separation (ATR)"],
  ["slope9Atr", "EMA9 slope (ATR/3bars)"],
  ["slope21Atr", "EMA21 slope (ATR/3bars)"],
  ["atrVsAvgPct", "ATR vs 100-bar average (%)"],
  ["bodyPct", "Candle body %"],
  ["closeLoc", "Close location in candle"],
  ["riskAtr", "Initial risk (ATR)"],
];
const getFv = (t, k) => (k in t.ctx ? t.ctx[k] : t[k]);
const featRows = [];
for (const [key, label] of FEATS) {
  const pool = DEEP.A.closed.filter(t => {
    const v = getFv(t, key);
    return typeof v === "number" && !isNaN(v);
  });
  if (pool.length < 30) { featRows.push([label, "—", "—", "insufficient data", "—", "—", "—"]); continue; }
  const sorted = pool.map(t => getFv(t, key)).sort((a, b) => a - b);
  const cut = sorted[Math.floor(pool.length / 2)];
  const lo = pool.filter(t => getFv(t, key) <= cut);
  const hi = pool.filter(t => getFv(t, key) > cut);
  const stat = (g) => {
    const w = g.filter(t => t.finalR > 0).length;
    return { n: g.length, wr: w / g.length * 100, netR: g.reduce((s, t) => s + t.finalR, 0) };
  };
  const sLo = stat(lo), sHi = stat(hi);
  const allW = DEEP.A.closed.filter(t => t.finalR > 0);
  const allL = DEEP.A.closed.filter(t => t.finalR < 0);
  const medW = med(allW.map(t => getFv(t, key)).filter(v => typeof v === "number" && !isNaN(v)));
  const medL = med(allL.map(t => getFv(t, key)).filter(v => typeof v === "number" && !isNaN(v)));
  const verdict = Math.abs(sLo.netR - sHi.netR) >= 3 ? "SEPARATES" : (Math.abs(sLo.netR - sHi.netR) >= 1.5 ? "weak" : "flat");
  featRows.push([label, fmtN(medW, 2), fmtN(medL, 2), `${fmtN(sLo.netR)} (${sLo.n}, WR ${fmtP(sLo.wr, 0)}%)`, `${fmtN(sHi.netR)} (${sHi.n}, WR ${fmtP(sHi.wr, 0)}%)`, cut.toFixed(2), verdict]);
  data[`BTC|A|feat|${key}`] = { medW, medL, cut, lo: sLo, hi: sHi };
}
log("| Feature | med WIN | med LOSS | LOW bucket (NetR, n, WR) | HIGH bucket (NetR, n, WR) | split at | verdict |");
log("|---|---|---|---|---|---|---|");
for (const r of featRows) log(`| ${r.join(" | ")} |`);
log("");
log("> Reading the table: `extAtr` LOW = entered near EMA21, HIGH = chasing past it. `recoveryAtr` LOW = entered right at the dip low; HIGH = bounce already spent. A **SEPARATES** verdict = the two halves differ by ≥3R net. **Caveats:** (1) pooled splits mix LONG+SHORT — direction matters (see §8 for direction-aware results); (2) all splits are in-sample and need the hold-out re-run before any use.");
log("");
log("Surprises vs naive hypotheses (why these splits matter):`recoveryAtr` HIGH (bounce already spent) outperformed LOW on BTC pullbacks — fast one-bar reclaims were the *weaker* subset, not the stronger one. `touchAge` HIGH (dips basing ≥2 bars at EMA21) outperformed quick reclaims. `riskAtr` HIGH (deeper structural stops) outperformed tight ones. Quiet signal bars (`atrVsAvgPct` LOW) strongly outperformed high-volatility signal bars. None of these are recommendations — they are the in-sample candidates for a tiered A/B.");
log("");

// ── 6. Minimum effective confirmation (gate table, BTC A funnel) ────────────
log("## 6. Minimum effective confirmation — core pipeline funnel (BTC CONFIG A)");
log("");
log("Per-bar funnel with first-failing-gate attribution (LONG and SHORT summed), reconstructed from engine audit rows. For the actionable stages (EXTENSION, RISK, IN-POSITION) we add a hypothetical value: `if entered anyway, what would the standalone trade have produced?` (bar-walk from the rejected bar with that bar's structural SL/TP; no position contention).");
log("");

{
  const candles = load("BTCUSDT");
  const p = { ...DEFAULT_PARAMS, ...BASE_A };
  const { audit } = runEngine(candles, BASE_A, { audit: true });
  const stage = ["REGIME+DIR", "MOMENTUM", "TRIGGER", "STRICT EXT ≤1.5 ATR", "BODY", "RISK GATE", "IN-POSITION"];
  const pass = { BUY: new Array(stage.length).fill(0), SELL: new Array(stage.length).fill(0) };
  const rej = { BUY: new Array(stage.length).fill(0), SELL: new Array(stage.length).fill(0) };
  const rejBars = {};
  for (const d of ["BUY", "SELL"]) for (const s of [3, 5]) rejBars[`${d}|${s}`] = [];
  for (const r of audit) {
    for (const d of ["BUY", "SELL"]) {
      if (!(d === "BUY" ? r.trendUp : r.trendDn)) { rej[d][0]++; continue; }
      pass[d][0]++;
      if (!(d === "BUY" ? r.momUp : r.momDn)) { rej[d][1]++; continue; }
      pass[d][1]++;
      const trig = d === "BUY" ? (r.pullbackUp || r.rawBOUp) : (r.pullbackDn || r.rawBODn);
      if (!trig) { rej[d][2]++; continue; }
      pass[d][2]++;
      if (!(d === "BUY" ? r.extOkUp : r.extOkDn)) { rej[d][3]++; rejBars[`${d}|3`].push(r.i); continue; }
      pass[d][3]++;
      if (!(d === "BUY" ? r.bodyOkUp : r.bodyOkDn)) { rej[d][4]++; continue; }
      pass[d][4]++;
      if (!(d === "BUY" ? r.riskGateBuyOk : r.riskGateSellOk)) { rej[d][5]++; rejBars[`${d}|5`].push(r.i); continue; }
      pass[d][5]++;
      if (!(d === "BUY" ? r.canEnterLong : r.canEnterShort)) { rej[d][6]++; continue; }
      pass[d][6]++;
    }
  }
  // Parity assertion: funnel final entries must equal engine signal count per direction
  const engBuy = DEEP.A.signals.filter(s => s.direction === "BUY").length;
  const engSell = DEEP.A.signals.filter(s => s.direction === "SELL").length;
  // Hypothetical standalone value of EXT / RISK-rejected triggers (structural SL at that bar)
  const ind = indicators(candles, p);
  const hyp = {};
  for (const d of ["BUY", "SELL"]) {
    for (const [sid, sname] of [[3, "STRICT EXT ≤1.5 ATR"], [5, "RISK GATE"]]) {
      const key = `${d}|${sid}`;
      const arr = [];
      let noSL = 0;
      for (const bar of rejBars[key]) {
        const lv = levelsAt(candles, ind, p, bar, d);
        if (isNaN(lv.risk) || lv.risk <= 0) { noSL++; continue; }
        const sim = walk(candles, p, bar, d, lv.entry, lv.sl, lv.tp1, lv.tp2, lv.risk);
        arr.push({ finalR: sim.finalR, outcome: sim.outcome, mfe: sim.mfe });
      }
      hyp[key] = { bars: rejBars[key].length, noSL, n: arr.length,
        netR: arr.reduce((s, x) => s + x.finalR, 0),
        wr: arr.length ? arr.filter(x => x.finalR > 0).length / arr.length * 100 : NaN,
        label: sname };
    }
  }
  data["BTC|A|funnel"] = { stage, pass, rej, parity: { buy: [pass.BUY[6], engBuy], sell: [pass.SELL[6], engSell] }, hyp };
  log("| Stage (chain order) | LONG pass | LONG rej | SHORT pass | SHORT rej | hypothetical value of the rejected (if entered anyway) |");
  log("|---|---|---|---|---|---|");
  for (let g = 0; g < stage.length; g++) {
    let hypTxt = "—";
    const parts = [];
    for (const d of ["BUY", "SELL"]) {
      const k = `${d}|${g}`;
      if (hyp[k] && hyp[k].n > 0) parts.push(`${d === "BUY" ? "L" : "S"}: ${hyp[k].n} sims → ${fmtN(hyp[k].netR)}R (WR ${fmtP(hyp[k].wr, 0)}%)`);
    }
    if (parts.length) hypTxt = parts.join(", ");
    const tag = g === stage.length - 1 ? " → final entries" : "";
    log(`| ${stage[g]}${tag} | ${pass.BUY[g]} | ${rej.BUY[g]} | ${pass.SELL[g]} | ${rej.SELL[g]} | ${hypTxt} |`);
  }
  log("");
  log(`**Parity assertion**: funnel final entries (LONG ${pass.BUY[6]} / SHORT ${pass.SELL[6]}) vs engine signals (LONG ${engBuy} / SHORT ${engSell}) — ${pass.BUY[6] === engBuy && pass.SELL[6] === engSell ? "EXACT MATCH ✓" : "MISMATCH ✗"}.`);
  log("");
  log("> **Stage labels**: REGIME+DIR = `trending` (EMA50 slope ≥ 0.05 ATR/bar) plus direction vs EMA50/EMA21. MOMENTUM = EMA9 3-bar slope + close vs EMA21. TRIGGER = pullback (EMA21 touch + EMA9 close-reclaim) OR breakout (close beyond the 10-bar box). BODY = `minBodyPct` gate — **dead at default 0.0** (passes every bar). IN-POSITION = engine blocks a fresh entry while the opposite side is already held; bars that pass every earlier stage but are blocked here are typically consecutive same-trend signals after a recent entry.");
  log("");
  log("Interpretation: rejection drops from REGIME+DIR to MOMENTUM and TRIGGER dwarf the tail gates — the scarcity is architectural (the setup itself is rare), not a tail-gate problem. At the actionable tail:");
  log("- **STRICT EXT ≤1.5 ATR** rejects 795 triggers (LONG 389 / SHORT 406). Hypothetical standalone value if entered anyway: LONG +0.26R (removes nothing useful), SHORT −3.05R (protective) — consistent with the §8 finding that *extended SHORT* entries are the weak population. **Keep**, treat as a short-side chase guard.");
  log("- **RISK GATE** rejects 177 triggers (LONG 104 / SHORT 73). Hypothetical value if entered anyway: +7.31R net — it deletes would-be *winners* in isolation (deeper-structure stops win more, §5 `riskAtr` HIGH bucket). Upper bound only (no position-contention), not actionable alone — the risk bounds deserve a dedicated audit before any tightening.");
  log("- **BODY** (minBodyPct=0) and the previously removed gates are dead/no-op.");
  log("");
}

// ── 7. Earlier-entry investigation ──────────────────────────────────────────
log("## 7. Earlier-entry opportunities");
log("");
log("### 7a. Early-pullback experiment (entry on the first dip bar instead of waiting for the EMA9 reclaim)");
log("");
log("Opt-in engine experiment `experimentEarlyPullback` (default OFF; parity-verified identical when off). Entry moves to the first bar of the touch window where the setup is up, close ≤ EMA9 and price is not free-falling >1.5 ATR below EMA21. Same SL/TP machinery. Standard **reclaim** signals remain possible for dips whose entry conditions never completed earlier.");
log("");

{
  for (const sym of SYMBOLS) {
    const candles = load(sym);
    const std = runEngine(candles, BASE_A);
    const early = runEngine(candles, BASE_A, { experimentEarlyPullback: true });
    const st = generateReport(std.trades), ea = generateReport(early.trades);
    const eClosed = early.trades.filter(t => t.exitReason !== "SUPERSEDED");
    const sClosed = std.trades.filter(t => t.exitReason !== "SUPERSEDED");
    data[`${sym}|earlyPb`] = {
      std: { signals: std.signals.length, trades: sClosed.length, wr: st.winRate, pf: st.profitFactor, netR: st.totalR, avgR: st.avgR, maxDDR: st.maxDrawdownR, avgMfe: st.avgMFE },
      early: { signals: early.signals.length, trades: eClosed.length, wr: ea.winRate, pf: ea.profitFactor, netR: ea.totalR, avgR: ea.avgR, maxDDR: ea.maxDrawdownR, avgMfe: ea.avgMFE },
    };
    const fam = {};
    for (const t of eClosed) { const k = `${t.direction}/${t.trigger}`; (fam[k] = fam[k] || []).push(t); }
    const famTxt = Object.entries(fam).map(([k, f]) => {
      const w = f.filter(t => t.finalR > 0).length;
      return `${k}: ${f.length} (WR ${fmtP(w / f.length * 100, 0)}%, ${fmtN(f.reduce((s, t) => s + t.finalR, 0))}R)`;
    }).join("  |  ");
    log(`- **${sym}**: standard ${sClosed.length} trades / ${fmtN(st.totalR)}R (WR ${fmtP(st.winRate, 0)}%, PF ${fmtP(st.profitFactor)}) → early ${eClosed.length} trades / ${fmtN(ea.totalR)}R (WR ${fmtP(ea.winRate, 0)}%, PF ${fmtP(ea.profitFactor)}, MaxDD ${ea.maxDrawdownR.toFixed(2)}R). Families: ${famTxt}`);
  }
  log("");
  log("> Interpretation guardrail: the early run changes *when* positions open (and therefore which later signals exist at all), so the trade-count delta is not a pure 'extra signals' count — it reflects earlier capture of the same episodes plus genuinely new dip entries that never reclaimed. Per-symbol stability and the WIN/LOSS mix of the added population matter more than the headline delta; ETH/SOL columns show whether BTC generalises.");
  log("");
}

log("### 7b. Matched comparison — same pullback episodes, standard vs earliest-dip entry (BTC A)");
log("");
{
  const candles = load("BTCUSDT");
  const ind = indicators(candles, { ...DEFAULT_PARAMS, ...BASE_A });
  const p = { ...DEFAULT_PARAMS, ...BASE_A };
  const early = runEngine(candles, BASE_A, { experimentEarlyPullback: true });
  const eClosed = early.trades.filter(t => t.exitReason !== "SUPERSEDED" && t.trigger === "PULLBACK RESUME");
  const std = runEngine(candles, BASE_A);
  const sClosed = std.trades.filter(t => t.exitReason !== "SUPERSEDED" && t.trigger === "PULLBACK RESUME");
  const sByBar = new Map(sClosed.map(t => [t.entryBar, t]));
  // For each early trade, was there a standard reclaim trade at the SAME episode?
  // Approximate matching: standard trade whose entryBar is within 6 bars after the early entry.
  let matched = 0, stdWins = 0, stdR = 0, eWins = 0, eR = 0, earlierBars = [];
  for (const t of eClosed) {
    let partner = null;
    for (let b = t.entryBar + 1; b <= Math.min(t.entryBar + 6, candles.length - 1); b++) {
      const q = sByBar.get(b);
      if (q && q.direction === t.direction) { partner = q; break; }
    }
    if (!partner) continue;
    matched++;
    stdWins += partner.finalR > 0 ? 1 : 0; stdR += partner.finalR;
    eWins += t.finalR > 0 ? 1 : 0; eR += t.finalR;
    earlierBars.push(partner.entryBar - t.entryBar);
  }
  data["BTC|earlyPbMatched"] = { matched, stdWins, stdR, eWins, eR, earlierBars };
  const avgEarly = earlierBars.length ? earlierBars.reduce((s, x) => s + x, 0) / earlierBars.length : NaN;
  const medEarly = med(earlierBars);
  log(`- ${matched} standard pullback signals had an earlier dip-bar entry candidate (of ${sClosed.length} standard pullback trades).`);
  log(`- Standard (reclaim) version: ${stdWins}W / ${fmtN(stdR)}R total.`);
  log(`- Earliest-dip version: ${eWins}W / ${fmtN(eR)}R total.`);
  log(`- Entries moved earlier by median ${fmtN(medEarly, 0).replace("+", "")} bar(s) (avg ${fmtN(avgEarly, 1).replace("+", "")}); the early entry close is at/below EMA9 by construction, so the entry extension is lower and the structural SL is computed at the dip, not the bounce.`);
  log("");
  log("### 7c. Breakout earlier-detection (breakoutBars 10 → 5)");
  log("");
  const st = generateReport(std.trades);
  const stdFull = std.trades.filter(t => t.exitReason !== "SUPERSEDED");
  const bo5 = runEngine(candles, { ...BASE_A, breakoutBars: 5 });
  const b5 = generateReport(bo5.trades);
  const b5Full = bo5.trades.filter(t => t.exitReason !== "SUPERSEDED");
  const bt = b5Full.filter(t => t.trigger === "BREAKOUT");
  log(`- BTC A breakoutBars=10 (baseline): ${stdFull.length} total trades / ${fmtN(st.totalR)}R; breakout trades ${stdFull.filter(t => t.trigger === "BREAKOUT").length}.`);
  log(`- BTC A breakoutBars=5: ${b5Full.length} total trades / ${fmtN(b5.totalR)}R — breakout entries: ${bt.length} (WR ${fmtP(bt.length ? bt.filter(t => t.finalR > 0).length / bt.length * 100 : 0, 0)}%, ${fmtN(bt.reduce((s, t) => s + t.finalR, 0))}R).`);
  log("- Breakout detection cannot be moved 1 candle earlier without lookahead: the close must first exceed the box. Earlier *detection* only comes from a shorter box (5 bars) or intra-bar evaluation — both trade scope for noise. LOW SAMPLE on breakouts in every config (2–8 per symbol) — treat all breakout verdicts as indicative only.");
  log("");
}

// ── 8. Soft-scoring feasibility ─────────────────────────────────────────────
log("## 8. Soft-scoring feasibility (from Section 5 evidence)");
log("");
log("The median-split table in §5 shows which single features separate R. A weighted score is only justified where ≥2 features show *independent* separation with adequate sample size. Findings:");
log("");

{
  const hmm = [];
  for (const sym of SYMBOLS) {
    const candles = load(sym);
    const eA = enrichTrades(candles, BASE_A, sym, "A");
    // quick: extAtr median split by direction
    for (const [dirLbl, dir] of [["LONG", "BUY"], ["SHORT", "SELL"]]) {
      const g = eA.closed.filter(t => t.direction === dir);
      const extKey = "extAtr";
      const pool = g.filter(t => !isNaN(t.ctx[extKey]));
      if (pool.length < 30) continue;
      const cut = med(pool.map(t => t.ctx[extKey]));
      const lo = pool.filter(t => t.ctx[extKey] <= cut);
      const hi = pool.filter(t => t.ctx[extKey] > cut);
      const f = (x) => x.reduce((s, t) => s + t.finalR, 0);
      hmm.push(`${sym} ${dirLbl} extAtr: low-half ${fmtN(f(lo))}R (${lo.length}) vs high-half ${fmtN(f(hi))}R (${hi.length})`);
    }
  }
  for (const h of hmm) log(`- ${h}`);
  log("");
  log("Direction-aware reading (all three symbols):");
  log("- **SHORT entries are the only direction where chasing is consistently punished** — the extended (high-`extAtr`) half of SHORTs is net-negative on every symbol (BTC −0.78R, ETH −0.79R, SOL −0.12R vs the cheap half +1.79/+2.91/+9.15R).");
  log("- **LONG entries do NOT show the penalty** — extended LONGs are net-positive on BTC (+2.28R) and ETH (+3.60R). A symmetric chasing filter would delete LONG winners (consistent with the interaction audit's finding that filters mostly harmed the BUY side).");
  log("- Other separators from §5 (quiet signal bars, deeper structural stops, ≥2-bar dips) need per-symbol verification before any design.");
  log("");
  log("Soft-scoring feasibility: a continuous score is only justified where features separate R *independently and per direction*. Today the only direction-robust single feature is SHORT entry extension. A tiered architecture (binary eligibility for regime/direction/momentum/trigger; a quality term on top) is structurally compatible with the existing pipeline and adds zero candle latency, but there is **not yet enough evidence for a multi-feature weighted score** — §5 splits are pooled and in-sample. Recommended path: test the single strongest direction-specific term as an A/B first; only add more terms if they survive the same test.");
  log("");
}

// ── 9. Ranked findings + recommendations ───────────────────────────────────
log("## 9. Findings and recommendation (evidence-based, no threshold tuning performed)");
log("");
log("### Top causes of false / losing signals (ranked by R impact, BTC A evidence)");
log("");

{
  const candles = load("BTCUSDT");
  const eA = enrichTrades(candles, BASE_A, "BTCUSDT", "A");
  const losses = eA.closed.filter(t => t.finalR < 0);
  const byCls = {};
  for (const t of losses) (byCls[t.cls] = byCls[t.cls] || []).push(t);
  const rows = Object.entries(byCls).map(([k, v]) => [k, v.length, v.reduce((s, t) => s + t.finalR, 0)])
    .sort((a, b) => a[2] - b[2]);
  for (const [k, n, r] of rows) log(`- **${k}** — ${n} losses, ${fmtN(r)}R combined.`);
  log("");
  log("### Top latency causes (ranked by impact, BTC A)");
  log("");
  log("- **PULLBACK reclaim close-confirmation (structural)** — pullback entries fire on the close-reclaim above EMA9, which lands on average **~0.8 ATR above the dip low** (avg `recoveryAtr` 0.82–0.87 on every symbol and direction, §4) and typically 1–2 bars after the EMA21 touch (avg `touchAge` 1.5–1.9). The bounce is spent before the trigger completes — this is the single largest, systematic entry-latency cost, and it is the same mechanism behind the LATE_ENTRY loss population (MFE<0.3R with bounce ≥0.5 ATR already spent: BTC 41, ETH 64, SOL 37 — the largest loss class on every symbol).");
  log("- **Breakout entries are same-bar by construction** (no candle lag), but BTC breakouts enter at avg `extAtr` 1.33 vs 0.80–0.87 for pullbacks (§4) — they structurally chase an extended close beyond the box. LOW SAMPLE on breakouts everywhere (2–10 per symbol): treat as indicative.");
  log("- **V4.2 stack adds no candle latency** (same-bar gates) but collapses frequency to 29–39 trades/180d on CUR — scarcity, not lateness (earlier audits).");
  log("");
}

log("### Minimum effective confirmation — verdict (BTC A funnel, §6)");
log("");
log("- **PULLBACK touch → reclaim**: the only gate that adds *candle* latency. Removing it entirely is NOT validated (full early-pullback run: BTC +9.33R but ETH −8.04R, SOL −10.44R — §7a), so it must be tiered, not deleted. The matched-episode test (§7b: 93 BTC episodes, +10.81R vs −3.55R standard) shows the *timing* value when the dip is real.");
log("- **STRICT EXT ≤1.5 ATR**: keep — its 795 trigger rejections are protective on SHORTs (−3.05R hypothetical) and neutral on LONGs (+0.26R); this is the short-side chase guard.");
log("- **RISK GATE**: keep as a safety bound; its standalone rejections would have been net-positive (+7.31R hypothetical, upper bound) — the risk bounds need their own dedicated audit before any tightening.");
log("- **BODY** (`minBodyPct` 0) and the previously-removed gates (pullback-momentum, breakout-ext ≤2.0) are dead/no-op — no confirmation value.");
log("");
log("## 10. Recommended changes (max 3, ranked — each requires the engine A/B + 90-day hold-out before Pine)");
log("");
log("1. **Tiered pullback entry — EARLY tier for slow dips only (HIGH IMPACT on latency; UNVALIDATED, experiment required).** Evidence is two-sided: removing the reclaim wholesale is BTC-positive but ETH/SOL-negative (§7a), yet matched earlier entries on BTC gained +14.4R over the same 93 episodes (§7b), and §5 shows dips basing ≥2 bars (`touchAge` high) outperform 1-bar reclaims. Test as parameterised variants on the engine: (a) early dip-bar entry; (b) early entry only when the dip has already based ≥2 bars at EMA21; (c) current reclaim-only. Ship the variant that survives all three symbols + the 90-day hold-out with positive ΔNetR — the goal is moving entries into the dip without admitting non-reclaiming dip noise.");
log("2. **Direction-aware SHORT chasing guard (MEDIUM IMPACT; the only direction-robust filter found).** Extended SHORT entries are net-negative on all three symbols (§8), while extended LONG entries are not — a soft tier that suppresses only high-`extAtr` SHORTs targets the LATE_ENTRY/SELL weakness without touching the LONG side. Requires per-symbol hold-out confirmation of the split before implementation.");
log("3. **Re-aim the V4.2 default stack (MEDIUM IMPACT, LATER)** — CUR's 29–39 trades/180d is too selective for practical use; relax defaults per the interaction audit. Frequency objective, not latency.");
log("");
log("**Changes explicitly NOT recommended** (would recreate the scarcity/late-entry failure mode): HTF confirmation, ADX/choppiness indices, additional EMA confirmations, a symmetric (both-direction) chasing gate, or any new binary gate stacked after the trigger.");
log("");

log("## 11. Proposed next implementation step (single change)");
log("");
log("**Implement recommendation 1's variant (b): an opt-in `slowDipEarlyEntry` experiment on the engine only — early dip-bar entry permitted only when the EMA21 touch has been continuous for ≥2 bars (no immediate same-bar reclaims).** Run the existing all-symbol + 90-day hold-out A/B against (a) and (c). No Pine change until the A/B is measured; this is the minimal change that tests the §7b timing value while gating out the non-reclaiming dip noise that hurt ETH/SOL in the wholesale relaxation.");
log("");

fs.mkdirSync(OUT_DIR, { recursive: true });
const mdPath = path.join(OUT_DIR, "V4-SIGNAL-QUALITY-LATENCY-AUDIT.md");
fs.writeFileSync(mdPath, md.join("\n"));
const jsonPath = path.join(OUT_DIR, "V4-SIGNAL-QUALITY-LATENCY-AUDIT.json");
fs.writeFileSync(jsonPath, JSON.stringify({ data }, null, 2));
console.log(`Wrote ${mdPath}`);
console.log(`Wrote ${jsonPath}`);
console.log(md.slice(0, 60).join("\n"));
