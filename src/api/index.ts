import path from "path";
import figlet from "figlet";

import express, { Router } from "express";

// Middleware Imports
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import requestLogger from "@middlewares/requestLogger";

// Util Imports
import FantailLogger from "@fantail/logger";
import getFilesRecursively from "@lib/getFilesRecursively";
// Code

const header = figlet.textSync(`Fantail`, { font: "3D-ASCII", width: 200 });

FantailLogger.log(`\n` + header);

const api = Router();

api.use(express.json());
api.use(express.urlencoded());
api.use(helmet());
api.use(cors({ origin: "*", exposedHeaders: ["Content-Type"] }));
api.use(requestLogger);

api.use(cookieParser());

FantailLogger.info("Loading API routes...");

const routeFiles = getFilesRecursively(path.join(__dirname, "routes"));

for (let file of routeFiles) {
  const module = await import(file);

  if (!module || !("default" in module)) {
    FantailLogger.warning(
      `Router ${file} couldn't be loaded: missing properties`,
    );
    continue;
  }

  const def = module.default;

  if (!(def instanceof Router)) {
    FantailLogger.warning(
      `Router ${file} couldn't be loaded: not valid Router.`,
    );
    continue;
  }

  const parsedPath = path.parse(file);
  const dir = parsedPath.dir.replace(path.join(__dirname, "routes"), "");

  if (parsedPath.name !== "index") {
    api.use(path.join(dir, parsedPath.name), def as Router);
    FantailLogger.info(`Registered router: ${dir}/${parsedPath.name}`);
  } else {
    api.use(dir, def as Router);
    FantailLogger.info(`Registered router: ${dir}`);
  }
}

export default api;
