// routes/whatsapp.ts
//
// Channel WhatsApp resmi (Meta WhatsApp Business Platform / Cloud API).
// TIDAK pakai automation WhatsApp Web tidak resmi — ini webhook resmi Meta.
//
// Setup yang dibutuhkan di Meta App Dashboard (WhatsApp > Configuration):
//   - Callback URL   : https://<domain-api-kamu>/api/whatsapp/webhook
//   - Verify token   : samain dengan env WHATSAPP_VERIFY_TOKEN
//   - Webhook fields : messages
//
// Env vars yang wajib ada (lihat .env.example di root):
//   WHATSAPP_VERIFY_TOKEN     — token bebas kamu tentuin sendiri, buat verifikasi webhook
//   WHATSAPP_ACCESS_TOKEN     — access token dari Meta App (System User token buat production)
//   WHATSAPP_PHONE_NUMBER_ID  — Phone Number ID dari WhatsApp Business Platform
//
// CATATAN FASE HARDENING (sudah selesai):
// Histori percakapan per nomor WA disimpan di tabel zenthra_wa_messages,
// bukan lagi in-memory — aman dari restart server & scale ke banyak instance.

import { Router, type IRouter } from "express";
import { runChat, type ChatHistoryItem } from "../lib/ai/chat-engine";
import { checkAndConsumeQuota, QuotaExceededError } from "../lib/billing/quota";
import { insertRow, listRows } from "../services/supabase";
import { doFetch } from "../lib/http";

const router: IRouter = Router();

const GRAPH_API_VERSION = "v21.0";
const MAX_HISTORY_PER_USER = 10;

/** GANTI dari versi awal yang in-memory (Map) — sekarang DB-backed lewat
 * zenthra_wa_messages, jadi aman dari restart server & scale ke banyak instance. */
async function loadHistory(waId: string): Promise<ChatHistoryItem[]> {
  try {
    const rows = await listRows<{ role: "user" | "assistant"; text: string }>(
      "zenthra_wa_messages",
      `select=role,text&wa_id=eq.${encodeURIComponent(waId)}&order=created_at.desc&limit=${MAX_HISTORY_PER_USER}`,
    );
    return rows.reverse(); // dibalik lagi jadi urutan kronologis (lama → baru)
  } catch {
    return []; // Supabase belum kekonfigurasi → jalan tanpa histori, jangan block chat
  }
}

async function saveMessage(waId: string, role: "user" | "assistant", text: string): Promise<void> {
  try {
    await insertRow("zenthra_wa_messages", { wa_id: waId, role, text });
  } catch {
    // Gagal nyimpen histori jangan sampai gagalin balasan yang udah kekirim ke user.
  }
}

function requireWaCredentials() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID belum dikonfigurasi.");
  }
  return { token, phoneNumberId };
}

async function sendWhatsAppText(to: string, body: string) {
  const { token, phoneNumberId } = requireWaCredentials();
  const res = await doFetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      // WhatsApp membatasi ~4096 karakter per pesan teks.
      text: { body: body.slice(0, 4000) },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`WhatsApp send gagal (${res.status}): ${errText}`);
  }
}

/** Upload media (misal WebP stiker) ke Graph API, balikin media ID buat dipakai di sendWhatsAppSticker(). */
async function uploadWhatsAppMedia(base64Webp: string): Promise<string> {
  const { token, phoneNumberId } = requireWaCredentials();
  const bytes = Buffer.from(base64Webp, "base64");
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([bytes], { type: "image/webp" }), "sticker.webp");

  const res = await doFetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`WhatsApp media upload gagal (${res.status}): ${errText}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("WhatsApp media upload tidak mengembalikan ID.");
  return data.id;
}

async function sendWhatsAppSticker(to: string, base64Webp: string) {
  const { token, phoneNumberId } = requireWaCredentials();
  const mediaId = await uploadWhatsAppMedia(base64Webp);

  const res = await doFetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "sticker", sticker: { id: mediaId } }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`WhatsApp sticker send gagal (${res.status}): ${errText}`);
  }
}

// --- Verifikasi webhook (dipanggil Meta sekali saat kamu setup webhook di dashboard) ---
router.get("/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Terima pesan masuk ---
router.post("/whatsapp/webhook", async (req, res) => {
  // WAJIB respons cepat ke Meta (di luar 20 detik webhook dianggap gagal & di-retry),
  // jadi kita ack duluan lalu proses balasan secara async.
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message || message.type !== "text") return; // skip status update, media, dsb (fase 1)

    const waId: string = message.from; // nomor pengirim, format internasional tanpa "+"
    const text: string = message.text?.body ?? "";
    if (!text.trim()) return;

    const principal = { type: "wa" as const, id: waId };

    try {
      await checkAndConsumeQuota(principal, "chat");
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        // Chat lewat WhatsApp tanpa akun (anonim) SELALU free tier — buat naikin
        // limit, user harus bikin akun web dulu lalu pakai "Connect your WhatsApp".
        await sendWhatsAppText(
          waId,
          "Kuota chat gratis hari ini udah habis. Bikin akun Zenthra di web buat upgrade tier dan lanjut chat.",
        );
        return;
      }
      throw error;
    }

    const history = await loadHistory(waId);
    const { reply, media } = await runChat(text, history, {
      onToolUsed: (category) => checkAndConsumeQuota(principal, category),
    });

    await saveMessage(waId, "user", text);
    await saveMessage(waId, "assistant", reply);

    const sticker = media.find((m) => m.type === "sticker");
    if (sticker) await sendWhatsAppSticker(waId, sticker.base64Webp);
    await sendWhatsAppText(waId, reply);
  } catch (error) {
    req.log.error({ error }, "whatsapp webhook processing failed");
  }
});

export default router;
