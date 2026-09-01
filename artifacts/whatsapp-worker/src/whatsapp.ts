import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  Browsers,
} from "@whiskeysockets/baileys";

const PHONE_NUMBER = process.env.WA_TEST_PHONE;

export async function startWhatsApp() {
  if (!PHONE_NUMBER) {
    throw new Error("WA_TEST_PHONE is required");
  }

  console.log("Fetching latest WhatsApp Web version...");

  const waVersion = await fetchLatestWaWebVersion();

  console.log(
    "WA Web version:",
    waVersion.version.join("."),
    "latest:",
    waVersion.isLatest,
  );

  const { state, saveCreds } =
    await useMultiFileAuthState("./auth/dev");

  const sock = makeWASocket({
    auth: state,
    version: waVersion.version,
    browser: Browsers.macOS("Chrome"),
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    if (update.connection) {
      console.log("WA STATUS:", update.connection);
    }

    if (update.connection === "close") {
      const statusCode =
        (update.lastDisconnect?.error as any)?.output?.statusCode;

      console.log("WA CLOSED:", statusCode ?? "unknown");
    }

    if (update.connection === "open") {
      console.log("✅ WhatsApp connected!");
    }
  });

  if (!state.creds.registered) {
    try {
      const code = await sock.requestPairingCode(
        PHONE_NUMBER,
      );

      console.log("");
      console.log("==============================");
      console.log("PAIRING CODE:", code);
      console.log("==============================");
      console.log("");
    } catch (error) {
      console.log(
        "PAIRING ERROR:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return sock;
}