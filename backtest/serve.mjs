#!/usr/bin/env node
// Simple HTTP server for the chart viewer
// Usage: node backtest/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = parseInt(process.argv[2] || '8080');
const BASE = path.join(import.meta.dirname, 'engine', 'output');

const MIME = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/chart-viewer.html';
  
  const filePath = path.join(BASE, url);
  const ext = path.extname(filePath);
  
  // Also try serving from backtest root
  let fullPath = filePath;
  if (!fs.existsSync(fullPath)) {
    fullPath = path.join(path.dirname(BASE), url);
  }
  
  if (!fs.existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + url);
    return;
  }
  
  const content = fs.readFileSync(fullPath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(content);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  CanvasV V4 FAST — Chart Viewer\n`);
  console.log(`  Open in your browser:\n`);
  console.log(`    http://127.0.0.1:${PORT}/\n`);
  console.log(`  Files served from: ${BASE}`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
