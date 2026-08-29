// routes/billing.ts
//
// Alur monetisasi saat ini — QRIS MANUAL, belum payment gateway otomatis:
//   1. User pilih tier di /pricing (web), scan QRIS statis, transfer.
//   2. User klik "Saya sudah bayar" → POST /billing/claim (bikin baris "pending").
//   3. Admin (kamu) cek mutasi QRIS masuk manual, lalu approve lewat
//      POST /billing/admin/confirm-payment (dilindungi ADMIN_API_SECRET, BUKAN
//      login user biasa — lihat middleware/auth.ts requireAdmin).
//   4. Begitu di-approve, tier user langsung aktif.
//
// /billing/admin/set-tier tetap ada buat override manual cepat (mis. kasih akses
// gratis ke tester) — juga admin-only. TIDAK ada endpoint yang bisa dipanggil
// user buat upgrade diri sendiri tanpa lewat proses klaim di atas.
//
// Upgrade ke payment gateway otomatis (Midtrans/Xendit, keduanya support QRIS)
// tinggal ganti langkah 3: webhook gateway manggil /billing/admin/confirm-payment
// otomatis pakai ADMIN_API_SECRET, gantiin proses cek manual kamu.

import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { insertRow, listRows, supabaseRequest } from "../services/supabase";
import { getUsageSummary } from "../lib/billing/quota";
import { TIERS } from "../lib/billing/tiers";

const router: IRouter = Router();

router.get("/billing/plans", (_req, res) => {
  res.json(
    Object.entries(TIERS).map(([id, cfg]) => ({
      id,
      label: cfg.label,
      priceIdrPerMonth: cfg.priceIdrPerMonth,
      quotas: Object.fromEntries(
        Object.entries(cfg.quotas).map(([k, v]) => [k, v === Infinity ? "unlimited" : v]),
      ),
    })),
  );
});

router.get("/billing/me", requireAuth, async (req, res) => {
  try {
    const summary = await getUsageSummary({ type: "user", id: req.user!.id });
    res.json(summary);
  } catch (error) {
    req.log.error({ error }, "billing summary failed");
    res.status(503).json({ error: "Status langganan tidak tersedia." });
  }
});

// --- Pembayaran QRIS manual (belum ada payment gateway otomatis) ---

const claimInput = z.object({
  tier: z.enum(["pelajar", "plus", "pro"]),
  note: z.string().max(200).optional(),
});

// User klik "Saya sudah bayar" setelah scan QRIS di halaman /pricing.
router.post("/billing/claim", requireAuth, async (req, res) => {
  const parsed = claimInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pilih tier yang valid." });
  try {
    const claim = await insertRow("zenthra_payment_claims", {
      user_id: req.user!.id,
      tier: parsed.data.tier,
      note: parsed.data.note ?? null,
      status: "pending",
    });
    return res.status(201).json({ id: claim.id, status: claim.status });
  } catch (error) {
    req.log.error({ error }, "payment claim failed");
    return res.status(503).json({ error: "Gagal mengirim konfirmasi pembayaran." });
  }
});

// Admin liat antrian klaim yang perlu dicek manual — panggil dengan header x-admin-secret.
router.get("/billing/admin/claims", requireAdmin, async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "pending";
    const rows = await listRows(
      "zenthra_payment_claims",
      `select=id,user_id,tier,note,status,created_at&status=eq.${encodeURIComponent(status)}&order=created_at.asc`,
    );
    return res.json(rows);
  } catch (error) {
    req.log.error({ error }, "admin claims list failed");
    return res.status(503).json({ error: "Daftar klaim tidak tersedia." });
  }
});

const confirmInput = z.object({ claimId: z.string().uuid() });

// Admin approve setelah cek mutasi QRIS masuk manual → set tier + tandai klaim selesai.
router.post("/billing/admin/confirm-payment", requireAdmin, async (req, res) => {
  const parsed = confirmInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "claimId tidak valid." });

  try {
    const claims = await listRows<{ id: string; user_id: string; tier: "pelajar" | "plus" | "pro"; status: string }>(
      "zenthra_payment_claims",
      `select=id,user_id,tier,status&id=eq.${encodeURIComponent(parsed.data.claimId)}&limit=1`,
    );
    const claim = claims[0];
    if (!claim) return res.status(404).json({ error: "Klaim tidak ditemukan." });
    if (claim.status !== "pending") return res.status(409).json({ error: `Klaim sudah berstatus "${claim.status}".` });

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await supabaseRequest("zenthra_subscriptions?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: { user_id: claim.user_id, tier: claim.tier, status: "active", current_period_end: periodEnd.toISOString() },
    });

    await supabaseRequest(`zenthra_payment_claims?id=eq.${encodeURIComponent(claim.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { status: "confirmed", resolved_at: new Date().toISOString() },
    });

    return res.json({ ok: true, userId: claim.user_id, tier: claim.tier });
  } catch (error) {
    req.log.error({ error }, "confirm payment failed");
    return res.status(503).json({ error: "Gagal konfirmasi pembayaran." });
  }
});

router.post("/billing/admin/reject-payment", requireAdmin, async (req, res) => {
  const parsed = confirmInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "claimId tidak valid." });
  try {
    await supabaseRequest(`zenthra_payment_claims?id=eq.${encodeURIComponent(parsed.data.claimId)}&status=eq.pending`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { status: "rejected", resolved_at: new Date().toISOString() },
    });
    return res.json({ ok: true });
  } catch (error) {
    req.log.error({ error }, "reject payment failed");
    return res.status(503).json({ error: "Gagal menolak klaim." });
  }
});

// --- Upgrade langsung (ADMIN-ONLY sekarang — sebelumnya bisa dipanggil user
// sendiri buat upgrade diri sendiri gratis tanpa bayar, itu bug, sudah ditutup) ---

const upgradeInput = z.object({ userId: z.string().uuid(), tier: z.enum(["free", "pelajar", "plus", "pro"]) });

router.post("/billing/admin/set-tier", requireAdmin, async (req, res) => {
  const parsed = upgradeInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "userId/tier tidak valid." });

  try {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await supabaseRequest("zenthra_subscriptions?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: { user_id: parsed.data.userId, tier: parsed.data.tier, status: "active", current_period_end: periodEnd.toISOString() },
    });
    return res.status(200).json({ userId: parsed.data.userId, tier: parsed.data.tier, status: "active" });
  } catch (error) {
    req.log.error({ error }, "admin set-tier failed");
    return res.status(503).json({ error: "Gagal update langganan." });
  }
});

export default router;
