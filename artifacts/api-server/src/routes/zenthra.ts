import { Router, type IRouter } from "express";
import { GetSignalsQueryParams, GetWalletParams, SendChatBody, SendChatResponse } from "@workspace/api-zod";
import { fetchMarkets, fetchWallet } from "../lib/zenthra-data";
import { computeSignal, computeWatchlistSignals } from "../lib/live-signals";
import { runChat } from "../lib/ai/chat-engine";
import { requireAuth } from "../middleware/auth";
import { checkAndConsumeQuota, QuotaExceededError } from "../lib/billing/quota";
import { TIERS } from "../lib/billing/tiers";

const router: IRouter = Router();

router.get("/markets", async (req, res) => {
  try { res.json(await fetchMarkets()); }
  catch (error) { req.log.error({ error }, "market fetch failed"); res.status(502).json({ error: "Live market data is temporarily unavailable." }); }
});

router.get("/signals", async (req, res) => {
  const parsed = GetSignalsQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid signal query." });
  try {
    if (parsed.data.symbol) {
      const signal = await computeSignal(parsed.data.symbol);
      return res.json(signal ? [signal] : []);
    }
    return res.json(await computeWatchlistSignals());
  } catch (error) {
    req.log.error({ error }, "signal computation failed");
    return res.status(502).json({ error: "Signal data is temporarily unavailable." });
  }
});

router.get("/wallet/:address", async (req, res) => {
  const parsed = GetWalletParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid Solana wallet address." });
  try { return res.json(await fetchWallet(parsed.data.address)); }
  catch (error) { req.log.error({ error }, "wallet fetch failed"); return res.status(502).json({ error: "Wallet data is temporarily unavailable." }); }
});

// Web chat channel — pakai chat-engine yang sama dengan WhatsApp channel (routes/whatsapp.ts).
router.post("/chat", requireAuth, async (req, res) => {
  const parsed = SendChatBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A message is required." });

  const principal = { type: "user" as const, id: req.user!.id };

  try {
    await checkAndConsumeQuota(principal, "chat");
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return res.status(429).json({
        error: `Kuota chat harian tier ${TIERS[error.tier].label} sudah habis. Upgrade tier buat lanjut hari ini.`,
        quotaExceeded: true,
        tier: error.tier,
      });
    }
    throw error;
  }

  try {
    const { reply } = await runChat(parsed.data.message, parsed.data.history, {
      onToolUsed: (category) => checkAndConsumeQuota(principal, category),
    });
    return res.json(SendChatResponse.parse({ reply }));
  } catch (error) {
    req.log.error({ error }, "chat request failed");
    return res.status(502).json({ error: "The AI analyst is temporarily unavailable." });
  }
});

export default router;
