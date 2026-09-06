# Zenthra — Panduan Deploy (GitHub → Vercel, satu domain)

## Arsitektur saat ini (sudah bukan split Railway + Vercel)

Sebelumnya dokumen ini bilang API server harus di Railway karena Socket.io
butuh koneksi jangka panjang. **Itu sudah tidak berlaku** — Socket.io sudah
dicabut dari `artifacts/api-server` (dicek dulu: tidak ada satupun kode
frontend yang benar-benar konsumsi koneksinya), jadi API server sekarang bisa
jalan sebagai Vercel serverless function biasa lewat `api/index.ts` di root
repo.

Konsekuensinya: **satu repo, satu Vercel project**, semuanya nempel di satu
domain (`zenthra.web.id`):

- `api/index.ts` (root) → build `artifacts/api-server`, jalan sebagai
  serverless function di balik `/api/*`
- `artifacts/zenthra` (dashboard React) → di-build dengan `BASE_PATH=/app/`,
  disajikan di `/app/*` (dan `/admin`, yang cuma route client-side di dalam
  SPA yang sama — lihat App.tsx, bukan deployment terpisah)
- `artifacts/landing` (landing page statis) → disajikan di `/`

Semua ini didefinisikan di `vercel.json` (root repo) lewat satu
`buildCommand` yang build ketiganya lalu digabung ke folder `combined/`.
Kamu TIDAK perlu Railway lagi, dan TIDAK perlu 3 project Vercel terpisah.

## 1. Push ke GitHub

```bash
cd Zenthra-Intelligence
git init
git add .
git commit -m "Zenthra: transformasi produk sesuai Master Blueprint"
git branch -M main
git remote add origin https://github.com/marvelyusuf44-dotcom/zenthra-intelligence.git
git push -u origin main
```

(Buat dulu repo kosong `zenthra-intelligence` di GitHub kalau belum ada.)

## 2. Deploy ke Vercel (satu project buat semuanya)

1. Vercel dashboard → **Add New Project** → import repo GitHub ini.
2. **Root Directory**: biarkan di root repo (JANGAN diarahkan ke
   `artifacts/zenthra` atau `artifacts/api-server`) — `vercel.json` di root
   yang mengatur build ketiga bagian sekaligus.
3. Framework preset: **Other** (biarin, `vercel.json` sudah menentukan
   `buildCommand`/`outputDirectory`/`rewrites`).
4. Isi Environment Variables (lihat `.env.example` di root repo) — minimal
   buat mulai:
   - `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
   - `GEMINI_API_KEY`
   - `HELIUS_API_KEY` (opsional, kosongin dulu kalau belum ada — fitur wallet
     auto-nonaktif dengan pesan error yang jelas, bukan crash)
   - `ADMIN_API_SECRET` (random & panjang — dipakai admin control center di
     `/admin`, JANGAN pernah ditaruh di kode frontend)
   - `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
     (opsional — lihat catatan WhatsApp di bawah)
5. Deploy.
6. Sanity check: buka `https://zenthra.web.id/api/healthz` → harus balikin
   `{"status":"ok"}`; `https://zenthra.web.id/` → landing page;
   `https://zenthra.web.id/app` → dashboard (redirect ke login kalau belum
   auth).
7. Arahkan domain `zenthra.web.id` ke project Vercel ini lewat
   **Settings → Domains**.

## 3. Setup webhook WhatsApp (opsional — internal notification channel saja)

WhatsApp bukan bagian dari identitas produk publik Zenthra lagi (lihat Master
Blueprint) — ini murni kanal notifikasi internal kalau kamu mau aktifkan.

1. Meta for Developers → App kamu → **WhatsApp** → **Configuration**.
2. Callback URL: `https://zenthra.web.id/api/whatsapp/webhook`
3. Verify token: samain persis dengan `WHATSAPP_VERIFY_TOKEN` di Vercel env.
4. Subscribe webhook field: `messages`.
5. Test kirim pesan — harus dibalas Zenthra lewat engine yang sama dengan web chat.

### "Connect your WhatsApp" (Embedded Signup)

Beda dari langkah di atas — ini buat fitur user hubungkan nomor WhatsApp
Business **mereka sendiri**. Halamannya (`/whatsapp`) sudah tidak dirutekan
dari App.tsx (tidak lagi bagian dari produk publik), tapi endpoint
backend-nya tetap ada kalau mau dipakai lagi nanti:

1. Meta for Developers → **Add Product** → **WhatsApp** → **Embedded Signup**.
2. Buat **Configuration** (feature: `whatsapp_business_management` +
   `whatsapp_business_messaging`). Catat **Configuration ID**-nya.
3. Isi di Vercel env: `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`.
4. Redeploy. Cek `GET /api/whatsapp/connect/config` harus balikin
   `{appId, configId}`.
5. **Sebelum publik ke banyak user**: fitur ini butuh App Review dari Meta
   buat permission `whatsapp_business_management` — sebelum disetujui, cuma
   Admin/Tester yang terdaftar di App Roles yang bisa nyoba connect.

## 4. Catatan tool AI

- `make_sticker`, `download_from_url`, `enhance_image` sudah **dicabut dari
  daftar tool agent publik** (lihat `lib/tools/index.ts`) — bukan lagi bagian
  dari identitas Zenthra sebagai on-chain research agent. Kode aslinya masih
  ada di `lib/tools/media.ts` kalau suatu saat mau disambung ulang ke
  permukaan lain (bukan agent utama).
- `sharp` (dependency asli buat sticker maker) masih ada di `package.json`
  tapi sudah tidak dipanggil dari tool registry — aman dibiarkan atau
  dihapus belakangan kalau memang tidak dipakai di tempat lain.

## 5. Alur pembayaran QRIS manual (belum payment gateway otomatis)

1. User buka `/pricing`, pilih tier, scan QRIS statis
   (`artifacts/zenthra/src/assets/qris-zenthra.jpg`), transfer.
2. User klik "Saya sudah bayar" → tercatat sebagai klaim `pending` (tabel
   `zenthra_payment_claims`).
3. Cek daftar klaim yang perlu diverifikasi — lewat curl, atau lewat
   `/admin` (tab **Claims**, sudah dibangun ulang supaya key admin tidak
   pernah tersimpan di localStorage browser):
   ```bash
   curl -H "x-admin-secret: $ADMIN_API_SECRET" \
     https://zenthra.web.id/api/billing/admin/claims?status=pending
   ```
4. Setelah kamu cocokin ke mutasi QRIS yang masuk, approve:
   ```bash
   curl -X POST -H "x-admin-secret: $ADMIN_API_SECRET" -H "Content-Type: application/json" \
     -d '{"claimId":"<id-dari-langkah-3>"}' \
     https://zenthra.web.id/api/billing/admin/confirm-payment
   ```
5. Tier user langsung aktif otomatis.

Endpoint admin lain yang tersedia (semua butuh header `x-admin-secret`, dan
semua read-only kecuali confirm/reject/set-tier di atas):
`GET /api/admin/users`, `GET /api/admin/usage-today`, `GET /api/admin/data-sources`.

## 6. Foto profil WhatsApp Zenthra (opsional)

```bash
cd artifacts/api-server
pnpm install
META_APP_ID=... WHATSAPP_ACCESS_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... \
  pnpm exec tsx scripts/set-whatsapp-profile-photo.ts scripts/assets/zenthra-wa-avatar.png
```

## Fase Hardening — yang sudah ditutup

- **CORS dikunci.** Set `ALLOWED_ORIGINS` di Vercel env ke `zenthra.web.id`
  (comma-separated kalau ada lebih dari satu domain). Kalau kosong, server
  jalan tapi nge-log warning dan fallback allow-all — jangan biarin kosong
  pas production.
- **Access token WhatsApp connection dienkripsi** (`WA_TOKEN_ENCRYPTION_KEY`,
  random & panjang, di-set SEBELUM ada user pertama connect).
- **History chat WhatsApp ada di database** (`zenthra_wa_messages`), bukan
  in-memory — aman dari restart.
- **Kredensial sesi WhatsApp tidak lagi ikut ke repo/build.** `.gitignore`
  sekarang eksplisit menolak `auth/`, `auth-backup/`, dan `**/creds.json` di
  kedalaman berapa pun — kalau kamu pernah commit file ini sebelumnya,
  riwayatnya masih ada di git history sampai kamu jalanin `git filter-repo`
  atau BFG secara manual; treat sesi WhatsApp lama itu sebagai bocor dan
  connect ulang.
- **Admin key tidak lagi disimpan di browser.** `/admin` sekarang minta key
  di-input ulang tiap sesi (in-memory saja, bukan localStorage) — lihat
  komentar di `AdminPage.tsx`.

## Yang masih perlu diinget (jujur soal batasannya)

- Migrasi `docs/supabase-schema.sql` WAJIB dijalanin ulang di Supabase SQL
  editor setelah update ini kalau kamu belum pernah — ada tabel
  `zenthra_subscriptions`, `zenthra_usage_daily`, `zenthra_payment_claims`,
  `zenthra_wa_messages`, dan fungsi Postgres `increment_zenthra_usage`.
- QRIS di `/pricing` itu QRIS statis kamu (`qris-zenthra.jpg`) — kalau nomor
  merchant/NMID berubah, ganti file-nya aja, gak perlu ubah kode.
- **Futures Intelligence Confluence Score** sekarang beneran hitung Open
  Interest & Funding dari Binance (real), tapi tiga kategori lain
  (Liquidations, On-chain, Market/News Context) masih ditandai
  `available: false` karena datanya belum ada infrastrukturnya — lihat
  komentar di `lib/scoring/confluence.ts`. Konsekuensinya: skor maksimum yang
  bisa dicapai sekarang ada di kisaran 65/100, jadi tier "Strong Setup"/
  "Valid Setup" belum akan pernah muncul sampai tiga sumber itu disambung.
  Ini disengaja — daripada mengarang angka buat kategori yang belum ada
  datanya.
- **On-chain transfers/entities** (`/api/onchain/transfers`,
  `/api/onchain/entities`) jujur balikin status `unavailable` — belum ada
  feed transfer besar real-time atau direktori entitas terverifikasi yang
  tersambung.
- **Smart Money** (`/smartmoney`) juga masih halaman kosong yang jujur —
  butuh feed agregat performa wallet yang belum dibangun.
