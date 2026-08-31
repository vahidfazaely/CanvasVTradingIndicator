// CanvasV V4 FAST — HTML Chart Viewer Generator
// Generates a self-contained HTML file with candlestick chart, signals, and trade details.
import fs from "node:fs";

export function generateViewer(data, outputPath) {
  const { signals, trades, candles, report } = data;

  // Downsample candles for rendering (max ~2000 for performance)
  const maxCandles = 2000;
  const step = Math.max(1, Math.floor(candles.length / maxCandles));
  const displayCandles = candles.filter((_, i) => i % step === 0);

  // Build trade markers
  const markers = trades.map(t => ({
    entryBar: t.entryBar,
    exitBar: t.exitBar,
    direction: t.direction,
    entry: t.entry,
    sl: t.sl,
    tp1: t.tp1,
    tp2: t.tp2,
    exitPrice: t.exitPrice,
    exitReason: t.exitReason,
    finalR: t.finalR,
    mfe: t.mfe,
    mae: t.mae,
    age: t.age,
    trigger: t.trigger,
    extAtr: t.extAtr,
    bodyPct: t.bodyPct,
    atr: t.atr,
    time: t.entryTime,
    slFailure: t.slFailure,
  }));

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>CanvasV V4 FAST — Backtest Viewer</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; }
.header { background: #16213e; padding: 16px 24px; border-bottom: 1px solid #333; }
.header h1 { font-size: 18px; color: #fff; }
.header .stats { display: flex; gap: 24px; margin-top: 8px; font-size: 13px; }
.header .stat { color: #aaa; }
.header .stat span { color: #fff; font-weight: 600; }
.container { display: flex; height: calc(100vh - 120px); }
.chart-area { flex: 1; position: relative; overflow: hidden; }
.sidebar { width: 320px; background: #16213e; border-left: 1px solid #333; overflow-y: auto; padding: 16px; }
canvas { display: block; }
.trade-list { max-height: 300px; overflow-y: auto; margin-top: 12px; }
.trade-item { padding: 8px; margin: 4px 0; border-radius: 4px; cursor: pointer; font-size: 12px; border: 1px solid #333; }
.trade-item:hover { background: #1e3a5f; }
.trade-item.selected { background: #1e3a5f; border-color: #4a9eff; }
.trade-item .dir { font-weight: 700; }
.trade-item .dir.buy { color: #4ade80; }
.trade-item .dir.sell { color: #f87171; }
.trade-item .result { float: right; }
.trade-item .result.win { color: #4ade80; }
.trade-item .result.loss { color: #f87171; }
.trade-detail { background: #0f172a; border-radius: 6px; padding: 12px; margin-top: 12px; font-size: 12px; line-height: 1.6; }
.trade-detail h3 { color: #fff; margin-bottom: 8px; font-size: 14px; }
.trade-detail .row { display: flex; justify-content: space-between; }
.trade-detail .label { color: #888; }
.trade-detail .value { color: #fff; }
.trade-detail .value.pos { color: #4ade80; }
.trade-detail .value.neg { color: #f87171; }
.controls { padding: 12px; background: #0f172a; border-bottom: 1px solid #333; display: flex; gap: 8px; align-items: center; }
.controls button { background: #1e3a5f; color: #fff; border: 1px solid #333; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.controls button:hover { background: #2a4a6f; }
.controls button.active { background: #4a9eff; border-color: #4a9eff; }
</style>
</head>
<body>
<div class="header">
  <h1>CanvasV V4 FAST — Backtest Viewer</h1>
  <div class="stats">
    <div class="stat">Signals: <span>${report.totalSignals}</span></div>
    <div class="stat">Trades: <span>${report.totalTrades}</span></div>
    <div class="stat">Win Rate: <span>${report.winRate.toFixed(1)}%</span></div>
    <div class="stat">Net R: <span style="color:${report.totalR >= 0 ? '#4ade80' : '#f87171'}">${report.totalR >= 0 ? '+' : ''}${report.totalR.toFixed(2)}</span></div>
    <div class="stat">Avg R: <span style="color:${report.avgR >= 0 ? '#4ade80' : '#f87171'}">${report.avgR >= 0 ? '+' : ''}${report.avgR.toFixed(3)}</span></div>
    <div class="stat">SL Hits: <span>${report.slHitPct.toFixed(1)}%</span></div>
  </div>
</div>
<div class="controls">
  <button id="btnAll" class="active" onclick="filterTrades('all')">All</button>
  <button id="btnWin" onclick="filterTrades('win')">Winners</button>
  <button id="btnLoss" onclick="filterTrades('loss')">Losers</button>
  <button id="btnSL" onclick="filterTrades('sl')">SL Hits</button>
  <button id="btnTP" onclick="filterTrades('tp')">TP Hits</button>
  <span style="color:#666; margin-left:12px;">Click trade in sidebar to inspect. Scroll chart with mouse wheel.</span>
</div>
<div class="container">
  <div class="chart-area">
    <canvas id="chart"></canvas>
  </div>
  <div class="sidebar">
    <div style="font-size:13px; color:#888;">Trades (${trades.length})</div>
    <div class="trade-list" id="tradeList"></div>
    <div class="trade-detail" id="tradeDetail" style="display:none;"></div>
  </div>
</div>
<script>
const candles = ${JSON.stringify(displayCandles)};
const markers = ${JSON.stringify(markers)};
const step = ${step};
let selectedTrade = null;
let filter = 'all';

function filterTrades(f) {
  filter = f;
  document.querySelectorAll('.controls button').forEach(b => b.classList.remove('active'));
  document.getElementById('btn' + f.charAt(0).toUpperCase() + f.slice(1)).classList.add('active');
  renderTradeList();
}

function getFilteredTrades() {
  return markers.filter(t => {
    if (filter === 'win') return t.finalR > 0;
    if (filter === 'loss') return t.finalR < 0;
    if (filter === 'sl') return t.exitReason === 'SL FIRST';
    if (filter === 'tp') return t.exitReason.includes('TP');
    return true;
  });
}

function renderTradeList() {
  const list = document.getElementById('tradeList');
  const filtered = getFilteredTrades();
  list.innerHTML = filtered.map((t, i) => {
    const isWin = t.finalR > 0;
    const time = new Date(t.time).toLocaleDateString();
    return '<div class="trade-item' + (selectedTrade === t ? ' selected' : '') + '" onclick="selectTrade(' + markers.indexOf(t) + ')">' +
      '<span class="dir ' + (t.direction === 'BUY' || t.direction === 'LONG' ? 'buy' : 'sell') + '">' + t.direction + '</span> ' +
      '<span style="color:#888">' + time + '</span> ' +
      '<span class="result ' + (isWin ? 'win' : 'loss') + '">' + (t.finalR >= 0 ? '+' : '') + t.finalR.toFixed(2) + 'R</span>' +
      '</div>';
  }).join('');
}

function selectTrade(idx) {
  selectedTrade = markers[idx];
  renderTradeList();
  renderDetail();
  drawChart();
}

function renderDetail() {
  const d = document.getElementById('tradeDetail');
  if (!selectedTrade) { d.style.display = 'none'; return; }
  d.style.display = 'block';
  const t = selectedTrade;
  const rClass = v => v >= 0 ? 'pos' : 'neg';
  d.innerHTML = '<h3>' + t.direction + ' — ' + t.exitReason + '</h3>' +
    '<div class="row"><span class="label">Entry</span><span class="value">' + t.entry.toFixed(2) + '</span></div>' +
    '<div class="row"><span class="label">SL</span><span class="value neg">' + t.sl.toFixed(2) + '</span></div>' +
    '<div class="row"><span class="label">TP1</span><span class="value pos">' + t.tp1.toFixed(2) + '</span></div>' +
    '<div class="row"><span class="label">TP2</span><span class="value pos">' + t.tp2.toFixed(2) + '</span></div>' +
    '<div class="row"><span class="label">Exit</span><span class="value">' + t.exitPrice.toFixed(2) + '</span></div>' +
    '<div class="row"><span class="label">R Result</span><span class="value ' + rClass(t.finalR) + '">' + (t.finalR >= 0 ? '+' : '') + t.finalR.toFixed(3) + 'R</span></div>' +
    '<div class="row"><span class="label">MFE</span><span class="value pos">+' + t.mfe.toFixed(3) + 'R</span></div>' +
    '<div class="row"><span class="label">MAE</span><span class="value neg">-' + t.mae.toFixed(3) + 'R</span></div>' +
    '<div class="row"><span class="label">Age</span><span class="value">' + t.age + ' bars</span></div>' +
    '<div class="row"><span class="label">Trigger</span><span class="value">' + t.trigger + '</span></div>' +
    '<div class="row"><span class="label">Ext ATR</span><span class="value">' + t.extAtr.toFixed(3) + '</span></div>' +
    '<div class="row"><span class="label">ATR</span><span class="value">' + t.atr.toFixed(2) + '</span></div>' +
    (t.slFailure ? '<div style="margin-top:8px; padding-top:8px; border-top:1px solid #333;">' +
      '<div class="row"><span class="label">Post-SL MFE</span><span class="value pos">+' + t.slFailure.postMFE.toFixed(3) + 'R</span></div>' +
      '<div class="row"><span class="label">Classification</span><span class="value">' + t.slFailure.classification + '</span></div>' +
      '</div>' : '');
}

const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
let offset = 0;

function drawChart() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  const W = canvas.width, H = canvas.height;

  // Find visible range
  const visibleCount = Math.floor(W / 6);
  const startIdx = Math.max(0, Math.min(candles.length - visibleCount, candles.length - visibleCount + offset));
  const endIdx = startIdx + visibleCount;
  const visible = candles.slice(startIdx, endIdx);

  if (visible.length === 0) return;

  // Price range
  let minP = Infinity, maxP = -Infinity;
  for (const c of visible) {
    if (c.low < minP) minP = c.low;
    if (c.high > maxP) maxP = c.high;
  }
  const padding = (maxP - minP) * 0.1;
  minP -= padding; maxP += padding;

  const toY = p => H - (p - minP) / (maxP - minP) * H;
  const barW = W / visible.length;

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const y = H * i / 4;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Candles
  for (let i = 0; i < visible.length; i++) {
    const c = visible[i];
    const x = i * barW + barW / 2;
    const isUp = c.close >= c.open;
    ctx.fillStyle = isUp ? '#4ade80' : '#f87171';
    ctx.fillRect(x - barW * 0.3, toY(Math.max(c.open, c.close)), barW * 0.6, Math.max(1, Math.abs(toY(c.open) - toY(c.close))));
    ctx.strokeStyle = isUp ? '#4ade80' : '#f87171';
    ctx.beginPath(); ctx.moveTo(x, toY(c.high)); ctx.lineTo(x, toY(c.low)); ctx.stroke();
  }

  // Trade markers
  const filtered = getFilteredTrades();
  for (const t of filtered) {
    const entryIdx = Math.floor(t.entryBar / step) - startIdx;
    const exitIdx = Math.floor(t.exitBar / step) - startIdx;
    if (entryIdx < 0 || entryIdx >= visible.length) continue;

    const x1 = entryIdx * barW + barW / 2;
    const y1 = toY(t.entry);

    // Entry marker
    const isBuy = t.direction === 'BUY' || t.direction === 'LONG';
    ctx.fillStyle = isBuy ? '#4ade80' : '#f87171';
    ctx.beginPath();
    if (isBuy) {
      ctx.moveTo(x1, y1 + 8); ctx.lineTo(x1 - 5, y1 + 16); ctx.lineTo(x1 + 5, y1 + 16);
    } else {
      ctx.moveTo(x1, y1 - 8); ctx.lineTo(x1 - 5, y1 - 16); ctx.lineTo(x1 + 5, y1 - 16);
    }
    ctx.fill();

    // SL line
    ctx.strokeStyle = '#f8717180';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x1, toY(t.sl)); ctx.lineTo(x1 + 60, toY(t.sl)); ctx.stroke();
    ctx.setLineDash([]);

    // TP line
    ctx.strokeStyle = '#4ade8080';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x1, toY(t.tp1)); ctx.lineTo(x1 + 60, toY(t.tp1)); ctx.stroke();
    ctx.setLineDash([]);

    // Exit marker (if visible)
    if (exitIdx >= 0 && exitIdx < visible.length) {
      const x2 = exitIdx * barW + barW / 2;
      ctx.fillStyle = t.finalR >= 0 ? '#4ade80' : '#f87171';
      ctx.beginPath();
      ctx.arc(x2, toY(t.exitPrice), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Selected trade highlight
  if (selectedTrade) {
    const ei = Math.floor(selectedTrade.entryBar / step) - startIdx;
    if (ei >= 0 && ei < visible.length) {
      const x = ei * barW + barW / 2;
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();

      // SL/TP lines for selected
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, toY(selectedTrade.sl)); ctx.lineTo(W, toY(selectedTrade.sl)); ctx.stroke();
      ctx.strokeStyle = '#4ade80';
      ctx.beginPath(); ctx.moveTo(0, toY(selectedTrade.tp1)); ctx.lineTo(W, toY(selectedTrade.tp1)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, toY(selectedTrade.tp2)); ctx.lineTo(W, toY(selectedTrade.tp2)); ctx.stroke();
    }
  }

  // Price axis
  ctx.fillStyle = '#888';
  ctx.font = '11px monospace';
  for (let i = 0; i <= 4; i++) {
    const p = minP + (maxP - minP) * i / 4;
    ctx.fillText(p.toFixed(2), W - 70, toY(p) - 4);
  }
}

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  offset = Math.max(0, Math.min(candles.length - Math.floor(canvas.width / 6), offset + Math.sign(e.deltaY) * 5));
  drawChart();
});

renderTradeList();
drawChart();
window.addEventListener('resize', drawChart);
</script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
}
