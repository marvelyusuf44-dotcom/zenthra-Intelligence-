// lib/scoring/smc.ts
//
// Port 1:1 dari fungsi Smart Money Concepts di signal_handler.py.
// PURE FUNCTIONS — struktur & threshold sama persis dengan versi Python.

import type { Direction, SmcAnalysis, SmcBias } from './types';

type SwingPoint = [index: number, price: number];

function findSwings(
  highs: number[],
  lows: number[],
  lookback: number
): { swingHighs: SwingPoint[]; swingLows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];
  for (let i = lookback; i < highs.length - lookback; i++) {
    const windowHigh = Math.max(...highs.slice(i - lookback, i + lookback + 1));
    const windowLow = Math.min(...lows.slice(i - lookback, i + lookback + 1));
    if (highs[i] === windowHigh) swingHighs.push([i, highs[i]]);
    if (lows[i] === windowLow) swingLows.push([i, lows[i]]);
  }
  return { swingHighs, swingLows };
}

/** Break of Structure — bandingkan 2 swing high & 2 swing low terakhir. */
export function detectBOS(
  highs: number[],
  lows: number[],
  lookback = 5
): SmcBias {
  try {
    const { swingHighs, swingLows } = findSwings(highs, lows, lookback);
    if (swingHighs.length < 2 || swingLows.length < 2) return null;

    const [lastSh, prevSh] = [swingHighs[swingHighs.length - 1][1], swingHighs[swingHighs.length - 2][1]];
    const [lastSl, prevSl] = [swingLows[swingLows.length - 1][1], swingLows[swingLows.length - 2][1]];

    if (lastSh > prevSh && lastSl > prevSl) return 'BULLISH';
    if (lastSh < prevSh && lastSl < prevSl) return 'BEARISH';
    return null;
  } catch {
    return null;
  }
}

/** Change of Character — deteksi perubahan struktur market (3 swing terakhir). */
export function detectCHoCH(
  closes: number[],
  highs: number[],
  lows: number[],
  lookback = 5
): SmcBias {
  try {
    const { swingHighs: sh, swingLows: sl } = findSwings(highs, lows, lookback);
    if (sh.length < 3 || sl.length < 3) return null;

    const lastSh = sh[sh.length - 1][1];
    const prevSh = sh[sh.length - 2][1];
    const prevSh2 = sh[sh.length - 3][1];
    const lastSl = sl[sl.length - 1][1];
    const prevSl = sl[sl.length - 2][1];
    const prevSl2 = sl[sl.length - 3][1];
    const price = closes[closes.length - 1];

    // CHoCH Bullish: sebelumnya bearish (LH, LL) tapi sekarang break above prev SH
    const wasBearish = prevSh < prevSh2 && prevSl < prevSl2;
    if (wasBearish && price > prevSh) return 'BULLISH';

    // CHoCH Bearish: sebelumnya bullish (HH, HL) tapi sekarang break below prev SL
    const wasBullish = prevSh > prevSh2 && prevSl > prevSl2;
    if (wasBullish && price < prevSl) return 'BEARISH';

    // catatan: lastSh/lastSl sengaja tidak dipakai di kondisi (sama seperti versi Python asli)
    void lastSh;
    void lastSl;
    return null;
  } catch {
    return null;
  }
}

/** Fair Value Gap — cari gap 3-candle terakhir di rentang lookback, dari candle terbaru mundur. */
export function detectFVG(
  opens: number[],
  closes: number[],
  highs: number[],
  lows: number[],
  lookback = 20
): { type: SmcBias; low: number | null; high: number | null } {
  try {
    const start = closes.length - 1;
    const end = Math.max(closes.length - lookback, 1);
    for (let i = start; i > end; i--) {
      if (lows[i] > highs[i - 2]) {
        return { type: 'BULLISH', low: highs[i - 2], high: lows[i] };
      } else if (highs[i] < lows[i - 2]) {
        return { type: 'BEARISH', low: highs[i], high: lows[i - 2] };
      }
    }
    return { type: null, low: null, high: null };
  } catch {
    return { type: null, low: null, high: null };
  }
}

/** Order Block — candle terakhir sebelum pergerakan impulsif yang menembusnya. */
export function detectOrderBlock(
  opens: number[],
  closes: number[],
  highs: number[],
  lows: number[]
): { type: SmcBias; low: number | null; high: number | null } {
  try {
    const start = closes.length - 2;
    const end = Math.max(closes.length - 15, 0);
    for (let i = start; i > end; i--) {
      if (closes[i] < opens[i]) {
        if (i + 1 < closes.length && closes[i + 1] > highs[i]) {
          return { type: 'BULLISH', low: lows[i], high: opens[i] };
        }
      } else if (closes[i] > opens[i]) {
        if (i + 1 < closes.length && closes[i + 1] < lows[i]) {
          return { type: 'BEARISH', low: opens[i], high: highs[i] };
        }
      }
    }
    return { type: null, low: null, high: null };
  } catch {
    return { type: null, low: null, high: null };
  }
}

/** Liquidity Sweep — wick nembus swing high/low lalu close balik + volume confirm. */
export function detectLiquiditySweep(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  lookback = 20
): 'SWEEP_HIGH' | 'SWEEP_LOW' | null {
  try {
    if (highs.length < lookback + 1) return null;
    const recentHigh = Math.max(...highs.slice(-lookback - 1, -1));
    const recentLow = Math.min(...lows.slice(-lookback - 1, -1));
    const avgVol = volumes.slice(-lookback - 1, -1).reduce((a, b) => a + b, 0) / lookback;
    const volConfirmed = volumes[volumes.length - 1] > avgVol * 1.2;

    const lastHigh = highs[highs.length - 1];
    const lastLow = lows[lows.length - 1];
    const lastClose = closes[closes.length - 1];

    if (lastHigh > recentHigh && lastClose < recentHigh && volConfirmed) return 'SWEEP_HIGH';
    if (lastLow < recentLow && lastClose > recentLow && volConfirmed) return 'SWEEP_LOW';
    return null;
  } catch {
    return null;
  }
}

/** Skor gabungan SMC untuk satu arah (LONG/SHORT). Bobot sama persis dengan calc_smc_score() Python. */
export function calcSmcScore(
  direction: Direction,
  bos: SmcBias,
  fvgType: SmcBias,
  obType: SmcBias,
  liqSweep: 'SWEEP_HIGH' | 'SWEEP_LOW' | null,
  choch: SmcBias = null
): number {
  let score = 0;
  if (direction === 'LONG') {
    if (bos === 'BULLISH') score += 2;
    if (fvgType === 'BULLISH') score += 2;
    if (obType === 'BULLISH') score += 2;
    if (liqSweep === 'SWEEP_LOW') score += 2;
    if (choch === 'BULLISH') score += 1;
  } else {
    if (bos === 'BEARISH') score += 2;
    if (fvgType === 'BEARISH') score += 2;
    if (obType === 'BEARISH') score += 2;
    if (liqSweep === 'SWEEP_HIGH') score += 2;
    if (choch === 'BEARISH') score += 1;
  }
  return score;
}

/** Jalanin semua deteksi SMC sekaligus, return objek terstruktur siap dipakai engine/UI. */
export function analyzeSmc(
  opens: number[],
  closes: number[],
  highs: number[],
  lows: number[],
  volumes: number[]
): SmcAnalysis {
  return {
    bos: detectBOS(highs, lows),
    choch: detectCHoCH(closes, highs, lows),
    fvg: detectFVG(opens, closes, highs, lows),
    orderBlock: detectOrderBlock(opens, closes, highs, lows),
    liquiditySweep: detectLiquiditySweep(highs, lows, closes, volumes),
  };
}
