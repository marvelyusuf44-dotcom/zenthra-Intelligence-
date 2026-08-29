import app from "./app";
import { logger } from "./lib/logger";
import { createServer } from "node:http";
import { Server } from "socket.io";

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
const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
io.on("connection", (socket) => {
  socket.emit("connected", { service: "zenthra-realtime" });
});
setInterval(() => {
  io.emit("market:tick", { at: new Date().toISOString(), source: "coingecko" });
}, 30_000);

httpServer.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
