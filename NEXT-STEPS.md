# Zenthra — Checklist Next Update

Status per hari ini (lihat `DEPLOY.md` buat panduan deploy yang sekarang jalan).
Centang manual di sini pas udah kelar, biar gampang lacak progress antar sesi.

## ⚠️ Ada tapi belum lengkap / belum bisa publik

- [ ] **Connect your WhatsApp** — kodenya jalan, ketutup App Review Meta.
      Belum bisa dibuka ke user umum, baru buat Admin/Tester yang didaftarin
      manual di Meta App Dashboard. Next: submit App Review begitu siap.
- [ ] **Image enhancement/HD** — slot tool udah ada (`lib/tools/media.ts`,
      fungsi `enhanceImage`), belum tersambung ke provider mana pun. Next:
      pilih provider (misal Replicate real-esrgan), tambah API key, sambungin.
- [ ] **Whale/smart-money activity & entities** — MASIH DATA MOCK/STATIS dari
      project lama (`onchain/entities`, `onchain/transfers`). Ini keunggulan
      terbesar yang disebut di brief tapi belum live. Next: ganti ke data
      on-chain real (Helius webhook/API buat Solana, atau provider serupa).
- [ ] **Token analysis lebih dalam** — sekarang baru harga/market cap dari
      CoinGecko. Next: tambah holder distribution, liquidity, dst.
- [ ] **Payment gateway otomatis** — masih QRIS manual (klaim → admin approve).
      Next: integrasi Midtrans/Xendit (butuh akun merchant kamu).
- [ ] **Landing page — isi placeholder** — 3 konstanta di `index.html`
      (`ZENTHRA_WA_NUMBER`, `API_BASE`, `APP_URL`) + bagian About/Contact.
- [ ] **Terms & Privacy** — masih draf awal, belum direview hukum. Penting
      terutama soal disclaimer trading + kepatuhan UU PDP sebelum publish resmi.

## ❌ Belum kesentuh sama sekali

- [ ] **Hiburan/game** — disebut di brief awal, belum ada tool apa pun.
- [ ] **Utility tools lain** — kalkulator, konverter, dsb (di luar sticker/downloader).
- [ ] **Android channel** — arsitektur Zenthra API udah siap nampung
      (`Zenthra AI Engine → Zenthra API → WhatsApp / Web / Android`), tapi
      channel Android-nya sendiri belum dibangun. Ini memang direncanakan "nanti".

## Rekomendasi urutan prioritas berikutnya

1. Whale/smart-money & entities (data live) — ini disebut eksplisit sebagai
   keunggulan terbesar Zenthra, dampaknya paling kelihatan.
2. Isi placeholder landing page + Terms/Privacy — blocker sebelum publish publik.
3. Image enhancement — quick win begitu ada provider key.
4. Sisanya (hiburan/game, utility tools, Android, payment gateway otomatis)
   — bisa nyusul belakangan, gak blocking buat mulai narik user pertama.
