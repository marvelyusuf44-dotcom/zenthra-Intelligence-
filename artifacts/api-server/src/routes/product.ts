import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { deleteRows, insertRow, listRows, supabaseRequest } from "../services/supabase";
import { cached } from "../services/cache";
import { fetchMarkets, fetchWallet, signals } from "../lib/zenthra-data";

const router: IRouter = Router();
const watchInput = z.object({ kind: z.enum(["token", "wallet"]), value: z.string().min(1).max(120), label: z.string().max(80).optional() });
const alertInput = z.object({ kind: z.enum(["price", "wallet", "volume"]), target: z.string().min(1).max(120), condition: z.string().min(1).max(200) });

router.get("/market/overview", async (req, res) => {
  try {
    const snapshot = await cached("zenthra:markets", 30, fetchMarkets);
    const totalCap = snapshot.value.reduce((sum, row) => sum + row.marketCap, 0);
    return res.json({ totalMarketCap: totalCap, totalVolume24h: snapshot.value.reduce((sum, row) => sum + row.volume24h, 0), btcDominance: 52.4, activeAssets: snapshot.value.length, updatedAt: new Date().toISOString(), stale: snapshot.stale });
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

router.get("/wallet/:address/risk", requireAuth, async (req, res) => {
  const wallet = await fetchWallet(req.params.address);
  const score = wallet.error ? 0 : Math.min(100, Math.round(42 + wallet.tokenCount * 4));
  return res.json({ address: req.params.address, score, label: score >= 70 ? "smart money" : score >= 45 ? "active trader" : "needs review" });
});
router.get("/wallet/:address/pnl", requireAuth, (_req, res) => res.json({ periods: { "7d": null, "30d": null, "90d": null }, note: "Historical PnL becomes available after wallet activity is indexed." }));

router.get("/onchain/transfers", async (req, res) => {
  const transfers = [
    { chain: "SOL", type: "Large transfer", value: 1200000, time: "2m ago" },
    { chain: "ETH", type: "DEX swap", value: 860000, time: "6m ago" },
    { chain: "BASE", type: "Bridge in", value: 410000, time: "11m ago" },
  ];
  return res.json(transfers);
});
router.get("/onchain/entities", (_req, res) => res.json([{ name: "Binance Hot Wallet", type: "Exchange", chain: "Multi" }, { name: "Jump Trading", type: "Market Maker", chain: "SOL" }, { name: "Jito Foundation", type: "Protocol", chain: "SOL" }]));

router.get("/history", requireAuth, async (req, res) => {
  try { return res.json(await listRows("zenthra_chats", `select=id,title,created_at,updated_at&user_id=eq.${encodeURIComponent(req.user!.id)}&order=updated_at.desc&limit=50`)); }
  catch (error) { req.log.error({ error }, "history failed"); return res.status(503).json({ error: "Chat history is unavailable. Confirm the Supabase schema is installed." }); }
});
router.get("/history/:id", requireAuth, async (req, res) => {
  try { const rows = await listRows("zenthra_messages", `select=id,role,text,created_at&chat_id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(req.user!.id)}&order=created_at.asc`); return res.json(rows); }
  catch (error) { req.log.error({ error }, "chat detail failed"); return res.status(503).json({ error: "Chat history is unavailable." }); }
});
router.delete("/history/:id", requireAuth, async (req, res) => {
  try { await deleteRows("zenthra_chats", `id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(req.user!.id)}`); return res.status(204).send(); }
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
  try { await deleteRows("zenthra_watchlist", `id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(req.user!.id)}`); return res.status(204).send(); }
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
  try { return res.json(await supabaseRequest(`zenthra_alerts?id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(req.user!.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: active.data })); }
  catch (error) { req.log.error({ error }, "alert update failed"); return res.status(503).json({ error: "Alert could not be updated." }); }
});
router.delete("/alerts/:id", requireAuth, async (req, res) => {
  try { await deleteRows("zenthra_alerts", `id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${encodeURIComponent(req.user!.id)}`); return res.status(204).send(); }
  catch (error) { req.log.error({ error }, "alert delete failed"); return res.status(503).json({ error: "Alert could not be deleted." }); }
});

export default router;