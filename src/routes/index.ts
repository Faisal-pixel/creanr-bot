import { Router } from "express";
import { telegramRouter } from "./telegram.routes.js";
import { TelegramController } from "@/controllers/telegram/telegram.controllers.js";

export const apiRouter = Router();

apiRouter.use("/telegram", telegramRouter);

// I will set up any cron (e.g., GitHub Actions, Render cron, Supabase Edge Function hitting this URL) to POST this route daily.
apiRouter.use("/cron/daily-telegram-counts", TelegramController.dailyTelegramCounts);