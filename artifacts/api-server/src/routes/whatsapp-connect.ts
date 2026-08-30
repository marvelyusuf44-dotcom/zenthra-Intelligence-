// routes/whatsapp-connect.ts
//
// "Connect your WhatsApp" — user menautkan nomor WhatsApp Business MILIK MEREKA
// SENDIRI lewat WhatsApp Embedded Signup resmi Meta. Beda dengan routes/whatsapp.ts
// (webhook nomor resmi Zenthra buat "Chat with Zenthra").
//
// Alur (semuanya lewat mekanisme resmi Meta, bukan automation WA Web):
//   1. Frontend load Facebook JS SDK, user klik "Connect WhatsApp Business".
//   2. FB.login() dengan config_id dari Meta App Dashboard (WhatsApp > Embedded Signup)
//      membuka popup resmi Meta. User login & pilih/verifikasi nomor WA Business mereka.
//   3. Popup mengirim `code` (authorization code) + event postMessage berisi
//      { waba_id, phone_number_id } ke frontend.
//   4. Frontend POST ke /api/whatsapp/connect/callback dengan { code, wabaId, phoneNumberId }.
//   5. Backend (endpoint ini) tukar `code` jadi access token via Graph API,
//      lalu simpan koneksi ke tabel zenthra_wa_connections.
//
// PENTING — ini bukan cuma soal kode: buat production (bukan sekadar testing),
// akun Meta App kamu perlu App Review untuk permission `whatsapp_business_management`
// dan `whatsapp_business_messaging`, plus tergabung sebagai Tech Provider/Solution
// Partner kalau mau nautkan nomor bisnis ORANG LAIN (bukan cuma nomor kamu sendiri).
// Itu proses approval di Meta, bukan sesuatu yang bisa "dikodein".

import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { insertRow, listRows, supabaseRequest } from "../services/supabase";
import { encryptSecret } from "../lib/security/crypto";

const router: IRouter = Router();
const GRAPH_API_VERSION = "v21.0";

const callbackInput = z.object({
  code: z.string().min(1),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  businessName: z.string().max(120).optional(),
});

// Config publik yang dibutuhkan frontend buat manggil FB.login() — bukan secret,
// aman dikirim ke client (App ID & Config ID memang didesain publik oleh Meta).
router.get("/whatsapp/connect/config", (_req, res) => {
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_CONFIG_ID;
  if (!appId || !configId) {
    return res.status(503).json({ error: "WhatsApp Embedded Signup belum dikonfigurasi di server." });
  }
  return res.json({ appId, configId });
});

router.post("/whatsapp/connect/callback", requireAuth, async (req, res) => {
  const parsed = callbackInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Data konfirmasi WhatsApp tidak valid." });

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return res.status(503).json({ error: "WhatsApp Embedded Signup belum dikonfigurasi di server." });

  try {
    // Tukar authorization code jadi access token resmi lewat Graph API.
    const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", parsed.data.code);

    const tokenRes = await fetch(tokenUrl.toString());
    if (!tokenRes.ok) {
      const detail = await tokenRes.text().catch(() => "");
      req.log.error({ detail, status: tokenRes.status }, "whatsapp token exchange failed");
      return res.status(502).json({ error: "Gagal verifikasi ke Meta. Coba ulangi proses connect." });
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) return res.status(502).json({ error: "Meta tidak mengembalikan access token." });

    const connection = await insertRow("zenthra_wa_connections", {
      user_id: req.user!.id,
      waba_id: parsed.data.wabaId,
      phone_number_id: parsed.data.phoneNumberId,
      business_name: parsed.data.businessName ?? null,
      access_token: encryptSecret(tokenData.access_token), // dienkripsi, bukan plaintext lagi
      status: "active",
    });

    return res.status(201).json({
      id: connection.id,
      wabaId: connection.waba_id,
      phoneNumberId: connection.phone_number_id,
      businessName: connection.business_name,
      status: connection.status,
    });
  } catch (error) {
    req.log.error({ error }, "whatsapp connect callback failed");
    return res.status(503).json({ error: "Koneksi WhatsApp gagal disimpan. Konfirmasi skema Supabase sudah ter-install." });
  }
});

router.get("/whatsapp/connect", requireAuth, async (req, res) => {
  try {
    const rows = await listRows(
      "zenthra_wa_connections",
      `select=id,waba_id,phone_number_id,business_name,status,created_at&user_id=eq.${encodeURIComponent(req.user!.id)}&order=created_at.desc`,
    );
    return res.json(rows);
  } catch (error) {
    req.log.error({ error }, "whatsapp connections list failed");
    return res.status(503).json({ error: "Daftar koneksi WhatsApp tidak tersedia." });
  }
});

router.delete("/whatsapp/connect/:id", requireAuth, async (req, res) => {
  try {
    // Soft-delete: tandai revoked, bukan hard-delete — biar histori tetap ada buat audit.
    await supabaseRequest(
      `zenthra_wa_connections?id=eq.${encodeURIComponent(String(req.params.id))}&user_id=eq.${encodeURIComponent(req.user!.id)}`,
      { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { status: "revoked" } },
    );
    return res.status(204).send();
  } catch (error) {
    req.log.error({ error }, "whatsapp disconnect failed");
    return res.status(503).json({ error: "Gagal memutuskan koneksi WhatsApp." });
  }
});

export default router;
