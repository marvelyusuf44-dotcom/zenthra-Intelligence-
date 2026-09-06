// lib/scoring/confluence.ts
//
// The Blueprint's weighted Confluence Score for Futures Intelligence. Wraps
// the existing deterministic technical/SMC engine (engine.ts, unchanged) with
// real funding and open-interest data, and classifies the result into
// Strong Setup / Valid Setup / Watch / No Trade.
//
// Category weights (fixed, always sum to 100):
//   Market Structure       20   <- SMC score, from engine.ts
//   Momentum + Volume      15   <- technical condition score, from engine.ts
//   Open Interest          15   <- real Binance OI trend (lib/binance.ts)
//   Funding                10   <- real Binance funding rate (lib/binance.ts)
//   Liquidations           10   <- NOT CONNECTED (see note below)
//   On-chain               15   <- NOT CONNECTED (see note below)
//   Market/News Context    10   <- NOT CONNECTED (see note below)
//   Data Quality             5  <- reflects how many of the 7 categories above actually had data
//
// Why three categories are marked unavailable instead of estimated:
//   - Liquidations needs a persistent aggregator over Binance's forceOrder
//     websocket stream. A stateless per-request serverless function can't
//     hold that connection open, so there is no real recent-liquidation
//     total to report.
//   - On-chain (for a whole futures market, not one wallet) needs an
//     aggregate exchange-inflow/outflow or whale-accumulation feed. This
//     project has real single-wallet lookups (Helius) but nothing that rolls
//     up into a market-wide on-chain read.
//   - Market/News Context needs a news or sentiment feed, which isn't wired
//     up anywhere in this project.
// Each is scored 0 and flagged `available: false` rather than guessed — per
// the Blueprint's own data-integrity rule, an honest "Intelligence degraded"
// beats a fabricated number.
//
// Direct consequence worth knowing: with only 4 of 7 evidence categories
// connected, the mathematical ceiling for any signal right now is
// 20 + 15 + 15 + 10 + 5 = 65/100. Strong Setup (80+) and Valid Setup (70-79)
// cannot be reached until Liquidations, On-chain, and Market/News-Context
// are connected — that's intentional, not a bug.

import type { Direction, SignalResult } from "./types";
import { fetchFundingRate, fetchOpenInterestTrend } from "../binance";

export type Tier = "strong_setup" | "valid_setup" | "watch" | "no_trade";
export type FinalCall = Direction | "WATCH" | "NO_TRADE";

export interface ConfluenceCategory {
  key: string;
  label: string;
  weight: number;
  raw: number; // 0..weight
  available: boolean;
  note: string;
}

export interface ConfluenceResult {
  total: number; // 0..100
  tier: Tier;
  tierLabel: "Strong Setup" | "Valid Setup" | "Watch" | "No Trade";
  call: FinalCall;
  categories: ConfluenceCategory[];
}

function tierFor(total: number): { tier: Tier; label: ConfluenceResult["tierLabel"] } {
  if (total >= 80) return { tier: "strong_setup", label: "Strong Setup" };
  if (total >= 70) return { tier: "valid_setup", label: "Valid Setup" };
  if (total >= 55) return { tier: "watch", label: "Watch" };
  return { tier: "no_trade", label: "No Trade" };
}

const SMC_MAX = 9; // calcSmcScore max: 2+2+2+2+1 (lib/scoring/smc.ts)
const TECHNICAL_MAX = 9; // number of boolean conditions engine.ts checks per direction

function marketStructureCategory(result: SignalResult | null): ConfluenceCategory {
  const raw = result ? Math.round((result.score.smcScore / SMC_MAX) * 20) : 0;
  return {
    key: "marketStructure",
    label: "Market Structure",
    weight: 20,
    raw,
    available: true,
    note: result ? `Smart Money Concepts score ${result.score.smcScore}/${SMC_MAX}.` : "No qualifying structure detected on the current timeframe.",
  };
}

function momentumVolumeCategory(result: SignalResult | null): ConfluenceCategory {
  const raw = result ? Math.round((result.score.technicalScore / TECHNICAL_MAX) * 15) : 0;
  return {
    key: "momentumVolume",
    label: "Momentum + Volume",
    weight: 15,
    raw,
    available: true,
    note: result ? `${result.score.technicalScore}/${TECHNICAL_MAX} technical conditions confirmed.` : "No qualifying momentum detected on the current timeframe.",
  };
}

async function openInterestCategory(symbol: string, direction: Direction | null): Promise<ConfluenceCategory> {
  const trend = await fetchOpenInterestTrend(symbol);
  if (!trend) {
    return { key: "openInterest", label: "Open Interest", weight: 15, raw: 0, available: false, note: "Intelligence degraded — source unavailable." };
  }
  const magnitude = Math.min(Math.abs(trend.changePct), 6) / 6; // an 8h swing of 6%+ maxes the confirming/non-confirming bucket
  const rising = trend.changePct > 0.5;
  const falling = trend.changePct < -0.5;
  const changeStr = `${trend.changePct >= 0 ? "+" : ""}${trend.changePct.toFixed(1)}%`;

  // Directional read: rising OI alongside a directional call means fresh
  // positioning is entering with the move (price+OI both up = new longs;
  // price+OI both down = new shorts) — that's the strong, confirming case
  // regardless of which direction it is. Falling OI alongside a directional
  // call means existing positions are closing (short-covering under a LONG
  // call, long-liquidation under a SHORT call) — real, but weak/non-fresh
  // conviction, so it must NOT score as well as a confirming rise just
  // because the magnitude is large. No directional call at all means there's
  // no market-structure read to confirm against, so OI alone (either sign)
  // stays capped low rather than driving the score on its own.
  let raw: number;
  let quality: string;
  if (!direction) {
    raw = Math.round(3 * magnitude);
    quality = "no directional read to confirm against";
  } else if (rising) {
    raw = Math.round(15 * (0.5 + 0.5 * magnitude));
    quality = `confirms the ${direction} read — fresh positioning entering with the move`;
  } else if (falling) {
    raw = Math.round(15 * 0.3 * (1 - magnitude));
    quality = `does not confirm the ${direction} read — looks like position unwind, not fresh conviction`;
  } else {
    raw = Math.round(15 * 0.35);
    quality = "flat — no strong confirming or contradicting signal";
  }

  return {
    key: "openInterest",
    label: "Open Interest",
    weight: 15,
    raw,
    available: true,
    note: `Open interest ${changeStr} over the last 8h — ${quality}.`,
  };
}

async function fundingCategory(symbol: string, direction: Direction | null): Promise<ConfluenceCategory> {
  const funding = await fetchFundingRate(symbol);
  if (!funding) {
    return { key: "funding", label: "Funding", weight: 10, raw: 0, available: false, note: "Intelligence degraded — source unavailable." };
  }
  const extremity = Math.min(Math.abs(funding.fundingRatePct), 0.05) / 0.05; // caps at 0.05%/interval
  const misaligned = direction
    ? (direction === "LONG" && funding.fundingRatePct > 0.02) || (direction === "SHORT" && funding.fundingRatePct < -0.02)
    : false;
  const raw = direction === null
    ? Math.round(10 * (1 - extremity * 0.5))
    : misaligned
      ? Math.round(10 * (1 - extremity))
      : Math.round(10 * (0.6 + 0.4 * (1 - extremity)));
  return {
    key: "funding",
    label: "Funding",
    weight: 10,
    raw,
    available: true,
    note: `Funding rate ${funding.fundingRatePct.toFixed(4)}%/interval${direction ? ` — ${misaligned ? "crowded against this direction" : "not a crowding risk for this direction"}` : "."}`,
  };
}

function unavailableCategory(key: string, label: string, weight: number, reason: string): ConfluenceCategory {
  return { key, label, weight, raw: 0, available: false, note: reason };
}

export async function computeConfluence(symbol: string, result: SignalResult | null): Promise<ConfluenceResult> {
  const direction = result?.direction ?? null;

  const [openInterest, funding] = await Promise.all([openInterestCategory(symbol, direction), fundingCategory(symbol, direction)]);
  const marketStructure = marketStructureCategory(result);
  const momentumVolume = momentumVolumeCategory(result);
  const liquidations = unavailableCategory(
    "liquidations",
    "Liquidations",
    10,
    "Not connected — real-time liquidation totals need a persistent stream aggregator that this serverless deployment doesn't run.",
  );
  const onchain = unavailableCategory(
    "onchain",
    "On-chain",
    15,
    "Not connected — a market-wide on-chain read needs an aggregate exchange-flow feed this build doesn't have yet (single-wallet lookups exist elsewhere in the product, but that's a different data need).",
  );
  const marketNewsContext = unavailableCategory("marketNewsContext", "Market/News Context", 10, "Not connected — no news/sentiment feed is wired up yet.");

  const scored = [marketStructure, momentumVolume, openInterest, funding, liquidations, onchain, marketNewsContext];
  const availableCount = scored.filter((c) => c.available).length;
  const dataQuality: ConfluenceCategory = {
    key: "dataQuality",
    label: "Data Quality",
    weight: 5,
    raw: Math.round((availableCount / scored.length) * 5),
    available: true,
    note: `${availableCount}/${scored.length} evidence categories had real data for this read.`,
  };

  const categories = [...scored, dataQuality];
  const total = categories.reduce((sum, c) => sum + c.raw, 0);
  const { tier, label } = tierFor(total);
  const call: FinalCall = tier === "strong_setup" || tier === "valid_setup" ? (direction ?? "NO_TRADE") : tier === "watch" ? "WATCH" : "NO_TRADE";

  return { total, tier, tierLabel: label, call, categories };
}
