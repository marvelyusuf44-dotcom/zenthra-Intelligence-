import express, { type Express, type RequestHandler, type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";
import { logger } from "./lib/logger";

const app: Express = express();

// A CJS module loaded under moduleResolution "bundler" sometimes ends up
// wrapped in `.default` at runtime even though its own type declarations
// say it's directly callable (or vice versa) — this checks for `.default`
// through `unknown` (not `any`) so the fallback is still real type-checked,
// then asserts the final shape we actually call it as.
function resolveCjsDefault<T>(mod: T): T {
  const maybeWrapped = mod as unknown as { default?: T };
  return maybeWrapped.default ?? mod;
}
type MiddlewareFactory = (options?: unknown) => RequestHandler;

// pino-http, helmet, dan express-rate-limit: Vercel's build resolve CJS
// default export mereka jadi namespace object (bukan fungsi langsung) di
// bawah moduleResolution "bundler" — walau runtime-nya (baik esbuild buat
// Render, maupun Vercel Node runtime) tetap kerja normal. Ini murni masalah
// TIPE, bukan bug jalan, jadi resolusinya di-handle sekali lewat
// `resolveCjsDefault` di atas, lalu di-assert ke bentuk callable yang kita
// pakai (opsional options -> RequestHandler) — behaviornya identik dengan
// sebelumnya (`(x as any).default ?? x`), cuma sekarang lewat `unknown`.
const pinoHttpFn = resolveCjsDefault(pinoHttp) as unknown as MiddlewareFactory;
const helmetFn = resolveCjsDefault(helmet) as unknown as MiddlewareFactory;
const rateLimitFn = resolveCjsDefault(rateLimit) as unknown as MiddlewareFactory;

app.use(
  pinoHttpFn({
    logger,
    serializers: {
      req(req: ExpressRequest & { id?: unknown }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: ExpressResponse) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmetFn({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(rateLimitFn({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many requests. Please try again shortly." } }));

// CORS — sebelumnya cors() polos allow SEMUA origin. Sekarang dikunci ke
// domain yang emang butuh akses (landing page + dashboard web app + WhatsApp
// webhook nggak lewat browser jadi gak kena CORS). Isi ALLOWED_ORIGINS di env,
// dipisah koma, contoh: "https://zenthra.id,https://app.zenthra.id".
// Kalau ALLOWED_ORIGINS kosong (misal pas development lokal), fallback allow-all
// dengan warning — biar gampang develop tapi jelas kelihatan kalau lupa di-set pas production.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
if (allowedOrigins.length === 0) {
  logger.warn("ALLOWED_ORIGINS belum di-set — CORS masih allow semua origin. Set ini sebelum production.");
}
app.use(
  cors({
    origin: allowedOrigins.length === 0 ? true : allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
