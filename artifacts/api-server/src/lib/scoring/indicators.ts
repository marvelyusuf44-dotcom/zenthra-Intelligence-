// lib/scoring/indicators.ts
//
// Port 1:1 dari handlers/signal_handler.py (bot ZENTHRA Python).
// PURE FUNCTIONS — tidak ada network call, tidak ada Telegram, tidak ada I/O.
// Semua fungsi di sini deterministic: input candle array → output angka/array.

/**
 * EMA sebagai array penuh (bukan cuma nilai terakhir) — dibutuhkan karena
 * beberapa tempat butuh slope EMA (misal slope_e21 = e21[-1] - e21[-5]).
 * Sama seperti ema_list() di Python: seed pakai values[0], bukan SMA.
 */
export function emaList(values: number[], period: number): number[] {
  if (values.length < period) {
    return new Array(values.length).fill(values[values.length - 1]);
  }
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[result.length - 1] * (1 - k));
  }
  return result;
}

export function ema(values: number[], period: number): number {
  const list = emaList(values, period);
  return list[list.length - 1];
}

/** MACD histogram (12/26/9), return array histogram penuh — sama seperti calc_macd(). */
export function calcMacdHistogram(closes: number[]): number[] {
  const e12 = emaList(closes, 12);
  const e26 = emaList(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signalLine = emaList(macdLine, 9);
  return macdLine.map((v, i) => v - signalLine[i]);
}

/** Williams %R, return array penuh. Nilai -50 dipakai sebagai placeholder saat data belum cukup. */
export function calcWilliamsR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number[] {
  const wr: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      wr.push(-50);
      continue;
    }
    const hh = Math.max(...highs.slice(i - period + 1, i + 1));
    const ll = Math.min(...lows.slice(i - period + 1, i + 1));
    wr.push(hh === ll ? -50 : ((hh - closes[i]) / (hh - ll)) * -100);
  }
  return wr;
}

export interface AdxResult {
  adx: number;
  pdi: number; // +DI terakhir
  mdi: number; // -DI terakhir
}

/** ADX + DI, Wilder smoothing — port langsung dari calc_adx(). */
export function calcAdx(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): AdxResult {
  try {
    const n = closes.length;
    const pdm: number[] = [];
    const mdm: number[] = [];
    const trs: number[] = [];
    for (let i = 1; i < n; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      pdm.push(upMove > downMove ? Math.max(upMove, 0) : 0);
      mdm.push(downMove > upMove ? Math.max(downMove, 0) : 0);
      trs.push(
        Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1])
        )
      );
    }

    const smooth = (d: number[]): number[] => {
      let s = d.slice(0, period).reduce((a, b) => a + b, 0);
      const r = [s];
      for (let i = period; i < d.length; i++) {
        s = s - s / period + d[i];
        r.push(s);
      }
      return r;
    };

    const at = smooth(trs);
    const smPdm = smooth(pdm);
    const smMdm = smooth(mdm);
    const pdi = smPdm.map((a, i) => (at[i] ? (100 * a) / at[i] : 0));
    const mdi = smMdm.map((a, i) => (at[i] ? (100 * a) / at[i] : 0));
    const dx = pdi.map((a, i) => {
      const b = mdi[i];
      return a + b ? (100 * Math.abs(a - b)) / (a + b) : 0;
    });
    const adxVal =
      dx.length >= period
        ? dx.slice(-period).reduce((a, b) => a + b, 0) / period
        : 0;

    return {
      adx: adxVal,
      pdi: pdi.length ? pdi[pdi.length - 1] : 0,
      mdi: mdi.length ? mdi[mdi.length - 1] : 0,
    };
  } catch {
    return { adx: 0, pdi: 50, mdi: 50 };
  }
}

/** Average True Range — port dari calculate_atr(). Fallback 0.01 kalau data kurang. */
export function calcAtr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number {
  if (closes.length < period + 1) return 0.01;
  const tr: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
}
