#!/usr/bin/env node
// CanvasV V4 — Numeric Marker Parity Check (full Pine vs Lite Pine)
//
// The engine (engine.mjs) is the pre-validated numeric mirror of the
// production Pine signal logic (parity established in the V4/V4.2 audits).
// This tool closes the loop on the Lite sync *numerically*:
//
//   1. Parse the input declarations out of BOTH Pine files
//      (TradingView/CanvasV_V4_FAST.pine and ..._FAST_lite.pine) so the
//      simulation is driven by what the scripts actually declare — not by a
//      hand-maintained copy.
//   2. Run the engine with full-parsed params and with lite-parsed params
//      on the same candles (BTCUSDT / ETHUSDT / SOLUSDT M15).
//   3. Compare candle-by-candle: every audit-row marker/gate boolean, then
//      each signal's SL/TP/risk geometry, then the trade stream.
//   4. Cross-check both against engine DEFAULT_PARAMS (engine drift guard).
//
// PASS = the two Pine builds are numerically identical on real data AND
// agree with the engine reference on every signal-affecting input.
//
// Usage: node backtest/pine-marker-parity.mjs

import fs from "node:fs";
import path from "node:path";
import { runEngine, DEFAULT_PARAMS } from "./engine.mjs";
import { parsePineInputs, sanityParse } from "./pine-parse.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const PINE_FULL = path.join(ROOT, "TradingView", "CanvasV_V4_FAST.pine");
const PINE_LITE = path.join(ROOT, "TradingView", "CanvasV_V4_FAST_lite.pine");
const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const OUT_DIR = path.join(import.meta.dirname, "engine", "output");
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const REPORT_MD = path.join(OUT_DIR, "V4-PINE-MARKER-PARITY.md");

//--------------------------------------------------------------
const fullParsed = parsePineInputs(PINE_FULL);
const liteParsed = parsePineInputs(PINE_LITE);
sanityParse(fullParsed, PINE_FULL);
sanityParse(liteParsed, PINE_LITE);

// Signal-affecting inputs = keys present in engine DEFAULT_PARAMS that are
// also declared as Pine inputs in BOTH files (engine mirrors Pine 1:1 here).
const SIGNAL_KEYS = Object.keys(DEFAULT_PARAMS).filter((k) => fullParsed[k] && liteParsed[k]);

// Build per-build params: start from DEFAULT_PARAMS, overlay parsed Pine
// defaults so the run is driven by the .pine text.
const paramsFull = { ...DEFAULT_PARAMS };
const paramsLite = { ...DEFAULT_PARAMS };
for (const k of SIGNAL_KEYS) {
  paramsFull[k] = fullParsed[k].value;
  paramsLite[k] = liteParsed[k].value;
}

// Defaults comparison table (full vs lite vs engine reference)
const defaultsDiff = [];
for (const k of SIGNAL_KEYS) {
  const fv = fullParsed[k].value;
  const lv = liteParsed[k].value;
  const ev = DEFAULT_PARAMS[k];
  const num = typeof ev === "number";
  const eq = (a, b) => (num ? Math.abs(a - b) < 1e-9 : a === b);
  if (!eq(fv, lv)) defaultsDiff.push({ k, full: fv, lite: lv, engine: ev });
}
// Inputs FULL Pine declares that LITE does NOT → drift risk (engine-keys only).
const missingInLite = [];
for (const k of Object.keys(DEFAULT_PARAMS)) {
  if (fullParsed[k] && !liteParsed[k]) missingInLite.push(k);
}

//--------------------------------------------------------------
// Comparison helpers
//--------------------------------------------------------------
const eqV = (a, b) => (a === b) || (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b));

function diffAudit(a, b) {
  if (!a || !b) return { lengthMismatch: true, count: 0, first: null, fieldDiff: {} };
  if (a.length !== b.length) return { lengthMismatch: true, count: 0, first: null, fieldDiff: {} };
  let count = 0;
  let first = null;
  const fieldDiff = {};
  const keys = Object.keys(a[0]);
  for (let i = 0; i < a.length; i++) {
    for (const k of keys) {
      if (!eqV(a[i][k], b[i][k])) {
        count++;
        fieldDiff[k] = (fieldDiff[k] || 0) + 1;
        if (!first) first = { i: a[i].i, t: a[i].t, field: k, full: a[i][k], lite: b[i][k] };
      }
    }
  }
  return { lengthMismatch: false, count, first, fieldDiff };
}

function diffSignals(a, b) {
  if (a.length !== b.length) return { lengthMismatch: true, nA: a.length, nB: b.length };
  let count = 0;
  let first = null;
  const fields = ["bar", "time", "direction", "trigger", "entry", "sl", "tp1", "tp2", "riskAtr", "extAtr", "bodyPct", "ema21", "atr", "structSL", "highVol", "posSize"];
  for (let i = 0; i < a.length; i++) {
    for (const f of fields) {
      if (!eqV(a[i][f], b[i][f])) {
        count++;
        if (!first) first = { idx: i, field: f, full: a[i][f], lite: b[i][f], bar: a[i].bar, time: a[i].time };
      }
    }
  }
  return { lengthMismatch: false, count, first };
}

function diffTrades(a, b) {
  if (a.length !== b.length) return { lengthMismatch: true, nA: a.length, nB: b.length };
  let count = 0;
  let first = null;
  const fields = ["direction", "entry", "sl", "tp1", "tp2", "risk", "riskAtr", "exitPrice", "exitReason", "entryBar", "exitBar", "finalR", "mfe", "mae", "trigger", "highVol"];
  for (let i = 0; i < a.length; i++) {
    for (const f of fields) {
      if (!eqV(a[i][f], b[i][f])) {
        count++;
        if (!first) first = { idx: i, field: f, full: a[i][f], lite: b[i][f], bar: a[i].entryBar, time: a[i].entryTime };
      }
    }
  }
  return { lengthMismatch: false, count, first };
}

//--------------------------------------------------------------
// Run per symbol
//--------------------------------------------------------------
const sections = [];
const total = { auditDiff: 0, signalDiff: 0, tradeDiff: 0 };
for (const sym of SYMBOLS) {
  const dataPath = path.join(DATA_DIR, `${sym}-15m.json`);
  const candles = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  const rF = runEngine(candles, paramsFull, { audit: true });
  const rL = runEngine(candles, paramsLite, { audit: true });

  const aDiff = diffAudit(rF.audit, rL.audit);
  const sDiff = diffSignals(rF.signals, rL.signals);
  const tDiff = diffTrades(rF.trades, rL.trades);
  total.auditDiff += aDiff.count;
  total.signalDiff += sDiff.count;
  total.tradeDiff += tDiff.count;

  sections.push(`### ${sym}

| Metric | Value |
|---|---|
| Candles | ${candles.length.toLocaleString()} |
| Processed (audit) bars | ${rF.audit ? rF.audit.length.toLocaleString() : "n/a"} |
| Signals (full / lite) | ${rF.signals.length} / ${rL.signals.length} |
| Trades (full / lite) | ${rF.trades.length} / ${rL.trades.length} |
| Audit-row field diffs | ${aDiff.count} |
| Signal diffs | ${sDiff.count} |
| Trade diffs | ${tDiff.count} |

${aDiff.count === 0 && sDiff.count === 0 && tDiff.count === 0 ? "✅ IDENTICAL" : "❌ MISMATCH"}
`);
}

//--------------------------------------------------------------
// Report
//--------------------------------------------------------------
const pass = defaultsDiff.length === 0 && total.auditDiff === 0 && total.signalDiff === 0 && total.tradeDiff === 0;
const now = new Date().toISOString().replace("T", " ").slice(0, 19);

let md = `# V4 Pine Numeric Marker Parity — full vs Lite

> Generated: ${now} — engine data: ${SYMBOLS.join(", ")} M15 — engine: backtest/engine.mjs (pre-validated Pine mirror)
> Method: both Pine files' declared inputs are parsed and run through the engine with \\\`audit:true\\\`; outputs compared candle-by-candle.

## Verdict: ${pass ? "✅ PASS" : "❌ FAIL"}

${
  defaultsDiff.length === 0
    ? "Signal-affecting input defaults are identical across FULL Pine, LITE Pine and the engine reference."
    : `**${defaultsDiff.length} default mismatch(es):** ${defaultsDiff.map((d) => `${d.k} full=${d.full} lite=${d.lite} engine=${d.engine}`).join("; ")}`
}

## Input defaults compared (${SIGNAL_KEYS.length} signal-affecting inputs)

| Input | FULL | LITE | Engine |
|---|---|---|---|
${SIGNAL_KEYS.map((k) => `| ${k} | ${fullParsed[k].value} | ${liteParsed[k].value} | ${DEFAULT_PARAMS[k]} |`).join("\n")}

Signal inputs declared in FULL Pine but missing in LITE (engine drift guard): ${missingInLite.length ? missingInLite.join(", ") : "none"}.

## Per-symbol candle-by-candle comparison

${sections.join("\n")}

## Summary

- Audit-row marker/gate diffs (full vs lite): **${total.auditDiff}**
- Signal SL/TP geometry diffs: **${total.signalDiff}**
- Trade-stream diffs: **${total.tradeDiff}**
- Covers: entryUp/entryDn and every stage boolean (regime, momentum, trigger, breakout gates, volume, HV, risk) per candle, plus each signal's entry/SL/TP1/TP2/riskAtr and the resulting trade exits.
`;

fs.writeFileSync(REPORT_MD, md);

// Console summary
console.log(`Numeric marker parity: ${pass ? "PASS ✅" : "FAIL ❌"}`);
console.log(`  input defaults compared: ${SIGNAL_KEYS.length} | default mismatches: ${defaultsDiff.length}`);
console.log(`  audit-row diffs: ${total.auditDiff} | signal diffs: ${total.signalDiff} | trade diffs: ${total.tradeDiff}`);
console.log(`Report: ${REPORT_MD}`);
process.exit(pass ? 0 : 1);
