// api/index.ts
//
// Entrypoint khusus Vercel — bikin API server ini bisa di-deploy sebagai
// serverless function, jadi SATU platform aja (Vercel) buat dashboard,
// landing page, DAN API server. Gak perlu Railway/Render lagi.
//
// Vercel otomatis kenalin file .ts di folder /api sebagai serverless function
// dan nge-bundle app Express ini beserta semua importnya sendiri — gak lewat
// build.mjs punya kita (itu tetap dipakai kalau deploy ke Render/VM biasa,
// lihat src/index.ts).
//
// PENTING beberapa konsekuensi nyata dari serverless (bukan bug, ini
// karakteristik platform):
//   - Setiap request bisa kena instance/cold-start berbeda. Rate limiting
//     (express-rate-limit, in-memory) jadi "best effort" per-instance, BUKAN
//     limit global yang presisi lagi. Cukup buat cegah spam kasar, tapi kalau
//     butuh rate limit ketat lintas-instance, itu perlu store eksternal
//     (misal Upstash Redis) — belum dibangun di fase ini.
//   - Cold start pertama kali (atau abis lama nganggur) bisa nambah delay
//     beberapa ratus ms - 1 detik buat request pertama.
import app from "../src/app";

export default app;
