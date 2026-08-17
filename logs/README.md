# CanvasV MTF Signal — collected logs

This folder holds the machine-readable diagnostic lines copied out of
TradingView alerts. The file is `cvlog.txt`, one line per event, appended
by `scripts\append-clipboard-to-log.bat`.

Each line is prefixed with the local time it was collected:

```
2026-08-17 12:04:11  CVLOG|BTCUSD|15|BUY|SIGNAL|100|OK|ADX=27.40|ATR=185.00|RISK=1.42A|RR=1.00/2.50|E=62839|SL=62580|TP1=63100|TP2=63485|T=08-15 09:00
2026-08-17 14:30:02  CVOUT|BTCUSD|15|BUY|SL FIRST|6b 90m|MFE=+0.31R|MAE=-1.00R|R=-1.00|H4=BULLISH|H1=BEARISH|ALIGN=BROKEN|E=62839|SL=62580|TP1=63100|TP2=63485|T=08-15 09:00
```

## CVLOG (signal/candidate time — fires on confirmed crossover bars)

```
CVLOG|<symbol>|<tf>|<BUY|SELL>|<SIGNAL|REJECTED>|<score>|<reason|OK>|<fields>|<T=signal bar time>
```

Fields: `ADX=`, `ATR=`, `RISK=<risk in ATR>A`, `RR=<TP1 R>/<TP2 R>`,
`E=<entry>`, `SL=`, `TP1=`, `TP2=`.

- `REJECTED` lines carry the first failed gate as the reason
  (`4H REGIME`, `4H SLOPE`, `1H MOMENTUM`, `ADX`, `CHASING`, ...).
  Their distribution is summarized by the on-chart DIAGNOSTIC STATS
  table — you do NOT need to copy every REJECTED line.
- Copy `SIGNAL` lines only, unless you specifically want the
  rejection-reason distribution (then copy a sample).

## CVOUT (resolution time — fires once when a tracked signal resolves)

```
CVOUT|<symbol>|<tf>|<dir>|<OUTCOME>|<N>b <M>m|MFE=+|MAE=-|R=<final R>|H4=<at exit>|H1=<at exit>|ALIGN=<INTACT|BROKEN>|E=|SL=|TP1=|TP2=|T=<signal bar time>
```

Outcomes: `SL FIRST` · `TP1 FIRST` · `TP2 FIRST` · `AMBIGUOUS` ·
`EXPIRED` · `SUPERSEDED`.

`T=` lets you join each CVOUT back to its CVLOG (same signal bar time).

## Usage

1. TradingView: enable **Signal Decision Logger** + **Enable diagnostic
   CVLOG alerts** (Diagnostics group).
2. Create an alert with condition **"Any alert() function call"** and
   delivery to email/webhook (or watch the Alert Log).
3. Copy each `CVLOG|`/`CVOUT|` line into `scripts\append-clipboard-to-log.bat`.
4. When you have ~20 resolved signals, send `logs\cvlog.txt` over for
   the winner/loser analysis.

## Limitations

- Pine cannot write files — this is copy-paste export, not automatic.
- The logger runs on historical bars too, so you can scroll back and
  re-capture past signals/resolutions the same way.
- Alert delivery latency means lines arrive at bar close; the `T=` field
  (bar time) is authoritative for ordering.
