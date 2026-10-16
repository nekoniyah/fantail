import "dotenv/config"
import express from "express";

import api from "@fantail/api"
import FantailLogger from "@fantail/logger";

const app = express();

const port = process.env.PORT || 4000;

FantailLogger.info("Starting server...");


app.use("/api", api)

app.listen(port, () => {
    FantailLogger.info(`Listening on port ${port}`);
});