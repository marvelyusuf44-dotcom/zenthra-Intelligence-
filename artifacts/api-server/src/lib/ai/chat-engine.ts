// lib/ai/chat-engine.ts
//
// INI JANTUNGNYA "satu intelligence engine, banyak channel". Fungsi runChat()
// di file ini dipanggil oleh:
//   - routes/zenthra.ts   (POST /api/chat — dipakai web app)
//   - routes/whatsapp.ts  (webhook WhatsApp Cloud API)
//
// Kalau nanti nambah channel baru (Android, dsb), channel itu tinggal manggil
// runChat() juga — TIDAK PERNAH nulis ulang logic Gemini/tool-calling.
// Ini murni orchestration: terima (message, history) → keluar teks balasan.
// Tidak ada channel-specific code (Express req/res, WhatsApp payload) di sini.

import { GoogleGenAI } from "@google/genai";
import { ZENTHRA_PERSONA } from "./persona";
import { TOOLS, executeTool } from "../tools";

export interface ChatHistoryItem {
  role: "user" | "assistant";
  text: string;
}

export interface ChatMedia {
  type: "sticker";
  base64Webp: string;
}

export interface RunChatResult {
  reply: string;
  // Media yang dihasilkan tool call (misal make_sticker) selama putaran ini.
  // Channel teks-only (web chat) boleh abaikan; channel seperti WhatsApp
  // pakai ini buat kirim media message asli, bukan cuma deskripsi teks.
  media: ChatMedia[];
}

// Tool mana masuk kategori kuota apa — dipakai callback onToolUsed di bawah.
// Chat-engine TETAP GAK TAU siapa usernya; ini cuma klasifikasi nama tool → kategori.
const TOOL_QUOTA_CATEGORY: Record<string, "onchain" | "creative" | undefined> = {
  get_wallet_analysis: "onchain",
  get_signals: "onchain",
  make_sticker: "creative",
  download_from_url: "creative",
  enhance_image: "creative",
};

export interface RunChatOptions {
  /**
   * Dipanggil SEBELUM tool kategori tertentu dieksekusi (bukan buat get_market_data/
   * check_risk yang gratis). Kalau callback ini throw, tool TIDAK dieksekusi dan model
   * dikasih tau kuotanya habis lewat function_result — model yang nyampein ke user.
   * Ini satu-satunya titik di mana chat-engine "nitip" ke billing layer tanpa jadi tau
   * apa pun soal siapa usernya — itu urusan channel (routes/*.ts) yang nyediain callback-nya.
   */
  onToolUsed?: (category: "onchain" | "creative") => Promise<void>;
}

/**
 * Jalanin satu putaran chat: kirim pesan + histori ke Gemini, eksekusi tool-call
 * kalau model minta, lalu balikin teks balasan final.
 *
 * @param message  pesan terbaru dari user
 * @param history  histori percakapan sebelumnya (maks ~10 dipakai, biar konteks tetap ringkas)
 */
export async function runChat(
  message: string,
  history: ChatHistoryItem[] = [],
  options: RunChatOptions = {},
): Promise<RunChatResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // Fallback lokal biar channel tetap kepake walau Gemini belum dikonfigurasi/down.
    return { reply: "Zenthra AI lagi belum bisa dihubungi (AI belum dikonfigurasi di server). Coba lagi sebentar ya.", media: [] };
  }

  const media: ChatMedia[] = [];

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const transcript = history
      .slice(-10)
      .map((item) => `${item.role === "user" ? "User" : "Zenthra"}: ${item.text}`)
      .join("\n");

    let interaction = await ai.interactions.create({
      model: "gemini-2.5-flash",
      input: [
        {
          type: "user_input",
          content: [{ type: "text", text: `${ZENTHRA_PERSONA}\n\nConversation so far:\n${transcript}\n\nUser: ${message}` }],
        },
      ],
      tools: TOOLS as any,
    });

    let guard = 0;
    while (interaction.steps.some((s: any) => s.type === "function_call") && guard < 4) {
      const calls = interaction.steps.filter((s: any) => s.type === "function_call");
      const results = await Promise.all(
        calls.map(async (fc: any) => {
          const category = TOOL_QUOTA_CATEGORY[fc.name];
          if (category && options.onToolUsed) {
            try {
              await options.onToolUsed(category);
            } catch (quotaError) {
              return {
                type: "function_result" as const,
                name: fc.name,
                call_id: fc.id,
                result: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      error: quotaError instanceof Error ? quotaError.message : "Kuota harian habis.",
                      quotaExceeded: true,
                    }),
                  },
                ],
              };
            }
          }

          const toolResult: any = await executeTool(fc.name, fc.arguments);
          if (fc.name === "make_sticker" && toolResult?.ok && toolResult?.base64Webp) {
            media.push({ type: "sticker", base64Webp: toolResult.base64Webp });
          }
          // Jangan kirim payload base64 (bisa ratusan KB) balik ke model — cukup
          // metadata-nya, biar konteks tetap ringkas dan nggak boros token.
          const { base64Webp, base64, ...metadataOnly } = toolResult ?? {};
          return {
            type: "function_result" as const,
            name: fc.name,
            call_id: fc.id,
            result: [{ type: "text" as const, text: JSON.stringify(metadataOnly) }],
          };
        }),
      );
      interaction = await ai.interactions.create({
        model: "gemini-2.5-flash",
        input: results,
        tools: TOOLS as any,
        previous_interaction_id: interaction.id,
      });
      guard++;
    }

    return { reply: interaction.output_text ?? "Couldn't land on an answer there — try rephrasing.", media };
  } catch (error) {
    // Channel caller (route/webhook) yang nentuin gimana nampilin error ke user;
    // di sini cukup fallback teks generik + rethrow buat logging di level atas.
    throw error;
  }
}
