# Preview run doc — CanvasV Web Test Lab

## Reproduce artifacts

No build step, no dependencies, no `.env` files. Everything is committed in git:

- `backtest/engine/data/{BTC,ETH,SOL}USDT-15m.json` — M15 candle data (tracked in git; a fresh checkout already has it).
- If the data ever needs refreshing: `node backtest/fetch-data.mjs --symbol BTCUSDT --interval 15m --days 180` (writes into `backtest/engine/data/`; other symbols likewise).

## Run the server

The app is a zero-dependency Node server (`backtest/web-test.mjs`). There is no `package.json` / npm script — run it directly with `node.exe`:

```powershell
# from the repo root
node backtest/web-test.mjs            # http://127.0.0.1:8090
node backtest/web-test.mjs 9000       # custom port
```

Detached start (Windows), stdout and stderr to different files:

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'node.exe' -ArgumentList 'backtest/web-test.mjs' -WorkingDirectory 'J:\MyIndicator' -RedirectStandardOutput 'J:\MyIndicator\.freebuff\preview-ade9a172-c202-4248-a2ca-0035bc073d27.log' -RedirectStandardError 'J:\MyIndicator\.freebuff\preview-ade9a172-c202-4248-a2ca-0035bc073d27.log.err' -WindowStyle Hidden -PassThru).Id"
```

Health check: `curl http://127.0.0.1:8090/api/meta` returns the symbol list; `GET /` returns the dashboard page.

## API (same engine as the CLI tools)

- `GET /api/meta` — symbols, candle counts, date ranges
- `GET /api/params` — engine input defaults + runtime types (drives the custom-parameters form)
- `POST /api/run` — `{ symbol, variants: [{label, overrides}], windows: [] }` → metrics per window per variant

Stop: close the window / `Stop-Process -Id <pid>`.