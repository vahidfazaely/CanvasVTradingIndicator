// Shared Pine input parser — used by pine-marker-parity.mjs and pine-holdout90.mjs
// so both simulation tools are driven by exactly the same extraction of what the
// .pine files actually declare (no hand-maintained copies to drift apart).

import fs from "node:fs";

// Parse `name = input.<type>(<default>, "title", ...)` declarations from a Pine file.
// Returns { name: { type, value } } where value is the parsed DEFAULT.
export function parsePineInputs(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const out = {};
  for (let raw of lines) {
    raw = raw.replace(/\/\/.*$/, "").trim();
    if (!raw) continue;
    const m = raw.match(/^(\w+)\s*=\s*input\.(int|float|bool|string|session)\((.*)\)$/);
    if (!m) continue;
    const name = m[1];
    const type = m[2];
    const argText = m[3];
    // First argument = default value. Split on the first comma OUTSIDE quotes.
    let first = "";
    let inQuote = null;
    for (let i = 0; i < argText.length; i++) {
      const ch = argText[i];
      if (inQuote) {
        first += ch;
        if (ch === inQuote) inQuote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { inQuote = ch; first += ch; continue; }
      if (ch === ",") break;
      first += ch;
    }
    const tok = first.trim();
    let value;
    if (type === "int" || type === "float") value = parseFloat(tok);
    else if (type === "bool") value = tok === "true";
    else value = tok.replace(/^["']/, "").replace(/["']$/, "");
    out[name] = { type, value };
  }
  return out;
}

// Hard sanity assertion on a few known declarations so a silent parse bug can
// never fake a PASS (mirrors the checks previously in pine-marker-parity.mjs).
export function sanityParse(parsed, file) {
  const checks = {
    maxExtAtr: 1.5, useStrictExt: true, atrStopMult: 1.5, maxRiskAtr: 4.0,
    hvMode: "Stronger Confirmation", enableRelVol: true, riskPerTrade: 0.5,
    tp1R: 1.0, tp2R: 2.5, breakoutBuffer: 0.1, closeLocMinLong: 0.7,
    volMinBreakout: 1.2, staleBarLimit: 15, outcomeBars: 20, beBarThreshold: 10,
  };
  const bad = [];
  for (const [k, v] of Object.entries(checks)) {
    if (!(k in parsed)) { bad.push(`${k}:MISSING`); continue; }
    const pv = parsed[k].value;
    if (typeof v === "number" ? Math.abs(pv - v) > 1e-9 : pv !== v) bad.push(`${k}:${pv}!=${v}`);
  }
  if (bad.length) throw new Error(`Pine input parser sanity failed on ${file}: ${bad.join(", ")}`);
}
