# Zenthra — Checklist Next Update

Status setelah transformasi produk sesuai Master Blueprint (lihat `DEPLOY.md`
buat panduan deploy yang sekarang jalan, dan audit lengkapnya di riwayat
percakapan/PR terkait). Centang manual di sini pas udah kelar.

## ⚠️ Sudah jujur soal keterbatasannya, tapi belum lengkap

- [ ] **Confluence Score — 3 dari 8 kategori belum tersambung.** Market
      Structure, Momentum+Volume, Open Interest, dan Funding sudah real
      (lihat `lib/scoring/confluence.ts`). Liquidations, On-chain, dan
      Market/News Context masih `available: false` karena butuh
      infrastruktur yang belum ada (aggregator stream buat liquidation,
      feed exchange-flow buat on-chain market-wide, feed berita/sentimen).
      Konsekuensi: skor maksimum yang bisa dicapai sekarang ada di kisaran
      65/100 — tier "Strong Setup"/"Valid Setup" belum akan pernah muncul
      sampai ketiganya disambung. Next: pilih & sambungkan provider buat
      salah satu dari tiga ini dulu (paling gampang: liquidation stream
      lewat proses worker terpisah yang nulis ke cache, bukan on-demand).
- [ ] **Entities & large-transfer feed** (`/api/onchain/*`) — sekarang jujur
      balikin status `unavailable`, bukan lagi data statis yang dikira live.
      Next: kalau mau isi beneran, butuh direktori entitas dengan alamat
      terverifikasi (bukan cuma nama), dan/atau feed transfer besar
      real-time — dua-duanya perlu sumber data baru, belum ada di project ini.
- [ ] **Smart Money** (`/smartmoney`) — halaman kosong yang jujur, belum ada
      feed agregat performa wallet. Next: butuh sumber data PnL-tracking
      per wallet, belum ada integrasinya.
- [ ] **Image enhancement** — kodenya (`lib/tools/media.ts`, fungsi
      `enhanceImage`) sudah dicabut dari tool registry AI agent publik (lihat
      Master Blueprint soal identitas produk), jadi ini sekarang prioritas
      rendah kecuali kamu mau pakai lagi di permukaan lain di luar agent utama.
- [ ] **Token analysis lebih dalam** — sekarang baru harga/market cap/volume
      dari CoinGecko, holder distribution & liquidity masih `null` (jujur,
      bukan angka ngarang). Next: sambungkan sumber data holder/liquidity.
- [ ] **Payment gateway otomatis** — masih QRIS manual (klaim → admin approve
      lewat `/admin` atau curl). Next: integrasi Midtrans/Xendit.
- [ ] **Terms & Privacy** — masih draf awal di landing page, belum direview
      hukum. Penting terutama soal disclaimer trading + kepatuhan UU PDP
      sebelum nerima pembayaran publik secara resmi.
- [ ] **Git history WhatsApp session** — file `creds.json` yang sempat
      kecommit sudah dihapus dari working tree dan `.gitignore` sudah
      diperketat, tapi kalau file itu PERNAH kecommit sebelumnya, riwayatnya
      masih ada di git history sampai kamu jalanin `git filter-repo`/BFG
      secara manual. Cek dulu: `git log --all -- '**/creds.json'`.

## ✅ Baru kelar (transformasi Master Blueprint)

- Identitas baru: AI agent riset on-chain, bukan asisten umum — WhatsApp,
  sticker, downloader, image enhancement sudah keluar dari permukaan publik.
- Brand hitam/putih/biru (bukan cyan/emerald lagi), logo asli terpasang di
  navbar/sidebar/favicon/landing.
- Landing page dibangun ulang total sesuai struktur Blueprint.
- `/ai` jadi pusat produk, Discover & Monitor (gabungan watchlist+alerts)
  baru dibangun, Futures Intelligence dapet Confluence Score deterministik
  dengan tier Strong Setup/Valid Setup/Watch/No Trade.
- Semua data statis/fake yang kecantol dari mockup lama sudah dibersihkan
  (lihat audit) — termasuk fallback AI reply palsu di chat, dan leverage
  yang tadinya dipilih random.
- Admin dipisah dari produk publik, key-nya sekarang cuma di memory
  (nggak lagi kesimpan di localStorage browser).

## ❌ Sengaja tidak dibangun (bukan lagi bagian dari identitas Zenthra)

Hiburan/game dan utility tools generik (kalkulator, konverter, dst.) SENGAJA
tidak dilanjutkan — itu bertentangan langsung sama Master Blueprint soal
identitas Zenthra ("Zenthra is NOT... an entertainment app... a utility
app"). Kalau mau dibangun lagi nanti, itu keputusan produk baru, bukan
"next step" dari checklist ini.

## Rekomendasi urutan prioritas berikutnya

1. Sambungkan salah satu dari Liquidations/On-chain/Market-News-Context —
   ini yang paling langsung ningkatin kualitas Futures Intelligence.
2. Terms & Privacy review hukum — blocker sebelum nerima pembayaran publik
   secara resmi.
3. Entities/Smart Money data real — dampaknya kelihatan tapi butuh riset
   provider dulu (mana yang punya direktori alamat terverifikasi).
4. Payment gateway otomatis — nggak blocking buat mulai narik user pertama,
   tapi ngurangin kerjaan manual approve klaim.
