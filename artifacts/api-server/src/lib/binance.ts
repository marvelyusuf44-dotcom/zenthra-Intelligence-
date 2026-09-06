// lib/binance.ts
//
// Layer network — SATU-SATUNYA file yang boleh nge-fetch ke Binance.
// Sengaja dipisah dari lib/scoring/* biar engine tetap pure & gampang di-unit-test.

import type { Candles } from './scoring/types';
import { doFetch } from './http';

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
      const res = await doFetch(url, { signal: AbortSignal.timeout(10_000) });
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

// --- Below: real data for the Futures Intelligence confluence score
// (lib/scoring/confluence.ts). Both return null on any failure — the
// confluence layer treats null as "unavailable" and scores it honestly
// as 0/weight rather than guessing a value.

export interface FundingSnapshot {
  fundingRatePct: number; // e.g. 0.01 means 0.01% per funding interval
  markPrice: number;
  nextFundingTime: number;
}

/** Current funding rate for a USDT-margined perpetual — public endpoint, no key required. */
export async function fetchFundingRate(symbol: string): Promise<FundingSnapshot | null> {
  const data = await fetchJson<{ lastFundingRate: string; markPrice: string; nextFundingTime: number }>(
    `${BASE_REST}/fapi/v1/premiumIndex?symbol=${symbol}`
  );
  if (!data) return null;
  const fundingRatePct = parseFloat(data.lastFundingRate) * 100;
  const markPrice = parseFloat(data.markPrice);
  if (!Number.isFinite(fundingRatePct) || !Number.isFinite(markPrice)) return null;
  return { fundingRatePct, markPrice, nextFundingTime: data.nextFundingTime };
}

export interface OpenInterestTrend {
  latest: number;
  changePct: number; // % change in open interest across the lookback window
}

/**
 * Open-interest trend over the last `periods` hourly buckets — a single
 * point-in-time OI reading can't tell direction, so this compares the
 * oldest vs newest bucket in the window (public endpoint, no key required).
 */
export async function fetchOpenInterestTrend(symbol: string, periods = 8): Promise<OpenInterestTrend | null> {
  const data = await fetchJson<Array<{ sumOpenInterest: string; timestamp: number }>>(
    `${BASE_REST}/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=${periods}`
  );
  if (!data || data.length < 2) return null;
  const first = parseFloat(data[0].sumOpenInterest);
  const last = parseFloat(data[data.length - 1].sumOpenInterest);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return { latest: last, changePct: ((last - first) / first) * 100 };
}
