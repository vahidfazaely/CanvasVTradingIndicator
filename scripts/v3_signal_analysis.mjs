#!/usr/bin/env node
// ================================================================
// CanvasV MTF Signal v3.4.4 — Quantitative Analysis Engine
// Exact translation of the Pine Script signal pipeline
// Tests: Conservative / Balanced / Aggressive sensitivity presets
// Data: Synthetic BTC-like M15 OHLCV (realistic regime model)
// ================================================================

// ---------------------------------------------------------------
// 1. SYNTHETIC DATA GENERATOR — Realistic BTC-like M15
// ---------------------------------------------------------------
// Model: regime-switching random walk with:
//   - Trend phases (bull/bear/range) lasting 2-20 days
//   - Volatility clustering (ATR autoregression)
//   - Mean-reversion tendencies
//   - Realistic wick-to-body ratios
//   - Volume patterns correlated with volatility

function generateBTCData(bars = 17500) {
  // ~6 months of M15 data
  const data = [];
  let price = 65000; // starting price
  let trend = 0;     // trend drift per bar
  let volatility = 200; // ATR proxy
  let regime = 'range';
  let regimeLen = 0;
  let maxRegimeLen = 0;
  let trendDir = 0;

  const rng = mulberry32(42); // deterministic seed

  for (let i = 0; i < bars; i++) {
    // Regime transitions
    regimeLen++;
    if (regimeLen > maxRegimeLen || rng() < 0.003) {
      const r = rng();
      if (r < 0.35) { regime = 'bull'; trendDir = 1; }
      else if (r < 0.65) { regime = 'bear'; trendDir = -1; }
      else { regime = 'range'; trendDir = 0; }
      maxRegimeLen = Math.floor(40 + rng() * 400); // 10h - 4 days
      regimeLen = 0;
    }

    // Trend drift
    const targetTrend = regime === 'bull' ? 15 : regime === 'bear' ? -12 : 0;
    trend = trend * 0.92 + targetTrend * 0.08 + (rng() - 0.5) * 20;

    // Volatility clustering
    const volTarget = regime === 'range' ? 120 : regime === 'bear' ? 280 : 180;
    volatility = volatility * 0.95 + volTarget * 0.05 + (rng() - 0.5) * 40;
    volatility = Math.max(50, Math.min(600, volatility));

    // Price movement
    const drift = trend + (rng() - 0.48) * volatility * 0.8;
    const open = price;
    const move1 = drift * (0.3 + rng() * 0.4);
    const move2 = drift * (0.3 + rng() * 0.4) + (rng() - 0.5) * volatility * 0.3;
    const bodySize = Math.abs(move1 + move2);
    const wickUp = rng() * volatility * 0.25;
    const wickDn = rng() * volatility * 0.25;

    let close = open + move1 + move2;
    let high, low;

    if (close > open) {
      high = close + wickUp;
      low = open - wickDn;
    } else {
      high = open + wickUp;
      low = close - wickDn;
    }

    // Ensure OHLC consistency
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    if (high === low) high += 1;

    const volume = Math.floor(50 + rng() * 500 + volatility * 0.5);

    data.push({
      time: 1720000000000 + i * 900000, // 15m intervals
      open, high, low, close, volume
    });

    price = close;
  }
  return data;
}

// Deterministic PRNG
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------
// 2. INDICATOR FUNCTIONS — Exact Pine Script translation
// ---------------------------------------------------------------

function ema(data, period) {
  const result = new Array(data.length).fill(null);
  const k = 2 / (period + 1);
  // First value = SMA
  let sum = 0;
  for (let i = 0; i < period && i < data.length; i++) sum += data[i];
  result[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

function sma(data, period) {
  const result = new Array(data.length).fill(null);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

function tr(candles) {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
}

function atr(candles, period) {
  const trs = tr(candles);
  const result = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < trs.length; i++) {
    sum += trs[i];
    if (i >= period) sum -= trs[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  // Wilder's smoothing (Pine uses this)
  for (let i = period; i < result.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + trs[i]) / period;
  }
  return result;
}

function dmi(candles, period) {
  const len = candles.length;
  const diPlus = new Array(len).fill(null);
  const diMinus = new Array(len).fill(null);
  const adx = new Array(len).fill(null);

  const smoothedDMPlus = new Array(len).fill(0);
  const smoothedDMMinus = new Array(len).fill(0);
  const smoothedTR = new Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    smoothedDMPlus[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    smoothedDMMinus[i] = (downMove > upMove && downMove > 0) ? downMove : 0;

    const trVal = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    smoothedTR[i] = trVal;

    if (i === period) {
      // Initial smoothing
      let sDMPlus = 0, sDMMinus = 0, sTR = 0;
      for (let j = 1; j <= period; j++) {
        sDMPlus += smoothedDMPlus[j];
        sDMMinus += smoothedDMMinus[j];
        sTR += smoothedTR[j];
      }
      smoothedDMPlus[i] = sDMPlus;
      smoothedDMMinus[i] = sDMMinus;
      smoothedTR[i] = sTR;
    } else if (i > period) {
      smoothedDMPlus[i] = smoothedDMPlus[i - 1] - smoothedDMPlus[i - 1] / period + smoothedDMPlus[i];
      smoothedDMMinus[i] = smoothedDMMinus[i - 1] - smoothedDMMinus[i - 1] / period + smoothedDMMinus[i];
      smoothedTR[i] = smoothedTR[i - 1] - smoothedTR[i - 1] / period + smoothedTR[i];
    }

    if (i >= period && smoothedTR[i] > 0) {
      diPlus[i] = (smoothedDMPlus[i] / smoothedTR[i]) * 100;
      diMinus[i] = (smoothedDMMinus[i] / smoothedTR[i]) * 100;
    }
  }

  // ADX calculation
  const dx = new Array(len).fill(null);
  for (let i = period; i < len; i++) {
    if (diPlus[i] != null && diMinus[i] != null) {
      const diSum = diPlus[i] + diMinus[i];
      dx[i] = diSum > 0 ? Math.abs(diPlus[i] - diMinus[i]) / diSum * 100 : 0;
    }
  }

  // Smoothed ADX (Wilder's)
  let adxSum = 0;
  let adxCount = 0;
  for (let i = period; i < len; i++) {
    if (dx[i] != null) {
      adxSum += dx[i];
      adxCount++;
      if (adxCount >= period) {
        if (adxCount === period) {
          adx[i] = adxSum / period;
        } else {
          adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
        }
      }
    }
  }

  return { diPlus, diMinus, adx };
}

function lowest(arr, period, idx) {
  let min = Infinity;
  const start = Math.max(0, idx - period);
  for (let i = start; i < idx; i++) {
    if (arr[i] < min) min = arr[i];
  }
  return min;
}

function highest(arr, period, idx) {
  let max = -Infinity;
  const start = Math.max(0, idx - period);
  for (let i = start; i < idx; i++) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
}

function taCrossover(a, b, i) {
  return a[i] > b[i] && a[i - 1] <= b[i - 1];
}

function taCrossunder(a, b, i) {
  return a[i] < b[i] && a[i - 1] >= b[i - 1];
}

// ---------------------------------------------------------------
// 3. SIMULATED HTF DATA — 4H and 1H from M15 candles
// ---------------------------------------------------------------

function buildHTFData(m15Data) {
  // Build 4H candles from M15 (every 4 M15 bars)
  const h4Candles = [];
  for (let i = 0; i < m15Data.length; i += 4) {
    const slice = m15Data.slice(i, i + 4);
    if (slice.length < 4) break;
    h4Candles.push({
      open: slice[0].open,
      high: Math.max(...slice.map(c => c.high)),
      low: Math.min(...slice.map(c => c.low)),
      close: slice[slice.length - 1].close,
    });
  }

  // Build 1H candles from M15 (every 4 M15 bars, offset)
  const h1Candles = [];
  for (let i = 0; i < m15Data.length; i += 4) {
    const slice = m15Data.slice(i, i + 4);
    if (slice.length < 4) break;
    h1Candles.push({
      open: slice[0].open,
      high: Math.max(...slice.map(c => c.high)),
      low: Math.min(...slice.map(c => c.low)),
      close: slice[slice.length - 1].close,
    });
  }

  // Compute HTF EMAs
  const h4Close = h4Candles.map(c => c.close);
  const h4Ema50 = ema(h4Close, 50);
  const h4Ema200 = ema(h4Close, 200);
  const h1Close = h1Candles.map(c => c.close);
  const h1Ema21 = ema(h1Close, 21);
  const h1Ema50 = ema(h1Close, 50);

  return { h4Candles, h4Ema50, h4Ema200, h1Candles, h1Ema21, h1Ema50 };
}

// Map M15 bar index to the last CLOSED HTF candle index
function h4CandleIdx(m15Idx) {
  return Math.floor(m15Idx / 4) - 1; // last CLOSED 4H candle
}

function h1CandleIdx(m15Idx) {
  return Math.floor(m15Idx / 4) - 1; // last CLOSED 1H candle
}

// ---------------------------------------------------------------
// 4. V3 SIGNAL ENGINE — Exact preset logic
// ---------------------------------------------------------------

const PRESETS = {
  Conservative: {
    flatSlope: false,
    noSlopeGate: false,
    h1Tol: 0.0,
    adxFloor: 18.0,
    bodyMin: 50.0,
    chaseMax: 1.5,
    volFloor: 0.05,
  },
  Balanced: {
    flatSlope: true,
    noSlopeGate: false,
    h1Tol: 0.005,
    adxFloor: 15.0,
    bodyMin: 40.0,
    chaseMax: 2.0,
    volFloor: 0.04,
  },
  Aggressive: {
    flatSlope: true,
    noSlopeGate: true,
    h1Tol: 0.010,
    adxFloor: 12.0,
    bodyMin: 30.0,
    chaseMax: 2.5,
    volFloor: 0.03,
  },
};

function runSignalEngine(m15Data, htf, preset) {
  const P = PRESETS[preset];
  const n = m15Data.length;

  // M15 indicators
  const emaF = ema(m15Data.map(c => c.close), 9);
  const emaS = ema(m15Data.map(c => c.close), 21);
  const { adx: adxVal } = dmi(m15Data, 14);
  const atrVal = atr(m15Data, 14);

  const signals = [];
  const candidates = []; // all crossover events (accepted + rejected)
  const rejections = {};

  for (let i = 2; i < n; i++) {
    if (emaF[i] == null || emaS[i] == null || adxVal[i] == null || atrVal[i] == null) continue;
    if (emaF[i - 1] == null || emaS[i - 1] == null) continue;

    const crossUp = taCrossover(emaF, emaS, i);
    const crossDn = taCrossunder(emaF, emaS, i);

    if (!crossUp && !crossDn) continue; // not a crossover event

    // --- HTF data (last CLOSED candle) ---
    const h4Idx = h4CandleIdx(i);
    const h1Idx = h1CandleIdx(i);

    if (h4Idx < 0 || h1Idx < 0) continue;
    if (h4Idx >= htf.h4Ema50.length || h4Idx >= htf.h4Ema200.length) continue;
    if (h1Idx >= htf.h1Ema21.length || h1Idx >= htf.h1Ema50.length) continue;
    if (h4Idx < 1) continue; // need previous for slope

    const h4e50 = htf.h4Ema50[h4Idx];
    const h4e50Prev = htf.h4Ema50[h4Idx - 1];
    const h4e200 = htf.h4Ema200[h4Idx];
    const h1FastV = htf.h1Ema21[h1Idx];
    const h1SlowV = htf.h1Ema50[h1Idx];

    if (h4e50 == null || h4e50Prev == null || h4e200 == null) continue;
    if (h1FastV == null || h1SlowV == null) continue;

    // --- H4 trend ---
    const h4Bull = h4e50 > h4e200;
    const h4Bear = h4e50 < h4e200;
    const slopeUpStrict = h4e50 > h4e50Prev;
    const slopeDnStrict = h4e50 < h4e50Prev;
    const slopeUp = P.flatSlope ? (h4e50 >= h4e50Prev) : slopeUpStrict;
    const slopeDn = P.flatSlope ? (h4e50 <= h4e50Prev) : slopeDnStrict;
    const sep4HOk = Math.abs(h4e50 - h4e200) / Math.max(h4e200, 1e-10) * 100 >= 0.10;

    // --- Direction check ---
    if (crossUp && !h4Bull) { candidates.push({ i, dir: 'BUY', rejected: true, reason: '4H REGIME' }); rejections['4H REGIME'] = (rejections['4H REGIME'] || 0) + 1; continue; }
    if (crossDn && !h4Bear) { candidates.push({ i, dir: 'SELL', rejected: true, reason: '4H REGIME' }); rejections['4H REGIME'] = (rejections['4H REGIME'] || 0) + 1; continue; }

    // --- Regime gate ---
    if (crossUp && !(P.noSlopeGate || slopeUp)) { candidates.push({ i, dir: 'BUY', rejected: true, reason: '4H SLOPE' }); rejections['4H SLOPE'] = (rejections['4H SLOPE'] || 0) + 1; continue; }
    if (crossDn && !(P.noSlopeGate || slopeDn)) { candidates.push({ i, dir: 'SELL', rejected: true, reason: '4H SLOPE' }); rejections['4H SLOPE'] = (rejections['4H SLOPE'] || 0) + 1; continue; }
    if (crossUp && !sep4HOk) { candidates.push({ i, dir: 'BUY', rejected: true, reason: '4H SEPARATION' }); rejections['4H SEPARATION'] = (rejections['4H SEPARATION'] || 0) + 1; continue; }
    if (crossDn && !sep4HOk) { candidates.push({ i, dir: 'SELL', rejected: true, reason: '4H SEPARATION' }); rejections['4H SEPARATION'] = (rejections['4H SEPARATION'] || 0) + 1; continue; }

    // --- H1 confirmation ---
    const h1ConfUp = h1FastV > h1SlowV * (1 - P.h1Tol);
    const h1ConfDn = h1FastV < h1SlowV * (1 + P.h1Tol);
    const h1MomUp = htf.h1Candles[h1Idx].close >= h1FastV * (1 - P.h1Tol);
    const h1MomDn = htf.h1Candles[h1Idx].close <= h1FastV * (1 + P.h1Tol);

    if (crossUp && !h1ConfUp) { candidates.push({ i, dir: 'BUY', rejected: true, reason: '1H STRUCTURE' }); rejections['1H STRUCTURE'] = (rejections['1H STRUCTURE'] || 0) + 1; continue; }
    if (crossDn && !h1ConfDn) { candidates.push({ i, dir: 'SELL', rejected: true, reason: '1H STRUCTURE' }); rejections['1H STRUCTURE'] = (rejections['1H STRUCTURE'] || 0) + 1; continue; }
    if (crossUp && !h1MomUp) { candidates.push({ i, dir: 'BUY', rejected: true, reason: '1H MOMENTUM' }); rejections['1H MOMENTUM'] = (rejections['1H MOMENTUM'] || 0) + 1; continue; }
    if (crossDn && !h1MomDn) { candidates.push({ i, dir: 'SELL', rejected: true, reason: '1H MOMENTUM' }); rejections['1H MOMENTUM'] = (rejections['1H MOMENTUM'] || 0) + 1; continue; }

    // --- Entry structure ---
    const setupUp = emaF[i] > emaS[i] && m15Data[i].close >= emaF[i];
    const setupDn = emaF[i] < emaS[i] && m15Data[i].close <= emaF[i];
    const gapUp = emaF[i] - emaS[i];
    const gapDn = emaS[i] - emaF[i];
    const gapUpPrev = emaF[i - 1] - emaS[i - 1];
    const gapDnPrev = emaS[i - 1] - emaF[i - 1];
    const gapUpExp = gapUp > gapUpPrev;
    const gapDnExp = gapDn > gapDnPrev;

    if (crossUp && !(setupUp && gapUpExp)) {
      const reason = !setupUp ? 'ENTRY STRUCTURE' : 'EMA EXPANSION';
      candidates.push({ i, dir: 'BUY', rejected: true, reason });
      rejections[reason] = (rejections[reason] || 0) + 1;
      continue;
    }
    if (crossDn && !(setupDn && gapDnExp)) {
      const reason = !setupDn ? 'ENTRY STRUCTURE' : 'EMA EXPANSION';
      candidates.push({ i, dir: 'SELL', rejected: true, reason });
      rejections[reason] = (rejections[reason] || 0) + 1;
      continue;
    }

    // --- Candle quality ---
    const candleRange = m15Data[i].high - m15Data[i].low;
    const candleBodyPct = candleRange > 0 ? Math.abs(m15Data[i].close - m15Data[i].open) / candleRange * 100 : 0;
    const candleUpOk = m15Data[i].close > m15Data[i].open && candleBodyPct >= P.bodyMin;
    const candleDnOk = m15Data[i].close < m15Data[i].open && candleBodyPct >= P.bodyMin;

    if (crossUp && !candleUpOk) { candidates.push({ i, dir: 'BUY', rejected: true, reason: 'CANDLE' }); rejections['CANDLE'] = (rejections['CANDLE'] || 0) + 1; continue; }
    if (crossDn && !candleDnOk) { candidates.push({ i, dir: 'SELL', rejected: true, reason: 'CANDLE' }); rejections['CANDLE'] = (rejections['CANDLE'] || 0) + 1; continue; }

    // --- ADX ---
    const adxPass = adxVal[i] >= P.adxFloor;
    if (!adxPass) {
      candidates.push({ i, dir: crossUp ? 'BUY' : 'SELL', rejected: true, reason: 'ADX' });
      rejections['ADX'] = (rejections['ADX'] || 0) + 1;
      continue;
    }

    // --- Volatility floor ---
    const atrPct = atrVal[i] / Math.max(m15Data[i].close, 1e-10) * 100;
    const volFloorOk = atrPct >= P.volFloor;
    if (!volFloorOk) {
      candidates.push({ i, dir: crossUp ? 'BUY' : 'SELL', rejected: true, reason: 'VOLATILITY' });
      rejections['VOLATILITY'] = (rejections['VOLATILITY'] || 0) + 1;
      continue;
    }

    // --- Chasing ---
    const entryDistAtr = Math.abs(m15Data[i].close - emaF[i]) / Math.max(atrVal[i], 1e-10);
    const chaseGateOk = entryDistAtr <= P.chaseMax;
    if (!chaseGateOk) {
      candidates.push({ i, dir: crossUp ? 'BUY' : 'SELL', rejected: true, reason: 'CHASING' });
      rejections['CHASING'] = (rejections['CHASING'] || 0) + 1;
      continue;
    }

    // --- Score ---
    const adxWeight = 25, trendWeight = 25, momWeight = 25, slopeWeight = 25;
    const maxScore = trendWeight + momWeight + adxWeight + slopeWeight;

    const buyScore = (h4Bull ? trendWeight : 0) + (h1ConfUp ? momWeight : 0) + (adxPass ? adxWeight : 0) + (slopeUpStrict ? slopeWeight : 0);
    const sellScore = (h4Bear ? trendWeight : 0) + (h1ConfDn ? momWeight : 0) + (adxPass ? adxWeight : 0) + (slopeDnStrict ? slopeWeight : 0);
    const score = crossUp ? buyScore : sellScore;

    if (score < 75) {
      candidates.push({ i, dir: crossUp ? 'BUY' : 'SELL', rejected: true, reason: 'SCORE', score });
      rejections['SCORE'] = (rejections['SCORE'] || 0) + 1;
      continue;
    }

    // --- Risk validation ---
    const entry = m15Data[i].close;
    const atrUsable = !isNaN(atrVal[i]) && atrVal[i] > 0;
    if (!atrUsable) {
      candidates.push({ i, dir: crossUp ? 'BUY' : 'SELL', rejected: true, reason: 'RISK' });
      rejections['RISK'] = (rejections['RISK'] || 0) + 1;
      continue;
    }

    const swingLookback = 10;
    const structBufferAtr = 0.5;
    const minRiskAtr = 0.5;
    const maxRiskAtr = 2.5;
    const atrFallbackMult = 1.5;

    if (crossUp) {
      const swingLow = lowest(m15Data.map(c => c.low), swingLookback, i);
      const structSL = swingLow - atrVal[i] * structBufferAtr;
      const riskStruct = entry - structSL;
      const slMode = riskStruct >= minRiskAtr * atrVal[i];
      const sl = slMode ? structSL : entry - atrFallbackMult * atrVal[i];
      const risk = entry - sl;
      const riskAtr = risk / Math.max(atrVal[i], 1e-10);
      const riskOk = sl < entry && riskAtr <= maxRiskAtr;

      if (!riskOk) {
        candidates.push({ i, dir: 'BUY', rejected: true, reason: 'RISK' });
        rejections['RISK'] = (rejections['RISK'] || 0) + 1;
        continue;
      }
    } else {
      const swingHigh = highest(m15Data.map(c => c.high), swingLookback, i);
      const structSL = swingHigh + atrVal[i] * structBufferAtr;
      const riskStruct = structSL - entry;
      const slMode = riskStruct >= minRiskAtr * atrVal[i];
      const sl = slMode ? structSL : entry + atrFallbackMult * atrVal[i];
      const risk = sl - entry;
      const riskAtr = risk / Math.max(atrVal[i], 1e-10);
      const riskOk = sl > entry && riskAtr <= maxRiskAtr;

      if (!riskOk) {
        candidates.push({ i, dir: 'SELL', rejected: true, reason: 'RISK' });
        rejections['RISK'] = (rejections['RISK'] || 0) + 1;
        continue;
      }
    }

    // --- SIGNAL ---
    const dir = crossUp ? 'BUY' : 'SELL';
    const sigScore = crossUp ? buyScore : sellScore;
    const isStrong = sigScore >= 100;

    candidates.push({ i, dir, rejected: false, score: sigScore, strong: isStrong });
    signals.push({
      bar: i,
      time: m15Data[i].time,
      dir,
      score: sigScore,
      strong: isStrong,
      entry: m15Data[i].close,
      emaF: emaF[i],
      emaS: emaS[i],
      adx: adxVal[i],
      atrPct,
    });
  }

  return { signals, candidates, rejections };
}

// ---------------------------------------------------------------
// 5. ANALYSIS FUNCTIONS
// ---------------------------------------------------------------

function analyzeSignals(signals, totalBars) {
  const buys = signals.filter(s => s.dir === 'BUY');
  const sells = signals.filter(s => s.dir === 'SELL');

  // Spacing (in bars)
  const spacings = [];
  for (let i = 1; i < signals.length; i++) {
    spacings.push(signals[i].bar - signals[i - 1].bar);
  }

  // Droughts (in bars)
  const buySpacings = [];
  for (let i = 1; i < buys.length; i++) buySpacings.push(buys[i].bar - buys[i - 1].bar);
  const sellSpacings = [];
  for (let i = 1; i < sells.length; i++) sellSpacings.push(sells[i].bar - sells[i - 1].bar);

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const median = arr => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const max = arr => arr.length ? Math.max(...arr) : 0;
  const min = arr => arr.length ? Math.min(...arr) : 0;

  const monthsApprox = totalBars / (4 * 24 * 30); // M15 bars → months

  return {
    buys: buys.length,
    sells: sells.length,
    total: signals.length,
    buySellRatio: sells.length > 0 ? (buys.length / sells.length).toFixed(2) : '∞',
    signalsPerMonth: (signals.length / monthsApprox).toFixed(1),
    avgSpacing: avg(spacings).toFixed(1),
    medianSpacing: median(spacings).toFixed(1),
    longestDrought: max(spacings),
    shortestSpacing: min(spacings),
    avgBuySpacing: avg(buySpacings).toFixed(1),
    avgSellSpacing: avg(sellSpacings).toFixed(1),
    longestBuyDrought: max(buySpacings),
    longestSellDrought: max(sellSpacings),
  };
}

function analyzeRejections(rejections, totalCandidates) {
  const totalRejected = Object.values(rejections).reduce((a, b) => a + b, 0);
  const result = {};
  for (const [key, count] of Object.entries(rejections)) {
    result[key] = { count, pctOfRejected: (count / totalRejected * 100).toFixed(1), pctOfTotal: (count / totalCandidates * 100).toFixed(1) };
  }
  return { buckets: result, totalRejected, totalCandidates };
}

// ---------------------------------------------------------------
// 6. PULLBACK/RECLAIM HYPOTHETICAL TRIGGER
// ---------------------------------------------------------------

function runPullbackEngine(m15Data, htf, preset) {
  const P = PRESETS[preset];
  const n = m15Data.length;
  const emaF = ema(m15Data.map(c => c.close), 9);
  const emaS = ema(m15Data.map(c => c.close), 21);
  const { adx: adxVal } = dmi(m15Data, 14);
  const atrVal = atr(m15Data, 14);

  const signals = [];
  const lookback = 5; // pullback lookback

  for (let i = lookback + 2; i < n; i++) {
    if (emaF[i] == null || emaS[i] == null || adxVal[i] == null || atrVal[i] == null) continue;

    // HTF checks (same as crossover engine)
    const h4Idx = h4CandleIdx(i);
    const h1Idx = h1CandleIdx(i);
    if (h4Idx < 1 || h1Idx < 0) continue;
    if (h4Idx >= htf.h4Ema50.length || h4Idx >= htf.h4Ema200.length) continue;
    if (h1Idx >= htf.h1Ema21.length || h1Idx >= htf.h1Ema50.length) continue;

    const h4e50 = htf.h4Ema50[h4Idx];
    const h4e50Prev = htf.h4Ema50[h4Idx - 1];
    const h4e200 = htf.h4Ema200[h4Idx];
    const h1FastV = htf.h1Ema21[h1Idx];
    const h1SlowV = htf.h1Ema50[h1Idx];
    if (h4e50 == null || h4e50Prev == null || h4e200 == null) continue;
    if (h1FastV == null || h1SlowV == null) continue;

    const h4Bull = h4e50 > h4e200;
    const h4Bear = h4e50 < h4e200;
    const slopeUpStrict = h4e50 > h4e50Prev;
    const slopeDnStrict = h4e50 < h4e50Prev;
    const slopeUp = P.flatSlope ? (h4e50 >= h4e50Prev) : slopeUpStrict;
    const slopeDn = P.flatSlope ? (h4e50 <= h4e50Prev) : slopeDnStrict;
    const sep4HOk = Math.abs(h4e50 - h4e200) / Math.max(h4e200, 1e-10) * 100 >= 0.10;
    const h1ConfUp = h1FastV > h1SlowV * (1 - P.h1Tol);
    const h1ConfDn = h1FastV < h1SlowV * (1 + P.h1Tol);
    const h1MomUp = htf.h1Candles[h1Idx].close >= h1FastV * (1 - P.h1Tol);
    const h1MomDn = htf.h1Candles[h1Idx].close <= h1FastV * (1 + P.h1Tol);

    // --- BUY pullback/reclaim ---
    // 1. Standing bullish: EMA9 > EMA21, close >= EMA9
    // 2. Pullback: within last N bars, price touched or went below EMA21 zone
    // 3. Reclaim: current close > EMA9 AND previous close <= EMA9
    // 4. Bullish candle, ADX, vol, chase gates

    if (h4Bull && (P.noSlopeGate || slopeUp) && sep4HOk && h1ConfUp && h1MomUp) {
      // Check pullback + reclaim
      let touchedZone = false;
      for (let j = i - lookback; j < i; j++) {
        if (m15Data[j].low <= emaS[j] * 1.005) { // touched near EMA21
          touchedZone = true;
          break;
        }
      }
      const reclaim = emaF[i] > emaS[i] && m15Data[i].close >= emaF[i] && m15Data[i - 1].close <= emaF[i - 1];
      if (touchedZone && reclaim) {
        // Same quality gates as crossover engine
        const candleRange = m15Data[i].high - m15Data[i].low;
        const candleBodyPct = candleRange > 0 ? Math.abs(m15Data[i].close - m15Data[i].open) / candleRange * 100 : 0;
        const candleOk = m15Data[i].close > m15Data[i].open && candleBodyPct >= P.bodyMin;
        const adxOk = adxVal[i] >= P.adxFloor;
        const atrPct = atrVal[i] / Math.max(m15Data[i].close, 1e-10) * 100;
        const volOk = atrPct >= P.volFloor;
        const distAtr = Math.abs(m15Data[i].close - emaF[i]) / Math.max(atrVal[i], 1e-10);
        const chaseOk = distAtr <= P.chaseMax;

        if (candleOk && adxOk && volOk && chaseOk) {
          const score = (h4Bull ? 25 : 0) + (h1ConfUp ? 25 : 0) + (adxOk ? 25 : 0) + (slopeUpStrict ? 25 : 0);
          if (score >= 75) {
            // Risk check
            const entry = m15Data[i].close;
            const swingLow = lowest(m15Data.map(c => c.low), 10, i);
            const structSL = swingLow - atrVal[i] * 0.5;
            const riskStruct = entry - structSL;
            const sl = riskStruct >= 0.5 * atrVal[i] ? structSL : entry - 1.5 * atrVal[i];
            const risk = entry - sl;
            const riskAtr = risk / Math.max(atrVal[i], 1e-10);
            if (sl < entry && riskAtr <= 2.5) {
              signals.push({ bar: i, dir: 'BUY', entry, score, strong: score >= 100 });
            }
          }
        }
      }
    }

    // --- SELL pullback/reclaim ---
    if (h4Bear && (P.noSlopeGate || slopeDn) && sep4HOk && h1ConfDn && h1MomDn) {
      let touchedZone = false;
      for (let j = i - lookback; j < i; j++) {
        if (m15Data[j].high >= emaS[j] * 0.995) { // touched near EMA21 from below
          touchedZone = true;
          break;
        }
      }
      const reclaim = emaF[i] < emaS[i] && m15Data[i].close <= emaF[i] && m15Data[i - 1].close >= emaF[i - 1];
      if (touchedZone && reclaim) {
        const candleRange = m15Data[i].high - m15Data[i].low;
        const candleBodyPct = candleRange > 0 ? Math.abs(m15Data[i].close - m15Data[i].open) / candleRange * 100 : 0;
        const candleOk = m15Data[i].close < m15Data[i].open && candleBodyPct >= P.bodyMin;
        const adxOk = adxVal[i] >= P.adxFloor;
        const atrPct = atrVal[i] / Math.max(m15Data[i].close, 1e-10) * 100;
        const volOk = atrPct >= P.volFloor;
        const distAtr = Math.abs(m15Data[i].close - emaF[i]) / Math.max(atrVal[i], 1e-10);
        const chaseOk = distAtr <= P.chaseMax;

        if (candleOk && adxOk && volOk && chaseOk) {
          const score = (h4Bear ? 25 : 0) + (h1ConfDn ? 25 : 0) + (adxOk ? 25 : 0) + (slopeDnStrict ? 25 : 0);
          if (score >= 75) {
            const entry = m15Data[i].close;
            const swingHigh = highest(m15Data.map(c => c.high), 10, i);
            const structSL = swingHigh + atrVal[i] * 0.5;
            const riskStruct = structSL - entry;
            const sl = riskStruct >= 0.5 * atrVal[i] ? structSL : entry + 1.5 * atrVal[i];
            const risk = sl - entry;
            const riskAtr = risk / Math.max(atrVal[i], 1e-10);
            if (sl > entry && riskAtr <= 2.5) {
              signals.push({ bar: i, dir: 'SELL', entry, score, strong: score >= 100 });
            }
          }
        }
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------
// 7. MAIN — Run analysis
// ---------------------------------------------------------------

function main() {
  console.log('========================================================');
  console.log('CanvasV MTF Signal v3.4.4 — Quantitative Analysis');
  console.log('========================================================');
  console.log();

  // Generate data
  const totalBars = 17500; // ~6 months of M15
  console.log(`Generating ${totalBars} M15 bars (~${(totalBars / (4 * 24 * 30)).toFixed(1)} months)...`);
  const m15Data = generateBTCData(totalBars);
  console.log(`Data generated: ${m15Data.length} bars`);
  console.log(`Price range: ${Math.min(...m15Data.map(c => c.low)).toFixed(0)} — ${Math.max(...m15Data.map(c => c.high)).toFixed(0)}`);
  console.log();

  // Build HTF
  console.log('Building 4H and 1H candles from M15 data...');
  const htf = buildHTFData(m15Data);
  console.log(`4H candles: ${htf.h4Candles.length}`);
  console.log(`1H candles: ${htf.h1Candles.length}`);
  console.log();

  // Run all presets
  const results = {};
  for (const preset of ['Conservative', 'Balanced', 'Aggressive']) {
    console.log(`--- Running ${preset} ---`);
    const start = Date.now();
    const { signals, candidates, rejections } = runSignalEngine(m15Data, htf, preset);
    const elapsed = Date.now() - start;
    const stats = analyzeSignals(signals, totalBars);
    const rej = analyzeRejections(rejections, candidates.length);
    results[preset] = { signals, candidates, rejections, stats, rej };
    console.log(`  Signals: ${signals.length} (${stats.buys} BUY / ${stats.sells} SELL) in ${elapsed}ms`);
    console.log(`  Candidates: ${candidates.length} (${rej.totalRejected} rejected)`);
    console.log();
  }

  // ---- TABLE 1: Signal Statistics ----
  console.log('========================================================');
  console.log('TABLE 1: Signal Statistics');
  console.log('========================================================');
  const hdr = ['Metric', 'Conservative', 'Balanced', 'Aggressive'];
  const row = (label, key) => [label, results.Conservative.stats[key], results.Balanced.stats[key], results.Aggressive.stats[key]];
  const tbl = [hdr,
    row('BUY count', 'buys'),
    row('SELL count', 'sells'),
    row('Total signals', 'total'),
    row('BUY/SELL ratio', 'buySellRatio'),
    row('Signals/month', 'signalsPerMonth'),
    row('Avg bars between', 'avgSpacing'),
    row('Median bars between', 'medianSpacing'),
    row('Longest drought (bars)', 'longestDrought'),
    row('Shortest spacing (bars)', 'shortestSpacing'),
    row('Longest BUY drought', 'longestBuyDrought'),
    row('Longest SELL drought', 'longestSellDrought'),
  ];
  printTable(tbl);
  console.log();

  // ---- TABLE 2: Rejection Buckets ----
  console.log('========================================================');
  console.log('TABLE 2: Rejection Buckets (count / % of total candidates)');
  console.log('========================================================');
  const allReasons = ['4H REGIME', '4H SLOPE', '4H SEPARATION', '1H STRUCTURE', '1H MOMENTUM', 'ENTRY STRUCTURE', 'EMA EXPANSION', 'CANDLE', 'ADX', 'VOLATILITY', 'CHASING', 'SCORE', 'RISK'];
  const rejHdr = ['Rejection Reason', 'Conservative', 'Balanced', 'Aggressive'];
  const rejRows = [rejHdr];
  for (const reason of allReasons) {
    const getCount = (p) => results[p].rejections[reason] || 0;
    const getTotal = (p) => results[p].candidates.length || 1;
    rejRows.push([
      reason,
      `${getCount('Conservative')} (${(getCount('Conservative') / getTotal('Conservative') * 100).toFixed(1)}%)`,
      `${getCount('Balanced')} (${(getCount('Balanced') / getTotal('Balanced') * 100).toFixed(1)}%)`,
      `${getCount('Aggressive')} (${(getCount('Aggressive') / getTotal('Aggressive') * 100).toFixed(1)}%)`,
    ]);
  }
  // Totals
  rejRows.push([
    'TOTAL REJECTED',
    `${results.Conservative.rej.totalRejected} / ${results.Conservative.rej.totalCandidates}`,
    `${results.Balanced.rej.totalRejected} / ${results.Balanced.rej.totalCandidates}`,
    `${results.Aggressive.rej.totalRejected} / ${results.Aggressive.rej.totalCandidates}`,
  ]);
  printTable(rejRows);
  console.log();

  // ---- TABLE 3: Crossover Bottleneck ----
  console.log('========================================================');
  console.log('TABLE 3: EMA Crossover Bottleneck Analysis');
  console.log('========================================================');
  const totalCross = {
    Conservative: results.Conservative.candidates.length,
    Balanced: results.Balanced.candidates.length,
    Aggressive: results.Aggressive.candidates.length,
  };
  const crossHdr = ['Metric', 'Conservative', 'Balanced', 'Aggressive'];
  const crossRows = [crossHdr];
  crossRows.push(['Total EMA crossover events', totalCross.Conservative, totalCross.Balanced, totalCross.Aggressive]);
  crossRows.push(['Signals generated', results.Conservative.stats.total, results.Balanced.stats.total, results.Aggressive.stats.total]);
  crossRows.push(['Crossover → signal rate', `${(results.Conservative.stats.total / Math.max(totalCross.Conservative, 1) * 100).toFixed(1)}%`, `${(results.Balanced.stats.total / Math.max(totalCross.Balanced, 1) * 100).toFixed(1)}%`, `${(results.Aggressive.stats.total / Math.max(totalCross.Aggressive, 1) * 100).toFixed(1)}%`]);
  crossRows.push(['Crosses/month', `${(totalCross.Conservative / (totalBars / (4 * 24 * 30))).toFixed(1)}`, `${(totalCross.Balanced / (totalBars / (4 * 24 * 30))).toFixed(1)}`, `${(totalCross.Aggressive / (totalBars / (4 * 24 * 30))).toFixed(1)}`]);
  printTable(crossRows);
  console.log();

  // ---- TABLE 4: Pullback/Reclaim Hypothetical ----
  console.log('========================================================');
  console.log('TABLE 4: Hypothetical Pullback/Reclaim Trigger (Balanced preset)');
  console.log('========================================================');
  const pbSignals = runPullbackEngine(m15Data, htf, 'Balanced');
  const pbBuys = pbSignals.filter(s => s.dir === 'BUY');
  const pbSells = pbSignals.filter(s => s.dir === 'SELL');
  const months = totalBars / (4 * 24 * 30);

  const pbSpacings = [];
  for (let i = 1; i < pbSignals.length; i++) pbSpacings.push(pbSignals[i].bar - pbSignals[i - 1].bar);
  const pbAvg = pbSpacings.length ? pbSpacings.reduce((a, b) => a + b, 0) / pbSpacings.length : 0;
  const pbMax = pbSpacings.length ? Math.max(...pbSpacings) : 0;

  const cmpHdr = ['Metric', 'EMA Crossover (Bal)', 'Pullback/Reclaim (Bal)'];
  const cmpRows = [cmpHdr];
  cmpRows.push(['Total opportunities', results.Balanced.stats.total, pbSignals.length]);
  cmpRows.push(['BUY opportunities', results.Balanced.stats.buys, pbBuys.length]);
  cmpRows.push(['SELL opportunities', results.Balanced.stats.sells, pbSells.length]);
  cmpRows.push(['Opportunities/month', results.Balanced.stats.signalsPerMonth, (pbSignals.length / months).toFixed(1)]);
  cmpRows.push(['Avg bars between', results.Balanced.stats.avgSpacing, pbAvg.toFixed(1)]);
  cmpRows.push(['Longest drought (bars)', results.Balanced.stats.longestDrought, pbMax]);
  printTable(cmpRows);
  console.log();

  // ---- TABLE 5: BUY/SELL Symmetry ----
  console.log('========================================================');
  console.log('TABLE 5: BUY/SELL Symmetry');
  console.log('========================================================');
  const symHdr = ['Metric', 'Conservative', 'Balanced', 'Aggressive'];
  const symRows = [symHdr];
  symRows.push(['BUY count', results.Conservative.stats.buys, results.Balanced.stats.buys, results.Aggressive.stats.buys]);
  symRows.push(['SELL count', results.Conservative.stats.sells, results.Balanced.stats.sells, results.Aggressive.stats.sells]);
  symRows.push(['BUY/SELL ratio', results.Conservative.stats.buySellRatio, results.Balanced.stats.buySellRatio, results.Aggressive.stats.buySellRatio]);
  symRows.push(['Longest BUY drought', results.Conservative.stats.longestBuyDrought, results.Balanced.stats.longestBuyDrought, results.Aggressive.stats.longestBuyDrought]);
  symRows.push(['Longest SELL drought', results.Conservative.stats.longestSellDrought, results.Balanced.stats.longestSellDrought, results.Aggressive.stats.longestSellDrought]);
  printTable(symRows);
  console.log();

  // ---- DETAILED DROUGHT ANALYSIS ----
  console.log('========================================================');
  console.log('DROUGHT ANALYSIS — Top 5 Longest Signal Droughts (Balanced)');
  console.log('========================================================');
  const balSignals = results.Balanced.signals;
  if (balSignals.length > 1) {
    const droughts = [];
    for (let i = 1; i < balSignals.length; i++) {
      droughts.push({
        from: balSignals[i - 1].bar,
        to: balSignals[i].bar,
        gap: balSignals[i].bar - balSignals[i - 1].bar,
        fromDir: balSignals[i - 1].dir,
        toDir: balSignals[i].dir,
        fromTime: new Date(balSignals[i - 1].time).toISOString().slice(0, 16),
        toTime: new Date(balSignals[i].time).toISOString().slice(0, 16),
      });
    }
    droughts.sort((a, b) => b.gap - a.gap);
    for (let i = 0; i < Math.min(5, droughts.length); i++) {
      const d = droughts[i];
      const hours = (d.gap * 15 / 60).toFixed(1);
      console.log(`  #${i + 1}: ${d.gap} bars (${hours}h) | ${d.fromDir} @ ${d.fromTime} → ${d.toDir} @ ${d.toTime}`);
    }
  }
  console.log();

  // ---- SUMMARY ----
  console.log('========================================================');
  console.log('SUMMARY');
  console.log('========================================================');
  console.log(`Conservative: ${results.Conservative.stats.total} signals/month (${results.Conservative.stats.signalsPerMonth})`);
  console.log(`Balanced:     ${results.Balanced.stats.total} signals/month (${results.Balanced.stats.signalsPerMonth})`);
  console.log(`Aggressive:   ${results.Aggressive.stats.total} signals/month (${results.Aggressive.stats.signalsPerMonth})`);
  console.log(`Pullback/Reclaim (Balanced): ${pbSignals.length} signals/month (${(pbSignals.length / months).toFixed(1)})`);
  console.log();

  const ratio = results.Balanced.stats.total / Math.max(results.Conservative.stats.total, 1);
  console.log(`Balanced → Conservative signal ratio: ${ratio.toFixed(1)}×`);
  const pbRatio = pbSignals.length / Math.max(results.Balanced.stats.total, 1);
  console.log(`Pullback → Crossover signal ratio: ${pbRatio.toFixed(1)}×`);
}

function printTable(rows) {
  if (!rows.length) return;
  const cols = rows[0].length;
  const widths = new Array(cols).fill(0);
  for (const row of rows) {
    for (let i = 0; i < cols; i++) {
      widths[i] = Math.max(widths[i], String(row[i]).length);
    }
  }
  for (const row of rows) {
    const parts = row.map((cell, i) => String(cell).padStart(widths[i]));
    console.log('  ' + parts.join(' | '));
  }
}

main();
