// src/lib/live-signals.ts
//
// Wires the real Zenthra scoring engine (ported from the Python bot) into
// the API's Signal shape. Replaces the static mock array previously in
// zenthra-data.ts.
//
// Scans a fixed watchlist rather than the full Binance futures list — keeps
// each request fast enough for a serverless function. Swap WATCHLIST for a
// dynamic getTopSymbols() call later if you want full-market scanning (that
// needs a background cron + cache, not a per-request scan — see the chat
// history for why).

import { getMultiTimeframeCandles } from "./binance";
import { generateSignalFromCandles, getDecimalPlaces } from "./scoring/engine";
import type { SignalResult } from "./scoring/types";
import type { Signal } from "@workspace/api-zod";

const WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "JUPUSDT",
  "BONKUSDT",
];

const CONDITION_LABELS: Record<string, string> = {
  emaShortUptrend: "EMA9 above EMA21",
  emaShortDowntrend: "EMA9 below EMA21",
  macdBullishNow: "MACD bullish",
  macdBearishNow: "MACD bearish",
  macdFreshOrStrengthening: "MACD momentum fresh or strengthening",
  notOverbought: "not overbought (Williams %R)",
  notOversold: "not oversold (Williams %R)",
  volumeConfirm: "volume above average",
  adxDirectionalBullish: "ADX confirms bullish direction",
  adxDirectionalBearish: "ADX confirms bearish direction",
  higherLowStructure: "higher-low structure",
  lowerHighStructure: "lower-high structure",
  trendStrong: "ADX trend strength confirmed",
  bullishDivergence: "bullish divergence",
  bearishDivergence: "bearish divergence",
};

function buildReasoning(result: SignalResult): string {
  const passed = Object.entries(result.score.conditions)
    .filter(([, ok]) => ok)
    .map(([key]) => CONDITION_LABELS[key] ?? key);

  const smcParts: string[] = [];
  if (result.smc.bos) smcParts.push(`${result.smc.bos.toLowerCase()} break of structure`);
  if (result.smc.choch) smcParts.push(`change of character (${result.smc.choch.toLowerCase()})`);
  if (result.smc.orderBlock.type) smcParts.push(`${result.smc.orderBlock.type.toLowerCase()} order block`);
  if (result.smc.liquiditySweep) {
    smcParts.push(result.smc.liquiditySweep === "SWEEP_HIGH" ? "liquidity swept above" : "liquidity swept below");
  }

  const bits = passed.slice(0, 4);
  if (smcParts.length) bits.push(smcParts.join(", "));
  return bits.length ? bits.join("; ") + "." : "Setup met the minimum confluence threshold.";
}

/** technicalScore (~0-9) + smcScore combine into a 0-100 confidence figure. Tune the divisor as live results come in. */
function toConfidence(result: SignalResult): number {
  return Math.max(0, Math.min(100, Math.round((result.score.combinedScore / 12) * 100)));
}

function toApiSignal(symbol: string, result: SignalResult | null, lastPrice: number | null): Signal {
  if (!result) {
    const price = lastPrice ?? 0;
    return {
      pair: symbol,
      direction: "HOLD",
      score: 0,
      entry: price,
      stopLoss: price,
      takeProfit: price,
      takeProfit2: null,
      timeframe: "15m",
      reasoning: "No high-conviction setup right now \u2014 conditions don't clear the confluence threshold.",
    };
  }

  const decimals = getDecimalPlaces(result.price);
  const round = (n: number) => Number(n.toFixed(decimals));

  return {
    pair: symbol,
    direction: result.direction,
    score: toConfidence(result),
    entry: round(result.entry),
    stopLoss: round(result.stopLoss),
    takeProfit: round(result.takeProfit.tp1),
    takeProfit2: round(result.takeProfit.tp2),
    timeframe: "15m",
    reasoning: buildReasoning(result),
  };
}

/** Compute a live signal for one symbol. Returns null only if candle data couldn't be fetched at all. */
export async function computeSignal(symbolRaw: string): Promise<Signal | null> {
  const symbol = symbolRaw.replace("/", "").toUpperCase();
  const { c15m, c1h, c4h } = await getMultiTimeframeCandles(symbol);
  if (!c15m) return null;

  const result = generateSignalFromCandles(symbol, c15m, c1h ?? undefined, c4h ?? undefined);
  const lastPrice = c15m.close[c15m.close.length - 1] ?? null;
  return toApiSignal(symbol, result, lastPrice);
}

/** Compute live signals for the whole watchlist, run concurrently. */
export async function computeWatchlistSignals(): Promise<Signal[]> {
  const results = await Promise.all(WATCHLIST.map((s) => computeSignal(s)));
  return results.filter((s): s is Signal => s !== null);
}
