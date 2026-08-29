// lib/security/crypto.ts
//
// Enkripsi application-level (AES-256-GCM) buat data sensitif yang disimpan
// di DB — dipakai pertama kali buat access_token di zenthra_wa_connections
// (sebelumnya plaintext, itu bug hardening yang sudah ditandai).
//
// KENAPA application-level, bukan fitur enkripsi Supabase (pgsodium)?
// Portable — jalan sama persis di Supabase tier mana pun tanpa perlu aktifin
// extension khusus, dan kunci enkripsi dipegang server (Railway env), bukan
// di sisi database sama sekali.

import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.WA_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("WA_TOKEN_ENCRYPTION_KEY belum di-set di environment.");
  // Terima key dalam bentuk apa pun (passphrase biasa, bukan cuma hex 32-byte
  // presisi) — di-hash SHA-256 dulu biar selalu tepat 32 byte buat AES-256.
  return createHash("sha256").update(raw).digest();
}

/** Format output: base64(iv):base64(authTag):base64(ciphertext) — gampang disimpan sebagai satu kolom text. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit, rekomendasi standar buat GCM
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Format ciphertext tidak valid.");
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
