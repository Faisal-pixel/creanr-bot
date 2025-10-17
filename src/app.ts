import express from "express";
import type { Application } from "express";
import cors from "cors";
import morgan from "morgan";
import { ENV } from "./config/env.js";
import { apiRouter } from "@/routes/index.js";

export const createApp = (): Application => {
    const app = express();

    // MIDDLEWARES
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    app.use(cors())
    if (ENV.NODE_ENV !== "test") {
        app.use(morgan("dev"))
    }
    // Health check
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", env: ENV.NODE_ENV });
    });

    // API ROUTES
    app.use("/api/v1", apiRouter);

    // 404 handler
    app.use((_req, res) => {
        res.status(404).json({ message: "Not Found" });
    });

    return app;
}