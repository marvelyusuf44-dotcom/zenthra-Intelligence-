// lib/tools/index.ts
//
// TOOL ENGINE — registry pusat semua tools yang bisa dipanggil AI/LLM Layer.
// Sengaja dipisah dari routes/*.ts supaya channel apa pun (web, WhatsApp, nanti
// Android) manggil registry yang SAMA. Nambah tool baru = nambah di sini aja,
// otomatis kepakai di semua channel.
//
// Konvensi nambah tool baru:
//   1. Tambah definisi di array `TOOLS` (schema function-calling buat Gemini)
//   2. Tambah case-nya di `executeTool()`
//   3. Kalau tool butuh data dari luar (API baru dsb), taruh fetching logic-nya
//      di lib/zenthra-data.ts atau file adapter baru — JANGAN inline di sini.

import { fetchMarkets, fetchWallet } from "../zenthra-data";
import { computeSignal, computeWatchlistSignals } from "../live-signals";
import { downloadFromUrl, enhanceImage, makeSticker } from "./media";

export const TOOLS = [
  {
    type: "function",
    name: "get_market_data",
    description: "Live price, 24h change, market cap and volume for one or more tracked tokens.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Token symbol, e.g. 'BTC', 'SOL'. Omit to get all tracked markets." },
      },
    },
  },
  {
    type: "function",
    name: "get_signals",
    description: "Current Zenthra signal desk output: direction, score, entry/SL/TP per pair.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Trading pair, e.g. 'SOLUSDT'. Omit for all active signals." },
      },
    },
  },
  {
    type: "function",
    name: "get_wallet_analysis",
    description: "SOL balance and token holdings for a Solana wallet address.",
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address" },
      },
      required: ["address"],
    },
  },
  {
    type: "function",
    name: "check_risk",
    description:
      "Given an account size and a proposed entry/stop-loss, compute a safe position size and flag if the risk is too aggressive. Always call this before proposing a trade size.",
    parameters: {
      type: "object",
      properties: {
        accountSize: { type: "number", description: "Account size in USD" },
        entry: { type: "number", description: "Proposed entry price" },
        stopLoss: { type: "number", description: "Proposed stop-loss price" },
        riskPercent: { type: "number", description: "Percent of account willing to risk on this trade, default 1-2" },
      },
      required: ["accountSize", "entry", "stopLoss"],
    },
  },
  {
    type: "function",
    name: "make_sticker",
    description: "Convert an image into a WhatsApp-ready sticker (square WebP, under 100KB). Provide the image URL the user shared.",
    parameters: {
      type: "object",
      properties: {
        imageUrl: { type: "string", description: "URL of the source image to convert into a sticker." },
      },
      required: ["imageUrl"],
    },
  },
  {
    type: "function",
    name: "download_from_url",
    description:
      "Download a direct file link (image, PDF, document). Does NOT work for social media video links (YouTube/Instagram/TikTok) — those are refused because it violates the platform's Terms of Service.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Direct URL to the file." },
      },
      required: ["url"],
    },
  },
  {
    type: "function",
    name: "enhance_image",
    description: "Upscale/enhance an image to higher resolution. Currently unavailable — will return a clear configuration error until an upscaling provider is connected.",
    parameters: {
      type: "object",
      properties: {
        imageUrl: { type: "string", description: "URL of the source image to enhance." },
      },
      required: ["imageUrl"],
    },
  },
] as const;

export async function executeTool(name: string, args: any): Promise<unknown> {
  switch (name) {
    case "get_market_data": {
      const all = await fetchMarkets();
      if (!args?.symbol) return all;
      const found = all.find((m) => m.symbol.toUpperCase() === String(args.symbol).toUpperCase());
      return found ?? { error: `No market data for "${args.symbol}"` };
    }
    case "get_signals": {
      if (args?.symbol) {
        const signal = await computeSignal(args.symbol);
        return signal ?? { error: `No candle data available for "${args.symbol}"` };
      }
      return await computeWatchlistSignals();
    }
    case "get_wallet_analysis":
      return await fetchWallet(args.address);
    case "check_risk": {
      const { accountSize, entry, stopLoss, riskPercent = 1.5 } = args;
      const riskAmount = accountSize * (riskPercent / 100);
      const perUnitRisk = Math.abs(entry - stopLoss);
      if (!perUnitRisk) return { error: "Entry and stop-loss can't be equal." };
      const positionSize = riskAmount / perUnitRisk;
      const positionValue = positionSize * entry;
      const flags: string[] = [];
      if (riskPercent > 3) flags.push("Risking over 3% of account on one trade is aggressive — most desks cap at 1-2%.");
      if (positionValue > accountSize * 5) flags.push("Implied leverage is high relative to account size — double-check margin requirements.");
      return {
        riskAmountUsd: Number(riskAmount.toFixed(2)),
        suggestedPositionSize: Number(positionSize.toFixed(6)),
        suggestedPositionValueUsd: Number(positionValue.toFixed(2)),
        flags,
      };
    }
    case "make_sticker": {
      try {
        const result = await makeSticker({ url: args?.imageUrl });
        return { ok: true, sizeBytes: result.sizeBytes, base64Webp: result.base64Webp };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Gagal membuat stiker." };
      }
    }
    case "download_from_url": {
      try {
        const result = await downloadFromUrl(args?.url);
        return { ok: true, contentType: result.contentType, sizeBytes: result.sizeBytes, base64: result.base64 };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Gagal mengunduh file." };
      }
    }
    case "enhance_image": {
      try {
        await enhanceImage({ url: args?.imageUrl });
        return { error: "unreachable" }; // enhanceImage selalu throw — lihat lib/tools/media.ts
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Image enhancement belum tersedia." };
      }
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
