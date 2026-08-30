// api/index.ts
//
// DIPERBAIKI: sebelumnya file ini `import app from "../src/app"` — nyeret
// Vercel buat nge-compile ULANG seluruh source TypeScript-nya (semua routes,
// middleware, dst) lewat proses typecheck TERPISAH milik Vercel sendiri yang
// ternyata gak "connect" ke tsconfig project kita (moduleResolution beda,
// bikin ratusan error palsu soal tipe Express yang hilang).
//
// Sekarang file ini cuma re-export dari HASIL BUNDLE yang udah dibikin lewat
// `pnpm run build` (build.mjs, pakai esbuild — proses yang sama yang udah
// kebukti jalan buat deploy Render). Vercel tinggal makan file JS jadi, gak
// perlu compile ulang apa-apa — jadi gak ada lagi permukaan buat proses
// typecheck terpisah itu nyasar.
export { default } from "../dist/app.mjs";
