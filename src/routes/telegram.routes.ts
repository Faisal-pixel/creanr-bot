import { TelegramController } from "@/controllers/telegram/telegram.controllers.js";
import { Router } from "express";

export const telegramRouter = Router();

telegramRouter.post("/link-session", TelegramController.create);