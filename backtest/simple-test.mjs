#!/usr/bin/env node
// CanvasV — Simple Test Runner
// One entry point for quick engine experiments, no API knowledge required.
//
// Usage:
//   node simple-test.mjs                          # BTCUSDT production baseline
//   node simple-test.mjs SOLUSDT                  # any symbol in engine/data
//   node simple-test.mjs ETHUSDT --param atrStopMult=2.0        # run with overrides
//   node simple-test.mjs --param a=1 --param b=2               # repeatable
//   node simple-test.mjs BTCUSDT --vs atrStopMult=2.0          # A/B: baseline vs variant
//   node simple-test.mjs --halves                 # also show first-90 / second-90
//   node simple-test.mjs --out BTC-CUSTOM.json    # export variant trade JSON
//
// Exit code 0 on success. Prints an aligned metric table; with --vs also the Δ.
//
// Example:  node simple-test.mjs SOLUSDT --vs atrStopMult=2.0 --halves

import fs from "node:fs";
import path from "node:path";
import { runEngine, generateReport, DEFAULT_PARAMS } from "./engine.mjs";

// ------------------------------------------------------------- CLI
const args = process.argv.slice(2);
const help = args.includes("--help") || args.includes("-h");
const halves = args.includes("--halves");

const getVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const outPath = getVal("--out");

// Symbol = first positional argument that isn't a flag/value.
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--param" && args[i - 1] !== "--vs" && args[i - 1] !== "--out" && args[i - 1] !== "--data");
const symbol = (positional[0] || "BTCUSDT").toUpperCase();

// Parse ONLY the given flag's k=v pairs. Each call scans the whole argv so the
// other flag's tokens are explicitly skipped (they look identical otherwise).
const parseKV = (flag) => {
  const map = {};
  let active = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) { active = true; continue; }
    if (args[i].startsWith("--")) { active = false; continue; }
    if (active && args[i].includes("=")) {
      const [k, v] = args[i].split("=");
      map[k] = coerce(v);
    }
  }
  return map;
};
const coerce = (s) => {
  if (s === "true") return true;
  if (s === "false") return false;
  const n = Number(s);
  return Number.isNaN(n) ? s : n;
};
const baseOverrides = parseKV("--param");
const vsOverrides = parseKV("--vs");

if (help) {
  console.log(`CanvasV Simple Test Runner

Usage:
  node simple-test.mjs [SYMBOL] [options]

Options:
  --param key=value     Override an engine param (repeatable).
  --vs key=value        Second parameter set -> run an A/B comparison with Δ.
  --halves              Also show first-90 / second-90 hold-out rows.
  --out FILE.json       Export the (variant) trade list to FILE.json.
  --data PATH.json      Use a custom candle file instead of engine/data.
  --help                Show this help.

Examples:
  node simple-test.mjs
  node simple-test.mjs SOLUSDT --param atrStopMult=2.0
  node simple-test.mjs ETHUSDT --vs atrStopMult=2.0 --halves
`);
  process.exit(0);
}

// ------------------------------------------------------------- load
const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const dataArg = getVal("--data");
let candles, srcLabel;
if (dataArg) {
  candles = JSON.parse(fs.readFileSync(dataArg, "utf8"));
  srcLabel = dataArg;
} else {
  const file = path.join(DATA_DIR, `${symbol}-15m.json`);
  if (!fs.existsSync(file)) {
    console.error(`No data for ${symbol}. Available: ${fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace("-15m.json", "")).join(", ")}`);
    process.exit(1);
  }
  candles = JSON.parse(fs.readFileSync(file, "utf8"));
  srcLabel = `${symbol} 15m`;
}

// Validate override keys against the engine's known params.
for (const [k] of [...Object.entries(baseOverrides), ...Object.entries(vsOverrides)]) {
  if (!(k in DEFAULT_PARAMS)) {
    console.error(`Unknown param '${k}'. Known keys:\n  ${Object.keys(DEFAULT_PARAMS).join(", ")}`);
    process.exit(1);
  }
}

const paramsBase = { ...DEFAULT_PARAMS, ...baseOverrides };
const paramsVs = vsOverrides && Object.keys(vsOverrides).length ? { ...DEFAULT_PARAMS, ...vsOverrides } : null;

// ------------------------------------------------------------- metrics
const fmtN = (v, d = 2) => (typeof v === "number" && Number.isFinite(v) ? (v >= 0 ? `+${v.toFixed(d)}` : v.toFixed(d)) : "n/a");
const fmtP = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "n/a");

function metricOf(run) {
  const closed = run.trades.filter((t) => t.exitReason !== "SUPERSEDED");
  const rep = generateReport(closed);
  const sum = (a) => a.reduce((s, t) => s + t.finalR, 0);
  return {
    trades: closed.length,
    winRate: rep.winRate,
    pf: rep.profitFactor,
    netR: rep.totalR,
    avgR: rep.avgR,
    ddR: rep.maxDrawdownR,
    ddPct: rep.maxDrawdownPct,
    longN: closed.filter((t) => t.direction === "BUY").length,
    longR: sum(closed.filter((t) => t.direction === "BUY")),
    shortN: closed.filter((t) => t.direction === "SELL").length,
    shortR: sum(closed.filter((t) => t.direction === "SELL")),
    pbN: closed.filter((t) => t.trigger === "PULLBACK RESUME").length,
    pbR: sum(closed.filter((t) => t.trigger === "PULLBACK RESUME")),
    boN: closed.filter((t) => t.trigger === "BREAKOUT").length,
    boR: sum(closed.filter((t) => t.trigger === "BREAKOUT")),
    slN: closed.filter((t) => t.exitReason === "SL FIRST").length,
    tpN: closed.filter((t) => t.exitReason.includes("TP")).length,
    supN: run.trades.length - closed.length,
    runs: run,
  };
}

// ------------------------------------------------------------- report
function renderRow(label, m, ref) {
  const d = ref
    ? ` | Δ ${fmtN(m.netR - ref.netR)}R / ${m.trades - ref.trades >= 0 ? "+" : ""}${m.trades - ref.trades}t`
    : "";
  console.log(
    `${label.padEnd(9)} ${String(m.trades).padStart(3)}t ${fmtP(m.winRate).padStart(5)}% PF ${fmtP(m.pf).padStart(4)} Net ${fmtN(m.netR).padStart(7)}R Avg ${fmtN(m.avgR, 3).padStart(7)} DD ${fmtN(m.ddR).padStart(6)}R/${fmtP(m.ddPct).padStart(5)}% L ${m.longN}/${fmtN(m.longR)} S ${m.shortN}/${fmtN(m.shortR)} PB ${m.pbN}/${fmtN(m.pbR)} BO ${m.boN}/${fmtN(m.boR)} SL ${m.slN} TP ${m.tpN} sup ${m.supN}${d}`
  );
}

console.log(`CanvasV Simple Test — ${srcLabel} (${candles.length.toLocaleString()} candles)`);
console.log(`Params: ${Object.keys(baseOverrides).length ? Object.entries(baseOverrides).map(([k, v]) => `${k}=${v}`).join(" ") : "production defaults (CUR)"}`);
if (paramsVs) console.log(`Variant: ${Object.entries(vsOverrides).map(([k, v]) => `${k}=${v}`).join(" ")}`);
console.log("=".repeat(96));

const windows = { full: candles };
if (halves) {
  const half = Math.floor(candles.length / 2);
  windows["first-90"] = candles.slice(0, half);
  windows["second-90"] = candles.slice(half);
}

let variantRun = null;
for (const [win, slice] of Object.entries(windows)) {
  const base = metricOf(runEngine(slice, paramsBase, {}));
  if (paramsVs) variantRun = metricOf(runEngine(slice, paramsVs, {}));
  renderRow(win, base, null);
  if (variantRun) renderRow(`  vs`, variantRun, base);
  console.log("-".repeat(96));
}

if (outPath) {
  const run = variantRun ? variantRun.runs : metricOf(runEngine(candles, paramsBase, {})).runs;
  fs.writeFileSync(outPath, JSON.stringify({ symbol: srcLabel, params: paramsVs || paramsBase, trades: run.trades }, null, 2));
  console.log(`Exported trades → ${outPath}`);
}
console.log("Tip: try --vs <param>=<value> for an A/B diff, --halves for the 90/90 split.");
