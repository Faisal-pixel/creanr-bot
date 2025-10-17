import { Router } from "express";
import { telegramRouter } from "./telegram.routes.js";

export const apiRouter = Router();

apiRouter.use("/telegram", telegramRouter);