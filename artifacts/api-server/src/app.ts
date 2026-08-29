import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many requests. Please try again shortly." } }));

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
