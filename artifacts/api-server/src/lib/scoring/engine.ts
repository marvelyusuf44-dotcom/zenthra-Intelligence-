// lib/scoring/engine.ts
//
// Port dari generate_signal() di signal_handler.py — TAPI dipisah total dari
// network fetching (aiohttp) dan Telegram. Fungsi di sini nerima candle data
// yang sudah di-fetch dari luar (lihat lib/binance.ts + app/api/signals/route.ts)
// dan murni melakukan kalkulasi + keputusan sinyal.
//
// Tidak ada fetch(), tidak ada Telegram Bot API, tidak ada file/database I/O.

import { calcAdx, calcAtr, calcMacdHistogram, calcWilliamsR, emaList } from './indicators';
import { analyzeSmc, calcSmcScore } from './smc';
import {
  Candles,
  DEFAULT_ENGINE_CONFIG,
  Direction,
  EngineConfig,
  ScoreBreakdown,
  SignalResult,
} from './types';

/** Jumlah desimal wajar buat format harga, tergantung magnitude harga. Sama seperti `dc` di Python. */
export function getDecimalPlaces(price: number): number {
  if (price >= 1000) return 1;
  if (price >= 100) return 2;
  if (price >= 10) return 3;
  if (price >= 1) return 4;
  if (price >= 0.1) return 5;
  return 6;
}

function structureUp(vals: number[]): boolean {
  let steps = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] > vals[i - 1]) steps++;
  return steps >= vals.length - 2;
}

function structureDown(vals: number[]): boolean {
  let steps = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] < vals[i - 1]) steps++;
  return steps >= vals.length - 2;
}

/**
 * Konfirmasi trend timeframe lebih tinggi (1H / 4H).
 * Sama seperti blok "1H Trend Filter" / "4H Trend Filter" di Python.
 */
function higherTimeframeConfirms(
  candles: Candles,
  direction: Direction,
  requireAdx?: number
): boolean {
  const { close: c, high: h, low: l } = candles;
  if (c.length < 60) return true; // data gak cukup → jangan block (sama seperti Python: `if dataXh:`)

  const e9 = emaList(c, 9)[c.length - 1];
  const e21 = emaList(c, 21)[c.length - 1];
  const e50 = emaList(c, 50)[c.length - 1];
  const hist = calcMacdHistogram(c);
  const { adx, pdi, mdi } = calcAdx(h, l, c);

  if (requireAdx !== undefined && adx < requireAdx) return false;

  if (direction === 'LONG') {
    // 1H pakai e9 vs e21, 4H pakai e21 vs e50 — persis seperti Python (dua timeframe beda pasangan EMA)
    return requireAdx !== undefined
      ? e21 > e50 && hist[hist.length - 1] > 0
      : e9 > e21 && hist[hist.length - 1] > 0 && pdi > mdi;
  } else {
    return requireAdx !== undefined
      ? e21 < e50 && hist[hist.length - 1] < 0
      : e9 < e21 && hist[hist.length - 1] < 0 && mdi > pdi;
  }
}

/**
 * Fungsi utama scoring engine — pure, deterministic (kecuali pemilihan leverage
 * yang pakai random, bisa di-override lewat parameter `rng` untuk testing).
 *
 * @param symbol         simbol pair, misal "BTCUSDT"
 * @param candles15m     candle 15m, minimal ~150 bar (dipakai buat semua indikator + SMC)
 * @param candles1h      candle 1h opsional, buat konfirmasi trend jangka menengah
 * @param candles4h      candle 4h opsional, buat konfirmasi trend jangka panjang
 * @param config         override threshold, default sama persis dengan bot Python
 * @param rng            random generator untuk pemilihan leverage (default Math.random)
 */
export function generateSignalFromCandles(
  symbol: string,
  candles15m: Candles,
  candles1h?: Candles,
  candles4h?: Candles,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
  rng: () => number = Math.random
): SignalResult | null {
  const { open: o, high: h, low: l, close: c, volume: v } = candles15m;
  if (c.length < 60) return null;

  const price = c[c.length - 1];
  let atr = calcAtr(h, l, c, config.atrPeriod);
  if (atr === 0) atr = price * 0.01;

  // ATR Volatility Filter — skip market yang "tidur"
  const atrPct = (atr / price) * 100;
  if (atrPct < config.atrMinPct) return null;

  // === SMC Analysis ===
  const smc = analyzeSmc(o, c, h, l, v);

  // === EMA ===
  const e9List = emaList(c, 9);
  const e21List = emaList(c, 21);
  const e50List = emaList(c, 50);
  const e9 = e9List[e9List.length - 1];
  const e21 = e21List[e21List.length - 1];
  const e50 = e50List[e50List.length - 1];

  const hist = calcMacdHistogram(c);
  const wr = calcWilliamsR(h, l, c);
  const { adx: adxVal, pdi, mdi } = calcAdx(h, l, c);

  const avgVol = v.length >= 20 ? v.slice(-20).reduce((a, b) => a + b, 0) / 20 : 1;

  if (adxVal < config.adxMinFilter) return null;

  // Divergence check — harga vs MACD histogram gak searah (sinyal reversal)
  const divLookback = 10;
  let bullishDivergence = false;
  let bearishDivergence = false;
  if (c.length > divLookback && hist.length > divLookback) {
    const priceDelta = c[c.length - 1] - c[c.length - 1 - divLookback];
    const histDelta = hist[hist.length - 1] - hist[hist.length - 1 - divLookback];
    bullishDivergence = priceDelta < 0 && histDelta > 0;
    bearishDivergence = priceDelta > 0 && histDelta < 0;
  }

  // Price structure 5 candle terakhir, toleransi 1 penyimpangan
  const hl3 = l.length >= 5 ? structureUp(l.slice(-5)) : false;
  const lh3 = h.length >= 5 ? structureDown(h.slice(-5)) : false;

  // MACD momentum baru dalam 3 candle terakhir (lebih toleran dari strict candle terakhir)
  const macdFreshBull =
    hist.length >= 4 &&
    Array.from({ length: 3 }, (_, k) => hist.length - 3 + k)
      .filter((i) => i >= 1)
      .some((i) => hist[i - 1] < 0 && hist[i] > 0);
  const macdFreshBear =
    hist.length >= 4 &&
    Array.from({ length: 3 }, (_, k) => hist.length - 3 + k)
      .filter((i) => i >= 1)
      .some((i) => hist[i - 1] > 0 && hist[i] < 0);

  const longConditions: Record<string, boolean> = {
    emaShortUptrend: e9 > e21,
    macdBullishNow: hist[hist.length - 1] > 0,
    macdFreshOrStrengthening: macdFreshBull || hist[hist.length - 1] > hist[hist.length - 2],
    notOverbought: wr[wr.length - 1] < -55,
    volumeConfirm: v[v.length - 1] > avgVol * 1.1,
    adxDirectionalBullish: pdi > mdi,
    higherLowStructure: hl3,
    trendStrong: adxVal > config.adxMinScored,
    bullishDivergence,
  };
  const shortConditions: Record<string, boolean> = {
    emaShortDowntrend: e9 < e21,
    macdBearishNow: hist[hist.length - 1] < 0,
    macdFreshOrStrengthening: macdFreshBear || hist[hist.length - 1] < hist[hist.length - 2],
    notOversold: wr[wr.length - 1] > -45,
    volumeConfirm: v[v.length - 1] > avgVol * 1.1,
    adxDirectionalBearish: mdi > pdi,
    lowerHighStructure: lh3,
    trendStrong: adxVal > config.adxMinScored,
    bearishDivergence,
  };

  const longScore = Object.values(longConditions).filter(Boolean).length;
  const shortScore = Object.values(shortConditions).filter(Boolean).length;

  if (longScore < config.minTechnicalScore && shortScore < config.minTechnicalScore) return null;

  let candidateDirection: Direction;
  if (longScore >= shortScore + 1) candidateDirection = 'LONG';
  else if (shortScore >= longScore + 1) candidateDirection = 'SHORT';
  else return null;
  void candidateDirection; // dihitung sama seperti Python (buat logging/debug), keputusan final di bawah

  // SMC jadi bagian dari skor utama, bukan filter sampingan
  const smcScoreLong = calcSmcScore('LONG', smc.bos, smc.fvg.type, smc.orderBlock.type, smc.liquiditySweep, smc.choch);
  const smcScoreShort = calcSmcScore('SHORT', smc.bos, smc.fvg.type, smc.orderBlock.type, smc.liquiditySweep, smc.choch);

  const combinedLong = longScore + smcScoreLong / 2;
  const combinedShort = shortScore + smcScoreShort / 2;

  let direction: Direction;
  if (combinedLong >= combinedShort + config.combinedScoreGap) direction = 'LONG';
  else if (combinedShort >= combinedLong + config.combinedScoreGap) direction = 'SHORT';
  else return null;

  const smcScoreCheck = calcSmcScore(direction, smc.bos, smc.fvg.type, smc.orderBlock.type, smc.liquiditySweep, smc.choch);
  if (smcScoreCheck < config.minSmcScore) return null;

  // Candle Confirmation — 2 candle 15m terakhir harus konsisten searah signal
  const lastOpen = o[o.length - 1];
  const lastClose = c[c.length - 1];
  const prevOpen = o[o.length - 2];
  const prevClose = c[c.length - 2];
  if (direction === 'LONG' && (lastClose <= lastOpen || prevClose <= prevOpen)) return null;
  if (direction === 'SHORT' && (lastClose >= lastOpen || prevClose >= prevOpen)) return null;

  // Jarak ke EMA50 — hindari entry di area yang udah terlalu jauh dari EMA50
  const distToEma50Pct = (Math.abs(price - e50) / e50) * 100;
  if (distToEma50Pct > config.maxDistanceToEma50Pct) return null;

  // Exhaustion Filter — hindari entry yang udah terlalu jauh dari swing N candle terakhir
  if (h.length >= config.exhaustionLookback + 1) {
    const swingHigh = Math.max(...h.slice(-config.exhaustionLookback - 1, -1));
    const swingLow = Math.min(...l.slice(-config.exhaustionLookback - 1, -1));
    if (direction === 'SHORT') {
      const extensionPct = ((swingHigh - price) / swingHigh) * 100;
      if (extensionPct > config.exhaustionMaxPct) return null;
    } else {
      const extensionPct = ((price - swingLow) / swingLow) * 100;
      if (extensionPct > config.exhaustionMaxPct) return null;
    }
  }

  // Konfirmasi 1H
  if (candles1h && candles1h.close.length >= 60) {
    if (!higherTimeframeConfirms(candles1h, direction)) return null;
  }

  // Konfirmasi 4H (trend harus kuat, ADX minimal 20)
  if (candles4h && candles4h.close.length >= 60) {
    if (!higherTimeframeConfirms(candles4h, direction, 20)) return null;
  }

  // === Entry / SL / TP berbasis ATR ===
  const decimals = getDecimalPlaces(price);
  const spread = price * config.entrySpreadPct;
  const entryLow = price - spread;
  const entryHigh = price + spread;

  let stopLoss: number;
  let tp1: number;
  let tp2: number;
  let tp3: number;
  if (direction === 'LONG') {
    stopLoss = price - atr * config.slAtrMultiplier;
    tp1 = price + atr * config.tp1AtrMultiplier;
    tp2 = price + atr * config.tp2AtrMultiplier;
    tp3 = price + atr * config.tp3AtrMultiplier;
  } else {
    stopLoss = price + atr * config.slAtrMultiplier;
    tp1 = price - atr * config.tp1AtrMultiplier;
    tp2 = price - atr * config.tp2AtrMultiplier;
    tp3 = price - atr * config.tp3AtrMultiplier;
  }

  const totalScore = Math.max(longScore, shortScore);
  let leverage: number;
  if (totalScore >= 8) leverage = [20, 25, 30][Math.floor(rng() * 3)];
  else if (totalScore >= 6) leverage = [10, 15, 20][Math.floor(rng() * 3)];
  else leverage = [5, 7, 10][Math.floor(rng() * 3)];

  const score: ScoreBreakdown = {
    longTechnicalScore: longScore,
    shortTechnicalScore: shortScore,
    technicalScore: totalScore,
    smcScore: smcScoreCheck,
    combinedScore: direction === 'LONG' ? combinedLong : combinedShort,
    conditions: direction === 'LONG' ? longConditions : shortConditions,
  };

  return {
    symbol,
    direction,
    price,
    entryLow,
    entryHigh,
    entry: (entryLow + entryHigh) / 2,
    stopLoss,
    takeProfit: { tp1, tp2, tp3 },
    leverage,
    decimals,
    score,
    smc,
  };
}
