// CanvasV V4 FAST — Local Signal Engine
// Faithfully reproduces the TradingView Pine Script v4.2.0 signal logic
// (all DEFAULT_PARAMS match the Pine input defaults exactly).
// Single-timeframe only (no MTF/security calls in production).
// Deliberate gaps vs Pine (all default-OFF execution extras in the .pine):
//   partial TP, break-even-after-TP1, session filter, commission/slippage.
// The engine additionally reports AMBIGUOUS (SL+TP same bar) and STALE_EXIT
// outcomes, which the Pine strategy classifies by exit price alone.

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
  maxExtAtr: 1.5,
  useStrictExt: true,
  minBodyPct: 0.0,

  // Risk
  swingLookback: 10,
  structBufferAtr: 0.5,
  minRiskAtr: 0.5,
  maxRiskAtr: 4.0,
  tp1R: 1.0,
  tp2R: 2.5,
  atrFallbackMult: 1.5,
  atrStopMult: 1.5,

  // Position Sizing (Phase 2)
  enableFixedRisk: true,
  riskPerTrade: 0.5,
  maxPosSize: 0,

  // Breakout Quality (Phase 3)
  enableBtBuffer: true,
  breakoutBuffer: 0.10,
  enableCloseLoc: true,
  closeLocMinLong: 0.70,
  closeLocMinShort: 0.30,
  enableBtExtFilter: true,
  breakoutExtAtr: 2.0,

  // Volume (Phase 4)
  enableRelVol: true,
  volLookback: 20,
  volMinBreakout: 1.20,
  volMinPullback: 1.10,

  // High-Volatility (Phase 5)
  hvMode: "Stronger Confirmation",
  hvVolMin: 1.40,
  hvCloseLocLong: 0.75,
  hvCloseLocShort: 0.25,

  // Position
  enableMidTradeBE: false,
  beBarThreshold: 10,
  staleBarLimit: 15,
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

// SMA — NaN-robust, matches Pine ta.sma behavior on series with leading NaN warmup
// (e.g. calcATR yields NaN for the first `period-1` bars). NaN inputs are skipped;
// output stays NaN until the trailing window holds `period` valid values.
export function calcSMA(data, period) {
  const sma = new Float64Array(data.length);
  let sum = 0, valid = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!isNaN(v)) { sum += v; valid++; }
    if (i >= period) {
      const old = data[i - period];
      if (!isNaN(old)) { sum -= old; valid--; }
    }
    sma[i] = valid === period ? sum / period : NaN;
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

export function runEngine(candles, params = DEFAULT_PARAMS, opts = {}) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const len = candles.length;
  const audit = !!opts.audit; // when true, per-bar funnel/stage booleans are collected
  // AUDIT EXPERIMENTS (opt-in, default OFF — production/parity behavior unchanged):
  //   Pullback entry policy, one of:
  //     "reclaim"  (default) — entry only on the EMA9 close-reclaim after an EMA21 touch.
  //     "firstDip" — any qualifying dip bar (opts.experimentEarlyPullback = true). Entry at
  //                  the first bar of a touch window: setup up, close <= EMA9, not
  //                  free-falling more than 1.5 ATR below EMA21.
  //     "slowDip"  (opts.experimentSlowDipEarly = true) — like firstDip but only after the
  //                  dip has already based minBars (opts.slowDipMinBars, default 2)
  //                  consecutive bars on the dip side of EMA9 (a slow EMA21 base, not a
  //                  one-bar dip). This is the Variant-B experiment from the quality/latency
  //                  audit. All three modes are causal per-bar and default OFF.
  const entryMode = opts.experimentSlowDipEarly ? "slowDip"
    : opts.experimentEarlyPullback ? "firstDip"
    : "reclaim";
  const slowDipMinBars = Math.max(1, opts.slowDipMinBars ?? 2);
  // Direction restriction for early entry (engine experiments only): 'both' (default),
  // 'long' or 'short'. Justified by the R1 forensics: dip SHORT entries are net positive
  // on all three symbols while dip LONG entries are negative on SOL.
  const earlySide = opts.experimentEarlySide ?? "both";
  const earlySideUpOk = earlySide === "both" || earlySide === "long";
  const earlySideDnOk = earlySide === "both" || earlySide === "short";

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

  // Volume (Phase 4)
  const volumes = candles.map(c => c.volume || 0);
  const volMA = calcSMA(volumes, p.volLookback);

  // Pre-compute rolling extremes (need [1] shift = previous bar's value)
  const swingLow = rollingLow(lows, p.swingLookback);
  const swingHigh = rollingHigh(highs, p.swingLookback);
  const lowestLowPB = rollingLow(lows, p.pullbackLookback);
  const highestHighPB = rollingHigh(highs, p.pullbackLookback);
  const highestHighBO = rollingHigh(highs, p.breakoutBars);
  const lowestLowBO = rollingLow(lows, p.breakoutBars);

  const signals = [];
  const trades = [];
  const auditRows = audit ? [] : null;

  // Position state
  let posState = 0; // 1=LONG, -1=SHORT, 0=FLAT
  let posEntry = 0, posSL = 0, posTP1 = 0, posTP2 = 0;
  let posRisk = 0, posRiskAtr = 0;
  let posBar = -1, posAge = 0;
  let posMFE = 0, posMAE = 0;
  let posDir = "";
  let posHighVol = false;
  let posExtAtr = 0, posBodyPct = 0, posEma21 = 0, posAtrVal = 0;
  let posStructSL = 0, posRR1 = 0, posRR2 = 0;
  let posTrigger = "";
  let dipAgeUp = 0; // consecutive bars closed on the dip side of EMA9 (close <= EMA9)
  let dipAgeDn = 0; // consecutive bars closed on the dip side of EMA9 (close >= EMA9)
  let runLowUp = Infinity;   // lowest low of the current BUY dip run (early-entry pierce guard)
  let runHighDn = -Infinity; // highest high of the current SELL dip run
  // Optional coarse constraints for the slowDip early mode (engine experiments only):
  //   slowDipMinPierceAtr — dip anchor must not sit more than X ATR below EMA21 at entry (default: unbounded).
  //   slowDipMaxAtrVs — entry bar ATR must not exceed X% of its 100-bar average (default: unbounded).
  const minPierce = opts.slowDipMinPierceAtr ?? -Infinity;
  const maxAtrVs = opts.slowDipMaxAtrVs ?? Infinity;
  // R1-residual guards (engine experiments only):
  //   slowDipMaxBodyAtr — entry-candle body must be <= X ATR (small-body entries win more,
  //                       cross-symbol consistent in the R1 forensics).
  //   slowDipMinCloseDir — entry candle must close >= X toward the trade side of its range
  //                        (0..1; direction-signed).
  const maxBodyAtr = opts.slowDipMaxBodyAtr ?? Infinity;
  const minCloseDir = opts.slowDipMinCloseDir ?? -1;

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

    // Dip-age episode counters + run anchors (causal; used by early-pullback entry modes only)
    if (c.close > emaTrig[i]) { dipAgeUp = 0; runLowUp = Infinity; } else { dipAgeUp++; runLowUp = Math.min(runLowUp, c.low); }
    if (c.close < emaTrig[i]) { dipAgeDn = 0; runHighDn = -Infinity; } else { dipAgeDn++; runHighDn = Math.max(runHighDn, c.high); }

    // ─── Triggers ───
    const pullbackTol = p.pullbackTolPct / 100.0;

    // [1] shift: use previous bar's rolling value
    const touchLowUp = i >= 1 && !isNaN(lowestLowPB[i - 1]) && lowestLowPB[i - 1] <= emaDir[i] * (1 + pullbackTol);
    const touchHighDn = i >= 1 && !isNaN(highestHighPB[i - 1]) && highestHighPB[i - 1] >= emaDir[i] * (1 - pullbackTol);

    const reclaimUp = c.close > emaTrig[i] && candles[i - 1].close <= emaTrig[i - 1];
    const reclaimDn = c.close < emaTrig[i] && candles[i - 1].close >= emaTrig[i - 1];

    // Early-pullback relaxation (audit experiments only, see entryMode above)
    const wantEarly = entryMode !== "reclaim";
    const baseAgeOkUp = entryMode === "slowDip" ? dipAgeUp >= slowDipMinBars : true;
    const baseAgeOkDn = entryMode === "slowDip" ? dipAgeDn >= slowDipMinBars : true;
    const pierceOkUp = (runLowUp - emaDir[i]) / Math.max(atrVal, 1e-10) >= minPierce;
    const pierceOkDn = (emaDir[i] - runHighDn) / Math.max(atrVal, 1e-10) >= minPierce;
    const atrVsOkUp = atrVsAvg <= maxAtrVs;
    const atrVsOkDn = atrVsAvg <= maxAtrVs;
    // R1-residual guards (causal, inline so they precede the closeLoc computation)
    const bodyAtrNow = c.high - c.low > 0 ? Math.abs(c.close - c.open) / Math.max(atrVal, 1e-10) : 0;
    const closeDirNow = c.high - c.low > 0 ? (c.close - c.low) / (c.high - c.low) : 0.5;
    const earlyBodyOkUp = bodyAtrNow <= maxBodyAtr;
    const earlyBodyOkDn = bodyAtrNow <= maxBodyAtr;
    const closeDirOkUp = closeDirNow >= minCloseDir;
    const closeDirOkDn = (1 - closeDirNow) >= minCloseDir;
    const earlyPbUp = wantEarly && earlySideUpOk && touchLowUp && !reclaimUp && baseAgeOkUp
      && c.close <= emaTrig[i] && (emaDir[i] - c.close) <= 1.5 * atrVal
      && pierceOkUp && atrVsOkUp && earlyBodyOkUp && closeDirOkUp;
    const earlyPbDn = wantEarly && earlySideDnOk && touchHighDn && !reclaimDn && baseAgeOkDn
      && c.close >= emaTrig[i] && (c.close - emaDir[i]) <= 1.5 * atrVal
      && pierceOkDn && atrVsOkDn && earlyBodyOkDn && closeDirOkDn;
    const pullbackUp = p.enablePullback && ((touchLowUp && reclaimUp) || earlyPbUp);
    const pullbackDn = p.enablePullback && ((touchHighDn && reclaimDn) || earlyPbDn);

    // ─── Entry quality (computed first — used by breakout, volume, and high-vol gates) ───
    const candleRange = c.high - c.low;
    const bodyPct = candleRange > 0 ? Math.abs(c.close - c.open) / candleRange * 100 : 0;
    const closeLoc = candleRange > 0 ? (c.close - c.low) / candleRange : 0.5;
    const bodyOkUp = p.minBodyPct <= 0 || (c.close > c.open && bodyPct >= p.minBodyPct);
    const bodyOkDn = p.minBodyPct <= 0 || (c.close < c.open && bodyPct >= p.minBodyPct);

    const extAtrUp = (c.close - emaDir[i]) / Math.max(atrVal, 1e-10);
    const extAtrDn = (emaDir[i] - c.close) / Math.max(atrVal, 1e-10);
    const extOkUp = p.useStrictExt ? extAtrUp <= p.maxExtAtr : true;
    const extOkDn = p.useStrictExt ? extAtrDn <= p.maxExtAtr : true;

    // ─── Volume (Phase 4) ───
    const curVol = volumes[i];
    const curVolMA = volMA[i];
    const curRelVol = curVolMA > 0 ? curVol / curVolMA : NaN;

    // ─── Breakout: ATR buffer + close location + extension filter (Phase 3) ───
    const btRangeHigh = i >= 1 ? highestHighBO[i - 1] : NaN;
    const btRangeLow = i >= 1 ? lowestLowBO[i - 1] : NaN;
    const btBufferUp = p.enableBtBuffer ? c.close > btRangeHigh + atrVal * p.breakoutBuffer : c.close > btRangeHigh;
    const btBufferDn = p.enableBtBuffer ? c.close < btRangeLow - atrVal * p.breakoutBuffer : c.close < btRangeLow;
    const btCloseOkUp = p.enableCloseLoc ? closeLoc >= p.closeLocMinLong : true;
    const btCloseOkDn = p.enableCloseLoc ? closeLoc <= p.closeLocMinShort : true;
    // Breakout extension gate — only enforced when STRICTER than the global strict gate
    // (extOkUp/extOkDn, maxExtAtr). Under defaults (useStrictExt=true, maxExtAtr=1.5 <= 2.0)
    // the strict gate implies the breakout gate, so this is a no-op (avoids double-counting
    // rejections in funnels). It still binds when useStrictExt=false or breakoutExtAtr < maxExtAtr.
    const btExtOkUp = !p.enableBtExtFilter ? true
      : (p.useStrictExt && p.breakoutExtAtr >= p.maxExtAtr) ? true
      : extAtrUp <= p.breakoutExtAtr;
    const btExtOkDn = !p.enableBtExtFilter ? true
      : (p.useStrictExt && p.breakoutExtAtr >= p.maxExtAtr) ? true
      : extAtrDn <= p.breakoutExtAtr;

    // Volume gate (Phase 4)
    const volOkBtUp = p.enableRelVol && !isNaN(curRelVol) ? curRelVol >= p.volMinBreakout : true;
    const volOkBtDn = p.enableRelVol && !isNaN(curRelVol) ? curRelVol >= p.volMinBreakout : true;
    const volOkPbUp = p.enableRelVol && !isNaN(curRelVol) ? curRelVol >= p.volMinPullback : true;
    const volOkPbDn = p.enableRelVol && !isNaN(curRelVol) ? curRelVol >= p.volMinPullback : true;

    const breakUp = p.enableBreakout && !isNaN(btRangeHigh) && btBufferUp && btCloseOkUp && btExtOkUp && volOkBtUp;
    const breakDn = p.enableBreakout && !isNaN(btRangeLow) && btBufferDn && btCloseOkDn && btExtOkDn && volOkBtDn;

    // Apply volume to pullback triggers
    const pullbackUpV = pullbackUp && volOkPbUp;
    const pullbackDnV = pullbackDn && volOkPbDn;

    const triggerUp = pullbackUpV || breakUp;
    const triggerDn = pullbackDnV || breakDn;

    // High-volatility quality gates (Phase 5)
    const hvVolOkUp = highVol && p.hvMode === "Stronger Confirmation" ? (!isNaN(curRelVol) ? curRelVol >= p.hvVolMin : false) : true;
    const hvVolOkDn = highVol && p.hvMode === "Stronger Confirmation" ? (!isNaN(curRelVol) ? curRelVol >= p.hvVolMin : false) : true;
    const hvCloseOkUp = highVol && p.hvMode === "Stronger Confirmation" ? closeLoc >= p.hvCloseLocLong : true;
    const hvCloseOkDn = highVol && p.hvMode === "Stronger Confirmation" ? closeLoc <= p.hvCloseLocShort : true;
    const hvBlock = highVol && p.hvMode === "Block";

    // ─── Risk validation ───
    const entry = c.close;
    const atrUsable = !isNaN(atrVal) && atrVal > 0;

    // [1] shift for swing levels
    const sl = i >= 1 ? swingLow[i - 1] : NaN;
    const sh = i >= 1 ? swingHigh[i - 1] : NaN;
    const structSLBuy = sl - atrVal * p.structBufferAtr;
    const structSLSell = sh + atrVal * p.structBufferAtr;

    // Apply volatility buffer: SL = structural + atrStopMult × ATR
    const slBuyRaw = structSLBuy - atrVal * p.atrStopMult;
    const slSellRaw = structSLSell + atrVal * p.atrStopMult;

    const riskStructBuy = entry - slBuyRaw;
    const slModeBuy = riskStructBuy >= p.minRiskAtr * atrVal;
    const slBuy = slModeBuy ? slBuyRaw : entry - p.atrFallbackMult * atrVal;
    const riskBuy = entry - slBuy;
    const riskAtrBuy = riskBuy / Math.max(atrVal, 1e-10);
    const riskGateBuyOk = atrUsable && slBuy < entry && riskAtrBuy <= p.maxRiskAtr;
    const tp1Buy = entry + riskBuy * p.tp1R;
    const tp2Buy = entry + riskBuy * p.tp2R;

    const riskStructSell = slSellRaw - entry;
    const slModeSell = riskStructSell >= p.minRiskAtr * atrVal;
    const slSell = slModeSell ? slSellRaw : entry + p.atrFallbackMult * atrVal;
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

      // Mid-trade break-even: after beBarThreshold bars, if profit >= +0.25R, move SL to entry
      if (p.enableMidTradeBE && posAge >= p.beBarThreshold && !slHit && !tp1Hit && !tp2Hit) {
        const midCurR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
        if (midCurR >= 0.25) {
          posSL = posEntry; // Move to break-even
        }
      }

      // Re-check SL with updated posSL
      const slHitUpdated = posState === 1 ? c.low <= posSL : c.high >= posSL;

      // Stale trade exit: if flat after staleBarLimit bars, exit at market
      let staleExit = false;
      if (posAge >= p.staleBarLimit && !slHit && !tp1Hit && !tp2Hit) {
        const staleR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
        if (staleR > -0.25 && staleR < 0.25) {
          staleExit = true;
        }
      }

      if (staleExit) {
        outcome = "STALE_EXIT";
        finalR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
      } else if (slHitUpdated && (tp1Hit || tp2Hit)) {
        outcome = "AMBIGUOUS";
        finalR = posState === 1 ? (c.close - posEntry) / Math.max(posRisk, 1e-10) : (posEntry - c.close) / Math.max(posRisk, 1e-10);
      } else if (slHitUpdated) {
        outcome = "SL FIRST";
        // If SL was moved to entry (break-even), R = 0, otherwise -1.0
        finalR = Math.abs(posSL - posEntry) < 0.01 ? 0.0 : -1.0;
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
          highVol: posHighVol,
        });

        posState = 0;
      }
    }

    // ─── New entries (AFTER tracking) ───
    const cfgOk = p.emaTrigLen < p.emaDirLen && p.emaDirLen < p.emaSlowLen && p.swingLookback >= 2 && p.tp1R > 0 && p.tp2R > p.tp1R && p.maxRiskAtr > p.minRiskAtr;

    const canEnterLong = posState === 0 || posState === -1;
    const canEnterShort = posState === 0 || posState === 1;

    // Note: the pullback-momentum gate (pbMomOk) was removed as dead code — pullbackUp/Dn
    // already require close > emaTrig (reclaimUp) / close < emaTrig (reclaimDn), so it was
    // mathematically always true.
    const entryUp = cfgOk && setupUp && triggerUp && !hvBlock && extOkUp && bodyOkUp && hvVolOkUp && hvCloseOkUp && riskGateBuyOk && canEnterLong;
    const entryDn = cfgOk && setupDn && triggerDn && !hvBlock && extOkDn && bodyOkDn && hvVolOkDn && hvCloseOkDn && riskGateSellOk && canEnterShort;

    // Fixed-risk position sizing (Phase 2)
    const equity = 10000; // Fixed for backtest
    const longPosRaw = p.enableFixedRisk && riskBuy > 0 ? equity * p.riskPerTrade / 100 / riskBuy : NaN;
    const longPosCapped = p.enableFixedRisk && !isNaN(longPosRaw) && p.maxPosSize > 0 ? Math.min(longPosRaw, p.maxPosSize) : longPosRaw;
    const longPosSize = p.enableFixedRisk && !isNaN(longPosCapped) ? Math.floor(longPosCapped * 10000) / 10000 : NaN;
    const shortPosRaw = p.enableFixedRisk && riskSell > 0 ? equity * p.riskPerTrade / 100 / riskSell : NaN;
    const shortPosCapped = p.enableFixedRisk && !isNaN(shortPosRaw) && p.maxPosSize > 0 ? Math.min(shortPosRaw, p.maxPosSize) : shortPosRaw;
    const shortPosSize = p.enableFixedRisk && !isNaN(shortPosCapped) ? Math.floor(shortPosCapped * 10000) / 10000 : NaN;

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
          highVol: posHighVol,
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
      posHighVol = highVol;
      posExtAtr = extAtrUp;
      posBodyPct = bodyPct;
      posEma21 = emaDir[i];
      posAtrVal = atrVal;
      posStructSL = structSLBuy;
      posRR1 = p.tp1R;
      posRR2 = p.tp2R;
      posTrigger = pullbackUpV ? "PULLBACK RESUME" : "BREAKOUT";

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
        relVol: curRelVol,
        closeLocation: closeLoc,
        highVol,
        posSize: longPosSize,
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
          highVol: posHighVol,
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
      posHighVol = highVol;
      posExtAtr = extAtrDn;
      posBodyPct = bodyPct;
      posEma21 = emaDir[i];
      posAtrVal = atrVal;
      posStructSL = structSLSell;
      posRR1 = p.tp1R;
      posRR2 = p.tp2R;
      posTrigger = pullbackDnV ? "PULLBACK RESUME" : "BREAKOUT";

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
        relVol: curRelVol,
        closeLocation: closeLoc,
        highVol,
        posSize: shortPosSize,
      });
    }

    // ─── Audit row (opts.audit): one compact record per processed bar ───
    if (auditRows) {
      auditRows.push({
        i: barIdx,
        t: c.timestamp,
        trending: !!trending,
        highVol: !!highVol,
        trendUp, trendDn, momUp, momDn, setupUp, setupDn,
        pullbackUp, pullbackDn,                       // raw pullback trigger (no vol gate)
        rawBOUp: p.enableBreakout && !isNaN(btRangeHigh) && c.close > btRangeHigh,
        rawBODn: p.enableBreakout && !isNaN(btRangeLow) && c.close < btRangeLow,
        btBufferUp, btBufferDn,
        btCloseOkUp, btCloseOkDn,
        btExtOkUp, btExtOkDn,                         // guarded: no-op under defaults (subsumed by strict)
        extOkUp, extOkDn,                             // strict extension gate (maxExtAtr)
        bodyOkUp, bodyOkDn,
        volOkBtUp, volOkBtDn,
        volOkPbUp, volOkPbDn,
        hvBlock,
        hvVolOkUp, hvVolOkDn,
        hvCloseOkUp, hvCloseOkDn,
        riskGateBuyOk, riskGateSellOk,
        canEnterLong, canEnterShort,
        entryUp, entryDn,
        closeLoc, relVol: curRelVol, atrVal,
      });
    }
  }

  return { signals, trades, candles, audit: auditRows };
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

export function generateReport(trades, opts = {}) {
  const riskPct = opts.riskPerTrade ?? 0.5; // % of equity risked per trade (for account % DD)
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

  // Max drawdown — proper peak-to-trough on cumulative R (fixed-fractional: each
  // closed trade contributes finalR; account % version compounds the equity curve).
  let cumR = 0, peakR = 0, maxDDR = 0;
  let cumPct = 0, peakPct = 0, maxDDPct = 0; // equity% uses compounding of (1 + R * riskPct/100)
  for (const t of closed) {
    cumR += t.finalR;
    if (cumR > peakR) peakR = cumR;
    maxDDR = Math.max(maxDDR, peakR - cumR);

    cumPct = (1 + cumPct / 100) * (1 + t.finalR * riskPct / 100) * 100 - 100;
    if (cumPct > peakPct) peakPct = cumPct;
    maxDDPct = Math.max(maxDDPct, peakPct - cumPct);
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
    maxDrawdownR: maxDDR,
    maxDrawdownPct: maxDDPct,
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
