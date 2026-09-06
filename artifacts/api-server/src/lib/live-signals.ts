// src/lib/live-signals.ts
//
// Wires the real Zenthra scoring engine (ported from the Python bot) plus
// the Confluence Score layer (lib/scoring/confluence.ts) into the API's
// signal shape.
//
// Scans a fixed watchlist rather than the full Binance futures list — keeps
// each request fast enough for a serverless function. Swap WATCHLIST for a
// dynamic getTopSymbols() call later if you want full-market scanning (that
// needs a background cron + cache, not a per-request scan).

import { getMultiTimeframeCandles } from "./binance";
import { generateSignalFromCandles, getDecimalPlaces } from "./scoring/engine";
import { computeConfluence, type ConfluenceResult, type FinalCall } from "./scoring/confluence";
import type { SignalResult } from "./scoring/types";

// Blueprint's initial Futures Intelligence universe (10 assets).
const WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "SUIUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "ADAUSDT",
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
  return bits.length ? bits.join("; ") + "." : "No technical/structure conditions cleared the confluence threshold.";
}

/**
 * Public shape for one symbol's research read. Deliberately a local
 * interface rather than the generated `Signal` type from @workspace/api-zod
 * — the generated type predates the Confluence Score and doesn't have these
 * fields. Update lib/api-spec/openapi.yaml and re-run the codegen script to
 * fold this into the generated client when convenient; nothing here breaks
 * that migration.
 */
export interface ZenthraSignal {
  pair: string;
  /** Raw technical/SMC direction from the engine, independent of confluence tier. 'HOLD' when the engine found no qualifying setup at all. */
  direction: "LONG" | "SHORT" | "HOLD";
  /** The Blueprint's final call: LONG/SHORT only at Strong/Valid Setup tiers, otherwise WATCH or NO_TRADE. Never a fabricated probability. */
  call: FinalCall;
  tier: ConfluenceResult["tier"];
  tierLabel: ConfluenceResult["tierLabel"];
  /** 0-100, sum of the weighted confluence categories — see lib/scoring/confluence.ts for why this build's ceiling is ~65 until more sources are connected. */
  score: number;
  confluence: ConfluenceResult["categories"];
  price: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  takeProfit2: number | null;
  timeframe: "15m";
  reasoning: string;
}

async function toApiSignal(symbol: string, result: SignalResult | null, lastPrice: number | null): Promise<ZenthraSignal> {
  const confluence = await computeConfluence(symbol, result);
  const price = result?.price ?? lastPrice ?? 0;

  if (!result) {
    return {
      pair: symbol,
      direction: "HOLD",
      call: confluence.call,
      tier: confluence.tier,
      tierLabel: confluence.tierLabel,
      score: confluence.total,
      confluence: confluence.categories,
      price,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      takeProfit2: null,
      timeframe: "15m",
      reasoning: "No high-conviction technical/structure setup right now — conditions don't clear the engine's confluence threshold.",
    };
  }

  const decimals = getDecimalPlaces(result.price);
  const round = (n: number) => Number(n.toFixed(decimals));

  return {
    pair: symbol,
    direction: result.direction,
    call: confluence.call,
    tier: confluence.tier,
    tierLabel: confluence.tierLabel,
    score: confluence.total,
    confluence: confluence.categories,
    price,
    entry: round(result.entry),
    stopLoss: round(result.stopLoss),
    takeProfit: round(result.takeProfit.tp1),
    takeProfit2: round(result.takeProfit.tp2),
    timeframe: "15m",
    reasoning: buildReasoning(result),
  };
}

/** Compute a live research read for one symbol. Returns null only if candle data couldn't be fetched at all. */
export async function computeSignal(symbolRaw: string): Promise<ZenthraSignal | null> {
  const symbol = symbolRaw.replace("/", "").toUpperCase();
  const { c15m, c1h, c4h } = await getMultiTimeframeCandles(symbol);
  if (!c15m) return null;

  const result = generateSignalFromCandles(symbol, c15m, c1h ?? undefined, c4h ?? undefined);
  const lastPrice = c15m.close[c15m.close.length - 1] ?? null;
  return toApiSignal(symbol, result, lastPrice);
}

/** Compute live research reads for the whole watchlist, run concurrently. */
export async function computeWatchlistSignals(): Promise<ZenthraSignal[]> {
  const results = await Promise.all(WATCHLIST.map((s) => computeSignal(s)));
  return results.filter((s): s is ZenthraSignal => s !== null);
}
