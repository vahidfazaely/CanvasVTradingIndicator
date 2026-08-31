// Lightweight offline structural check for Pine Script v5 files.
// TradingView has no local compiler, so this validates the things we CAN
// check locally: delimiter balance, unterminated strings/comments, and a
// few sanity counters (indicator decl, plot/plotshape/alertcondition use).
//
// Usage: node scripts/check-pine-structure.mjs <file.pine>

import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/check-pine-structure.mjs <file.pine>");
  process.exit(2);
}
const src = fs.readFileSync(file, "utf8");
const lines = src.split(/\r?\n/);

// --- Strip comments and strings, tracking line numbers ---------------------
const stripped = []; // {ch, line}
let inBlock = false;
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  let inStr = false;
  let q = "";
  for (let j = 0; j < ln.length; j++) {
    const ch = ln[j];
    const next = ln[j + 1];
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        j++;
      }
      continue;
    }
    if (inStr) {
      if (ch === "\\") {
        j++;
        continue;
      }
      if (ch === q) inStr = false;
      continue;
    }
    if (ch === "/" && next === "/") break; // line comment
    if (ch === "/" && next === "*") {
      inBlock = true;
      j++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      q = ch;
      continue;
    }
    stripped.push({ ch, line: i + 1 });
  }
}
if (inBlock) {
  console.error(`FAIL: unterminated block comment /* ... */`);
  process.exit(1);
}

// --- Delimiter balance -----------------------------------------------------
const pairs = { ")": "(", "]": "[", "}": "{" };
const stack = [];
const errors = [];
for (const { ch, line } of stripped) {
  if (ch === "(" || ch === "[" || ch === "{") {
    stack.push({ ch, line });
  } else if (pairs[ch]) {
    const top = stack.pop();
    if (!top || top.ch !== pairs[ch]) {
      errors.push(
        `line ${line}: unmatched '${ch}' (expected to close '${top ? top.ch : "nothing"}' opened at line ${top ? top.line : "?"})`
      );
    }
  }
}
for (const leftover of stack) {
  errors.push(`line ${leftover.line}: unclosed '${leftover.ch}'`);
}
if (errors.length) {
  console.error(`FAIL: ${errors.length} delimiter error(s)`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

// --- Sanity counters (code only, comments excluded) -----------------------
const code = stripped.map((s) => s.ch).join("");
const count = (re) => (code.match(re) || []).length;
const checks = [
  ["indicator(", count(/indicator\(/g), 1],
  ["plotshape(", count(/plotshape\(/g), null],
  ["alertcondition(", count(/alertcondition\(/g), null],
  ["request.security", count(/request\.security/g), 0],
  ["lookahead_on", count(/lookahead_on/g), 0],
  ["barstate.isconfirmed", count(/barstate\.isconfirmed/g), null],
];
let warn = false;
for (const [name, n, expect] of checks) {
  const ok = expect === null || n === expect;
  if (!ok) warn = true;
  console.log(`${ok ? "OK " : "WARN"} ${name}: ${n}${expect !== null ? ` (expected ${expect})` : ""}`);
}

console.log(`OK: delimiters balanced, no unterminated strings, ${lines.length} lines`);
process.exit(warn ? 1 : 0);
