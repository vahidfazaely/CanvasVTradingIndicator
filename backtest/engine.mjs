// CanvasV V4 FAST — Local Signal Engine
// Faithfully reproduces the TradingView Pine Script v4.1.0 logic.
// Single-timeframe only (no MTF/security calls in production).

import fs from "node:fs";
import path from "node:path";

// ─── Default parameters (match Pine inputs exactly) ───────────────
export const DEFAULT_PARAMS = {
  // Regime
  regimeBars: 10,
  regimeMinSlope: 0.05,
  atrRegimeLen: 100,
  highVolPct: 130.0,
  atrPeriod: 14,

  // Direction / momentum
  emaTrigLen: 9,
  emaDirLen: 21,
  emaSlowLen: 50,
  momSlopeBars: 3,

  // Triggers
  enablePullback: true,
  enableBreakout: true,
  pullbackLookback: 5,
  pullbackTolPct: 0.5,
  breakoutBars: 10,
  maxExtAtr: 2.5,
  minBodyPct: 0.0,

  // Risk
  swingLookback: 10,
  structBufferAtr: 0.5,
  minRiskAtr: 0.5,
  maxRiskAtr: 2.5,
  tp1R: 1.0,
  tp2R: 2.5,
  atrFallbackMult: 1.5,

  // Position
  outcomeBars: 20,
};

// ─── Indicator calculations (match Pine ta.* exactly) ──────────────

// EMA: Pine's ta.ema uses multiplier = 2 / (period + 1)
// First value is SMA of the first `period` bars
export function calcEMA(data, period) {
  const ema = new Float64Array(data.length);
  const mult = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i < period - 1) {
      ema[i] = NaN;
    } else if (i === period - 1) {
      ema[i] = sum / period;
    } else {
      ema[i] = (data[i] - ema[i - 1]) * mult + ema[i - 1];
    }
  }
  return ema;
}

// SMA
export function calcSMA(data, period) {
  const sma = new Float64Array(data.length);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    sma[i] = i >= period - 1 ? sum / period : NaN;
  }
  return sma;
}

// ATR (Wilder's RMA — matches Pine's ta.atr)
// tr = max(high-low, abs(high-prevClose), abs(low-prevClose))
// atr = rma(tr, period)
export function calcATR(candles, period) {
  const len = candles.length;
  const tr = new Float64Array(len);
  const atr = new Float64Array(len);

  for (let i = 0; i < len; i++) {
    const c = candles[i];
    if (i === 0) {
      tr[i] = c.high - c.low;
    } else {
      const pc = candles[i - 1].close;
      tr[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    }
  }

  // RMA (Wilder's smoothing)
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += tr[i];
    if (i < period - 1) {
      atr[i] = NaN;
    } else if (i === period - 1) {
      atr[i] = sum / period;
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }
  }
  return atr;
}

// Rolling min/max (ta.lowest / ta.highest) — value at bar [i] is the min/max
// of bars [i-period+1 .. i]. Pine's [1] shift means we use the PREVIOUS bar's value.
export function rollingLow(data, period) {
  const result = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result[i] = NaN;
    } else {
      let min = data[i];
      for (let j = i - period + 1; j <= i; j++) {
        if (data[j] < min) min = data[j];
      }
      result[i] = min;
    }
  }
  return result;
}

export function rollingHigh(data, period) {
  const result = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result[i] = NaN;
    } else {
      let max = data[i];
      for (let j = i - period + 1; j <= i; j++) {
        if (data[j] > max) max = data[j];
      }
      result[i] = max;
    }
  }
  return result;
}

// ─── Signal engine ────────────────────────────────────────────────

export function runEngine(candles, params = DEFAULT_PARAMS) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const len = candles.length;

  // Extract arrays
  const opens = candles.map(c => c.open);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  // Calculate indicators
  const emaTrig = calcEMA(closes, p.emaTrigLen);
  const emaDir = calcEMA(closes, p.emaDirLen);
  const emaSlow = calcEMA(closes, p.emaSlowLen);
  const atr = calcATR(candles, p.atrPeriod);
  const atrAvg = calcSMA(atr, p.atrRegimeLen);

  // Pre-compute rolling extremes (need [1] shift = previous bar's value)
  const swingLow = rollingLow(lows, p.swingLookback);
  const swingHigh = rollingHigh(highs, p.swingLookback);
  const lowestLowPB = rollingLow(lows, p.pullbackLookback);
  const highestHighPB = rollingHigh(highs, p.pullbackLookback);
  const highestHighBO = rollingHigh(highs, p.breakoutBars);
  const lowestLowBO = rollingLow(lows, p.breakoutBars);

  const signals = [];
  const trades = [];

  // Position state
  let posState = 0; // 1=LONG, -1=SHORT, 0=FLAT
  let posEntry = 0, posSL = 0, posTP1 = 0, posTP2 = 0;
  let posRisk = 0, posRiskAtr = 0;
  let posBar = -1, posAge = 0;
  let posMFE = 0, posMAE = 0;
  let posDir = "";
  let posExtAtr = 0, posBodyPct = 0, posEma21 = 0, posAtrVal = 0;
  let posStructSL = 0, posRR1 = 0, posRR2 = 0;
  let posTrigger = "";

  for (let i = 0; i < len; i++) {
    const c = candles[i];
    const barIdx = i;

    // Skip warmup period
    const warmup = Math.max(p.emaSlowLen, p.atrRegimeLen, p.swingLookback) + 5;
    if (i < warmup) continue;

    // ─── Regime ───
    const atrVal = atr[i];
    if (isNaN(atrVal) || atrVal <= 0) continue;

    const atrVsAvg = atrVal / Math.max(atrAvg[i], 1e-10) * 100;
    const regimeSlope = (emaSlow[i] - emaSlow[i - p.regimeBars]) / Math.max(atrVal * p.regimeBars, 1e-10);
    const trending = Math.abs(regimeSlope) >= p.regimeMinSlope;
    const highVol = atrVsAvg >= p.highVolPct;

    const trendUp = trending && emaDir[i] > emaSlow[i] && emaSlow[i] > emaSlow[i - p.regimeBars];
    const trendDn = trending && emaDir[i] < emaSlow[i] && emaSlow[i] < emaSlow[i - p.regimeBars];

    // ─── Direction + momentum ───
    const momUp = emaTrig[i] > emaTrig[i - p.momSlopeBars] && c.close >= emaDir[i];
    const momDn = emaTrig[i] < emaTrig[i - p.momSlopeBars] && c.close <= emaDir[i];

    const setupUp = trendUp && momUp;
    const setupDn = trendDn && momDn;

    // ─── Triggers ───
    const pullbackTol = p.pullbackTolPct / 100.0;

    // [1] shift: use previous bar's rolling value
    const touchLowUp = i >= 1 && !isNaN(lowestLowPB[i - 1]) && lowestLowPB[i - 1] <= emaDir[i] * (1 + pullbackTol);
    const touchHighDn = i >= 1 && !isNaN(highestHighPB[i - 1]) && highestHighPB[i - 1] >= emaDir[i] * (1 - pullbackTol);

    const reclaimUp = c.close > emaTrig[i] && candles[i - 1].close <= emaTrig[i - 1];
    const reclaimDn = c.close < emaTrig[i] && candles[i - 1].close >= emaTrig[i - 1];

    const pullbackUp = p.enablePullback && touchLowUp && reclaimUp;
    const pullbackDn = p.enablePullback && touchHighDn && reclaimDn;

    const breakUp = p.enableBreakout && !isNaN(highestHighBO[i - 1]) && c.close > highestHighBO[i - 1];
    const breakDn = p.enableBreakout && !isNaN(lowestLowBO[i - 1]) && c.close < lowestLowBO[i - 1];

    const triggerUp = pullbackUp || breakUp;
    const triggerDn = pullbackDn || breakDn;

    // ─── Entry quality ───
    const candleRange = c.high - c.low;
    const bodyPct = candleRange > 0 ? Math.abs(c.close - c.open) / candleRange * 100 : 0;
    const bodyOkUp = p.minBodyPct <= 0 || (c.close > c.open && bodyPct >= p.minBodyPct);
    const bodyOkDn = p.minBodyPct <= 0 || (c.close < c.open && bodyPct >= p.minBodyPct);

    const extAtrUp = (c.close - emaDir[i]) / Math.max(atrVal, 1e-10);
    const extAtrDn = (emaDir[i] - c.close) / Math.max(atrVal, 1e-10);
    const extOkUp = extAtrUp <= p.maxExtAtr;
    const extOkDn = extAtrDn <= p.maxExtAtr;

    // ─── Risk validation ───
    const entry = c.close;
    const atrUsable = !isNaN(atrVal) && atrVal > 0;

    // [1] shift for swing levels
    const sl = i >= 1 ? swingLow[i - 1] : NaN;
    const sh = i >= 1 ? swingHigh[i - 1] : NaN;
    const structSLBuy = sl - atrVal * p.structBufferAtr;
    const structSLSell = sh + atrVal * p.structBufferAtr;

    const riskStructBuy = entry - structSLBuy;
    const slModeBuy = riskStructBuy >= p.minRiskAtr * atrVal;
    const slBuy = slModeBuy ? structSLBuy : entry - p.atrFallbackMult * atrVal;
    const riskBuy = entry - slBuy;
    const riskAtrBuy = riskBuy / Math.max(atrVal, 1e-10);
    const riskGateBuyOk = atrUsable && slBuy < entry && riskAtrBuy <= p.maxRiskAtr;
    const tp1Buy = entry + riskBuy * p.tp1R;
    const tp2Buy = entry + riskBuy * p.tp2R;

    const riskStructSell = structSLSell - entry;
    const slModeSell = riskStructSell >= p.minRiskAtr * atrVal;
    const slSell = slModeSell ? structSLSell : entry + p.atrFallbackMult * atrVal;
    const riskSell = slSell - entry;
    const riskAtrSell = riskSell / Math.max(atrVal, 1e-10);
    const riskGateSellOk = atrUsable && slSell > entry && riskAtrSell <= p.maxRiskAtr;
    const tp1Sell = entry - riskSell * p.tp1R;
    const tp2Sell = entry - riskSell * p.tp2R;

    // ─── Position tracking (check BEFORE new entries) ───
    if (posState !== 0 && barIdx > posBar) {
      posAge++;

      // MFE/MAE
      const favR = posState === 1 ? (c.high - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.low) / Math.max(posRisk, 1e-10);
      const advR = posState === 1 ? (posEntry - c.low) / Math.max(posRisk, 1e-10) : (c.high - posEntry) / Math.max(posRisk, 1e-10);
      posMFE = Math.max(posMFE, favR);
      posMAE = Math.max(posMAE, advR);

      // Exit checks (same priority as Pine: SL+TP > SL > TP2 > TP1 > EXPIRY)
      const slHit = posState === 1 ? c.low <= posSL : c.high >= posSL;
      const tp1Hit = posState === 1 ? c.high >= posTP1 : c.low <= posTP1;
      const tp2Hit = posState === 1 ? c.high >= posTP2 : c.low <= posTP2;

      let outcome = null;
      let finalR = 0;

      if (slHit && (tp1Hit || tp2Hit)) {
        outcome = "AMBIGUOUS";
        finalR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
      } else if (slHit) {
        outcome = "SL FIRST";
        finalR = -1.0;
      } else if (tp2Hit) {
        outcome = "TP2 FIRST";
        finalR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
      } else if (tp1Hit) {
        outcome = "TP1 FIRST";
        finalR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
      } else if (posAge >= p.outcomeBars) {
        outcome = "EXPIRED";
        finalR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
      }

      if (outcome) {
        // Record trade
        trades.push({
          direction: posDir,
          entry: posEntry,
          sl: posSL,
          tp1: posTP1,
          tp2: posTP2,
          risk: posRisk,
          riskAtr: posRiskAtr,
          exitPrice: outcome === "SL FIRST" ? posSL : c.close,
          exitReason: outcome,
          exitBar: barIdx,
          exitTime: c.timestamp,
          entryTime: candles[posBar].timestamp,
          entryBar: posBar,
          finalR,
          mfe: posMFE,
          mae: posMAE,
          age: posAge,
          extAtr: posExtAtr,
          bodyPct: posBodyPct,
          ema21: posEma21,
          atr: posAtrVal,
          structSL: posStructSL,
          rr1: posRR1,
          rr2: posRR2,
          trigger: posTrigger,
        });

        posState = 0;
      }
    }

    // ─── New entries (AFTER tracking) ───
    const cfgOk = p.emaTrigLen < p.emaDirLen && p.emaDirLen < p.emaSlowLen && p.swingLookback >= 2 && p.tp1R > 0 && p.tp2R > p.tp1R && p.maxRiskAtr > p.minRiskAtr;

    const canEnterLong = posState === 0 || posState === -1;
    const canEnterShort = posState === 0 || posState === 1;

    const entryUp = cfgOk && setupUp && triggerUp && extOkUp && bodyOkUp && riskGateBuyOk && canEnterLong;
    const entryDn = cfgOk && setupDn && triggerDn && extOkDn && bodyOkDn && riskGateSellOk && canEnterShort;

    if (entryUp) {
      // Supersede opposite position
      if (posState === -1) {
        const supR = (c.close - posEntry) / Math.max(posRisk, 1e-10);
        trades.push({
          direction: "SHORT", entry: posEntry, sl: posSL, tp1: posTP1, tp2: posTP2,
          risk: posRisk, riskAtr: posRiskAtr, exitPrice: c.close, exitReason: "SUPERSEDED",
          exitBar: barIdx, exitTime: c.timestamp, entryTime: candles[posBar].timestamp,
          entryBar: posBar, finalR: supR, mfe: posMFE, mae: posMAE, age: posAge,
          extAtr: posExtAtr, bodyPct: posBodyPct, ema21: posEma21, atr: posAtrVal,
          structSL: posStructSL, rr1: posRR1, rr2: posRR2, trigger: posTrigger,
        });
      }

      posState = 1;
      posBar = barIdx;
      posEntry = entry;
      posSL = slBuy;
      posTP1 = tp1Buy;
      posTP2 = tp2Buy;
      posRisk = riskBuy;
      posRiskAtr = riskAtrBuy;
      posAge = 0;
      posMFE = 0;
      posMAE = 0;
      posDir = "BUY";
      posExtAtr = extAtrUp;
      posBodyPct = bodyPct;
      posEma21 = emaDir[i];
      posAtrVal = atrVal;
      posStructSL = structSLBuy;
      posRR1 = p.tp1R;
      posRR2 = p.tp2R;
      posTrigger = pullbackUp ? "PULLBACK RESUME" : "BREAKOUT";

      signals.push({
        bar: barIdx,
        time: c.timestamp,
        direction: "BUY",
        trigger: posTrigger,
        entry,
        sl: slBuy,
        tp1: tp1Buy,
        tp2: tp2Buy,
        riskAtr: riskAtrBuy,
        extAtr: extAtrUp,
        bodyPct,
        ema21: emaDir[i],
        atr: atrVal,
        structSL: structSLBuy,
        regime: trendUp ? "TREND UP" : trendDn ? "TREND DOWN" : highVol ? "HIGH VOL" : "RANGING",
        setupState: setupUp ? "LONG" : "NONE",
      });
    }

    if (entryDn) {
      if (posState === 1) {
        const supR = (posEntry - c.close) / Math.max(posRisk, 1e-10);
        trades.push({
          direction: "LONG", entry: posEntry, sl: posSL, tp1: posTP1, tp2: posTP2,
          risk: posRisk, riskAtr: posRiskAtr, exitPrice: c.close, exitReason: "SUPERSEDED",
          exitBar: barIdx, exitTime: c.timestamp, entryTime: candles[posBar].timestamp,
          entryBar: posBar, finalR: supR, mfe: posMFE, mae: posMAE, age: posAge,
          extAtr: posExtAtr, bodyPct: posBodyPct, ema21: posEma21, atr: posAtrVal,
          structSL: posStructSL, rr1: posRR1, rr2: posRR2, trigger: posTrigger,
        });
      }

      posState = -1;
      posBar = barIdx;
      posEntry = entry;
      posSL = slSell;
      posTP1 = tp1Sell;
      posTP2 = tp2Sell;
      posRisk = riskSell;
      posRiskAtr = riskAtrSell;
      posAge = 0;
      posMFE = 0;
      posMAE = 0;
      posDir = "SELL";
      posExtAtr = extAtrDn;
      posBodyPct = bodyPct;
      posEma21 = emaDir[i];
      posAtrVal = atrVal;
      posStructSL = structSLSell;
      posRR1 = p.tp1R;
      posRR2 = p.tp2R;
      posTrigger = pullbackDn ? "PULLBACK RESUME" : "BREAKOUT";

      signals.push({
        bar: barIdx,
        time: c.timestamp,
        direction: "SELL",
        trigger: posTrigger,
        entry,
        sl: slSell,
        tp1: tp1Sell,
        tp2: tp2Sell,
        riskAtr: riskAtrSell,
        extAtr: extAtrDn,
        bodyPct,
        ema21: emaDir[i],
        atr: atrVal,
        structSL: structSLSell,
        regime: trendUp ? "TREND UP" : trendDn ? "TREND DOWN" : highVol ? "HIGH VOL" : "RANGING",
        setupState: setupDn ? "SHORT" : "NONE",
      });
    }
  }

  return { signals, trades, candles };
}

// ─── SL-Failure analysis ──────────────────────────────────────────

export function analyzeSLFailures(trades, candles, window = 20) {
  return trades.map(t => {
    if (t.exitReason !== "SL FIRST") return { ...t, slFailure: null };

    const exitBar = t.exitBar;
    const direction = t.direction;
    const entry = t.entry;
    const risk = t.risk;

    // Measure favorable excursion AFTER SL
    let postMFE = 0;
    const endBar = Math.min(exitBar + window, candles.length - 1);
    for (let i = exitBar + 1; i <= endBar; i++) {
      const c = candles[i];
      const favR = direction === "BUY"
        ? (c.high - entry) / Math.max(risk, 1e-10)
        : (entry - c.low) / Math.max(risk, 1e-10);
      postMFE = Math.max(postMFE, favR);
    }

    // Classify
    let classification = "UNKNOWN";
    if (postMFE >= 1.0) classification = "STOP_TOO_TIGHT";
    else if (postMFE >= 0.5) classification = "MARGINAL_STOP";
    else if (t.mfe < 0.3) classification = "LATE_ENTRY";
    else if (t.extAtr > 1.5) classification = "OVEREXTENDED";
    else classification = "CONTINUATION";

    return {
      ...t,
      slFailure: {
        postMFE,
        postWindow: window,
        classification,
      },
    };
  });
}

// ─── Performance report ───────────────────────────────────────────

export function generateReport(trades) {
  const closed = trades.filter(t => t.exitReason !== "SUPERSEDED");
  const winners = closed.filter(t => t.finalR > 0);
  const losers = closed.filter(t => t.finalR < 0);
  const slTrades = closed.filter(t => t.exitReason === "SL FIRST");
  const tpTrades = closed.filter(t => t.exitReason.includes("TP"));

  const totalR = closed.reduce((s, t) => s + t.finalR, 0);
  const avgR = closed.length > 0 ? totalR / closed.length : 0;
  const avgWinner = winners.length > 0 ? winners.reduce((s, t) => s + t.finalR, 0) / winners.length : 0;
  const avgLoser = losers.length > 0 ? losers.reduce((s, t) => s + t.finalR, 0) / losers.length : 0;
  const profitFactor = losers.length > 0 && avgLoser !== 0
    ? Math.abs(winners.reduce((s, t) => s + t.finalR, 0) / losers.reduce((s, t) => s + t.finalR, 0))
    : Infinity;

  // Max drawdown (in R)
  let peak = 0, dd = 0, maxDD = 0;
  for (const t of closed) {
    peak += t.finalR;
    dd = Math.min(dd, peak - Math.max(peak, 0));
    maxDD = Math.min(maxDD, dd);
  }

  const avgMFE = closed.length > 0 ? closed.reduce((s, t) => s + t.mfe, 0) / closed.length : 0;
  const avgMAE = closed.length > 0 ? closed.reduce((s, t) => s + t.mae, 0) / closed.length : 0;
  const avgAge = closed.length > 0 ? closed.reduce((s, t) => s + t.age, 0) / closed.length : 0;

  const buyTrades = closed.filter(t => t.direction === "BUY" || t.direction === "LONG");
  const sellTrades = closed.filter(t => t.direction === "SELL" || t.direction === "SHORT");

  return {
    totalSignals: trades.length,
    totalTrades: closed.length,
    buyTrades: buyTrades.length,
    sellTrades: sellTrades.length,
    winners: winners.length,
    losers: losers.length,
    winRate: closed.length > 0 ? (winners.length / closed.length * 100) : 0,
    profitFactor,
    totalR,
    avgR,
    avgWinner,
    avgLoser,
    maxDrawdownR: maxDD,
    slHitPct: closed.length > 0 ? (slTrades.length / closed.length * 100) : 0,
    tpHitPct: closed.length > 0 ? (tpTrades.length / closed.length * 100) : 0,
    avgMFE,
    avgMAE,
    avgHoldingBars: avgAge,
    slTrades: slTrades.length,
    tpTrades: tpTrades.length,
    expiredTrades: closed.filter(t => t.exitReason === "EXPIRED").length,
    supersededTrades: trades.filter(t => t.exitReason === "SUPERSEDED").length,
  };
}
