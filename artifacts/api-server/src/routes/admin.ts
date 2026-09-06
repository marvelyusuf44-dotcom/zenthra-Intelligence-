// routes/admin.ts
//
// Admin control-center endpoints that aren't billing-specific (users list,
// daily usage aggregate, data-source configuration status). Kept separate
// from routes/billing.ts so that file stays focused on the QRIS claim flow.
//
// All routes here are read-only and protected by the same requireAdmin
// shared-secret middleware as routes/billing.ts (see middleware/auth.ts) —
// this intentionally does NOT introduce a new auth model. No route in this
// file ever echoes back ADMIN_API_SECRET, GEMINI_API_KEY, HELIUS_API_KEY,
// SUPABASE_SERVICE_ROLE_KEY, or any other secret value — only booleans for
// "is this configured".

import { Router, type IRouter } from "express";
import { requireAdmin } from "../middleware/auth";
import { listRows } from "../services/supabase";
import { TIERS, type QuotaCategory } from "../lib/billing/tiers";

const router: IRouter = Router();

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  zenthra_subscriptions: { tier: string; status: string; current_period_end: string | null } | null;
}

// Admin: full user list with their current subscription, newest first.
// Relies on the zenthra_subscriptions -> zenthra_users foreign key so
// PostgREST can embed it in one request instead of two round-trips.
router.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const rows = await listRows<UserRow>(
      "zenthra_users",
      "select=id,email,created_at,zenthra_subscriptions(tier,status,current_period_end)&order=created_at.desc&limit=200",
    );
    return res.json(
      rows.map((row) => ({
        id: row.id,
        email: row.email,
        createdAt: row.created_at,
        tier: row.zenthra_subscriptions?.tier ?? "free",
        subscriptionStatus: row.zenthra_subscriptions?.status ?? "active",
        currentPeriodEnd: row.zenthra_subscriptions?.current_period_end ?? null,
      })),
    );
  } catch (error) {
    req.log.error({ error }, "admin users list failed");
    return res.status(503).json({ error: "User list is unavailable. Confirm the Supabase schema is installed." });
  }
});

// Admin: today's real usage counts by category, summed across every principal
// (logged-in users AND anonymous WhatsApp numbers). No estimate/fake numbers —
// if the table can't be reached this returns an explicit error, not zeros.
router.get("/admin/usage-today", requireAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await listRows<{ category: QuotaCategory; count: number; principal_type: "user" | "wa" }>(
      "zenthra_usage_daily",
      `select=category,count,principal_type&usage_date=eq.${today}`,
    );
    const totals: Record<QuotaCategory, number> = { chat: 0, onchain: 0, creative: 0 };
    let webPrincipals = 0;
    let waPrincipals = 0;
    for (const row of rows) {
      totals[row.category] = (totals[row.category] ?? 0) + row.count;
      if (row.principal_type === "user") webPrincipals++;
      else waPrincipals++;
    }
    return res.json({ date: today, totals, activePrincipals: { web: webPrincipals, whatsapp: waPrincipals } });
  } catch (error) {
    req.log.error({ error }, "admin usage aggregate failed");
    return res.status(503).json({ error: "Usage data is unavailable. Confirm the Supabase schema is installed." });
  }
});

// Admin: configuration status of every external dependency. This reports
// whether each secret/key is PRESENT in the environment, never its value,
// and never claims a provider is "healthy" beyond that — an env var being
// set doesn't guarantee the upstream provider is currently reachable.
router.get("/admin/data-sources", requireAdmin, (_req, res) => {
  const configured = (name: string) => Boolean(process.env[name]?.trim());
  return res.json({
    sources: [
      { name: "Gemini (AI engine)", configured: configured("GEMINI_API_KEY"), note: "Chat/agent falls back to an honest 'AI unavailable' message when unset." },
      { name: "Helius (Solana on-chain)", configured: configured("HELIUS_API_KEY"), note: "Wallet analysis returns an explicit 'not configured' state when unset." },
      { name: "CoinGecko (market data)", configured: true, note: "Public endpoint, no key required." },
      { name: "Binance (futures candles)", configured: true, note: "Public endpoint, no key required." },
      { name: "Supabase (database)", configured: configured("SUPABASE_URL") && configured("SUPABASE_SERVICE_ROLE_KEY"), note: "History, watchlist, alerts, billing, and this admin panel all depend on this." },
      { name: "WhatsApp Cloud API", configured: configured("WHATSAPP_ACCESS_TOKEN") && configured("WHATSAPP_PHONE_NUMBER_ID"), note: "Internal notification channel — not part of the public product." },
      { name: "WhatsApp Embedded Signup", configured: configured("META_APP_ID") && configured("META_APP_SECRET") && configured("META_CONFIG_ID"), note: "Gated behind Meta App Review; internal only." },
    ],
    tiers: Object.entries(TIERS).map(([id, cfg]) => ({ id, label: cfg.label })),
    generatedAt: new Date().toISOString(),
  });
});

export default router;
