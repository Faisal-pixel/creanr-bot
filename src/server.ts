import express from "express";
import { createApp } from "./app.js";
import { ENV } from "./config/env.js";

import { launchBotDev } from "./bot/bot.js";
import './bot/handlers.js'

const app = createApp();

if(ENV.NODE_ENV !== "production" && ENV.NODE_ENV !== "test") {
    console.log("Running in development mode, launching bot with polling...");
    launchBotDev().then(() => console.log("Bot started with polling...")).catch(console.error);
}

app.listen(ENV.PORT, () => {
    console.log(`Server running on ${ENV.NODE_ENV} mode on port ${ENV.PORT}`);
})

export default app;
