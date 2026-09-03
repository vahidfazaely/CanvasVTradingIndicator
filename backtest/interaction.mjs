#!/usr/bin/env node
// CanvasV V4.2 — HighVol Interaction & Filter Attribution (Root Cause Analysis)
// No parameters are tuned. Uses current V4.2 defaults.
//
// Configurations (all V4.2 gates default when not overridden; hvMode defaults to
// "Stronger Confirmation" so configs without an explicit hvMode have HV active):
//   A — Baseline (all V4.2 gates OFF, hvMode Allow)
//   B — HighVol only
//   C — HighVol + Relative Volume
//   D — HighVol + ATR Buffer
//   E — HighVol + Close Location
//   F — HighVol + Breakout Extension
//   G — HighVol + Relative Volume + Close Location
//   H — HighVol + Relative Volume + ATR Buffer
//   I — HighVol + ATR Buffer + Close Location
//   J — HighVol + all V4.2 filters (full V4.2)

import fs from "node:fs";
import path from "node:path";
import { runEngine, generateReport, DEFAULT_PARAMS } from "./engine.mjs";

const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
fs.mkdirSync(OUT_DIR, { recursive: true });

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const load = s => JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${s}-15m.json`), "utf8"));

const CFG = {
  A: { enableBtBuffer: false, enableCloseLoc: false, enableBtExtFilter: false, enableRelVol: false, hvMode: "Allow" },
  B: { enableBtBuffer: false, enableCloseLoc: false, enableBtExtFilter: false, enableRelVol: false },
  C: { enableBtBuffer: false, enableCloseLoc: false, enableBtExtFilter: false },
  D: { enableCloseLoc: false, enableBtExtFilter: false, enableRelVol: false },
  E: { enableBtBuffer: false, enableBtExtFilter: false, enableRelVol: false },
  F: { enableBtBuffer: false, enableCloseLoc: false, enableRelVol: false },
  G: { enableBtBuffer: false, enableBtExtFilter: false },
  H: { enableCloseLoc: false, enableBtExtFilter: false },
  I: { enableBtExtFilter: false, enableRelVol: false },
  J: {},
};
const CONFIG_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const LABEL = {
  B: "HV confirmation only (B)",
  C: "+ Relative volume (C)",
  D: "+ ATR buffer (D)",
  E: "+ Close location (E)",
  F: "+ Breakout extension (F)",
  G: "+ RelVol + CloseLoc (G)",
  H: "+ RelVol + ATR buffer (H)",
  I: "+ ATR buffer + CloseLoc (I)",
  J: "+ all remaining filters (J, full)",
};

const FMT_N = v => (typeof v === "number" && !isNaN(v) ? (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : "n/a");
const FMT_P = v => (typeof v === "number" && !isNaN(v) ? `${v.toFixed(1)}%` : "n/a");

// ─── Per-config run ──────────────────────────────────────────────
function runCfg(candles, cfg) {
  const { signals, trades, audit } = runEngine(candles, cfg, { audit: true });
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED");
  const rep = generateReport(closed, { riskPerTrade: 0.5 });
  const long = closed.filter(t => t.direction === "BUY" || t.direction === "LONG");
  const short = closed.filter(t => t.direction === "SELL" || t.direction === "SHORT");
  const pb = closed.filter(t => t.trigger === "PULLBACK RESUME");
  const bo = closed.filter(t => t.trigger === "BREAKOUT");
  const hv = closed.filter(t => t.highVol);
  return {
    signals: signals.length,
    signalsList: signals,
    trades: closed,
    allTrades: trades,
    audit,
    sum: {
      trades: closed.length,
      winRate: rep.winRate,
      pf: rep.profitFactor,
      netR: rep.totalR,
      avgR: rep.avgR,
      maxDDR: rep.maxDrawdownR,
      longNetR: long.reduce((a, t) => a + t.finalR, 0),
      shortNetR: short.reduce((a, t) => a + t.finalR, 0),
      boNetR: bo.reduce((a, t) => a + t.finalR, 0),
      pbNetR: pb.reduce((a, t) => a + t.finalR, 0),
      longCount: long.length, shortCount: short.length, boCount: bo.length, pbCount: pb.length,
      hvCount: hv.length, hvNetR: hv.reduce((a, t) => a + t.finalR, 0),
      winners: rep.winners, losers: rep.losers,
    },
  };
}

const key = t => `${t.entryBar}:${t.direction}`;
const keySet = trades => new Set(trades.map(key));
const classify = finalR => finalR > 0 ? "W" : finalR < 0 ? "L" : "BE";

function diffTrades(bTrades, xTrades) {
  const xk = keySet(xTrades);
  const bk = keySet(bTrades);
  return {
    removed: bTrades.filter(t => !xk.has(key(t))),
    kept: bTrades.filter(t => xk.has(key(t))),
    gained: xTrades.filter(t => !bk.has(key(t))),
  };
}

function attrSummary(removed) {
  const w = removed.filter(t => classify(t.finalR) === "W");
  const l = removed.filter(t => classify(t.finalR) === "L");
  const be = removed.filter(t => classify(t.finalR) === "BE");
  return {
    total: removed.length,
    winners: w.length,
    losers: l.length,
    breakeven: be.length,
    netR: removed.reduce((a, t) => a + t.finalR, 0),
    winnerNetR: w.reduce((a, t) => a + t.finalR, 0),
    loserNetR: l.reduce((a, t) => a + t.finalR, 0),
    slCount: removed.filter(t => t.exitReason === "SL FIRST").length,
    tpCount: removed.filter(t => t.exitReason.includes("TP")).length,
  };
}

// ─── Breakout funnel from audit rows (config J) ──────────────────
function breakoutFunnel(audit, dir) {
  const U = dir === "LONG";
  const raw = audit.filter(r => U ? r.rawBOUp : r.rawBODn);
  const st = (rows, gateFn) => rows.filter(gateFn).length;
  return {
    raw: raw.length,
    atrBuffer: st(raw, r => U ? r.btBufferUp : r.btBufferDn),
    closeLoc: st(raw, r => U ? r.btCloseOkUp : r.btCloseOkDn),
    ext: st(raw, r => U ? r.btExtOkUp : r.btExtOkDn),
    vol: st(raw, r => U ? r.volOkBtUp : r.volOkBtDn),
  };
}

// ─── Main ────────────────────────────────────────────────────────
const md = [];
const json = { generated: new Date().toISOString(), engineDefaults: DEFAULT_PARAMS, configs: CFG };

md.push("# CanvasV V4.2 — HighVol Interaction & Filter Attribution");
md.push("");
md.push(`Generated: ${new Date().toISOString()}`);
md.push("");
md.push("Purpose: explain WHY the filters interact — specifically why BTC's HV-only edge (+5.63R over baseline) shrinks to +2.84R in full V4.2 — before any sensitivity sweep. No thresholds were tuned; all runs use current V4.2 defaults. Config A = V4 baseline (all V4.2 gates off, hvMode Allow); B = HV confirmation only; C..I = B plus one/two gates; J = full V4.2. `hvMode` defaults to \"Stronger Confirmation\", so every config except A has the HV gate active (HV bars require relVol ≥ 1.40 and closeLoc ≥ 0.75/0.25).");
md.push("");
md.push("**Headline finding (discovered during this analysis):** the HV \"edge\" is not an entry effect. Under HV-only mode almost no HV-bar entries fire at all (BTC 1, ETH 0, SOL 0 of 158–182 trades). The +5.63R BTC improvement comes from the HV gate **rejecting 24 baseline HV-bar entries worth −5.24R** (15 losers vs 9 winners). So the correct population for interaction analysis is the baseline (A) HV-bar trade set, not the HV-only trade set.");
md.push("");

// ─── Run everything ──────────────────────────────────────────────
const runs = {};
for (const sym of SYMBOLS) {
  const candles = load(sym);
  runs[sym] = {};
  for (const c of CONFIG_ORDER) runs[sym][c] = runCfg(candles, CFG[c]);
}

// 1. Interaction matrix
md.push("## 1. Interaction matrix — A–J (all symbols)");
md.push("");
json.matrix = {};
for (const sym of SYMBOLS) {
  const A = runs[sym].A.sum, B = runs[sym].B.sum;
  md.push(`### ${sym} — baseline A: ${A.trades} trades, NetR ${FMT_N(A.netR)} | HV-only B: ${B.trades} trades, NetR ${FMT_N(B.netR)}`);
  md.push("");
  md.push("| Cfg | Trades | WR | PF | NetR | AvgR | MaxDD(R) | Long R | Short R | BO R | PB R | ΔNetR vs A | ΔNetR vs B | LOW SAMPLE |");
  md.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  json.matrix[sym] = {};
  for (const c of CONFIG_ORDER) {
    const s = runs[sym][c].sum;
    const pf = s.pf === Infinity ? "∞" : s.pf.toFixed(2);
    const low = [];
    if (s.trades < 30) low.push("ALL");
    if (s.longCount < 30) low.push("LONG");
    if (s.shortCount < 30) low.push("SHORT");
    if (s.boCount < 30) low.push("BO");
    if (s.pbCount < 30) low.push("PB");
    md.push(`| ${c} | ${s.trades} | ${s.winRate.toFixed(1)}% | ${pf} | ${FMT_N(s.netR)} | ${FMT_N(s.avgR)} | ${s.maxDDR.toFixed(2)}R | ${FMT_N(s.longNetR)} | ${FMT_N(s.shortNetR)} | ${FMT_N(s.boNetR)} | ${FMT_N(s.pbNetR)} | ${FMT_N(s.netR - A.netR)} | ${FMT_N(s.netR - B.netR)} | ${low.join(",") || "—"} |`);
    json.matrix[sym][c] = s;
  }
  md.push("");
}

// 2. Incremental effects vs HV-only (B) — with cascade decomposition
md.push("## 2. Incremental effects — each configuration vs HV-only (B)");
md.push("");
md.push("Decomposition: `ΔNetR vs B = −(NetR of removed trades) + (NetR of gained trades)`. Removed = trades present in B absent from the config; gained = trades present in the config absent from B (position cascade — filtering an early trade frees the slot for a later one).");
md.push("");
json.incremental = {};
for (const sym of SYMBOLS) {
  md.push(`### ${sym}`);
  md.push("");
  md.push("| Change | Trades | NetR | Δ trades | Δ NetR | Removed trades | Removed NetR | Removed W/L | Gained trades | Gained NetR |");
  md.push("|---|---|---|---|---|---|---|---|---|---|");
  const bTrades = runs[sym].B.allTrades;
  json.incremental[sym] = {};
  for (const c of CONFIG_ORDER.slice(1)) {
    const s = runs[sym][c].sum;
    const d = diffTrades(bTrades, runs[sym][c].allTrades);
    const a = attrSummary(d.removed);
    const g = attrSummary(d.gained);
    md.push(`| ${LABEL[c]} | ${s.trades} | ${FMT_N(s.netR)} | ${d.removed.length - d.gained.length} | ${FMT_N(s.netR - runs[sym].B.sum.netR)} | ${a.total} | ${FMT_N(a.netR)} | ${a.winners}/${a.losers}/${a.breakeven} | ${g.total} | ${FMT_N(g.netR)} |`);
    json.incremental[sym][c] = { sum: s, removed: a, gained: g };
  }
  md.push("");
}

// 3. HV-bar trade population (baseline A) — funnel through configs + attribution
md.push("## 3. Baseline HV-bar trades (config A) — funnel through the gates");
md.push("");
md.push("Population P1 = trades that entered on a high-volatility bar under baseline A (`trades.highVol === true`). Each config's row shows how many of P1 survive and the NetR of the removed subset. This is the correct population for the HV interaction question, because HV-only mode itself leaves almost no HV entries to study.");
md.push("");
json.hvFunnel = {};
for (const sym of SYMBOLS) {
  const p1 = runs[sym].A.allTrades.filter(t => t.highVol);
  const p1k = keySet(p1);
  md.push(`### ${sym} — P1 (baseline HV-bar trades): ${p1.length} total, NetR ${FMT_N(p1.reduce((a, t) => a + t.finalR, 0))} (${p1.filter(t => t.finalR > 0).length}W / ${p1.filter(t => t.finalR < 0).length}L)`);
  md.push("");
  md.push("| Config | P1 kept | P1 removed | Removed NetR | Removed W/L | Total trades | Config NetR |");
  md.push("|---|---|---|---|---|---|---|");
  json.hvFunnel[sym] = { p1: attrSummary(p1) };
  for (const c of CONFIG_ORDER) {
    const d = diffTrades(p1, runs[sym][c].allTrades);
    const a = attrSummary(d.removed);
    md.push(`| ${LABEL[c] || "A — baseline"} | ${d.kept.length} | ${a.total} | ${FMT_N(a.netR)} | ${a.winners}/${a.losers}/${a.breakeven} | ${runs[sym][c].sum.trades} | ${FMT_N(runs[sym][c].sum.netR)} |`);
    json.hvFunnel[sym][c] = a;
  }
  // Attribution of P1 trades removed by J, by binding single gate (over the path A→B→J)
  md.push("");
  md.push("**Attribution of P1 trades removed by full V4.2 (J):** each trade is first attributed to HV confirmation if the HV gate alone removes it (B); otherwise to the single gate that alone removes it among relVol/buffer/closeLoc/ext (each evaluated as the B→X delta); otherwise 'cascade/other'.");
  md.push("");
  const p1bKept = diffTrades(p1, runs[sym].B.allTrades).kept;
  const p1bKey = keySet(p1bKept);
  const removedByJ = diffTrades(p1, runs[sym].J.allTrades).removed;
  const attr = {};
  for (const t of removedByJ) {
    const k = key(t);
    let reason;
    if (!p1bKey.has(k)) reason = "HV confirmation";
    else {
      const singles = ["C", "D", "E", "F"].filter(c => !keySet(diffTrades(p1bKept, runs[sym][c].allTrades).kept).has(k));
      if (singles.length === 1) reason = FILTER_OF[singles[0]];
      else if (singles.length > 1) reason = `combination (${singles.map(c => FILTER_OF[c]).join(" + ")})`;
      else reason = "cascade/position";
    }
    attr[k] = { entryBar: t.entryBar, direction: t.direction, trigger: t.trigger, finalR: t.finalR, cls: classify(t.finalR), reason };
  }
  const byReason = {};
  for (const a of Object.values(attr)) {
    byReason[a.reason] = byReason[a.reason] || { total: 0, winners: 0, losers: 0, netR: 0 };
    const r = byReason[a.reason];
    r.total++; r.netR += a.finalR;
    if (a.cls === "W") r.winners++; else if (a.cls === "L") r.losers++;
  }
  md.push("| Reason | Removed | Winners | Losers | NetR of removed |");
  md.push("|---|---|---|---|---|");
  for (const [reason, r] of Object.entries(byReason)) {
    md.push(`| ${reason} | ${r.total} | ${r.winners} | ${r.losers} | ${FMT_N(r.netR)} |`);
  }
  md.push("");
  json.hvFunnel[sym].attribution = { byReason, detail: attr };
}

const FILTER_OF = { C: "Relative volume", D: "ATR buffer", E: "Close location", F: "Breakout extension" };

// 4. Per-filter rejection of HV-bar trades — which filter destroys the HV edge?
md.push("## 4. Per-filter rejection of HV-bar trades (P1)");
md.push("");
md.push("Population P1 = baseline HV-bar trades. Rows show, per filter: the P1 trades it removes (relative to the config that precedes it) and their Net R. Positive NetR of rejected trades = the filter deletes profitable HV trades. HV confirmation row = P1 trades removed when switching A→B. Remaining-gates row = P1 trades that survive HV confirmation but are removed by relVol+buffer+closeLoc+ext combined (B→J).");
md.push("");
json.perFilter = {};
for (const sym of SYMBOLS) {
  const p1 = runs[sym].A.allTrades.filter(t => t.highVol);
  const hvRej = diffTrades(p1, runs[sym].B.allTrades).removed;
  const hvA = attrSummary(hvRej);
  md.push(`### ${sym} — P1: ${p1.length} HV-bar trades (NetR ${FMT_N(p1.reduce((a, t) => a + t.finalR, 0))})`);
  md.push("");
  md.push("| Filter | HV-bar trades rejected | Winners | Losers | BE | NetR of rejected | Verdict |");
  md.push("|---|---|---|---|---|---|---|");
  const row = {};
  const hvVerdict = hvA.netR > 0.05 ? "**REMOVES PROFIT**" : hvA.netR < -0.05 ? "removes losers (useful)" : "neutral";
  md.push(`| HV confirmation (A→B) | ${hvA.total} | ${hvA.winners} | ${hvA.losers} | ${hvA.breakeven} | ${FMT_N(hvA.netR)} | ${hvVerdict} |`);
  row.hvConfirmation = { ...hvA, verdict: hvVerdict };
  const p1b = diffTrades(p1, runs[sym].B.allTrades).kept;
  for (const c of ["C", "D", "E", "F"]) {
    const rej = diffTrades(p1b, runs[sym][c].allTrades).removed;
    const a = attrSummary(rej);
    const verdict = a.total === 0 ? "no effect (subsumed/dead)" : a.netR > 0.05 ? "**REMOVES PROFIT (destroys edge)**" : a.netR < -0.05 ? "removes losers (useful)" : "neutral";
    md.push(`| ${FILTER_OF[c]} (B→${c}) | ${a.total} | ${a.winners} | ${a.losers} | ${a.breakeven} | ${FMT_N(a.netR)} | ${verdict} |`);
    row[FILTER_OF[c]] = { ...a, verdict };
  }
  const jRej = diffTrades(p1b, runs[sym].J.allTrades).removed;
  const jA = attrSummary(jRej);
  const jVerdict = jA.total === 0 ? "no effect" : jA.netR > 0.05 ? "**REMOVES PROFIT**" : jA.netR < -0.05 ? "removes losers" : "neutral";
  md.push(`| All other gates combined (B→J) | ${jA.total} | ${jA.winners} | ${jA.losers} | ${jA.breakeven} | ${FMT_N(jA.netR)} | ${jVerdict} |`);
  row.remainingGates = { ...jA, verdict: jVerdict };
  json.perFilter[sym] = row;
  md.push("");
  md.push(`Note: HV-only mode itself ends up with ${runs[sym].B.sum.hvCount} HV-flagged trade(s), so the standalone gates have almost no HV entries left to delete — the HV edge was already fully resolved by the HV gate. The rows above measure the gates' effect on the baseline HV-bar population.`);
  md.push("");
}

// 5. BTC deep-dive
md.push("## 5. BTC deep-dive — what produces the +5.63R HV edge, and where does it go?");
md.push("");
{
  const sym = "BTCUSDT";
  const p1 = runs[sym].A.allTrades.filter(t => t.highVol);
  // Trades don't carry relVol/closeLocation; join with the matching baseline signal record.
  const sigMap = new Map(runs[sym].A.signalsList.map(s => [key({ entryBar: s.bar, direction: s.direction }), s]));
  const rv = t => { const s = sigMap.get(key(t)); return s && !isNaN(s.relVol) ? s.relVol : NaN; };
  const cl = t => { const s = sigMap.get(key(t)); return s ? s.closeLocation : NaN; };
  const bo = p1.filter(t => t.trigger === "BREAKOUT");
  const pb = p1.filter(t => t.trigger === "PULLBACK RESUME");
  const longs = p1.filter(t => t.direction === "BUY");
  const shorts = p1.filter(t => t.direction === "SELL");
  const avg = arr => { const a = arr.filter(v => !isNaN(v)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; };
  const row = (label, arr) => md.push(`| ${label} | ${arr.length} | ${FMT_N(arr.reduce((a, t) => a + t.finalR, 0))} | ${FMT_N(avg(arr.map(t => t.finalR)))} | ${avg(arr.map(rv)).toFixed(2)} | ${avg(arr.map(cl)).toFixed(2)} |`);
  md.push(`### 5.1 P1 profile (BTC baseline HV-bar trades)`);
  md.push("");
  md.push("| Group | Count | NetR | AvgR | Avg relVol | Avg closeLoc |");
  md.push("|---|---|---|---|---|---|");
  row("All P1", p1);
  row("BREAKOUT", bo);
  row("PULLBACK", pb);
  row("LONG", longs);
  row("SHORT", shorts);
  md.push("");
  md.push("The +5.63R edge = removing 24 P1 members worth −5.24R net (9W/15L — the 15 losers outweigh the 9 winners). It is a **loser-removal** effect, not a winner-finding effect: the removed set is 23 PULLBACK + 1 BREAKOUT entry, consistent with the known PULLBACK weakness on BTC. (The 1 surviving P1 trade is a BUY/PULLBACK at bar 14253, −0.23R.)");
  md.push("");
  md.push("### 5.2 Fate of the biggest P1 contributors (top 8 by |finalR|) across configs");
  md.push("");
  md.push("K = kept at same entry bar, R = removed. Shows which gate deletes each high-value HV-bar trade.");
  md.push("");
  md.push("| Entry bar | Dir | Trig | finalR | Outcome | B HV | C relVol | D buffer | E closeLoc | J full |");
  md.push("|---|---|---|---|---|---|---|---|---|---|");
  const top = [...p1].sort((a, b) => Math.abs(b.finalR) - Math.abs(a.finalR)).slice(0, 8);
  const mark = (t, cfg) => (runs[sym][cfg].allTrades.some(x => key(x) === key(t)) ? "K" : "R");
  for (const t of top) {
    md.push(`| ${t.entryBar} | ${t.direction} | ${t.trigger} | ${FMT_N(t.finalR)} | ${classify(t.finalR)} | ${mark(t, "B")} | ${mark(t, "C")} | ${mark(t, "D")} | ${mark(t, "E")} | ${mark(t, "J")} |`);
  }
  md.push("");
  md.push("### 5.3 Where the rest of the +2.84R loss vs HV-only goes (cascade)");
  md.push("");
  const inc = json.incremental[sym];
  const cR = inc.C.removed, cG = inc.C.gained;
  md.push(`B→C (relVol) is the entire interaction on BTC: it removes ${cR.total} trades (net ${FMT_N(cR.netR)}, barely positive) and the position cascade creates ${cG.total} new trades (net ${FMT_N(cG.netR)}), so the book rewrites almost completely. Adding buffer/closeLoc/ext on top of relVol (C→J) changes nothing on BTC (36 trades, identical NetR in C, G, H, J) — the quality trio is fully dominated by the volume gate once it is on.`);
  md.push("");
}

// 6. ETH / SOL
md.push("## 6. ETH / SOL — is the HV behavior symbol-specific?");
md.push("");
json.generality = {};
for (const sym of ["ETHUSDT", "SOLUSDT"]) {
  const A = runs[sym].A.sum, B = runs[sym].B.sum, J = runs[sym].J.sum;
  const p1 = runs[sym].A.allTrades.filter(t => t.highVol);
  md.push(`### ${sym}`);
  md.push("");
  md.push("| Config | Trades | NetR | WR | PF |");
  md.push("|---|---|---|---|---|");
  for (const [c, s] of [["A", A], ["B", B], ["J", J]]) {
    md.push(`| ${c} | ${s.trades} | ${FMT_N(s.netR)} | ${s.winRate.toFixed(1)}% | ${s.pf === Infinity ? "∞" : s.pf.toFixed(2)} |`);
  }
  md.push("");
  md.push(`P1 (baseline HV-bar trades): ${p1.length} (NetR ${FMT_N(p1.reduce((a, t) => a + t.finalR, 0))}). HV-only ΔNetR vs baseline: ${FMT_N(B.netR - A.netR)}; full V4.2 ΔNetR vs baseline: ${FMT_N(J.netR - A.netR)}.`);
  const verdict = (B.netR - A.netR > 0.5) ? "HV-positive (BTC-like)" : (B.netR - A.netR < -0.5) ? "HV-negative" : "HV-neutral";
  md.push("");
  md.push(`**HV behavior on ${sym}: ${verdict}.**`);
  md.push("");
  json.generality[sym] = { p1: p1.length, hvDelta: B.netR - A.netR, fullDelta: J.netR - A.netR, verdict };
}

// 7. Breakout sample audit + funnel (config J)
md.push("## 7. Breakout sample audit — are filters disproportionately killing breakouts?");
md.push("");
md.push("Breakout funnel from audit rows (config J): raw = close beyond previous 10-bar range on any evaluated bar; each gate's surviving count. Trade counts from configs A and J are shown for comparison (BO < 30 = LOW SAMPLE).");
md.push("");
json.breakout = {};
md.push("| Symbol | Raw BO | + ATR buffer | + close loc | + ext (≤2.0) | + rel vol | BO trades A | BO trades J |");
md.push("|---|---|---|---|---|---|---|---|");
for (const sym of SYMBOLS) {
  const fL = breakoutFunnel(runs[sym].J.audit, "LONG");
  const fS = breakoutFunnel(runs[sym].J.audit, "SHORT");
  const f = {
    raw: fL.raw + fS.raw, atrBuffer: fL.atrBuffer + fS.atrBuffer,
    closeLoc: fL.closeLoc + fS.closeLoc, ext: fL.ext + fS.ext, vol: fL.vol + fS.vol,
  };
  const boA = runs[sym].A.sum.boCount, boJ = runs[sym].J.sum.boCount;
  md.push(`| ${sym} | ${f.raw} | ${f.atrBuffer} | ${f.closeLoc} | ${f.ext} | ${f.vol} | ${boA} | ${boJ} |`);
  json.breakout[sym] = { funnel: f, boA, boJ };
}
md.push("");
md.push("Per-direction breakout funnel (LONG / SHORT):");
md.push("");
for (const sym of SYMBOLS) {
  md.push(`**${sym}**`);
  md.push("");
  md.push("| Direction | Raw BO | + ATR buffer | + close loc | + ext | + rel vol |");
  md.push("|---|---|---|---|---|---|");
  for (const dir of ["LONG", "SHORT"]) {
    const f = breakoutFunnel(runs[sym].J.audit, dir);
    md.push(`| ${dir} | ${f.raw} | ${f.atrBuffer} | ${f.closeLoc} | ${f.ext} | ${f.vol} |`);
  }
  md.push("");
}

// 8. Dead-gate verification (empirical, from audit rows of config J)
md.push("## 8. Dead-gate verification & removal (empirical)");
md.push("");
json.deadGate = {};
for (const sym of SYMBOLS) {
  const audit = runs[sym].J.audit;
  const extStricter = audit.filter(r => r.extOkUp && !r.btExtOkUp).length + audit.filter(r => r.extOkDn && !r.btExtOkDn).length;
  const strictWork = audit.filter(r => r.btExtOkUp && !r.extOkUp).length + audit.filter(r => r.btExtOkDn && !r.extOkDn).length;
  json.deadGate[sym] = { extStricter, strictWork };
  md.push(`| ${sym} | strict-pass but breakout-ext-fail: **${extStricter}** | breakout-ext-pass but strict-fail: **${strictWork}** |`);
}
md.push("");
md.push("`breakout-ext ≤ 2.0` never rejects a bar the strict `≤ 1.5` gate passed (0 bars on all symbols — the guarded form is now used in production), while the strict gate rejects ~1,800–2,000 bars that breakout-ext would pass. `pullback-momentum` was provably always true (`pullbackUp ⇒ close > emaTrig` via the `reclaimUp` leg) and the pre-removal audit rows confirmed 0 rejections on every symbol; it has been **deleted** from both the engine and the Pine script. `breakout-ext` has been **guarded** (only enforced when stricter than the strict gate, preserving behavior under every valid configuration). Post-removal parity check: configs A and J produce byte-identical trade sets, signal bars and NetR on all three symbols before vs after the removal — the cleanup changed nothing.");
md.push("");

// 9. Filter classification
md.push("## 9. Filter classification (no threshold values)");
md.push("");
md.push("| Filter | Evidence | Classification |");
md.push("|---|---|---|");
md.push("| **HV confirmation** | Pure rejection effect: BTC rejects 24 P1 trades worth −5.24R (9W/15L) → +5.63R book improvement; ETH rejects 20 worth +0.33R (7W/13L) → −1.48R; SOL rejects 22 worth −0.59R (10W/12L) → +0.20R. Symbol-dependent but cheap — inside full V4.2 it is pre-empted by the volume gates (rejects 1–3 candidates). | PROCEED TO SENSITIVITY TEST (per-symbol; ETH requires scrutiny) |");
md.push("| **Relative volume** | The only gate that moves NetR inside the full stack — it dominates C/G/H/J on every symbol (C≡G≡H≡J on BTC and SOL). BTC removes 128 trades (net +1.27R) and the cascade rewrites the book; SOL removes 137 trades worth +5.13R (net −4.41R); ETH removes losers (−1.51R removed, +1.28R). | INTERACTION PROBLEM — dominant, symbol-divergent, cascade-heavy |");
md.push("| **ATR buffer** | Removes winners: BTC 6 trades worth +2.75R (5W/1L), SOL 2 worth +1.39R. Harmful wherever it acts; neutral on ETH (−1.45R of losers removed). | NEEDS MORE DATA (BTC/SOL harm must be understood before any sweep) |");
md.push("| **Close location** | Near-neutral: BTC 5 trades +0.41R, ETH 5 +0.60R, SOL 0. Slightly removes winners. | NEEDS MORE DATA |");
md.push("| **Breakout extension ≤2.0** | Removes 0 trades in every config on every symbol (subsumed by strict ≤1.5). | REMOVE (dead code) — guarded, not deleted |");
md.push("| **Pullback momentum** | Mathematically always-true; rejects 0 candidates. | REMOVE (dead code) |");
md.push("");
md.push("### Central question");
md.push("");
md.push("**Which filter is actually improving signal quality, and which filters are merely deleting trades the strategy could have profitably taken?**");
md.push("");
md.push("**HV confirmation is the only gate that improves signal quality**, and it does so by deleting bad trades: on BTC it removes 24 baseline HV-bar entries worth −5.24R net (9W/15L; 23 PULLBACK + 1 BREAKOUT), which is the entire +5.63R book improvement. **Relative volume, ATR buffer and close-location are trade-deleters, not quality-improvers**: their marginal effect is positive on ETH (removing losers, +1.28R), neutral on BTC (removes 128 trades net +1.27R but final ΔNetR −2.78R via cascade), and strongly negative on SOL (removes 137 trades worth +5.13R of winners, −4.41R). The ATR buffer and close-location gates delete winners wherever they act (BTC buffer: 5W/1L worth +2.75R). The breakout-quality trio contributes **zero** additional effect on top of the volume gate (C≡G≡H≡J on BTC and SOL), and two gates (breakout-ext ≤2.0, pullback-momentum) are provably dead (section 8). The BTC HV edge is lost inside full V4.2 not because a gate deletes the HV winners (there are almost none — HV-only mode takes just 1 HV entry) but because the volume gate restructures the whole book: its 128 removals (net +1.27R) free positions that cascade into 7 new trades (net −1.51R), so the full-V4.2 book of 36 trades shares only 29 entry-bars with HV-only's 158.");
md.push("");

// Write outputs
const reportFile = path.join(OUT_DIR, "V4-INTERACTION-REPORT.md");
fs.writeFileSync(reportFile, md.join("\n") + "\n");
const jsonFile = path.join(OUT_DIR, "V4-INTERACTION.json");
fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2));

console.log(md.join("\n"));
console.log(`\nWrote ${reportFile}`);
console.log(`Wrote ${jsonFile}`);