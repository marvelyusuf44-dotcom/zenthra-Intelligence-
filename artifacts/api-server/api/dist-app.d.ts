// Kasih tau TypeScript bentuk module hasil bundle (dist/app.mjs) tanpa perlu
// nyentuh tipe Express sama sekali — sengaja `any`, biar gak ada permukaan
// buat proses typecheck terpisah Vercel nyasar lagi kayak sebelumnya.
declare module "../dist/app.mjs" {
  const app: any;
  export default app;
}
