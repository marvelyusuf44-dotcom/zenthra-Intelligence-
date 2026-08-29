import { GetMarketsResponse, GetWalletResponse } from "@workspace/api-zod";

const COIN_IDS = [
  ["bitcoin", "BTC", "Bitcoin"],
  ["ethereum", "ETH", "Ethereum"],
  ["solana", "SOL", "Solana"],
  ["binancecoin", "BNB", "BNB"],
  ["ripple", "XRP", "XRP"],
  ["dogecoin", "DOGE", "Dogecoin"],
  ["jupiter-exchange-solana", "JUP", "Jupiter"],
  ["bonk", "BONK", "Bonk"],
] as const;

export async function fetchMarkets() {
  const ids = COIN_IDS.map(([id]) => id).join(",");
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=20&page=1`,
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`CoinGecko request failed (${response.status})`);
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return GetMarketsResponse.parse(
    rows.map((row, index) => ({
      rank: index + 1,
      name: String(row.name ?? COIN_IDS[index]?.[2] ?? "Unknown"),
      symbol: String(row.symbol ?? COIN_IDS[index]?.[1] ?? "").toUpperCase(),
      price: Number(row.current_price ?? 0),
      change24h: Number(row.price_change_percentage_24h ?? 0),
      volume24h: Number(row.total_volume ?? 0),
      marketCap: Number(row.market_cap ?? 0),
    })),
  );
}

// Live signals now come from ./live-signals.ts (real scoring engine over
// Binance candles) instead of the static mock array that used to live here.

export async function fetchWallet(address: string) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    return GetWalletResponse.parse({ address, solBalance: 0, tokenCount: 0, tokens: [], error: "HELIUS_API_KEY is not configured on the server." });
  }
  const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "zenthra", method: "getAssetsByOwner",
      params: { ownerAddress: address, page: 1, limit: 50, displayOptions: { showFungible: true, showNativeBalance: true } },
    }),
  });
  if (!response.ok) throw new Error(`Helius request failed (${response.status})`);
  const payload = await response.json() as { result?: { nativeBalance?: { lamports?: number }; items?: Array<Record<string, any>> }; error?: { message?: string } };
  if (payload.error) return GetWalletResponse.parse({ address, solBalance: 0, tokenCount: 0, tokens: [], error: payload.error.message ?? "Helius returned an error" });
  const result = payload.result ?? {};
  const tokens = (result.items ?? [])
    .filter((item) => item.interface === "FungibleToken" || item.interface === "FungibleAsset")
    .slice(0, 10)
    .map((item) => {
      const decimals = item.token_info?.decimals;
      const balance = item.token_info?.balance;
      return { name: item.content?.metadata?.name ?? "Unknown token", symbol: item.token_info?.symbol ?? "", amount: typeof balance === "number" && typeof decimals === "number" ? balance / 10 ** decimals : null };
    });
  return GetWalletResponse.parse({ address, solBalance: Number(result.nativeBalance?.lamports ?? 0) / 1e9, tokenCount: tokens.length, tokens });
}