// lib/scoring/types.ts
// Tipe data untuk scoring engine — dipakai di semua module lain.

export interface Candles {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export type Direction = 'LONG' | 'SHORT';
export type SmcBias = 'BULLISH' | 'BEARISH' | null;

export interface SmcAnalysis {
  bos: SmcBias;
  choch: SmcBias;
  fvg: { type: SmcBias; low: number | null; high: number | null };
  orderBlock: { type: SmcBias; low: number | null; high: number | null };
  liquiditySweep: 'SWEEP_HIGH' | 'SWEEP_LOW' | null;
}

export interface ScoreBreakdown {
  longTechnicalScore: number;
  shortTechnicalScore: number;
  technicalScore: number; // max(long, short) — skor arah yang menang
  smcScore: number;
  combinedScore: number;
  conditions: Record<string, boolean>; // detail kondisi yang lolos, buat debugging/UI
}

export interface SignalResult {
  symbol: string;
  direction: Direction;
  price: number;
  entryLow: number;
  entryHigh: number;
  entry: number;
  stopLoss: number;
  takeProfit: { tp1: number; tp2: number; tp3: number };
  leverage: number;
  decimals: number;
  score: ScoreBreakdown;
  smc: SmcAnalysis;
}

// Opsi yang bisa di-tuning tanpa nyentuh logic inti — nilainya ambil
// persis dari bot Python (signal_handler.py) biar hasilnya konsisten.
export interface EngineConfig {
  atrPeriod: number;
  atrMinPct: number; // skip kalau ATR < 0.3% dari harga (market tidur)
  adxMinFilter: number; // hard filter awal, adx_val < 22 → skip
  adxMinScored: number; // syarat kondisi skor, adx_val > 25
  minTechnicalScore: number; // long_score/short_score minimal 6
  combinedScoreGap: number; // selisih combined_long vs combined_short minimal 1.5
  minSmcScore: number; // smc_score_check minimal 2
  maxDistanceToEma50Pct: number; // skip kalau harga > 8% dari EMA50
  exhaustionLookback: number; // 20 candle
  exhaustionMaxPct: number; // skip kalau extension > 15%
  entrySpreadPct: number; // 0.00015 → entry zone +/- 0.015% dari price
  slAtrMultiplier: number;
  tp1AtrMultiplier: number;
  tp2AtrMultiplier: number;
  tp3AtrMultiplier: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  atrPeriod: 14,
  atrMinPct: 0.3,
  adxMinFilter: 22,
  adxMinScored: 25,
  minTechnicalScore: 6,
  combinedScoreGap: 1.5,
  minSmcScore: 2,
  maxDistanceToEma50Pct: 8,
  exhaustionLookback: 20,
  exhaustionMaxPct: 15,
  entrySpreadPct: 0.00015,
  slAtrMultiplier: 2.2,
  tp1AtrMultiplier: 2.0,
  tp2AtrMultiplier: 3.5,
  tp3AtrMultiplier: 5.5,
};
