// lib/tools/media.ts
//
// Tool creative/utility — CATATAN SOAL SCOPE:
//
// 1. make_sticker: BENERAN JALAN. Convert gambar apa pun ke format stiker
//    WhatsApp (WebP persegi, dikompres di bawah 100KB) pakai `sharp`.
//
// 2. download_from_url: BENERAN JALAN, tapi SENGAJA DIBATASI ke direct file link
//    (gambar/dokumen/dsb yang bisa langsung di-fetch). TIDAK mengunduh video dari
//    YouTube/Instagram/TikTok — itu melanggar Terms of Service platform tersebut
//    dan berisiko pelanggaran hak cipta massal. Kalau kamu butuh unduh video
//    resmi, arahkan user ke fitur ekspor/share resmi platform tersebut.
//
// 3. enhance_image: BELUM BENERAN JALAN — di-scaffold sebagai slot tool yang
//    tinggal disambungkan ke provider upscaling (contoh: Replicate real-esrgan)
//    begitu kamu punya API key-nya. Sekarang balikin pesan "belum dikonfigurasi"
//    yang jujur, bukan hasil palsu.

import sharp from "sharp";
import { doFetch } from "../http";

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024; // 15MB, batas wajar buat direct file link
const STICKER_MAX_BYTES = 100 * 1024; // syarat resmi WhatsApp buat stiker statis

export interface StickerResult {
  base64Webp: string; // siap dikirim balik sebagai stiker (channel yang kirim ke WA)
  sizeBytes: number;
}

/** Convert gambar (URL atau base64) jadi stiker WebP 512x512, dikompres sampai <100KB. */
export async function makeSticker(imageInput: { url?: string; base64?: string }): Promise<StickerResult> {
  let buffer: Buffer;
  if (imageInput.base64) {
    buffer = Buffer.from(imageInput.base64, "base64");
  } else if (imageInput.url) {
    const res = await doFetch(imageInput.url);
    if (!res.ok) throw new Error(`Gagal ambil gambar (${res.status}).`);
    buffer = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("Butuh `url` atau `base64` gambar sumber.");
  }

  // Coba kualitas makin rendah sampai muat di bawah 100KB (syarat WhatsApp).
  for (const quality of [80, 60, 45, 30]) {
    const webp = await (sharp as any)(buffer)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality })
      .toBuffer();
    if (webp.byteLength <= STICKER_MAX_BYTES) {
      return { base64Webp: webp.toString("base64"), sizeBytes: webp.byteLength };
    }
  }
  throw new Error("Gambar tidak bisa dikompres di bawah batas ukuran stiker WhatsApp (100KB). Coba gambar yang lebih sederhana.");
}

export interface DownloadResult {
  base64: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Download direct file link (gambar, PDF, dsb). BUKAN buat video platform sosial
 * media (YouTube/IG/TikTok/dst) — itu di luar scope tool ini, lihat catatan di atas.
 */
export async function downloadFromUrl(url: string): Promise<DownloadResult> {
  const parsed = new URL(url);
  const blockedHosts = ["youtube.com", "youtu.be", "instagram.com", "tiktok.com", "facebook.com", "twitter.com", "x.com"];
  if (blockedHosts.some((h) => parsed.hostname.endsWith(h))) {
    throw new Error(
      "Zenthra tidak mengunduh video/konten dari platform sosial media (melanggar ToS platform tersebut). Gunakan fitur share/export resmi dari aplikasinya.",
    );
  }

  const res = await doFetch(url);
  if (!res.ok) throw new Error(`Gagal unduh (${res.status}).`);
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_DOWNLOAD_BYTES) throw new Error("File lebih besar dari batas 15MB.");

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("File lebih besar dari batas 15MB.");

  return {
    base64: buffer.toString("base64"),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    sizeBytes: buffer.byteLength,
  };
}

/** Slot tool image enhancement — belum tersambung ke provider mana pun. */
export async function enhanceImage(_imageInput: { url?: string; base64?: string }): Promise<never> {
  throw new Error(
    "Image enhancement belum dikonfigurasi di server (butuh provider upscaling, misal Replicate real-esrgan — tambahkan API key-nya lalu sambungkan di sini).",
  );
}
