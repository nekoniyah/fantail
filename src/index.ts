import "dotenv/config";
import express from "express";

import { createServer } from "http";

import api from "@fantail/api";
import FantailLogger from "@fantail/logger";
import createIO from "./api/ws";
import listenEvents from "./api/ws/events";

const app = express();
const server = createServer(app);

const port = process.env.PORT || 4000;

FantailLogger.info("Starting server...");

app.use("/api", api);

const io = createIO(server);
listenEvents(io);

server.listen(port, () => {
  FantailLogger.info(`Listening on port ${port}`);
});
