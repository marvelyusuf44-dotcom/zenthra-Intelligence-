import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { deleteRows, insertRow, listRows, supabaseRequest } from "../services/supabase";
import { cached } from "../services/cache";
import { fetchMarkets } from "../lib/zenthra-data";

const router: IRouter = Router();
const watchInput = z.object({ kind: z.enum(["token", "wallet"]), value: z.string().min(1).max(120), label: z.string().max(80).optional() });
const alertInput = z.object({ kind: z.enum(["price", "wallet", "volume"]), target: z.string().min(1).max(120), condition: z.string().min(1).max(200) });

router.get("/market/overview", async (req, res) => {
  try {
    const snapshot = await cached("zenthra:markets", 30, fetchMarkets);
    const totalCap = snapshot.value.reduce((sum, row) => sum + row.marketCap, 0);
    // Real dominance, computed from the same tracked universe — not a fixed
    // constant. Null (not a guessed number) if BTC isn't in the response.
    const btc = snapshot.value.find((row) => row.symbol.toUpperCase() === "BTC");
    const btcDominance = btc && totalCap > 0 ? Number(((btc.marketCap / totalCap) * 100).toFixed(1)) : null;
    return res.json({ totalMarketCap: totalCap, totalVolume24h: snapshot.value.reduce((sum, row) => sum + row.volume24h, 0), btcDominance, activeAssets: snapshot.value.length, updatedAt: new Date().toISOString(), stale: snapshot.stale });
  } catch (error) { req.log.error({ error }, "overview failed"); return res.status(502).json({ error: "Market overview is temporarily unavailable." }); }
});

router.get("/market/top-movers", async (req, res) => {
  try { const snapshot = await cached("zenthra:markets", 30, fetchMarkets); return res.json([...snapshot.value].sort((a, b) => b.change24h - a.change24h).slice(0, 5)); }
  catch (error) { req.log.error({ error }, "top movers failed"); return res.status(502).json({ error: "Top movers are temporarily unavailable." }); }
});

router.get("/market/trending", async (req, res) => {
  try { const snapshot = await cached("zenthra:markets", 30, fetchMarkets); return res.json(snapshot.value.slice().sort((a, b) => b.volume24h - a.volume24h).slice(0, 5)); }
  catch (error) { req.log.error({ error }, "trending failed"); return res.status(502).json({ error: "Trending assets are temporarily unavailable." }); }
});

router.get("/token/:symbol", async (req, res) => {
  try {
    const markets = (await cached("zenthra:markets", 30, fetchMarkets)).value;
    const token = markets.find((row) => row.symbol.toLowerCase() === req.params.symbol.toLowerCase());
    if (!token) return res.status(404).json({ error: "Token not found in tracked universe." });
    return res.json({ ...token, supply: null, holders: null, similarTokens: markets.filter((row) => row.symbol !== token.symbol).slice(0, 3), sentiment: token.change24h >= 0 ? "constructive" : "cautious" });
  } catch (error) { req.log.error({ error }, "token lookup failed"); return res.status(502).json({ error: "Token research is temporarily unavailable." }); }
});

router.get("/token/:symbol/holders", (_req, res) => res.json({ holders: null, concentration: "Connect a chain indexer to load holder distribution." }));
router.get("/token/:symbol/similar", async (_req, res) => {
  const markets = await cached("zenthra:markets", 30, fetchMarkets);
  return res.json(markets.value.slice(0, 4));
});

// Was previously a fabricated formula (42 + tokenCount * 4) labeled as a
// "smart money" / "active trader" score with no real analysis behind it —
// removed per the Blueprint's data-integrity rule against fabricated
// confidence. Real wallet risk scoring needs transaction-history and
// counterparty analysis this project doesn't have yet, so this is honest
// about that instead of guessing.
router.get("/wallet/:address/risk", requireAuth, (req, res) => {
  return res.json({ address: req.params.address, score: null, label: null, status: "unavailable", message: "Intelligence degraded — source unavailable. Wallet risk scoring needs transaction-history analysis this build doesn't have yet." });
});
router.get("/wallet/:address/pnl", requireAuth, (_req, res) => res.json({ periods: { "7d": null, "30d": null, "90d": null }, note: "Historical PnL becomes available after wallet activity is indexed." }));

// Both endpoints below previously returned a fixed, hardcoded array on every
// request (three fake transfers, three fake entities) — presented as if it
// were a live feed. Removed per the Blueprint's data-integrity rule: a
// general "large transfers across the whole chain" firehose and a verified
// entity-labeling directory both need a data source this project doesn't
// have wired up yet (a whale-tracking feed / curated, address-verified
// entity database, respectively). Returning an honest unavailable state
// here instead of guessing or fabricating rows.
router.get("/onchain/transfers", (_req, res) => res.json({ transfers: [], status: "unavailable", message: "Intelligence degraded — source unavailable. A live large-transfer feed isn't connected yet." }));
router.get("/onchain/entities", (_req, res) => res.json({ entities: [], status: "unavailable", message: "Intelligence degraded — source unavailable. A verified entity-labeling directory isn't connected yet." }));

router.get("/history", requireAuth, async (req, res) => {
  try { return res.json(await listRows("zenthra_chats", `select=id,title,created_at,updated_at&user_id=eq.${encodeURIComponent(req.user!.id)}&order=updated_at.desc&limit=50`)); }
  catch (error) { req.log.error({ error }, "history failed"); return res.status(503).json({ error: "Chat history is unavailable. Confirm the Supabase schema is installed." }); }
});
router.get("/history/:id", requireAuth, async (req, res) => {
  try { const rows = await listRows("zenthra_messages", `select=id,role,text,created_at&chat_id=eq.${encodeURIComponent(String(req.params.id))}&user_id=eq.${encodeURIComponent(req.user!.id)}&order=created_at.asc`); return res.json(rows); }
  catch (error) { req.log.error({ error }, "chat detail failed"); return res.status(503).json({ error: "Chat history is unavailable." }); }
});
router.delete("/history/:id", requireAuth, async (req, res) => {
  try { await deleteRows("zenthra_chats", `id=eq.${encodeURIComponent(String(req.params.id))}&user_id=eq.${encodeURIComponent(req.user!.id)}`); return res.status(204).send(); }
  catch (error) { req.log.error({ error }, "chat delete failed"); return res.status(503).json({ error: "Chat could not be deleted." }); }
});

router.get("/watchlist", requireAuth, async (req, res) => {
  try { return res.json(await listRows("zenthra_watchlist", `select=id,kind,value,label,created_at&user_id=eq.${encodeURIComponent(req.user!.id)}&order=created_at.desc`)); }
  catch (error) { req.log.error({ error }, "watchlist load failed"); return res.status(503).json({ error: "Watchlist is unavailable." }); }
});
router.post("/watchlist", requireAuth, async (req, res) => {
  const parsed = watchInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Watchlist item is invalid." });
  try { return res.status(201).json(await insertRow("zenthra_watchlist", { ...parsed.data, user_id: req.user!.id })); }
  catch (error) { req.log.error({ error }, "watchlist add failed"); return res.status(503).json({ error: "Watchlist is unavailable." }); }
});
router.delete("/watchlist/:id", requireAuth, async (req, res) => {
  try { await deleteRows("zenthra_watchlist", `id=eq.${encodeURIComponent(String(req.params.id))}&user_id=eq.${encodeURIComponent(req.user!.id)}`); return res.status(204).send(); }
  catch (error) { req.log.error({ error }, "watchlist delete failed"); return res.status(503).json({ error: "Watchlist item could not be deleted." }); }
});

router.get("/alerts", requireAuth, async (req, res) => {
  try { return res.json(await listRows("zenthra_alerts", `select=id,kind,target,condition,active,created_at&user_id=eq.${encodeURIComponent(req.user!.id)}&order=created_at.desc`)); }
  catch (error) { req.log.error({ error }, "alerts load failed"); return res.status(503).json({ error: "Alerts are unavailable." }); }
});
router.post("/alerts", requireAuth, async (req, res) => {
  const parsed = alertInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Alert details are invalid." });
  try { return res.status(201).json(await insertRow("zenthra_alerts", { ...parsed.data, active: true, user_id: req.user!.id })); }
  catch (error) { req.log.error({ error }, "alert create failed"); return res.status(503).json({ error: "Alerts are unavailable." }); }
});
router.put("/alerts/:id", requireAuth, async (req, res) => {
  const active = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!active.success) return res.status(400).json({ error: "Alert state is invalid." });
  try { return res.json(await supabaseRequest(`zenthra_alerts?id=eq.${encodeURIComponent(String(req.params.id))}&user_id=eq.${encodeURIComponent(req.user!.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: active.data })); }
  catch (error) { req.log.error({ error }, "alert update failed"); return res.status(503).json({ error: "Alert could not be updated." }); }
});
router.delete("/alerts/:id", requireAuth, async (req, res) => {
  try { await deleteRows("zenthra_alerts", `id=eq.${encodeURIComponent(String(req.params.id))}&user_id=eq.${encodeURIComponent(req.user!.id)}`); return res.status(204).send(); }
  catch (error) { req.log.error({ error }, "alert delete failed"); return res.status(503).json({ error: "Alert could not be deleted." }); }
});

export default router;