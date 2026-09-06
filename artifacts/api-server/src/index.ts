import app from "./app";
import { logger } from "./lib/logger";
import { createServer } from "node:http";

// Socket.io dicabut — cek dulu (frontend/src/App.tsx dkk) dan ternyata gak
// ada satu pun kode di dashboard yang beneran konsumsi koneksinya. Ini bikin
// API server bisa jalan sebagai Vercel serverless function (lihat api/index.ts),
// bukan cuma long-running process kayak sebelumnya.

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

httpServer.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
