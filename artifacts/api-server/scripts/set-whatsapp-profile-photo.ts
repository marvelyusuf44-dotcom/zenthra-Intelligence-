// scripts/set-whatsapp-profile-photo.ts
//
// Set foto profil nomor WhatsApp Business Zenthra ("Chat with Zenthra") lewat
// Graph API resmi Meta — BUKAN via WhatsApp Web/automation tidak resmi (nomor
// WA nggak punya cara ganti foto profil selain lewat app WhatsApp itu sendiri
// ATAU API resmi ini).
//
// CARA PAKAI (jalanin SEKALI setelah API server live & env var udah di-set di Railway):
//   cd artifacts/api-server
//   pnpm exec tsx scripts/set-whatsapp-profile-photo.ts scripts/assets/zenthra-wa-avatar.png
//
// Butuh env (ambil dari Railway/​.env kamu):
//   META_APP_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
//
// Alur resmi Meta (Resumable Upload API), 3 langkah:
//   1. Buka upload session di level App
//   2. Upload byte gambarnya, dapet "file handle"
//   3. PATCH whatsapp_business_profile pakai handle itu

import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const GRAPH_API_VERSION = "v21.0";

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  throw new Error(`Format ${ext} tidak didukung WhatsApp business profile photo — pakai PNG atau JPEG.`);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: pnpm exec tsx scripts/set-whatsapp-profile-photo.ts <path-ke-gambar>");
    process.exit(1);
  }

  const appId = process.env.META_APP_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!appId || !token || !phoneNumberId) {
    console.error("Env belum lengkap: butuh META_APP_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID.");
    process.exit(1);
  }

  const fileBytes = readFileSync(filePath);
  const fileSize = statSync(filePath).size;
  const mime = mimeFor(filePath);

  console.log(`Uploading ${filePath} (${fileSize} bytes, ${mime})...`);

  // Langkah 1: buka upload session
  const sessionUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads`);
  sessionUrl.searchParams.set("file_length", String(fileSize));
  sessionUrl.searchParams.set("file_type", mime);
  sessionUrl.searchParams.set("access_token", token);

  const sessionRes = await fetch(sessionUrl.toString(), { method: "POST" });
  if (!sessionRes.ok) throw new Error(`Gagal buka upload session (${sessionRes.status}): ${await sessionRes.text()}`);
  const session = (await sessionRes.json()) as { id?: string };
  if (!session.id) throw new Error("Upload session tidak mengembalikan ID.");

  // Langkah 2: upload byte-nya, dapet file handle
  const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${session.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: "0",
    },
    body: new Uint8Array(fileBytes),
  });
  if (!uploadRes.ok) throw new Error(`Gagal upload file (${uploadRes.status}): ${await uploadRes.text()}`);
  const uploaded = (await uploadRes.json()) as { h?: string };
  if (!uploaded.h) throw new Error("Upload tidak mengembalikan file handle.");

  console.log("Upload sukses, ngeset sebagai foto profil...");

  // Langkah 3: set sebagai foto profil business
  const profileRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/whatsapp_business_profile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: uploaded.h }),
  });
  if (!profileRes.ok) throw new Error(`Gagal set foto profil (${profileRes.status}): ${await profileRes.text()}`);

  console.log("Foto profil WhatsApp Zenthra berhasil diupdate.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
