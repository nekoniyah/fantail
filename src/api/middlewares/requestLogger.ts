import type {Handler} from "express";
import FantailLogger from "@fantail/logger";

const requestLogger: Handler = async (req, res, next) => {
    FantailLogger.info(
        `${req.method.toUpperCase()} ${req.path}`,
    );

    next();
};

export default requestLogger;
