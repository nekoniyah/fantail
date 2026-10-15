import "dotenv/config"
import express from "express";

import api from "@fantail/api"
import FantailLogger from "@fantail/logger";

const app = express();

const port = process.env.PORT;
const discoveryServerHost = process.env.DISCOVERY_SERVICE_HOST;

if (!port) {
    FantailLogger.error("Port is required");
    throw new Error("Port is required");
}

FantailLogger.info("Starting server...");

if (!discoveryServerHost)
    FantailLogger.warning(
        "No discovery server host provided. This instance will not show up anywhere.",
    );

app.use("/api", api)

app.listen(port, () => {
    FantailLogger.info(`Listening on port ${port}`);
});