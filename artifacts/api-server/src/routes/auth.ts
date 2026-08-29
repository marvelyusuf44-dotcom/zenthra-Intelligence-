import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { insertRow, listRows } from "../services/supabase";
import { signUser } from "../middleware/auth";

const router: IRouter = Router();
const credentials = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(128) });

router.post("/auth/register", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Use a valid email and a password of at least 8 characters." });
  try {
    const existing = await listRows("zenthra_users", `select=id&email=eq.${encodeURIComponent(parsed.data.email.toLowerCase())}&limit=1`);
    if (existing.length) return res.status(409).json({ error: "An account with this email already exists." });
    const user = await insertRow("zenthra_users", { email: parsed.data.email.toLowerCase(), password_hash: await bcrypt.hash(parsed.data.password, 12) });
    const authUser = { id: String(user.id), email: String(user.email) };
    return res.status(201).json({ user: authUser, token: signUser(authUser) });
  } catch (error) {
    req.log.error({ error }, "register failed");
    return res.status(503).json({ error: "Account service is unavailable. Confirm the Supabase schema is installed." });
  }
});

router.post("/auth/login", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });
  try {
    const rows = await listRows<{ id: string; email: string; password_hash: string }>("zenthra_users", `select=id,email,password_hash&email=eq.${encodeURIComponent(parsed.data.email.toLowerCase())}&limit=1`);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
    const authUser = { id: String(user.id), email: String(user.email) };
    return res.json({ user: authUser, token: signUser(authUser) });
  } catch (error) {
    req.log.error({ error }, "login failed");
    return res.status(503).json({ error: "Account service is unavailable. Confirm the Supabase schema is installed." });
  }
});

router.post("/auth/logout", (_req, res) => res.status(204).send());

export default router;