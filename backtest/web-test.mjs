#!/usr/bin/env node
// CanvasV — Web Test Lab
// A small zero-dependency web dashboard for running the quick tests in your
// browser instead of a console. Click buttons, read tables.
//
// Usage:
//   node backtest/web-test.mjs            # http://127.0.0.1:8090
//   node backtest/web-test.mjs --open     # also open the default browser
//   node backtest/web-test.mjs 9000       # custom port
//
// API:
//   GET  /api/meta                       -> symbols + candle counts + date ranges
//   POST /api/run                        -> {symbol, variants:[{label,overrides}], windows:[]}
//                                          returns metrics per window per variant
// Everything is computed locally from the saved M15 data. No data leaves the machine.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { runEngine, generateReport, DEFAULT_PARAMS } from "./engine.mjs";

const PORT = parseInt((process.argv[2] || "8090").replace(/\D/g, "")) || 8090;
const OPEN = process.argv.includes("--open");
const DATA_DIR = path.join(import.meta.dirname, "engine", "data");
const candleCache = new Map(); // symbol -> candles
const runCache = new Map();    // key -> metrics

const SYMBOLS = fs
  .readdirSync(DATA_DIR)
  .filter((f) => f.endsWith("-15m.json"))
  .map((f) => f.replace("-15m.json", ""))
  .sort();

function loadCandles(symbol) {
  if (!candleCache.has(symbol)) {
    candleCache.set(symbol, JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${symbol}-15m.json`), "utf8")));
  }
  return candleCache.get(symbol);
}

function fmtN(v, d) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "n/a";
  return (v >= 0 ? "+" : "") + v.toFixed(d);
}
function fmtP(v, d) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "n/a";
  return v.toFixed(d);
}

function metricOf(run) {
  const closed = run.trades.filter((t) => t.exitReason !== "SUPERSEDED");
  const rep = generateReport(closed);
  const sum = (a) => a.reduce((s, t) => s + t.finalR, 0);
  const dirs = (d) => { const g = closed.filter((t) => t.direction === d); return { n: g.length, r: sum(g) }; };
  const fams = (f) => { const g = closed.filter((t) => (f === "PB" ? t.trigger === "PULLBACK RESUME" : t.trigger === "BREAKOUT")); return { n: g.length, r: sum(g) }; };
  const L = dirs("BUY"), S = dirs("SELL"), pb = fams("PB"), bo = fams("BO");
  return {
    trades: closed.length,
    winRate: rep.winRate,
    pf: rep.profitFactor,
    netR: rep.totalR,
    avgR: rep.avgR,
    ddR: rep.maxDrawdownR,
    ddPct: rep.maxDrawdownPct,
    longN: L.n, longR: L.r,
    shortN: S.n, shortR: S.r,
    pbN: pb.n, pbR: pb.r,
    boN: bo.n, boR: bo.r,
    slN: closed.filter((t) => t.exitReason === "SL FIRST").length,
    tpN: closed.filter((t) => t.exitReason.includes("TP")).length,
    supN: run.trades.length - closed.length,
  };
}

function runWindow(symbol, overrides, win) {
  const candles = loadCandles(symbol);
  let slice = candles;
  if (win === "first-90") slice = candles.slice(0, Math.floor(candles.length / 2));
  if (win === "second-90") slice = candles.slice(Math.floor(candles.length / 2));
  const key = JSON.stringify([symbol, overrides, win]);
  if (!runCache.has(key)) {
    runCache.set(key, metricOf(runEngine(slice, { ...DEFAULT_PARAMS, ...overrides }, {})));
  }
  return runCache.get(key);
}

// ------------------------------------------------------------- routes
function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function handleRun(req, res, body) {
  const { symbol, variants, windows } = body;
  if (!symbol || !Array.isArray(variants) || !variants.length) {
    return sendJson(res, 400, { error: "Need { symbol, variants: [{label, overrides}], windows }" });
  }
  const candles = loadCandles(symbol);
  const winList = Array.isArray(windows) && windows.length ? windows : ["full"];
  const out = { symbol, candleCount: candles.length, windows: {} };
  for (const win of winList) {
    out.windows[win] = {};
    for (const v of variants) {
      out.windows[win][v.label] = runWindow(symbol, v.overrides || {}, win);
    }
  }
  sendJson(res, 200, out);
}

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(PAGE_HTML);
  }
  if (url === "/api/meta") {
    const meta = SYMBOLS.map((sym) => {
      const c = loadCandles(sym);
      const iso = (t) => new Date(t).toISOString().slice(0, 10);
      return { symbol: sym, candles: c.length, from: iso(c[0].timestamp), to: iso(c[c.length - 1].timestamp) };
    });
    return sendJson(res, 200, { symbols: meta });
  }
  if (url === "/api/run" && req.method === "POST") {
    let raw = "";
    req.on("data", (d) => { raw += d; });
    req.on("end", () => {
      try { handleRun(req, res, JSON.parse(raw)); }
      catch (e) { sendJson(res, 500, { error: String(e) }); }
    });
    return;
  }
  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("  CanvasV Web Test Lab");
  console.log(`  http://127.0.0.1:${PORT}/`);
  console.log("  (Ctrl+C or close this window to stop)");
  console.log("");
  if (OPEN) {
    exec(`start http://127.0.0.1:${PORT}/`, (err) => { if (err) console.log("Could not auto-open the browser; open the URL above manually."); });
  }
});

// ------------------------------------------------------------- page
const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CanvasV Web Test Lab</title>
<style>
  :root { --bg:#0d1117; --card:#161b22; --line:#30363d; --txt:#e6edf3; --dim:#8b949e; --good:#3fb950; --bad:#f85149; --acc:#58a6ff; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:"Segoe UI",system-ui,Arial,sans-serif; background:var(--bg); color:var(--txt); }
  header { padding:18px 28px; border-bottom:1px solid var(--line); display:flex; align-items:baseline; gap:16px; }
  header h1 { font-size:20px; margin:0; }
  header .tag { color:var(--dim); font-size:13px; }
  main { max-width:1100px; margin:0 auto; padding:22px 28px 60px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px 18px; margin-bottom:18px; }
  .card h2 { margin:0 0 12px; font-size:15px; color:var(--acc); font-weight:600; }
  .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  button { background:#21262d; color:var(--txt); border:1px solid var(--line); border-radius:8px; padding:8px 14px; font-size:14px; cursor:pointer; }
  button:hover { border-color:var(--acc); }
  button.primary { background:#1f6feb; border-color:#1f6feb; }
  button.active { border-color:var(--acc); color:var(--acc); }
  button:disabled { opacity:.5; cursor:wait; }
  .sym { min-width:86px; }
  .dim { color:var(--dim); font-size:13px; }
  table { border-collapse:collapse; width:100%; font-size:13px; margin-top:6px; }
  th,td { text-align:right; padding:6px 10px; border-bottom:1px solid var(--line); white-space:nowrap; }
  th:first-child,td:first-child { text-align:left; }
  th { color:var(--dim); font-weight:600; font-size:12px; text-transform:uppercase; }
  td.num { font-family:Consolas,monospace; font-size:12.5px; }
  .pos { color:var(--good); } .neg { color:var(--bad); }
  .win-label { font-weight:600; color:var(--txt); }
  .meta { display:flex; justify-content:space-between; color:var(--dim); font-size:13px; margin-top:8px; }
  .hist { list-style:none; margin:0; padding:0; }
  .hist li { padding:7px 0; border-bottom:1px dashed var(--line); font-size:13px; }
  .hist .t { color:var(--dim); font-family:Consolas,monospace; font-size:11.5px; margin-right:8px; }
  .err { color:var(--bad); }
</style>
</head>
<body>
<header>
  <h1>CanvasV Web Test Lab</h1>
  <span class="tag">local backtest dashboard &middot; M15 data &middot; runs the same engine as the CLI</span>
</header>
<main>
  <div class="card">
    <h2>1 &middot; Market</h2>
    <div class="row" id="symbols"></div>
    <div class="meta" id="meta"></div>
  </div>
  <div class="card">
    <h2>2 &middot; Test</h2>
    <div class="row">
      <button id="btnBaseline" class="primary">Run baseline (all windows)</button>
      <button id="btnAB">A/B &middot; stop 1.5 vs 1.0</button>
      <button id="btnSweep">Stop sweep &middot; all 3 symbols</button>
    </div>
    <div class="dim" style="margin-top:10px">Current symbol: <b id="curSym">BTCUSDT</b> &middot; Baseline = production defaults (36t / +6.43R on BTC). A/B shows full + both 90/90 halves with a &Delta; column. Sweep compares stop widths 1.0 / 1.25 / 1.5 on the full window of every symbol.</div>
  </div>
  <div class="card">
    <h2>Results</h2>
    <div id="results"><div class="dim">Pick a test above &mdash; it runs in a second or two.</div></div>
  </div>
  <div class="card">
    <h2>History</h2>
    <ul class="hist" id="hist"></ul>
  </div>
</main>
<script>
"use strict";
var SYM = "BTCUSDT";
var meta = null;

function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function clsNum(v) { return v > 0 ? "pos" : (v < 0 ? "neg" : ""); }
function addCls(el, v) { var c = clsNum(v); if (c) el.classList.add(c); }

function fmtNum(v, d) { d = d || 2; if (typeof v !== "number" || !isFinite(v)) return "n/a"; var s = v >= 0 ? "+" + v.toFixed(d) : v.toFixed(d); return s; }
function fmtVal(v, d) { d = d || 2; if (typeof v !== "number" || !isFinite(v)) return "n/a"; return v.toFixed(d); }

function loadMeta() {
  fetch("/api/meta").then(function (r) { return r.json(); }).then(function (m) {
    meta = m.symbols;
    var box = document.getElementById("symbols");
    box.innerHTML = "";
    m.symbols.forEach(function (s) {
      var b = h("button", "sym", s.symbol);
      b.addEventListener("click", function () { SYM = s.symbol; document.getElementById("curSym").textContent = s.symbol; document.querySelectorAll("#symbols button").forEach(function (x) { x.classList.remove("active"); }); b.classList.add("active"); });
      box.appendChild(b);
    });
    var first = document.querySelector("#symbols button"); if (first) first.classList.add("active");
    var ranges = m.symbols.map(function (s) { return s.symbol + ": " + s.candles.toLocaleString() + " bars, " + s.from + " &rarr; " + s.to; }).join(" &middot; ");
    document.getElementById("meta").innerHTML = ranges;
  });
}

function addHist(line, cls) {
  var ul = document.getElementById("hist");
  var li = document.createElement("li");
  var t = h("span", "t", new Date().toLocaleTimeString());
  li.appendChild(t);
  var txt = line.replace(/&Delta;/g, "Δ").replace(/&middot;/g, "·").replace(/&mdash;/g, "—");
  if (cls) li.appendChild(h("span", cls, txt)); else li.appendChild(document.createTextNode(txt));
  ul.insertBefore(li, ul.firstChild);
  while (ul.children.length > 30) ul.removeChild(ul.lastChild);
}

function apiRun(payload) {
  return fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(function (r) { return r.json(); });
}

function tableFor(title, rows) {
  // rows: [{label, m, base}] — Δ columns shown only when there is a real comparison.
  var hasDelta = rows.length > 1;
  var wrap = h("div", "");
  var th3 = h("h3", "win-label");
  th3.innerHTML = title;
  wrap.appendChild(th3);
  var t = document.createElement("table");
  var thead = document.createElement("thead");
  var tr = document.createElement("tr");
  var headers = ["Variant", "Trades", "Win %", "PF", "Net R", "Avg R", "DD R", "LONG", "SHORT", "SL", "TP"];
  if (hasDelta) headers = headers.concat(["Δ NetR", "Δ trades"]);
  headers.forEach(function (c) { tr.appendChild(h("th", "", c)); });
  thead.appendChild(tr); t.appendChild(thead);
  var tb = document.createElement("tbody");
  rows.forEach(function (r) {
    var m = r.m;
    var tr2 = document.createElement("tr");
    tr2.appendChild(h("td", "", r.label));
    tr2.appendChild(h("td", "num", String(m.trades)));
    var wr = h("td", "num", fmtVal(m.winRate, 1) + "%"); addCls(wr, m.winRate - 50); tr2.appendChild(wr);
    tr2.appendChild(h("td", "num", fmtVal(m.pf, 2)));
    var nr = h("td", "num", fmtNum(m.netR)); addCls(nr, m.netR); tr2.appendChild(nr);
    tr2.appendChild(h("td", "num", fmtNum(m.avgR, 3)));
    tr2.appendChild(h("td", "num", fmtVal(m.ddR, 2)));
    tr2.appendChild(h("td", "num", m.longN + " / " + fmtNum(m.longR)));
    tr2.appendChild(h("td", "num", m.shortN + " / " + fmtNum(m.shortR)));
    tr2.appendChild(h("td", "num", String(m.slN)));
    tr2.appendChild(h("td", "num", String(m.tpN)));
    if (hasDelta) {
      var dR = h("td", "num", fmtNum(r.m.netR - r.base.netR)); addCls(dR, r.m.netR - r.base.netR);
      var dT = h("td", "num", (r.m.trades - r.base.trades >= 0 ? "+" : "") + (r.m.trades - r.base.trades)); addCls(dT, r.m.trades - r.base.trades);
      tr2.appendChild(dR); tr2.appendChild(dT);
    }
    tb.appendChild(tr2);
  });
  t.appendChild(tb); wrap.appendChild(t);
  return wrap;
}

function renderBaseline(res) {
  var box = document.getElementById("results");
  box.innerHTML = "";
  ["full","first-90","second-90"].forEach(function (win) {
    if (!res.windows[win]) return;
    var w = res.windows[win];
    var label = win === "full" ? "Full window" : (win === "first-90" ? "First 90 days" : "Second 90 days");
    var base = w["Baseline"];
    box.appendChild(tableFor(label + " &mdash; production defaults", [{ label: "Baseline", m: base, base: base }]));
  });
}

function renderAB(res) {
  var box = document.getElementById("results");
  box.innerHTML = "";
  ["full","first-90","second-90"].forEach(function (win) {
    if (!res.windows[win]) return;
    var w = res.windows[win];
    var base = w["Stop 1.5 (default)"] || w["Baseline"];
    var label = win === "full" ? "Full window" : (win === "first-90" ? "First 90 days" : "Second 90 days");
    var rows = Object.keys(w).map(function (k) { return { label: k, m: w[k], base: base }; });
    box.appendChild(tableFor(label, rows));
  });
  var full = res.windows.full;
  var a = full["Stop 1.0"], b = full["Stop 1.5 (default)"] || full["Baseline"];
  if (a && b)    addHist(SYM + " A/B stop: 1.0 = " + fmtNum(a.netR) + "R (" + a.trades + "t) vs 1.5 = " + fmtNum(b.netR) + "R (" + b.trades + "t)");
}

function renderSweep(res) {
  var box = document.getElementById("results");
  box.innerHTML = "";
  var t = document.createElement("table");
  var thead = document.createElement("thead");
  var tr = document.createElement("tr");
  ["Symbol","Stop","Trades","Win %","PF","Net R","Avg R","DD R"].forEach(function (c) { tr.appendChild(h("th", "", c)); });
  thead.appendChild(tr); t.appendChild(thead);
  var tb = document.createElement("tbody");
  Object.keys(res.windows.full).forEach(function (sym) {
    var w = res.windows.full[sym];
    var base = w["1.5 (current default)"];
    Object.keys(w).forEach(function (k) {
      var m = w[k];
      var tr2 = document.createElement("tr");
      tr2.appendChild(h("td", "", sym));
      tr2.appendChild(h("td", "", k));
      tr2.appendChild(h("td", "num", String(m.trades)));
      var wr = h("td", "num", fmtVal(m.winRate, 1) + "%"); addCls(wr, m.winRate - 50); tr2.appendChild(wr);
      tr2.appendChild(h("td", "num", fmtVal(m.pf, 2)));
      var nr = h("td", "num", fmtNum(m.netR)); addCls(nr, m.netR); tr2.appendChild(nr);
      tr2.appendChild(h("td", "num", fmtNum(m.avgR, 3)));
      tr2.appendChild(h("td", "num", fmtVal(m.ddR, 2)));
      tb.appendChild(tr2);
    });
  });
  t.appendChild(tb);
  box.appendChild(t);
}

function runWith(btn, fn) {
  var results = document.getElementById("results");
  results.innerHTML = "";
  results.appendChild(h("div", "dim", "Running on " + SYM + " &mdash; this takes a couple of seconds&hellip;"));
  btn.disabled = true;
  fn().then(function (res) {
    if (res.error) { results.innerHTML = ""; results.appendChild(h("div", "err", "Error: " + res.error)); }
  }).catch(function (e) {
    results.innerHTML = "";
    results.appendChild(h("div", "err", "Request failed: " + e));
  }).finally(function () { btn.disabled = false; });
}

document.getElementById("btnBaseline").addEventListener("click", function () {
  var b = this;
  runWith(b, function () {
    return apiRun({ symbol: SYM, variants: [{ label: "Baseline", overrides: {} }], windows: ["full", "first-90", "second-90"] }).then(function (res) {
      if (res.error) return res;
      renderBaseline(res);
      var f = res.windows.full["Baseline"];
      addHist(SYM + " baseline: " + f.trades + "t / " + fmtNum(f.netR) + "R (" + fmtNum(f.winRate, 1) + "% win)");
      return res;
    });
  });
});

document.getElementById("btnAB").addEventListener("click", function () {
  var b = this;
  runWith(b, function () {
    return apiRun({ symbol: SYM, variants: [{ label: "Stop 1.5 (default)", overrides: { atrStopMult: 1.5 } }, { label: "Stop 1.0", overrides: { atrStopMult: 1.0 } }], windows: ["full", "first-90", "second-90"] }).then(function (res) {
      if (res.error) return res;
      renderAB(res);
      return res;
    });
  });
});

document.getElementById("btnSweep").addEventListener("click", function () {
  var b = this;
  runWith(b, function () {
    var variants = [{ label: "1.5 (current default)", overrides: { atrStopMult: 1.5 } }, { label: "1.25", overrides: { atrStopMult: 1.25 } }, { label: "1.0", overrides: { atrStopMult: 1.0 } }];
    var symbols = (meta || []).map(function (s) { return s.symbol; });
    return Promise.all(symbols.map(function (s) {
      return apiRun({ symbol: s, variants: variants, windows: ["full"] });
    })).then(function (ress) {
      var out = { windows: { full: {} } };
      ress.forEach(function (r) { out.windows.full[r.symbol] = r.windows.full; });
      renderSweep(out);
      var notes = ress.map(function (r) {
        var f = r.windows.full, cur = f["1.5 (current default)"], v10 = f["1.0"];
        return r.symbol + " 1.0 Δ " + fmtNum(v10.netR - cur.netR) + "R";
      }).join(" · ");
      addHist("Stop sweep: " + notes);
      return out;
    });
  });
});

loadMeta();
addHist("Ready. Pick a market, then a test.");
</script>
</body>
</html>`;
