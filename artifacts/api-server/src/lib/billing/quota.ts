// lib/billing/quota.ts
//
// Enforcement layer buat sistem tier. Dipanggil dari routes/channel (zenthra.ts,
// whatsapp.ts), BUKAN dari dalam Tool Engine — Tool Engine tetap gak perlu tau
// soal user/billing sama sekali (lihat lib/tools/index.ts).

import { listRows, supabaseRequest } from "../../services/supabase";
import { DEFAULT_TIER, TIERS, nextTierSuggestion, type QuotaCategory, type Tier } from "./tiers";

export type Principal = { type: "user"; id: string } | { type: "wa"; id: string };

export class QuotaExceededError extends Error {
  constructor(
    public readonly category: QuotaCategory,
    public readonly tier: Tier,
    public readonly limit: number,
  ) {
    super(`Kuota harian "${category}" habis (limit ${limit}/hari untuk tier ${TIERS[tier].label}).`);
  }
}

async function getTier(principal: Principal): Promise<Tier> {
  // Principal "wa" (chat anonim tanpa akun) SELALU free tier — upgrade cuma
  // lewat akun (web login / Connect your WhatsApp yang tertaut ke akun).
  if (principal.type === "wa") return DEFAULT_TIER;

  try {
    const rows = await listRows<{ tier: Tier; status: string; current_period_end: string | null }>(
      "zenthra_subscriptions",
      `select=tier,status,current_period_end&user_id=eq.${encodeURIComponent(principal.id)}&limit=1`,
    );
    const sub = rows[0];
    if (!sub || sub.status !== "active") return DEFAULT_TIER;
    if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) return DEFAULT_TIER; // expired, turun ke free
    return sub.tier;
  } catch {
    // Supabase belum kekonfigurasi / schema belum ke-install — jangan block user, fallback free.
    return DEFAULT_TIER;
  }
}

async function incrementAndGetCount(principal: Principal, category: QuotaCategory): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    // RPC ini INSERT ... ON CONFLICT DO UPDATE count = count + 1, atomic di sisi
    // Postgres — jadi aman dari race condition dua request masuk bersamaan,
    // beda dengan pola "baca lalu tulis" yang gampang kelewat.
    const result = await supabaseRequest<number>("rpc/increment_zenthra_usage", {
      method: "POST",
      body: {
        p_principal_type: principal.type,
        p_principal_id: principal.id,
        p_category: category,
        p_date: today,
      },
    });
    return typeof result === "number" ? result : 1;
  } catch {
    return 0; // Supabase belum kekonfigurasi / fungsi belum ke-install → jangan block user
  }
}

async function getTodayCount(principal: Principal, category: QuotaCategory): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const rows = await listRows<{ count: number }>(
      "zenthra_usage_daily",
      `select=count&principal_type=eq.${principal.type}&principal_id=eq.${encodeURIComponent(principal.id)}&category=eq.${category}&usage_date=eq.${today}&limit=1`,
    );
    return rows[0]?.count ?? 0;
  } catch {
    return 0; // dipakai getUsageSummary buat nampilin status, bukan buat enforcement
  }
}

/**
 * Cek kuota DAN catat pemakaiannya sekaligus, atomic (increment dulu di Postgres,
 * baru dibandingkan ke limit). Kalau count abis increment > limit, throw
 * QuotaExceededError — konsekuensinya: request yang PAS melewati batas tetap
 * kehitung terpakai (soft quota, bukan financial gate presisi). Ini pilihan
 * sadar: lebih aman dari race condition daripada pola cek-dulu-baru-tulis.
 */
export async function checkAndConsumeQuota(principal: Principal, category: QuotaCategory): Promise<void> {
  const tier = await getTier(principal);
  const limit = TIERS[tier].quotas[category];
  const used = await incrementAndGetCount(principal, category);
  if (limit !== Infinity && used > limit) throw new QuotaExceededError(category, tier, limit);
}

export interface UsageSummary {
  tier: Tier;
  tierLabel: string;
  nextTier: Tier | null;
  usage: Record<QuotaCategory, { used: number; limit: number }>;
}

export async function getUsageSummary(principal: Principal): Promise<UsageSummary> {
  const tier = await getTier(principal);
  const categories: QuotaCategory[] = ["chat", "onchain", "creative"];
  const usage = {} as UsageSummary["usage"];
  for (const category of categories) {
    usage[category] = { used: await getTodayCount(principal, category), limit: TIERS[tier].quotas[category] };
  }
  return { tier, tierLabel: TIERS[tier].label, nextTier: nextTierSuggestion(tier), usage };
}
