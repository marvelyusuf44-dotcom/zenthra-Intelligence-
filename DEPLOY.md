# Zenthra — Panduan Deploy (GitHub → Railway → Vercel)

## Kenapa split, bukan semua di Vercel?

`artifacts/api-server` pakai **Socket.io** (koneksi realtime jangka panjang) dan
proses Express yang jalan terus (`app.listen`). Vercel itu serverless — fungsi
jalan lalu mati per-request, jadi nggak cocok buat koneksi realtime yang harus
tetap nyala. Kamu juga sudah punya pengalaman Railway dari bot Telegram, jadi:

- **API server** (Express + AI Engine + Tool Engine + WhatsApp webhook) → **Railway**
- **Frontend/web app** (React + Vite) → **Vercel** (emang buat ini)

Keduanya tetap satu repo GitHub yang sama — cuma beda "Root Directory" pas connect ke masing-masing platform.

## 1. Push ke GitHub

```bash
cd Zenthra-Intelligence
git init
git add .
git commit -m "Zenthra Phase 1: consolidated tool engine + WhatsApp channel"
git branch -M main
git remote add origin https://github.com/marvelyusuf44-dotcom/zenthra-intelligence.git
git push -u origin main
```

(Buat dulu repo kosong `zenthra-intelligence` di GitHub kalau belum ada.)

## 2. Deploy API server ke Railway

1. Railway dashboard → **New Project** → **Deploy from GitHub repo** → pilih repo ini.
2. **Root Directory**: `artifacts/api-server`
3. **Build Command**: `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build`
4. **Start Command**: `pnpm run start`
5. Isi Environment Variables (lihat `.env.example` di root repo) — minimal buat mulai:
   - `PORT` (Railway biasanya isi otomatis, biarin)
   - `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
   - `GEMINI_API_KEY`
   - `HELIUS_API_KEY` (opsional, kosongin dulu kalau belum ada — fitur wallet auto-nonaktif dengan pesan error yang jelas, bukan crash)
   - `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
6. Deploy. Catat URL publiknya, misal `https://zenthra-api-production.up.railway.app`.
7. Sanity check: buka `https://<url-railway-kamu>/api/healthz` → harus balikin `{"status":"ok"}`.

## 3. Deploy frontend ke Vercel

1. Vercel dashboard → **Add New Project** → import repo GitHub yang sama.
2. **Root Directory**: `artifacts/zenthra`
   (Vercel otomatis kenal ini bagian dari pnpm workspace karena ada `pnpm-workspace.yaml` di root repo — `vercel.json` di folder ini sudah nentuin build command & output dir.)
3. Environment Variables:
   - `VITE_API_BASE_URL` = URL Railway dari langkah 2 (tanpa trailing slash), contoh `https://zenthra-api-production.up.railway.app`
4. Deploy.

## 4. Setup webhook WhatsApp (setelah API server live di Railway)

1. Meta for Developers → App kamu → **WhatsApp** → **Configuration**.
2. Callback URL: `https://<url-railway-kamu>/api/whatsapp/webhook`
3. Verify token: samain persis dengan `WHATSAPP_VERIFY_TOKEN` di Railway env.
4. Subscribe webhook field: `messages`.
5. Test kirim pesan ke nomor WhatsApp Business kamu — harus dibalas Zenthra lewat engine yang sama dengan web chat.

## 5. Setup "Connect your WhatsApp" (Embedded Signup)

Beda dari langkah 4 — ini buat fitur user hubungkan nomor WhatsApp Business **mereka sendiri**, bukan nomor resmi Zenthra.

1. Meta for Developers → App kamu → **Add Product** → **WhatsApp** → **Embedded Signup**.
2. Buat sebuah **Configuration** (isi nama, feature: `whatsapp_business_management` + `whatsapp_business_messaging`). Catat **Configuration ID**-nya.
3. Isi di Railway env: `META_APP_ID`, `META_APP_SECRET` (App settings > Basic), `META_CONFIG_ID` (dari langkah 2).
4. Redeploy API server. Cek `GET /api/whatsapp/connect/config` harus balikin `{appId, configId}`.
5. **Sebelum publik ke banyak user**: fitur ini butuh App Review dari Meta buat permission `whatsapp_business_management` (approval bisnis, bukan langkah teknis) — sebelum disetujui, cuma Admin/Tester yang terdaftar di App Roles yang bisa nyoba connect.

## Catatan tambahan Fase 2

- `sharp` (buat sticker maker) adalah native module — Railway build di container Linux jadi biasanya beres otomatis lewat prebuilt binary. Kalau build gagal soal `sharp`, cek log build; biasanya solusinya nambah `SHARP_IGNORE_GLOBAL_LIBVIPS=1` di env atau pastikan base image bukan Alpine super minimal.
- `download_from_url` sengaja diblokir buat domain YouTube/Instagram/TikTok/dst (lihat komentar di `lib/tools/media.ts`) — itu bukan bug, itu batas yang disengaja.
- `enhance_image` masih placeholder — balikin error jelas, bukan hasil palsu, sampai kamu sambungin provider upscaling (misal Replicate).


## 6. Alur pembayaran QRIS manual (belum payment gateway otomatis)

1. User buka `/pricing`, pilih tier, scan QRIS statis (`artifacts/zenthra/src/assets/qris-zenthra.jpg`), transfer.
2. User klik "Saya sudah bayar" → tercatat sebagai klaim `pending` (tabel `zenthra_payment_claims`).
3. Kamu cek daftar klaim yang perlu diverifikasi:
   ```bash
   curl -H "x-admin-secret: $ADMIN_API_SECRET" \
     https://<url-railway-kamu>/api/billing/admin/claims
   ```
4. Setelah kamu cocokin ke mutasi QRIS yang masuk, approve:
   ```bash
   curl -X POST -H "x-admin-secret: $ADMIN_API_SECRET" -H "Content-Type: application/json" \
     -d '{"claimId":"<id-dari-langkah-3>"}' \
     https://<url-railway-kamu>/api/billing/admin/confirm-payment
   ```
5. Tier user langsung aktif otomatis. Set `ADMIN_API_SECRET` di Railway env — random & panjang, jangan pernah taruh di frontend.

Upgrade ke payment gateway otomatis (Midtrans/Xendit — dua-duanya support QRIS)
nanti tinggal ganti langkah 3-4 jadi dipanggil otomatis dari webhook gateway,
bukan kamu manual — endpoint-nya udah siap dipanggil dari mana pun asal bawa `ADMIN_API_SECRET`.

## 7. Foto profil WhatsApp Zenthra

Setelah API server live & `META_APP_ID` / `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` ke-set di Railway:

```bash
cd artifacts/api-server
pnpm install
META_APP_ID=... WHATSAPP_ACCESS_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... \
  pnpm exec tsx scripts/set-whatsapp-profile-photo.ts scripts/assets/zenthra-wa-avatar.png
```

Ini manggil Resumable Upload API resmi Meta (bukan automation tidak resmi) — sekali jalan aja, nggak perlu diulang kecuali mau ganti foto lagi.

## 8. Deploy Landing Page (situs publik)

Ini project Vercel **ketiga**, terpisah dari dashboard (`artifacts/zenthra`) — landing page murni HTML statis, nggak ada build step, jadi paling gampang di-deploy.

1. **WAJIB edit dulu 3 konstanta** di `artifacts/landing/index.html` (cari komentar `TODO: ganti`) sebelum deploy:
   - `ZENTHRA_WA_NUMBER` — nomor WhatsApp Business ASLI Zenthra (format internasional tanpa `+`, contoh `6281234567890`). Ini beda dari `phone_number_id` di Meta — ini nomor telepon aslinya.
   - `API_BASE` — URL Railway API server kamu (langkah 2).
   - `APP_URL` — domain dashboard (Vercel project `artifacts/zenthra`, langkah 3).
2. Vercel dashboard → **Add New Project** → import repo yang sama.
3. **Root Directory**: `artifacts/landing`. Framework preset: **Other** (biarin, `vercel.json` udah nentuin sisanya).
4. Deploy. Arahkan domain utama kamu (misal `zenthra.id`) ke sini, dan domain dashboard (langkah 3) ke subdomain seperti `app.zenthra.id`.
5. Isi bagian **About** dan **Contact** di `index.html` dengan info asli kamu — sekarang masih placeholder yang jelas ditandai (`<em>...</em>`).
6. Bagian **Terms & Privacy** di halaman itu masih draf awal, BUKAN dokumen hukum final — sudah saya tandai jelas di halamannya sendiri juga. Sebelum publish resmi & mulai nerima pembayaran publik, konsultasikan ke praktisi hukum, terutama soal disclaimer trading dan kepatuhan UU PDP (perlindungan data pribadi).

## 9. Fase Hardening — yang baru ditutup

- **CORS dikunci.** Set `ALLOWED_ORIGINS` di Railway env ke domain landing +
  dashboard kamu (comma-separated). Kalau kosong, server jalan tapi nge-log
  warning dan fallback allow-all — jangan biarin kosong pas production.
- **Access token WhatsApp connection dienkripsi.** Set `WA_TOKEN_ENCRYPTION_KEY`
  (random, panjang) di Railway env SEBELUM ada user pertama connect — kalau
  key ini hilang/ganti, token yang udah tersimpan gak bisa didekripsi lagi
  (user harus connect ulang).
- **History chat WhatsApp pindah ke database** (`zenthra_wa_messages`) — udah
  gak in-memory lagi, aman dari restart & siap kalau nanti scale ke banyak
  instance Railway.

## Yang masih perlu diinget (jujur soal batasannya)

- "Connect your WhatsApp" sudah ada endpoint & halamannya (`/whatsapp`), tapi
  status production-nya nunggu App Review Meta (lihat langkah 5 di atas).
- Tool `make_sticker` & `download_from_url` beneran jalan. `enhance_image` masih
  slot kosong — jujur balikin pesan "belum dikonfigurasi", bukan hasil palsu.
- **Sistem tier/kuota** (`lib/billing/*`) sudah enforce di `/chat` (web, wajib
  login) dan WhatsApp anonim (selalu Free tier). Upgrade tier SEKARANG cuma bisa
  lewat alur klaim QRIS manual (langkah 6) atau admin endpoint — user TIDAK BISA
  lagi upgrade diri sendiri langsung (bug awal sudah ditutup).
- Migrasi `docs/supabase-schema.sql` WAJIB dijalanin ulang di Supabase SQL editor
  setelah update ini — ada tabel baru (`zenthra_subscriptions`,
  `zenthra_usage_daily`, `zenthra_payment_claims`, `zenthra_wa_messages`) dan
  satu fungsi Postgres (`increment_zenthra_usage`).
- QRIS di `/pricing` itu QRIS statis kamu (`qris-zenthra.jpg`) — kalau nomor
  merchant/NMID berubah, ganti file-nya aja, gak perlu ubah kode.
- **Landing page** (`artifacts/landing/index.html`) itu HTML statis polos, sengaja
  gak pakai React/build-tool baru — biar nol risiko pas deploy. Konsekuensinya:
  3 konstanta (`ZENTHRA_WA_NUMBER`, `API_BASE`, `APP_URL`) WAJIB diedit manual
  sebelum publish (lihat langkah 8), dan bagian About/Contact masih placeholder.
