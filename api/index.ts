// api/index.ts (di ROOT repo, bukan di artifacts/api-server lagi)
//
// Proyek digabung jadi SATU Vercel project (API + Dashboard nyatu, satu
// domain) — sebelumnya 2 project terpisah. File ini re-export dari hasil
// bundle esbuild punya api-server (pola yang udah kebukti jalan), cuma path
// relatifnya beda karena sekarang posisinya di root.
export { default } from "../artifacts/api-server/dist/app.mjs";
