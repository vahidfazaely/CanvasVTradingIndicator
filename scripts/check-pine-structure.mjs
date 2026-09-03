// Lightweight offline structural check for Pine Script v5 files.
// TradingView has no local compiler, so this validates the things we CAN
// check locally:
//   - delimiter balance, unterminated strings/comments
//   - sanity counters (indicator/strategy decl, plot/plotshape/alertcondition use)
//   - SEMANTIC: top-level variable declared more than once (`x = ...` twice)
//   - SEMANTIC: top-level variable used on a line above its first declaration
//               (Pine requires declaration before use; this catches the
//               'Undeclared identifier' class of compile errors)
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

// --- Rebuild per-line code (comments/strings removed) ----------------------
const codeByLine = new Map(); // line -> code string
for (const { ch, line } of stripped) {
  codeByLine.set(line, (codeByLine.get(line) || "") + ch);
}

// --- Semantic: top-level declarations --------------------------------------
// Matches `[var|varip] [type] name = ...` (not `:=` reassignments, not functions).
const TYPE_KW = "(?:bool|int|float|string|color|line|label|table|box|array|matrix|linefill|polyline)\\s+";
// `(?!=)` guards against `name == value` (comparison) being read as a declaration.
const DECL_RE = new RegExp(`^\\s*(?:var|varip)\\s+(?:${TYPE_KW})?([A-Za-z_]\\w*)\\s*=\\s*(?!=)|^\\s*(?:${TYPE_KW})?([A-Za-z_]\\w*)\\s*=\\s*(?!=)`);

const declared = new Map(); // name -> first declaration line
for (const [line, code] of codeByLine) {
  const m = code.match(DECL_RE);
  if (m) {
    const name = m[1] || m[2];
    if (!name) continue;
    if (declared.has(name)) {
      console.error(`FAIL: line ${line}: '${name}' is already declared at line ${declared.get(name)} (Pine v5 forbids re-declaration with '='; use a new variable name)`);
      process.exit(1);
    }
    declared.set(name, line);
  }
}

// --- Semantic: use before declaration --------------------------------------
const IDENT_RE = /[A-Za-z_]\w*/g;
for (const [line, code] of codeByLine) {
  IDENT_RE.lastIndex = 0;
  let m;
  while ((m = IDENT_RE.exec(code))) {
    const name = m[0];
    // Skip keywords and namespace-prefixed built-ins
    if (/^(and|or|not|if|else|for|to|while|var|varip|true|false|na)$/.test(name)) continue;
    if (/^(close|open|high|low|volume|time|timenow|bar_index|barstate|syminfo|hl2|hlc3|ohlc4)$/.test(name)) continue;
    if (/^(ta|math|strategy|input|request|array|matrix|table|label|line|box|color|plot|alertcondition|timeframe|session|ticker)\./.test(name)) continue;
    if (!declared.has(name)) continue;
    const declLine = declared.get(name);
    if (line < declLine) {
      console.error(`FAIL: line ${line}: '${name}' is used before its declaration at line ${declLine} (Pine requires declaration above first use)`);
      process.exit(1);
    }
  }
}

// --- Sanity counters (code only, comments excluded) ------------------------
const code = stripped.map((s) => s.ch).join("");
const count = (re) => (code.match(re) || []).length;
const declCount = count(/(^|[^A-Za-z_])(indicator|strategy|library)\(/g);
const checks = [
  ["indicator()/strategy()/library()", declCount, 1],
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

console.log(`OK: delimiters balanced, no unterminated strings, no use-before-declaration, no redeclaration, ${lines.length} lines`);
process.exit(warn ? 1 : 0);