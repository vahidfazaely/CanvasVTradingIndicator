// Lightweight offline parity check: TradingView/CanvasV_V4_FAST.pine (full)
// vs TradingView/CanvasV_V4_FAST_lite.pine (Lite).
//
// The Lite build is trimmed on DIAGNOSTICS ONLY (no DEBUG mode, no decisions
// log, no V4LOG/V4POST diag alerts, no post-SL observation). Its signal path
// must be byte-identical to the full build: same inputs + defaults, same
// trigger/entry-quality/risk/HV gates, same sizing + exit management.
//
// This cannot compile Pine (TradingView has no local compiler) — it verifies
// the strongest proxy available: for every identifier in the curated signal
// path, the normalized right-hand-side text must match between the two files,
// and every signal-relevant input must exist with the same default.
//
// Usage: node scripts/check-pine-parity.mjs

import fs from "node:fs";

const FULL = "TradingView/CanvasV_V4_FAST.pine";
const LITE = "TradingView/CanvasV_V4_FAST_lite.pine";

//--------------------------------------------------------------
// Normalization: strip comments + collapse whitespace
//--------------------------------------------------------------
function stripLine(line) {
  // Remove // comments (not inside strings — Pine uses single-quoted strings
  // with '//' unlikely; these files use '//' only for comments).
  const noComment = line.replace(/\/\/.*$/, "").trim();
  return noComment.replace(/\s+/g, " ");
}

function norm(text) {
  return text
    .split("\n")
    .map(stripLine)
    .filter((l) => l.length > 0);
}

// map: id -> array of top-level assignment RHS texts ("name = ..." / "name := ...")
// Handles optional Pine type prefixes: `name = ...`, `name := ...`, `bool name = ...`.
const TYPE_KW = "(?:bool|int|float|string|color|line|label|table|box|array|matrix|linefill|polyline)";
function collectAssignments(lines) {
  const map = new Map();
  for (const l of lines) {
    // Top-level only: a declaration line that does not start with whitespace.
    if (/^\s/.test(l)) continue;
    const m = l.match(new RegExp(`^(?:(${TYPE_KW})\\s+)?([A-Za-z_]\\w*)\\s*(?::?=)\\s*(.+)$`));
    if (!m) continue;
    const name = m[2];
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(m[3]);
  }
  return map;
}

function collectInputs(lines) {
  const map = new Map();
  for (const l of lines) {
    // e.g. foo = input.float(1.5, "ATR Stop Loss Buffer", minval = 0.0, ...)
    const m = l.match(/^(\w+)\s*=\s*input\.(int|float|bool|string|session)\((.*)$/);
    if (!m) continue;
    const body = m[3];
    // Compare through the first ", group" boundary — everything up to the
    // tooltip is: type args up to group. Strip the trailing tooltip param.
    const upToGroup = body.split(", group =")[0].trim();
    map.set(m[1], { type: m[2], head: upToGroup });
  }
  return map;
}

//--------------------------------------------------------------
// Curated signal-path identifiers that MUST match between builds
//--------------------------------------------------------------
const SIGNAL_IDS = [
  // series / regime / direction
  "regimeSlope", "trending", "highVol", "trendUp", "trendDn",
  "momUp", "momDn", "setupUp", "setupDn",
  // volume
  "volMA", "relVol",
  // triggers + entry quality
  "pullbackTol", "touchLowUp", "touchHighDn", "reclaimUp", "reclaimDn",
  "pullbackUp", "pullbackDn",
  "candleRange", "bodyPct", "closeLocation", "bodyOkUp", "bodyOkDn",
  "extAtrUp", "extAtrDn", "extOkUp", "extOkDn",
  "btRangeHigh", "btRangeLow", "btBufferUp", "btBufferDn",
  "btCloseOkUp", "btCloseOkDn", "btExtOkUp", "btExtOkDn",
  "volOkBtUp", "volOkBtDn", "volOkPbUp", "volOkPbDn",
  "breakUp", "breakDn", "pullbackUpV", "pullbackDnV", "triggerUp", "triggerDn",
  // risk
  "entry", "atrUsable", "swingLow", "swingHigh",
  "structSLBuy", "structSLSell", "slBuyRaw", "slSellRaw",
  "riskStructBuy", "slModeBuy", "slBuy", "riskBuy", "riskAtrBuy",
  "riskGateBuyOk", "tp1Buy", "tp2Buy",
  "riskStructSell", "slModeSell", "slSell", "riskSell", "riskAtrSell",
  "riskGateSellOk", "tp1Sell", "tp2Sell",
  "cfgOk", "inSession",
  // HV gates
  "hvVolOkUp", "hvVolOkDn", "hvCloseOkUp", "hvCloseOkDn", "hvBlock",
  // candidates + entries
  "candUp", "candDn", "candReasonUp", "candReasonDn",
  "entryUp", "entryDn", "trigUpTxt", "trigDnTxt",
  "goLong", "goShort",
  // fixed-risk sizing
  "longPosRaw", "longPosCapped", "longPosSize",
  "shortPosRaw", "shortPosCapped", "shortPosSize",
  // exit-management hoists
  "exitSL", "midCurR", "staleR",
];

// Signal-relevant inputs that MUST exist with identical defaults.
// (Diagnostic-only inputs may differ: showLog / enableDiagAlerts /
// visualMode / postSlWindow are intentionally absent in Lite; showEMAs
// default differs intentionally — Lite renders its own EMA toggle.)
const SIGNAL_INPUTS = [
  // regime / dir / triggers
  "regimeBars", "regimeMinSlope", "atrRegimeLen", "highVolPct", "atrPeriod",
  "emaTrigLen", "emaDirLen", "emaSlowLen", "momSlopeBars",
  "enablePullback", "enableBreakout", "pullbackLookback", "pullbackTolPct",
  "breakoutBars", "maxExtAtr", "useStrictExt", "minBodyPct",
  // risk
  "swingLookback", "structBufferAtr", "minRiskAtr", "maxRiskAtr",
  "tp1R", "tp2R", "atrStopMult",
  // execution + session
  "enablePartialTP", "enableMoveBE", "enableMidTradeBE",
  "beBarThreshold", "staleBarLimit", "outcomeBars",
  "useSessionFilter", "sessionInput",
  // position sizing (Phase 2)
  "enableFixedRisk", "riskPerTrade", "maxPosSize",
  // breakout quality (Phase 3)
  "enableBtBuffer", "breakoutBuffer", "enableCloseLoc",
  "closeLocMinLong", "closeLocMinShort", "enableBtExtFilter", "breakoutExtAtr",
  // volume (Phase 4)
  "enableRelVol", "volLookback", "volMinBreakout", "volMinPullback",
  // high-volatility (Phase 5)
  "hvMode", "hvVolMin", "hvCloseLocLong", "hvCloseLocShort",
];

//--------------------------------------------------------------
const full = collectAssignments(norm(fs.readFileSync(FULL, "utf8")));
const lite = collectAssignments(norm(fs.readFileSync(LITE, "utf8")));
const fullIn = collectInputs(norm(fs.readFileSync(FULL, "utf8")));
const liteIn = collectInputs(norm(fs.readFileSync(LITE, "utf8")));

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error("FAIL: " + msg);
};

// --- 1. Signal-path formula equality ---------------------------
for (const id of SIGNAL_IDS) {
  const f = full.get(id);
  const l = lite.get(id);
  if (!f) {
    fail(`${id}: not found in FULL`);
    continue;
  }
  if (!l) {
    fail(`${id}: declared in FULL but MISSING in Lite`);
    continue;
  }
  const fj = f.join(" | ");
  const lj = l.join(" | ");
  if (fj !== lj) {
    fail(`${id}:\n  FULL: ${fj}\n  LITE: ${lj}`);
  }
}

// --- 2. Input existence + defaults ------------------------------
for (const name of SIGNAL_INPUTS) {
  const f = fullIn.get(name);
  const l = liteIn.get(name);
  if (!f) {
    fail(`input ${name}: not found in FULL`);
    continue;
  }
  if (!l) {
    fail(`input ${name}: present in FULL but MISSING in Lite`);
    continue;
  }
  if (f.head !== l.head) {
    fail(`input ${name}:\n  FULL: ${f.head}\n  LITE: ${l.head}`);
  }
}

// --- 3. Reverse check: no extra signal-relevant inputs in Lite --
for (const name of liteIn.keys()) {
  if (SIGNAL_INPUTS.includes(name)) continue;
  if (fullIn.has(name)) continue; // diagnostic input — expected in full only
  fail(`input ${name}: present in Lite but NOT in FULL (signal set drift?)`);
}

if (failures === 0) {
  console.log(`OK  signal-path parity: ${SIGNAL_IDS.length} identifiers + ${SIGNAL_INPUTS.length} inputs match`);
  console.log(`OK  (Lite diagnostics-only trims are excluded by design: DEBUG mode, decisions log, diag alerts, post-SL window)`);
  process.exit(0);
} else {
  console.error(`\n${failures} parity failure(s) between ${FULL} and ${LITE}`);
  process.exit(1);
}
