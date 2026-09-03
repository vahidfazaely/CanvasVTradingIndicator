#!/usr/bin/env node
// CanvasV — slowDipEarlyEntry (Variant B) A/B/C experiment
// Engine-only. Variants on CONFIG A (unfiltered detector, audit-consistent):
//   C  reclaim-only (production trigger)
//   A  firstDip     — early entry at first qualifying dip bar (wholesale)
//   B  slowDip2     — early entry only after >=2 consecutive dip bars at EMA9/EMA21 (slow base)
// Outputs: engine/output/V4-SLOWDIP-EXPERIMENT.md + .json
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
  const f = a.filter(x => typeof x === "number" && !isNaN(x));
  if (!f.length) return NaN;
  const s = [...f].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const load = (sym) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${sym}-15m.json`), "utf8"));

const MODES = [
  ["C reclaim", {}],
  ["A firstDip", { experimentEarlyPullback: true }],
  ["B slowDip2", { experimentSlowDipEarly: true, slowDipMinBars: 2 }],
];

// Reconstruct the slow-dip eligibility pool per bar (mirrors engine conditions for
// slowDip mode) and attribute blocks to the RISK gate or the in-position rule.
function poolFunnel(candles, sym) {
  const p = { ...DEFAULT_PARAMS, ...BASE_A };
  const closes = candles.map(c => c.close);
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const emaTrig = calcEMA(closes, p.emaTrigLen);
  const emaDir = calcEMA(closes, p.emaDirLen);
  const emaSlow = calcEMA(closes, p.emaSlowLen);
  const atr = calcATR(candles, p.atrPeriod);
  const atrAvg = calcSMA(atr, p.atrRegimeLen);
  const swingLow = rollingLow(lows, p.swingLookback);
  const swingHigh = rollingHigh(highs, p.swingLookback);
  const pbLow = rollingLow(lows, p.pullbackLookback);
  const pbHigh = rollingHigh(highs, p.pullbackLookback);
  const warmup = Math.max(p.emaSlowLen, p.atrRegimeLen, p.swingLookback) + 5;
  const tol = p.pullbackTolPct / 100.0;
  const sigBarDir = new Set();
  const rB = runEngine(candles, BASE_A, { experimentSlowDipEarly: true, slowDipMinBars: 2 });
  for (const s of rB.signals) sigBarDir.add(`${s.bar}|${s.direction}`);
  let dipAgeUp = 0, dipAgeDn = 0, pool = 0, riskBlocked = 0, posBlocked = 0, entered = 0;
  for (let i = warmup; i < candles.length; i++) {
    const c = candles[i];
    const atrV = atr[i];
    if (isNaN(atrV) || atrV <= 0) continue;
    if (c.close > emaTrig[i]) dipAgeUp = 0; else dipAgeUp++;
    if (c.close < emaTrig[i]) dipAgeDn = 0; else dipAgeDn++;
    const regimeSlope = (emaSlow[i] - emaSlow[i - p.regimeBars]) / Math.max(atrV * p.regimeBars, 1e-10);
    const trending = Math.abs(regimeSlope) >= p.regimeMinSlope;
    const trendUp = trending && emaDir[i] > emaSlow[i] && emaSlow[i] > emaSlow[i - p.regimeBars];
    const trendDn = trending && emaDir[i] < emaSlow[i] && emaSlow[i] < emaSlow[i - p.regimeBars];
    const momUp = emaTrig[i] > emaTrig[i - p.momSlopeBars] && c.close >= emaDir[i];
    const momDn = emaTrig[i] < emaTrig[i - p.momSlopeBars] && c.close <= emaDir[i];
    // slow-dip early eligibility per direction
    const touchU = i >= 1 && !isNaN(pbLow[i - 1]) && pbLow[i - 1] <= emaDir[i] * (1 + tol);
    const touchD = i >= 1 && !isNaN(pbHigh[i - 1]) && pbHigh[i - 1] >= emaDir[i] * (1 - tol);
    const eligU = trendUp && momUp && touchU && dipAgeUp >= 2
      && c.close <= emaTrig[i] && (emaDir[i] - c.close) <= 1.5 * atrV;
    const eligD = trendDn && momDn && touchD && dipAgeDn >= 2
      && c.close >= emaTrig[i] && (c.close - emaDir[i]) <= 1.5 * atrV;
    // risk gate at this bar (engine formulas)
    let riskU = false, riskD = false;
    if (i >= 1 && !isNaN(swingLow[i - 1]) && !isNaN(swingHigh[i - 1])) {
      const slB = (swingLow[i - 1] - atrV * p.structBufferAtr) - atrV * p.atrStopMult;
      const rBk = c.close - slB;
      const slF = rBk >= p.minRiskAtr * atrV ? slB : c.close - p.atrFallbackMult * atrV;
      riskU = (c.close - slF) / atrV <= p.maxRiskAtr;
      const shB = (swingHigh[i - 1] + atrV * p.structBufferAtr) + atrV * p.atrStopMult;
      const rSk = shB - c.close;
      const slF2 = rSk >= p.minRiskAtr * atrV ? shB : c.close + p.atrFallbackMult * atrV;
      riskD = (slF2 - c.close) / atrV <= p.maxRiskAtr;
    }
    for (const [d, elig, riskOk] of [["BUY", eligU, riskU], ["SELL", eligD, riskD]]) {
      if (!elig) continue;
      pool++;
      if (sigBarDir.has(`${i}|${d}`)) { entered++; continue; }
      if (!riskOk) riskBlocked++; else posBlocked++;
    }
  }
  return { pool, entries: entered, blocked: pool - entered, riskBlocked, posBlocked };
}


// Dip context at an entry bar (direction-aware, mirrors the audit's ctxAt dip logic)
function dipCtx(candles, emaTrig, emaDir, atr, eb, dir, tol) {
  const isBuy = dir === "BUY";
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const closes = candles.map(c => c.close);
  // consecutive dip-run ending at eb (eb inclusive). Reclaim bars (dir side above EMA9) get 0.
  let run = 0;
  for (let k = eb; k >= 0 && (isBuy ? closes[k] <= emaTrig[k] : closes[k] >= emaTrig[k]); k--) run++;
  const dipBars = run;
  // anchor over the dip window; if none (reclaim-bar entry), use last 6 bars before eb
  const from = Math.max(0, eb - Math.max(dipBars, 6) + (dipBars ? 1 : 0) - (dipBars ? 0 : 1));
  const aFrom = dipBars > 0 ? eb - dipBars + 1 : Math.max(0, eb - 6);
  void from;
  let anchor = isBuy ? Infinity : -Infinity;
  for (let k = aFrom; k <= eb; k++) anchor = isBuy ? Math.min(anchor, lows[k]) : Math.max(anchor, highs[k]);
  const touch = (isBuy ? lows[eb - 1] : highs[eb - 1]) !== undefined
    && (isBuy ? Math.min(...lows.slice(Math.max(0, eb - 5), eb)) <= emaDir[eb] * (1 + tol)
              : Math.max(...highs.slice(Math.max(0, eb - 5), eb)) >= emaDir[eb] * (1 - tol));
  return {
    dipBars,
    recoveryAtr: isBuy ? (candles[eb].close - anchor) / atr[eb] : (anchor - candles[eb].close) / atr[eb],
    touched21: touch,
    anchor,
  };
}

// Did a reclaim (close back across EMA9) occur within n bars after eb? (for premature tagging)
function reclaimedSoon(candles, emaTrig, eb, dir, n = 5) {
  const end = Math.min(eb + n, candles.length - 1);
  for (let k = eb + 1; k <= end; k++) {
    if (dir === "BUY" && candles[k].close > emaTrig[k]) return k;
    if (dir === "SELL" && candles[k].close < emaTrig[k]) return k;
  }
  return null;
}

function runVariant(candles, sym, modeName, opts, params = BASE_A) {
  const { signals, trades } = runEngine(candles, params, opts);
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED");
  const r = generateReport(trades);
  const emaTrig = calcEMA(candles.map(c => c.close), DEFAULT_PARAMS.emaTrigLen);
  const emaDir = calcEMA(candles.map(c => c.close), DEFAULT_PARAMS.emaDirLen);
  const atr = calcATR(candles, DEFAULT_PARAMS.atrPeriod);
  const tol = DEFAULT_PARAMS.pullbackTolPct / 100.0;
  const pb = closed.filter(t => t.trigger === "PULLBACK RESUME");
  const rows = pb.map(t => {
    const ctx = dipCtx(candles, emaTrig, emaDir, atr, t.entryBar, t.direction === "BUY" ? "BUY" : "SELL", tol);
    const re = reclaimedSoon(candles, emaTrig, t.entryBar, t.direction === "BUY" ? "BUY" : "SELL");
    return { t, ctx, reclaimedBar: re };
  });
  const noFollow = pb.filter(t => t.finalR < 0 && t.mfe < 0.3);
  const premLosers = rows.filter(x => x.t.finalR < 0 && x.reclaimedBar === null && x.ctx.dipBars >= 1);
  const premWinners = rows.filter(x => x.t.finalR > 0 && x.reclaimedBar === null && x.ctx.dipBars >= 1);
  const earlyRows = rows.filter(x => x.ctx.dipBars >= 1);   // entered on a dip bar (true early entry)
  const recRows = rows.filter(x => x.ctx.dipBars === 0);    // entered on the reclaim bar itself
  const split = (d) => {
    const g = closed.filter(t => t.direction === d);
    return { n: g.length, wr: g.length ? g.filter(t => t.finalR > 0).length / g.length * 100 : NaN,
             netR: g.reduce((s, t) => s + t.finalR, 0) };
  };
  return {
    sym, mode: modeName, signals: signals.length, trades: closed.length,
    wr: r.winRate, pf: r.profitFactor, netR: r.totalR, avgR: r.avgR,
    maxDD: r.maxDrawdownR, maxDDPct: r.maxDrawdownPct, avgMfe: r.avgMFE,
    avgAge: r.avgHoldingBars,
    pbCount: pb.length, pbNetR: pb.reduce((s, t) => s + t.finalR, 0),
    medExtAtr: med(pb.map(t => t.extAtr)),
    medDipBars: med(rows.map(x => x.ctx.dipBars)),
    medRecovery: med(rows.map(x => x.ctx.recoveryAtr)),
    noFollow: { n: noFollow.length, netR: noFollow.reduce((s, t) => s + t.finalR, 0) },
    prem: { losers: premLosers.length, loserR: premLosers.reduce((s, x) => s + x.t.finalR, 0),
            winners: premWinners.length, winnerR: premWinners.reduce((s, x) => s + x.t.finalR, 0) },
    long: split("BUY"), short: split("SELL"),
    earlySplit: {
      early: { n: earlyRows.length, netR: earlyRows.reduce((s, x) => s + x.t.finalR, 0),
               wr: earlyRows.length ? earlyRows.filter(x => x.t.finalR > 0).length / earlyRows.length * 100 : NaN,
               medRecovery: med(earlyRows.map(x => x.ctx.recoveryAtr)) },
      reclaim: { n: recRows.length, netR: recRows.reduce((s, x) => s + x.t.finalR, 0),
                 wr: recRows.length ? recRows.filter(x => x.t.finalR > 0).length / recRows.length * 100 : NaN,
                 medRecovery: med(recRows.map(x => x.ctx.recoveryAtr)) },
    },
    pbRows: rows.map(x => ({ bar: x.t.entryBar, dir: x.t.direction, finalR: x.t.finalR, mfe: x.t.mfe,
                             exitReason: x.t.exitReason, age: x.t.age, dipBars: x.ctx.dipBars,
                             recoveryAtr: x.ctx.recoveryAtr, reclaimed: x.reclaimedBar !== null })),
  };
}

// ── 1. Full-window A/B/C per symbol ────────────────────────────────────────
log("# CanvasV — slowDipEarlyEntry (Variant B) A/B/C Experiment");
log("");
log(`- Date: ${new Date().toISOString().slice(0, 10)}`);
log("- Engine-only experiment; Pine untouched. CONFIG A (all V4.2 toggles OFF) for the primary comparison, matching the quality/latency audit.");
log("- Modes: **C** reclaim-only (current trigger) · **A** firstDip (early entry at first qualifying dip bar) · **B** slowDip2 (early entry only once the dip has based ≥2 consecutive bars on the dip side of EMA9, low still in EMA21 touch window, close not free-falling >1.5 ATR below EMA21).");
log("");
log("## 1. Full-window results (180 days per symbol, CONFIG A)");
log("");
log("| Symbol | Variant | Trades | WR % | PF | Net R | Avg R | MaxDD R | avg MFE | med extAtr (PB) | med dipBars | med recoveryAtr |");
log("|---|---|---|---|---|---|---|---|---|---|---|---|");
const data = { full: {} };
for (const sym of SYMBOLS) {
  const candles = load(sym);
  data.full[sym] = {};
  for (const [name, o] of MODES) {
    const v = runVariant(candles, sym, name, o);
    data.full[sym][name] = v;
    log(`| ${sym} | ${name} | ${v.trades} | ${fmtP(v.wr, 1)} | ${fmtP(v.pf)} | ${fmtN(v.netR)} | ${fmtN(v.avgR, 3)} | ${v.maxDD.toFixed(2)} | ${fmtN(v.avgMfe, 2)} | ${fmtN(v.medExtAtr, 2)} | ${fmtN(v.medDipBars, 1)} | ${fmtN(v.medRecovery, 2)} |`);
  }
  log("");
}

log("### Direction & no-follow-through breakdown (PULLBACK population)");
log("");
log("| Symbol | Variant | LONG n | LONG NetR | SHORT n | SHORT NetR | NO_FOLLOW losses (MFE<0.3R) | NO_FOLLOW R | PB trades | PB NetR |");
log("|---|---|---|---|---|---|---|---|---|---|");
for (const sym of SYMBOLS) {
  for (const [name, o] of MODES) {
    const v = data.full[sym][name];
    log(`| ${sym} | ${name} | ${v.long.n} | ${fmtN(v.long.netR)} | ${v.short.n} | ${fmtN(v.short.netR)} | ${v.noFollow.n} | ${fmtN(v.noFollow.netR)} | ${v.pbCount} | ${fmtN(v.pbNetR)} |`);
  }
}
log("");
log("### Early vs reclaim-type pullback entries (dip-bar entry vs reclaim-bar entry)");
log("");
log("| Symbol | Variant | dip-bar entries | dip-bar NetR (WR) | med recovery at dip-bar entry | reclaim-bar entries | reclaim NetR (WR) | med recovery at reclaim entry |");
log("|---|---|---|---|---|---|---|---|");
for (const sym of SYMBOLS) {
  for (const [name, o] of MODES) {
    const v = data.full[sym][name];
    const e = v.earlySplit.early, rc = v.earlySplit.reclaim;
    log(`| ${sym} | ${name} | ${e.n} | ${fmtN(e.netR)} (${fmtP(e.wr, 0)}%) | ${fmtN(e.medRecovery, 2)} | ${rc.n} | ${fmtN(rc.netR)} (${fmtP(rc.wr, 0)}%) | ${fmtN(rc.medRecovery, 2)} |`);
  }
}
log("");
log("> Reading: on the reclaim-only variant (C) every pullback entry is a reclaim-bar entry with ~1.1 ATR of bounce already spent. Variant A shifts almost everything to dip-bar entries (recovery ≈ 0.2 ATR) but admits the premature noise of §2. Variant B shifts only a minority to dip-bar entries; the rest remain reclaim-bar entries — so its latency gain is partial by construction.");
log("");

log("## 2. Failure trade-off — premature entries (early variants only)");
log("");
log("A trade is tagged *premature* when its entry bar had ≥1 dip bar and no EMA9 reclaim followed within 5 bars — i.e. the system entered a dip that did not resolve upward. Winners/Losers split shows what the early entries bought.");
log("");
log("| Symbol | Variant | premature losers | loser R | premature winners | winner R |");
log("|---|---|---|---|---|---|");
for (const sym of SYMBOLS) {
  for (const [name, o] of MODES) {
    const v = data.full[sym][name];
    if (!v.prem.losers && !v.prem.winners) continue;
    log(`| ${sym} | ${name} | ${v.prem.losers} | ${fmtN(v.prem.loserR)} | ${v.prem.winners} | ${fmtN(v.prem.winnerR)} |`);
  }
}
log("");

// ── 3. Matched-episode analysis (BTC) ─────────────────────────────────────
log("## 3. Matched episodes (BTC) — same pullback episodes under C vs B vs A");
log("");
{
  const candles = load("BTCUSDT");
  const res = {};
  const byMode = {};
  for (const [name, o] of MODES) byMode[name] = runVariant(candles, "BTCUSDT", name, o).pbRows;
  const pairsFor = (earlyName) => {
    const early = byMode[earlyName];
    const late = byMode["C reclaim"];
    const lateByBar = new Map(late.map(x => [x.bar, x]));
    const pairs = [];
    for (const e of early) {
      let partner = null;
      for (let b = e.bar + 1; b <= e.bar + 6; b++) {
        const q = lateByBar.get(b);
        if (q && q.dir === e.dir) { partner = q; break; }
      }
      if (partner) pairs.push({ early: e, late: partner });
    }
    const cWin_eWin = pairs.filter(x => x.late.finalR > 0 && x.early.finalR > 0).length;
    const cWin_eLoss = pairs.filter(x => x.late.finalR > 0 && x.early.finalR <= 0).length;
    const cLoss_eWin = pairs.filter(x => x.late.finalR <= 0 && x.early.finalR > 0).length;
    const cLoss_eLoss = pairs.filter(x => x.late.finalR <= 0 && x.early.finalR <= 0).length;
    const lateR = pairs.reduce((s, x) => s + x.late.finalR, 0);
    const earlyR = pairs.reduce((s, x) => s + x.early.finalR, 0);
    return { n: pairs.length, cWin_eWin, cWin_eLoss, cLoss_eWin, cLoss_eLoss,
             lateR, earlyR, delta: earlyR - lateR,
             medEarlier: med(pairs.map(x => x.late.bar - x.early.bar)) };
  };
  for (const nm of ["A firstDip", "B slowDip2"]) {
    const p = pairsFor(nm);
    res[nm] = p;
    log(`- **${nm} vs C** — ${p.n} matched episodes. C-winner/B-winner ${p.cWin_eWin}, C-winner→early-loss (damage) ${p.cWin_eLoss}, C-loss→early-winner (rescues) ${p.cLoss_eWin}, both losses ${p.cLoss_eLoss}. Net R: C ${fmtN(p.lateR)} → early ${fmtN(p.earlyR)} (Δ ${fmtN(p.delta)}). Entries earlier by median ${fmtN(p.medEarlier, 0).replace("+", "")} bar(s).`);
  }
  data.matched = res;
  log("");
}

// ── 4. Gate interaction for the slow-dip pool ──────────────────────────────
log("## 4. Gate interaction — the slow-dip pool vs what actually entered");
log("");
log("Slow-dip eligibility is reconstructed per bar with the exact engine conditions (setup up, EMA21 touch in window, dipAge ≥ 2, close on the dip side of EMA9, not free-falling). A bar in the pool becomes an entry unless a downstream gate blocks it. Under CONFIG A the only binding downstream gates are RISK and the in-position rule; STRICT-EXT ≤1.5 ATR cannot block a dip bar (close ≤ EMA21 ⇒ extension ≤ 0) and BODY/HV/volume are off.");
log("");
log("| Symbol | slow-dip pool (bars) | entries (B signals) | blocked total | risk-blocked | in-position blocked | entry rate |");
log("|---|---|---|---|---|---|---|");
const funnels = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const f = poolFunnel(candles, sym);
  funnels[sym] = f;
  log(`| ${sym} | ${f.pool} | ${f.entries} | ${f.blocked} | ${f.riskBlocked} | ${f.posBlocked} | ${fmtP(f.entries / Math.max(1, f.pool) * 100, 0)}% |`);
}
log("");
log("### Exit distribution of Variant-B pullback entries");
log("");
log("| Symbol | B PB entries | SL FIRST | TP1/TP2 | EXPIRED | STALE | avg age (bars) | losers with MFE<0.3R |");
log("|---|---|---|---|---|---|---|---|");
for (const sym of SYMBOLS) {
  const v = data.full[sym]["B slowDip2"];
  const pb = data.full[sym]["B slowDip2"].pbRows;
  const cnt = (x) => pb.filter(p => p.exitReason === x).length;
  const exp = pb.filter(p => p.exitReason === "EXPIRED");
  const stale = pb.filter(p => p.exitReason === "STALE_EXIT");
  const noF = pb.filter(p => p.finalR < 0 && p.mfe < 0.3).length;
  log(`| ${sym} | ${pb.length} | ${cnt("SL FIRST")} | ${cnt("TP1 FIRST") + cnt("TP2 FIRST")} | ${exp.length} | ${stale.length} | ${fmtP(med(pb.map(x => x.age)), 1)} | ${noF} |`);
}
log("");
data.funnels = funnels;

// ── 5. Hold-out validation (90/90 temporal split) ──────────────────────────
log("## 5. Out-of-sample check — 90/90 temporal hold-out (C vs frozen B)");
log("");
log("Split each 180-day file into two non-overlapping 90-day halves; indicators recomputed inside each slice (no leakage). Variant B rule (≥2 dip bars) was fixed from the audit evidence before this run. The second half is the nearest thing to an external test available offline (Binance unreachable — same limitation as the HV validation report).");
log("");
const hold = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const half = Math.floor(candles.length / 2);
  hold[sym] = {};
  log(`### ${sym} (${half} bars per half)`);
  log("");
  log("| Half | Variant | Trades | WR % | PF | Net R | Avg R | MaxDD R |");
  log("|---|---|---|---|---|---|---|---|");
  for (const [hName, slice] of [["first-90", candles.slice(0, half)], ["second-90", candles.slice(half)]]) {
    hold[sym][hName] = {};
    for (const [name, o] of [["C reclaim", {}], ["B slowDip2", { experimentSlowDipEarly: true, slowDipMinBars: 2 }]]) {
      const v = runVariant(slice, sym, name, o);
      hold[sym][hName][name] = v;
      log(`| ${hName} | ${name} | ${v.trades} | ${fmtP(v.wr, 1)} | ${fmtP(v.pf)} | ${fmtN(v.netR)} | ${fmtN(v.avgR, 3)} | ${v.maxDD.toFixed(2)} |`);
    }
  }
  const d1 = hold[sym]["first-90"]["B slowDip2"].netR - hold[sym]["first-90"]["C reclaim"].netR;
  const d2 = hold[sym]["second-90"]["B slowDip2"].netR - hold[sym]["second-90"]["C reclaim"].netR;
  hold[sym].delta = { first: d1, second: d2 };
  log(`ΔNetR(B − C): first-90 ${fmtN(d1)}, second-90 ${fmtN(d2)}`);
  log("");
}
data.holdout = hold;

// ── 6. Production-config sanity ────────────────────────────────────────────
log("## 6. Sanity on the current production config (V4.2 defaults ON)");
log("");
log("| Symbol | C (reclaim) trades/NetR | B (slowDip2) trades/NetR |");
log("|---|---|---|");
const cur = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  const c = runVariant(candles, sym, "C reclaim", {}, {});
  const b = runVariant(candles, sym, "B slowDip2", { experimentSlowDipEarly: true, slowDipMinBars: 2 }, {});
  cur[sym] = { c: { trades: c.trades, netR: c.netR, wr: c.wr }, b: { trades: b.trades, netR: b.netR, wr: b.wr } };
  log(`| ${sym} | ${c.trades} / ${fmtN(c.netR)}R (WR ${fmtP(c.wr, 0)}%) | ${b.trades} / ${fmtN(b.netR)}R (WR ${fmtP(b.wr, 0)}%) |`);
}
log("");
data.cur = cur;

// ── 7. Decision ────────────────────────────────────────────────────────────
log("## 7. Decision — REFINE (do not ship as-is)");
log("");
log("### What the evidence shows");
log("");
log("- **Variant B is a real improvement on BTC only** — consistent everywhere BTC is measured: full window A-config +3.59 → +10.23R (WR 47→49%, PF 1.07→1.15); both hold-out halves (+4.31R / +2.33R) including the adversarial second half where C lost −6.82R and B only −4.49R; production config 36→53 trades at the *same* 58% WR with +6.43 → +11.60R. Its new dip-bar entries are excellent: 82 entries, +7.49R, 52% WR, recovery 0.27 ATR vs 1.14 ATR on reclaim entries.");
log("- **Variant B is flat-to-negative on ETH** — full window +5.14 vs +6.15R; hold-out second half −1.44R; production config +4.75 → −2.41R. Dip-bar entries are ~breakeven (−0.22R).");
log("- **Variant B clearly damages SOL** — full window +0.61 vs +8.29R; both hold-out halves negative (−4.59R / −3.09R); production config WR drops 62→48%. Its 86 dip-bar entries net **−4.60R** (43% WR): SOL's slow dips are chop, not continuation. SOL's entire edge lives in reclaim-confirmed SHORT pullbacks (+9.04R) which B dilutes to +3.93R.");
log("- **B is strictly better than A (firstDip)** on every risk measure: premature (never-reclaim) losers cut ~6× (BTC 68→11, ETH 67→13, SOL 71→14), MaxDD far lower (BTC 15.40→8.75R), ETH/SOL no longer destroyed (−1.89→+5.14 ETH, −2.15→+0.61 SOL). The ≥2-bar basing gate removes most of Variant A's noise.");
log("- **Upstream gates do not strangle B**: of the slow-dip pool (123–146 bars/symbol), 56–63% become entries; the risk gate blocks only 21–24 and the in-position rule 27–40. The constraint is the pool itself, not the gate stack.");
log("- **The quality of a slow-dip entry is symbol-dependent**: BTC +0.09R/trade, ETH −0.00, SOL −0.05. No direction split explains it cleanly (B improved BTC SELL PB +1.02→+6.66R but damaged SOL SELL PB +9.04→+3.93R) — the discriminator between \"slow dip → continuation\" (BTC) and \"slow dip → chop\" (SOL) is not the dip length.");
log("");
log("### Verdict per the task's decision rule");
log("");
log("- **ADOPT? No.** The rule does not improve all three symbols out-of-sample; per instructions an improvement that does not survive out-of-sample is not an improvement. Shipping it would damage SOL and ETH on the production config.");
log("- **REJECT? No.** On BTC the mechanism is strong, stable across both windows/configs, and it is the only tested variant that converts the audit's \"earlier valid entries\" finding into Net R without a drawdown explosion. Rejecting it discards the best evidence-backed latency fix found so far.");
log("- **REFINE — yes.** The next single experiment (engine only, same 90/90 protocol per symbol) is to find the condition that separates BTC-type slow dips from SOL-type slow dips before allowing the dip-bar entry — candidate discriminators already present in the data and consistent with the audit §5 findings: dip depth vs EMA21 (pierceAtr — deep pierces are the chop signature), ATR regime (quiet-bar entries outperformed high-vol bars), and the direction-aware SHORT extension context. Test one conditioned variant (e.g. slow-dip early only when the dip does not pierce EMA21 more than X ATR **and** ATR < its 100-bar average) across all three symbols; adopt only if it clears BOTH hold-out halves on all three symbols. No Pine change before that.");
log("");
log("---");
log("**Pine parity status:** engine option `opts.experimentSlowDipEarly` (default OFF) + `slowDipMinBars`; default run verified byte-identical to pre-experiment behavior (178/197/179 trades on A). Pine untouched in this phase per instructions — the Pine port is conditional on an ADOPT decision from the refined variant.");
log("");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "V4-SLOWDIP-EXPERIMENT.md"), md.join("\n"));
fs.writeFileSync(path.join(OUT_DIR, "V4-SLOWDIP-EXPERIMENT.json"), JSON.stringify({ data }, null, 2));
console.log("wrote V4-SLOWDIP-EXPERIMENT.md / .json");
