// lib/billing/tiers.ts
//
// Definisi tier & kuota harian. INI SATU-SATUNYA TEMPAT buat ubah harga/limit —
// jangan hardcode angka kuota di file lain, import dari sini.
//
// Kategori kuota:
//   chat     — setiap pesan masuk (base cost setiap kali user ngobrol)
//   onchain  — tool get_wallet_analysis / get_signals (paling mahal, panggil API luar)
//   creative — tool make_sticker / download_from_url / enhance_image

export type Tier = "free" | "pelajar" | "plus" | "pro";
export type QuotaCategory = "chat" | "onchain" | "creative";

export interface TierConfig {
  label: string;
  priceIdrPerMonth: number; // 0 = gratis
  quotas: Record<QuotaCategory, number>; // per hari, Infinity = fair-use unlimited
}

export const TIERS: Record<Tier, TierConfig> = {
  free: {
    label: "Free",
    priceIdrPerMonth: 0,
    quotas: { chat: 15, onchain: 3, creative: 2 },
  },
  pelajar: {
    label: "Pelajar",
    priceIdrPerMonth: 12_000,
    quotas: { chat: 100, onchain: 20, creative: 15 },
  },
  plus: {
    label: "Plus",
    priceIdrPerMonth: 35_000,
    quotas: { chat: Infinity, onchain: 100, creative: 50 },
  },
  pro: {
    label: "Pro",
    priceIdrPerMonth: 89_000,
    quotas: { chat: Infinity, onchain: Infinity, creative: Infinity },
  },
};

/** Tier default buat principal yang belum punya baris subscription — dan SATU-SATUNYA
 * tier yang berlaku buat user WhatsApp anonim ("Chat with Zenthra" tanpa akun). */
export const DEFAULT_TIER: Tier = "free";

export function nextTierSuggestion(tier: Tier): Tier | null {
  const order: Tier[] = ["free", "pelajar", "plus", "pro"];
  const idx = order.indexOf(tier);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
}
