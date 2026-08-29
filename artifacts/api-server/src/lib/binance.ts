// lib/binance.ts
//
// Layer network — SATU-SATUNYA file yang boleh nge-fetch ke Binance.
// Sengaja dipisah dari lib/scoring/* biar engine tetap pure & gampang di-unit-test.

import type { Candles } from './scoring/types';

const BASE_REST = 'https://fapi.binance.com';
const MIN_VOLUME_USD = 500_000; // sama seperti MIN_VOLUME_USD di config.py bot Python

type BinanceKline = [
  number, // open time
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  ...unknown[]
];

async function fetchJson<T>(url: string, retries = 3): Promise<T | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) return (await res.json()) as T;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
  }
  return null;
}

/** Ambil daftar simbol futures USDT dengan volume 24h >= MIN_VOLUME_USD. */
export async function getTopSymbols(limit = 120): Promise<string[]> {
  const tickers = await fetchJson<Array<{ symbol: string; quoteVolume: string }>>(
    `${BASE_REST}/fapi/v1/ticker/24hr`
  );
  if (!tickers) return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

  const symbols = tickers
    .filter((t) => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) >= MIN_VOLUME_USD)
    .map((t) => t.symbol);

  // shuffle biar nggak selalu scan urutan yang sama
  for (let i = symbols.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
  }
  return symbols.slice(0, limit);
}

/** Ambil candle dari Binance Futures, convert ke format Candles yang dipakai engine. */
export async function getKlines(
  symbol: string,
  interval: '15m' | '1h' | '4h' = '15m',
  limit = 150
): Promise<Candles | null> {
  const url = `${BASE_REST}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const data = await fetchJson<BinanceKline[]>(url);
  if (!data || data.length < 60) return null;

  return {
    open: data.map((k) => parseFloat(k[1])),
    high: data.map((k) => parseFloat(k[2])),
    low: data.map((k) => parseFloat(k[3])),
    close: data.map((k) => parseFloat(k[4])),
    volume: data.map((k) => parseFloat(k[5])),
  };
}

/** Ambil candle 15m + 1h + 4h sekaligus untuk satu simbol (dipakai engine buat multi-timeframe confirm). */
export async function getMultiTimeframeCandles(symbol: string) {
  const [c15m, c1h, c4h] = await Promise.all([
    getKlines(symbol, '15m', 150),
    getKlines(symbol, '1h', 150),
    getKlines(symbol, '4h', 150),
  ]);
  return { c15m, c1h, c4h };
}
