import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type AuthUser = { id: string; email: string };

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

const secret = () => process.env.JWT_SECRET ?? process.env.SESSION_SECRET;

export function signUser(user: AuthUser) {
  const signingSecret = secret();
  if (!signingSecret) throw new Error("JWT_SECRET is not configured.");
  return jwt.sign(user, signingSecret, { expiresIn: "7d", issuer: "zenthra" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const signingSecret = secret();
  if (!token || !signingSecret) return res.status(401).json({ error: "Authentication required." });
  try {
    const payload = jwt.verify(token, signingSecret, { issuer: "zenthra" }) as AuthUser;
    req.user = { id: payload.id, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

/**
 * Buat aksi admin-only (konfirmasi pembayaran manual, dst) — SENGAJA dipisah
 * dari requireAuth (JWT per-user) karena aksinya "atas nama user lain", bukan
 * "atas nama diri sendiri". Proteksi pakai shared secret di header, bukan JWT
 * user biasa. Set ADMIN_API_SECRET di env — panjang & random, jangan ditebak.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers["x-admin-secret"];
  const expected = process.env.ADMIN_API_SECRET;
  if (!expected) return res.status(503).json({ error: "Admin actions belum dikonfigurasi (ADMIN_API_SECRET kosong)." });
  if (provided !== expected) return res.status(401).json({ error: "Admin authentication required." });
  return next();
}