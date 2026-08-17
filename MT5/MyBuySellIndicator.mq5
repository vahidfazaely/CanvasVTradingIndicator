//+------------------------------------------------------------------+
//|                                      MyBuySellIndicator.mq5       |
//|                         H4 Trend + M15 Entry System              |
//|                              Phase 2 (v2.00)                     |
//|   ATR risk levels | ADX filter | H4 slope | scoring | panel      |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026"
#property version   "2.00"
#property indicator_chart_window

//--- 6 buffers:
//--- 0 = H4 EMA 50
//--- 1 = H4 EMA 200
//--- 2 = M15 EMA 9
//--- 3 = M15 EMA 21
//--- 4 = BUY
//--- 5 = SELL
#property indicator_buffers 6
#property indicator_plots   6

//--- H4 EMA 50
#property indicator_label1  "H4 EMA 50"
#property indicator_type1   DRAW_LINE
#property indicator_color1  clrDodgerBlue
#property indicator_style1  STYLE_SOLID
#property indicator_width1  1

//--- H4 EMA 200
#property indicator_label2  "H4 EMA 200"
#property indicator_type2   DRAW_LINE
#property indicator_color2  clrOrange
#property indicator_style2  STYLE_SOLID
#property indicator_width2  2

//--- M15 EMA 9
#property indicator_label3  "M15 EMA 9"
#property indicator_type3   DRAW_LINE
#property indicator_color3  clrLimeGreen
#property indicator_style3  STYLE_SOLID
#property indicator_width3  1

//--- M15 EMA 21
#property indicator_label4  "M15 EMA 21"
#property indicator_type4   DRAW_LINE
#property indicator_color4  clrMagenta
#property indicator_style4  STYLE_SOLID
#property indicator_width4  1

//--- BUY arrows
#property indicator_label5  "BUY"
#property indicator_type5   DRAW_ARROW
#property indicator_color5  clrLime
#property indicator_width5  3

//--- SELL arrows
#property indicator_label6  "SELL"
#property indicator_type6   DRAW_ARROW
#property indicator_color6  clrRed
#property indicator_width6  3


//+------------------------------------------------------------------+
//| Inputs                                                           |
//+------------------------------------------------------------------+
input group "=== Trend ==="
input int    H4_EMA_Fast        = 50;      // H4 EMA Fast
input int    H4_EMA_Slow        = 200;     // H4 EMA Slow
input bool   EnableH4SlopeFilter = true;   // EnableH4SlopeFilter (EMA 50 must not oppose direction)

input group "=== Entry ==="
input int    M15_EMA_Fast       = 9;       // M15 EMA Fast
input int    M15_EMA_Slow       = 21;      // M15 EMA Slow

input group "=== ADX Filter ==="
input bool   EnableADXFilter    = true;    // EnableADXFilter
input int    ADX_Period         = 14;      // ADX Period
input double ADX_Minimum        = 20.0;    // ADX Minimum

input group "=== Risk Management ==="
input int    ATR_Period         = 14;      // ATR Period
input double ATR_SL_Multiplier  = 1.5;     // ATR SL Multiplier
input double ATR_TP1_Multiplier = 1.5;     // ATR TP1 Multiplier
input double ATR_TP2_Multiplier = 3.0;     // ATR TP2 Multiplier

input group "=== Signal ==="
input int    MinimumSignalScore = 75;      // MinimumSignalScore (0-100)

input group "=== Alerts ==="
input bool   EnableAlerts       = false;   // EnableAlerts


//+------------------------------------------------------------------+
//| Indicator buffers                                                |
//+------------------------------------------------------------------+
double H4EMA50Buffer[];
double H4EMA200Buffer[];

double M15EMA9Buffer[];
double M15EMA21Buffer[];

double BuyBuffer[];
double SellBuffer[];


//+------------------------------------------------------------------+
//| Indicator handles                                                |
//+------------------------------------------------------------------+
int H4EMA50Handle  = INVALID_HANDLE;
int H4EMA200Handle = INVALID_HANDLE;

int M15EMA9Handle  = INVALID_HANDLE;
int M15EMA21Handle = INVALID_HANDLE;

int ADXHandle      = INVALID_HANDLE;
int ATRHandle      = INVALID_HANDLE;


//+------------------------------------------------------------------+
//| Signal / panel state (globals)                                   |
//+------------------------------------------------------------------+
datetime lastAlertTime      = 0;   // last bar that fired an alert (deduplication)
datetime gLastSignalTime    = 0;   // bar time of the latest confirmed signal
datetime gDrawnSignalTime   = 0;   // bar time of the levels currently drawn
int      gLastSignalDir     = 0;   // +1 = BUY, -1 = SELL, 0 = none
int      gLastScore         = 0;   // score of the latest confirmed signal
double   gEntry = 0, gSL = 0, gTP1 = 0, gTP2 = 0;   // latest confirmed signal levels
string   gPanelText         = "";  // last rendered panel text


//+------------------------------------------------------------------+
//| Initialization                                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   //--- ENFORCE M15 timeframe: this system is designed for M15 entry signals
   if(_Period != PERIOD_M15)
   {
      Print("MyBuySellIndicator: ERROR - this indicator must be attached to an M15 chart.");
      Print("MyBuySellIndicator: Current timeframe is ", EnumToString(_Period), ". Initialization aborted.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   //--- Validate H4 EMA periods: Fast must be smaller than Slow
   if(H4_EMA_Fast <= 0 || H4_EMA_Slow <= 0 || H4_EMA_Fast >= H4_EMA_Slow)
   {
      Print("MyBuySellIndicator: ERROR - H4_EMA_Fast (", H4_EMA_Fast,
            ") must be smaller than H4_EMA_Slow (", H4_EMA_Slow, "). Initialization aborted.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   //--- Validate M15 EMA periods: Fast must be smaller than Slow
   if(M15_EMA_Fast <= 0 || M15_EMA_Slow <= 0 || M15_EMA_Fast >= M15_EMA_Slow)
   {
      Print("MyBuySellIndicator: ERROR - M15_EMA_Fast (", M15_EMA_Fast,
            ") must be smaller than M15_EMA_Slow (", M15_EMA_Slow, "). Initialization aborted.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   //--- Validate ADX inputs
   if(ADX_Period <= 0)
   {
      Print("MyBuySellIndicator: ERROR - ADX_Period (", ADX_Period, ") must be greater than 0. Initialization aborted.");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(ADX_Minimum < 0.0 || ADX_Minimum > 100.0)
   {
      Print("MyBuySellIndicator: ERROR - ADX_Minimum (", ADX_Minimum, ") must be between 0 and 100. Initialization aborted.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   //--- Validate ATR inputs
   if(ATR_Period <= 0)
   {
      Print("MyBuySellIndicator: ERROR - ATR_Period (", ATR_Period, ") must be greater than 0. Initialization aborted.");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(ATR_SL_Multiplier <= 0.0 || ATR_TP1_Multiplier <= 0.0 || ATR_TP2_Multiplier <= 0.0)
   {
      Print("MyBuySellIndicator: ERROR - ATR multipliers must be greater than 0. Initialization aborted.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   //--- Validate signal score
   if(MinimumSignalScore < 0 || MinimumSignalScore > 100)
   {
      Print("MyBuySellIndicator: ERROR - MinimumSignalScore (", MinimumSignalScore, ") must be between 0 and 100. Initialization aborted.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   //--- Reset all state
   lastAlertTime    = 0;
   gLastSignalTime  = 0;
   gDrawnSignalTime = 0;
   gLastSignalDir   = 0;
   gLastScore       = 0;
   gEntry = gSL = gTP1 = gTP2 = 0;
   gPanelText       = "";

   //--- Connect indicator buffers
   SetIndexBuffer(0, H4EMA50Buffer,  INDICATOR_DATA);
   SetIndexBuffer(1, H4EMA200Buffer, INDICATOR_DATA);

   SetIndexBuffer(2, M15EMA9Buffer,  INDICATOR_DATA);
   SetIndexBuffer(3, M15EMA21Buffer, INDICATOR_DATA);

   SetIndexBuffer(4, BuyBuffer,      INDICATOR_DATA);
   SetIndexBuffer(5, SellBuffer,     INDICATOR_DATA);

   //--- Arrow symbols
   PlotIndexSetInteger(4, PLOT_ARROW, 233);
   PlotIndexSetInteger(5, PLOT_ARROW, 234);

   //--- Empty values
   PlotIndexSetDouble(4, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetDouble(5, PLOT_EMPTY_VALUE, EMPTY_VALUE);

   //--- Do not draw EMAs before enough data exists
   PlotIndexSetInteger(0, PLOT_DRAW_BEGIN, H4_EMA_Slow);
   PlotIndexSetInteger(1, PLOT_DRAW_BEGIN, H4_EMA_Slow);

   PlotIndexSetInteger(2, PLOT_DRAW_BEGIN, M15_EMA_Slow);
   PlotIndexSetInteger(3, PLOT_DRAW_BEGIN, M15_EMA_Slow);

   //--- Create H4 EMA handles
   H4EMA50Handle = iMA(
      _Symbol,
      PERIOD_H4,
      H4_EMA_Fast,
      0,
      MODE_EMA,
      PRICE_CLOSE
   );

   H4EMA200Handle = iMA(
      _Symbol,
      PERIOD_H4,
      H4_EMA_Slow,
      0,
      MODE_EMA,
      PRICE_CLOSE
   );

   //--- Create M15 EMA handles
   M15EMA9Handle = iMA(
      _Symbol,
      PERIOD_M15,
      M15_EMA_Fast,
      0,
      MODE_EMA,
      PRICE_CLOSE
   );

   M15EMA21Handle = iMA(
      _Symbol,
      PERIOD_M15,
      M15_EMA_Slow,
      0,
      MODE_EMA,
      PRICE_CLOSE
   );

   //--- Create ADX and ATR handles (M15, closed candles only)
   ADXHandle = iADX(
      _Symbol,
      PERIOD_M15,
      ADX_Period
   );

   ATRHandle = iATR(
      _Symbol,
      PERIOD_M15,
      ATR_Period
   );

   //--- Check handles
   if(H4EMA50Handle == INVALID_HANDLE)
   {
      Print("ERROR: Could not create H4 EMA 50 handle.");
      return(INIT_FAILED);
   }

   if(H4EMA200Handle == INVALID_HANDLE)
   {
      Print("ERROR: Could not create H4 EMA 200 handle.");
      return(INIT_FAILED);
   }

   if(M15EMA9Handle == INVALID_HANDLE)
   {
      Print("ERROR: Could not create M15 EMA 9 handle.");
      return(INIT_FAILED);
   }

   if(M15EMA21Handle == INVALID_HANDLE)
   {
      Print("ERROR: Could not create M15 EMA 21 handle.");
      return(INIT_FAILED);
   }

   if(ADXHandle == INVALID_HANDLE)
   {
      Print("ERROR: Could not create ADX handle.");
      return(INIT_FAILED);
   }

   if(ATRHandle == INVALID_HANDLE)
   {
      Print("ERROR: Could not create ATR handle.");
      return(INIT_FAILED);
   }

   //--- Indicator name
   IndicatorSetString(
      INDICATOR_SHORTNAME,
      "My Buy/Sell Scalper - H4 + M15 (Phase 2)"
   );

   return(INIT_SUCCEEDED);
}


//+------------------------------------------------------------------+
//| Deinitialization                                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   //--- Release all indicator handles
   if(H4EMA50Handle != INVALID_HANDLE)
      IndicatorRelease(H4EMA50Handle);

   if(H4EMA200Handle != INVALID_HANDLE)
      IndicatorRelease(H4EMA200Handle);

   if(M15EMA9Handle != INVALID_HANDLE)
      IndicatorRelease(M15EMA9Handle);

   if(M15EMA21Handle != INVALID_HANDLE)
      IndicatorRelease(M15EMA21Handle);

   if(ADXHandle != INVALID_HANDLE)
      IndicatorRelease(ADXHandle);

   if(ATRHandle != INVALID_HANDLE)
      IndicatorRelease(ATRHandle);

   //--- Remove all chart objects created by this indicator
   ObjectsDeleteAll(0, "MyBS_");
}


//+------------------------------------------------------------------+
//| Main calculation                                                 |
//+------------------------------------------------------------------+
int OnCalculate(
   const int rates_total,
   const int prev_calculated,
   const datetime &time[],
   const double &open[],
   const double &high[],
   const double &low[],
   const double &close[],
   const long &tick_volume[],
   const long &volume[],
   const int &spread[]
)
{
   //--- Need enough M15 candles
   if(rates_total < M15_EMA_Slow + 10)
      return(0);

   //--- Make arrays chronological:
   //--- index 0 = oldest
   //--- index rates_total-1 = newest
   ArraySetAsSeries(time,  false);
   ArraySetAsSeries(open,  false);
   ArraySetAsSeries(high,  false);
   ArraySetAsSeries(low,   false);
   ArraySetAsSeries(close, false);

   //--- Number of H4 bars
   int h4Bars = Bars(_Symbol, PERIOD_H4);

   if(h4Bars < H4_EMA_Slow + 10)
      return(0);

   //--- Temporary arrays for indicator values
   static double h4Fast[];
   static double h4Slow[];

   static double m15Fast[];
   static double m15Slow[];

   static double adxArr[];
   static double atrArr[];

   ArrayResize(h4Fast, h4Bars);
   ArrayResize(h4Slow, h4Bars);

   ArrayResize(m15Fast, rates_total);
   ArrayResize(m15Slow, rates_total);

   ArrayResize(adxArr, rates_total);
   ArrayResize(atrArr, rates_total);

   //--- Copy H4 EMA data
   int copiedH4Fast = CopyBuffer(
      H4EMA50Handle,
      0,
      0,
      h4Bars,
      h4Fast
   );

   int copiedH4Slow = CopyBuffer(
      H4EMA200Handle,
      0,
      0,
      h4Bars,
      h4Slow
   );

   //--- Copy M15 EMA data
   int copiedM15Fast = CopyBuffer(
      M15EMA9Handle,
      0,
      0,
      rates_total,
      m15Fast
   );

   int copiedM15Slow = CopyBuffer(
      M15EMA21Handle,
      0,
      0,
      rates_total,
      m15Slow
   );

   //--- Copy ADX and ATR data (M15)
   int copiedADX = CopyBuffer(
      ADXHandle,
      0,
      0,
      rates_total,
      adxArr
   );

   int copiedATR = CopyBuffer(
      ATRHandle,
      0,
      0,
      rates_total,
      atrArr
   );

   //--- Make sure data exists
   if(copiedH4Fast <= 0 ||
      copiedH4Slow <= 0 ||
      copiedM15Fast <= 0 ||
      copiedM15Slow <= 0 ||
      copiedADX <= 0 ||
      copiedATR <= 0)
   {
      return(prev_calculated);
   }

   //--- Number of bars with confirmed data on each timeframe.
   //--- Never index beyond these limits (prevents phantom values).
   int h4Available  = MathMin(copiedH4Fast,  copiedH4Slow);
   int m15Available = MathMin(copiedM15Fast, copiedM15Slow);

   //--- Start calculation (windowed recalculation, not the full history)
   int start = 0;

   if(prev_calculated > 0)
      start = prev_calculated - 2;

   if(start < 0)
      start = 0;

   //--- Index of the newest (still forming) bar
   int lastBar = rates_total - 1;

   //--- Alerts only during LIVE calculation.
   //--- On the very first call (prev_calculated == 0) all signals are historical.
   bool liveCalculation = (prev_calculated > 0);

   //--- Clear / calculate
   for(int i = start; i < rates_total; i++)
   {
      //--- Default values
      H4EMA50Buffer[i]  = EMPTY_VALUE;
      H4EMA200Buffer[i] = EMPTY_VALUE;

      M15EMA9Buffer[i]  = EMPTY_VALUE;
      M15EMA21Buffer[i] = EMPTY_VALUE;

      BuyBuffer[i]  = EMPTY_VALUE;
      SellBuffer[i] = EMPTY_VALUE;

      //--- M15 EMA display values
      if(i < m15Available)
      {
         M15EMA9Buffer[i]  = m15Fast[i];
         M15EMA21Buffer[i] = m15Slow[i];
      }

      //--- Find corresponding H4 candle
      int h4Shift = iBarShift(
         _Symbol,
         PERIOD_H4,
         time[i],
         false
      );

      if(h4Shift < 0)
         continue;

      //--- Convert series shift to chronological array index
      int h4Index = h4Bars - 1 - h4Shift;

      //--- Use one CLOSED H4 candle for the trend/slope.
      //--- This prevents the current H4 candle from changing the trend.
      int closedH4Shift = h4Shift + 1;

      if(closedH4Shift >= h4Bars)
         continue;

      int closedH4Index = h4Bars - 1 - closedH4Shift;

      //--- Display H4 EMA values
      if(h4Index >= 0 &&
         h4Index < h4Available)
      {
         H4EMA50Buffer[i]  = h4Fast[h4Index];
         H4EMA200Buffer[i] = h4Slow[h4Index];
      }

      //--- Only generate signals on CLOSED M15 candles.
      //--- The newest candle is still forming.
      if(i < 1 || i >= lastBar)
         continue;

      //--- Confirm the copied M15 EMA data is valid for BOTH bar i and bar i-1.
      if(i >= m15Available)
         continue;

      //--- Confirm ADX / ATR data is valid for the closed bar i.
      if(i >= copiedADX || i >= copiedATR)
         continue;

      //--- Need valid CLOSED H4 data for the trend AND the slope.
      //--- The slope needs the previous closed H4 candle (closedH4Index - 1).
      if(closedH4Index < 1 ||
         closedH4Index >= h4Available)
         continue;

      //==============================================================
      // H4 TREND  (Phase 1 logic unchanged)
      //==============================================================

      bool h4Bullish =
         h4Fast[closedH4Index] >
         h4Slow[closedH4Index];

      bool h4Bearish =
         h4Fast[closedH4Index] <
         h4Slow[closedH4Index];


      //==============================================================
      // H4 EMA 50 SLOPE  (closed H4 candles only)
      //==============================================================

      //--- BUY: EMA 50 must NOT be falling. SELL: EMA 50 must NOT be rising.
      bool h4EMA50Rising  = (h4Fast[closedH4Index] >= h4Fast[closedH4Index - 1]);
      bool h4EMA50Falling = (h4Fast[closedH4Index] <= h4Fast[closedH4Index - 1]);


      //==============================================================
      // M15 MOMENTUM  (Phase 1 logic unchanged)
      //==============================================================

      double currentFast = m15Fast[i];
      double currentSlow = m15Slow[i];

      double previousFast = m15Fast[i - 1];
      double previousSlow = m15Slow[i - 1];


      //==============================================================
      // BUY CROSS  (Phase 1 logic unchanged)
      //==============================================================

      bool bullishCross =
         previousFast <= previousSlow &&
         currentFast  >  currentSlow;


      //==============================================================
      // SELL CROSS  (Phase 1 logic unchanged)
      //==============================================================

      bool bearishCross =
         previousFast >= previousSlow &&
         currentFast  <  currentSlow;


      //==============================================================
      // ADX  (closed M15 candle only)
      //==============================================================

      double adxValue = adxArr[i];
      bool   adxPass  = (adxValue >= ADX_Minimum);


      //==============================================================
      // ATR  (closed M15 signal candle only)
      //==============================================================

      double atrValue = atrArr[i];


      //==============================================================
      // BUY SIGNAL
      //==============================================================

      if(h4Bullish && bullishCross)
      {
         //--- Signal score: +25 per satisfied component
         int score = 0;

         if(h4Bullish)                      score += 25;   // H4 trend agrees
         if(bullishCross)                   score += 25;   // M15 crossover agrees
         if(EnableADXFilter && adxPass)     score += 25;   // ADX passes minimum
         if(EnableH4SlopeFilter && h4EMA50Rising) score += 25; // H4 slope agrees

         if(score >= MinimumSignalScore)
         {
            double candleRange = high[i] - low[i];

            if(candleRange <= 0)
               candleRange = _Point * 20;

            double entry = close[i];
            double sl    = entry - atrValue * ATR_SL_Multiplier;
            double tp1   = entry + atrValue * ATR_TP1_Multiplier;
            double tp2   = entry + atrValue * ATR_TP2_Multiplier;

            //--- Arrow slightly outside the signal candle
            BuyBuffer[i] = low[i] - candleRange * 0.45;

            //--- Remember the latest confirmed signal
            gLastSignalTime = time[i];
            gLastSignalDir  = +1;
            gLastScore      = score;
            gEntry = entry;
            gSL    = sl;
            gTP1   = tp1;
            gTP2   = tp2;

            //--- Alert once per NEW confirmed live signal
            if(liveCalculation && EnableAlerts &&
               (i >= rates_total - 3) &&
               time[i] != lastAlertTime)
            {
               lastAlertTime = time[i];
               DoAlert("BUY", score, entry, sl, tp1, tp2);
            }
         }
      }


      //==============================================================
      // SELL SIGNAL
      //==============================================================

      if(h4Bearish && bearishCross)
      {
         //--- Signal score: +25 per satisfied component
         int score = 0;

         if(h4Bearish)                      score += 25;   // H4 trend agrees
         if(bearishCross)                   score += 25;   // M15 crossover agrees
         if(EnableADXFilter && adxPass)     score += 25;   // ADX passes minimum
         if(EnableH4SlopeFilter && h4EMA50Falling) score += 25; // H4 slope agrees

         if(score >= MinimumSignalScore)
         {
            double candleRange = high[i] - low[i];

            if(candleRange <= 0)
               candleRange = _Point * 20;

            double entry = close[i];
            double sl    = entry + atrValue * ATR_SL_Multiplier;
            double tp1   = entry - atrValue * ATR_TP1_Multiplier;
            double tp2   = entry - atrValue * ATR_TP2_Multiplier;

            //--- Arrow slightly outside the signal candle
            SellBuffer[i] = high[i] + candleRange * 0.45;

            //--- Remember the latest confirmed signal
            gLastSignalTime = time[i];
            gLastSignalDir  = -1;
            gLastScore      = score;
            gEntry = entry;
            gSL    = sl;
            gTP1   = tp1;
            gTP2   = tp2;

            //--- Alert once per NEW confirmed live signal
            if(liveCalculation && EnableAlerts &&
               (i >= rates_total - 3) &&
               time[i] != lastAlertTime)
            {
               lastAlertTime = time[i];
               DoAlert("SELL", score, entry, sl, tp1, tp2);
            }
         }
      }
   }

   //--- Draw SL/TP levels of the latest confirmed signal (only when it changes)
   if(gLastSignalTime != 0 && gLastSignalTime != gDrawnSignalTime)
   {
      gDrawnSignalTime = gLastSignalTime;
      DrawSignalLevels(gLastSignalTime, gEntry, gSL, gTP1, gTP2);
   }

   //--- Refresh the information panel (last CLOSED M15 bar only)
   RefreshPanel(time, rates_total, m15Available, copiedADX, h4Bars, h4Available,
                m15Fast, m15Slow, adxArr, h4Fast, h4Slow);

   return(rates_total);
}


//+------------------------------------------------------------------+
//| Fire a BUY/SELL alert                                            |
//+------------------------------------------------------------------+
void DoAlert(const string direction, const int score,
             const double entry, const double sl,
             const double tp1, const double tp2)
{
   string msg = StringFormat(
      "%s M15: %s signal | Score: %d | Entry: %s | SL: %s | TP1: %s | TP2: %s",
      _Symbol,
      direction,
      score,
      DoubleToString(entry, _Digits),
      DoubleToString(sl, _Digits),
      DoubleToString(tp1, _Digits),
      DoubleToString(tp2, _Digits)
   );

   Alert(msg);
}


//+------------------------------------------------------------------+
//| Draw ENTRY / SL / TP1 / TP2 levels (latest signal only)          |
//+------------------------------------------------------------------+
void DrawSignalLevels(const datetime sigTime,
                      const double entry, const double sl,
                      const double tp1, const double tp2)
{
   DrawLevel("MyBS_Entry", sigTime, entry, "ENTRY", clrDodgerBlue, 2);
   DrawLevel("MyBS_SL",    sigTime, sl,    "SL",    clrTomato,    2);
   DrawLevel("MyBS_TP1",   sigTime, tp1,   "TP1",   clrLimeGreen, 1);
   DrawLevel("MyBS_TP2",   sigTime, tp2,   "TP2",   clrGreen,     1);
}

//+------------------------------------------------------------------+
//| Create or move one horizontal level (ray) with a label           |
//+------------------------------------------------------------------+
void DrawLevel(const string name, const datetime t,
               const double price, const string label,
               const color clr, const int width)
{
   //--- Recreate the level each time it moves (simple, fully portable)
   ObjectDelete(0, name);

   //--- Anchor points are passed directly at creation (no property enums needed)
   ObjectCreate(0, name, OBJ_TREND, 0, t, price, t + 3600, price);

   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, true);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, width);
   ObjectSetString(0, name, OBJPROP_TEXT, label + " " + DoubleToString(price, _Digits));
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}


//+------------------------------------------------------------------+
//| Refresh the info panel in the upper-right corner                 |
//+------------------------------------------------------------------+
void RefreshPanel(const datetime &time[],
                  const int rates_total,
                  const int m15Available,
                  const int adxAvailable,
                  const int h4Bars,
                  const int h4Available,
                  const double &m15Fast[],
                  const double &m15Slow[],
                  const double &adxArr[],
                  const double &h4Fast[],
                  const double &h4Slow[])
{
   //--- Panel state must use only CLOSED candles
   int lb = rates_total - 2;                 // last CLOSED M15 bar

   if(lb < 1 || lb >= m15Available || lb >= adxAvailable)
      return;

   string h4Trend  = "NEUTRAL";
   string momentum = "NEUTRAL";

   //--- H4 trend from the last CLOSED H4 candle
   int h4ShiftP = iBarShift(_Symbol, PERIOD_H4, time[lb], false);

   if(h4ShiftP >= 0 && (h4ShiftP + 1) < h4Bars)
   {
      int cIdx = h4Bars - 1 - (h4ShiftP + 1);

      if(cIdx >= 0 && cIdx < h4Available)
      {
         if(h4Fast[cIdx] > h4Slow[cIdx])
            h4Trend = "BULLISH";
         else if(h4Fast[cIdx] < h4Slow[cIdx])
            h4Trend = "BEARISH";
      }
   }

   //--- M15 momentum on the last CLOSED M15 bar
   if(m15Fast[lb] > m15Slow[lb])
      momentum = "BULLISH";
   else if(m15Fast[lb] < m15Slow[lb])
      momentum = "BEARISH";

   string dirText = (gLastSignalDir > 0) ? "BUY" :
                    (gLastSignalDir < 0) ? "SELL" : "NONE";

   string panel = StringFormat(
      "MyIndicator\n"
      "H4 Trend: %s\n"
      "M15 Momentum: %s\n"
      "ADX: %.1f\n"
      "Signal Score: %d\n"
      "Last Signal: %s",
      h4Trend,
      momentum,
      adxArr[lb],
      gLastScore,
      dirText
   );

   //--- Show levels only when a confirmed signal exists
   if(gLastSignalTime != 0)
   {
      panel += StringFormat(
         "\nEntry: %s\nSL: %s\nTP1: %s\nTP2: %s",
         DoubleToString(gEntry, _Digits),
         DoubleToString(gSL, _Digits),
         DoubleToString(gTP1, _Digits),
         DoubleToString(gTP2, _Digits)
      );
   }

   //--- Touch the chart only when the text actually changed
   if(panel != gPanelText)
   {
      gPanelText = panel;
      CreatePanel(panel);
   }
}


//+------------------------------------------------------------------+
//| Create/update the background box + multi-line text label         |
//+------------------------------------------------------------------+
void CreatePanel(const string text)
{
   const string bgName = "MyBS_PanelBg";
   const string txName = "MyBS_PanelText";

   //--- Background rectangle (upper-right corner)
   if(ObjectFind(0, bgName) < 0)
   {
      ObjectCreate(0, bgName, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, bgName, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
      ObjectSetInteger(0, bgName, OBJPROP_XDISTANCE, 12);
      ObjectSetInteger(0, bgName, OBJPROP_YDISTANCE, 12);
      ObjectSetInteger(0, bgName, OBJPROP_XSIZE, 190);
      ObjectSetInteger(0, bgName, OBJPROP_YSIZE, 160);
      ObjectSetInteger(0, bgName, OBJPROP_BGCOLOR, C'26,26,32');
      ObjectSetInteger(0, bgName, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, bgName, OBJPROP_COLOR, clrDimGray);
      ObjectSetInteger(0, bgName, OBJPROP_BACK, false);
      ObjectSetInteger(0, bgName, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, bgName, OBJPROP_HIDDEN, true);
   }

   //--- Multi-line text label
   if(ObjectFind(0, txName) < 0)
   {
      ObjectCreate(0, txName, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, txName, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
      ObjectSetInteger(0, txName, OBJPROP_XDISTANCE, 22);
      ObjectSetInteger(0, txName, OBJPROP_YDISTANCE, 20);
      ObjectSetString(0, txName, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, txName, OBJPROP_FONTSIZE, 9);
      ObjectSetInteger(0, txName, OBJPROP_COLOR, clrSilver);
      ObjectSetInteger(0, txName, OBJPROP_BACK, false);
      ObjectSetInteger(0, txName, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, txName, OBJPROP_HIDDEN, true);
   }

   ObjectSetString(0, txName, OBJPROP_TEXT, text);

   //--- Fit the background box to the number of lines
   string lines[];
   int lineCount = StringSplit(text, '\n', lines);

   if(lineCount > 0)
      ObjectSetInteger(0, bgName, OBJPROP_YSIZE, 10 + lineCount * 15 + 6);
}
//+------------------------------------------------------------------+
