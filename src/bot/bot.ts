import { ENV } from '@/config/env.js';
import {Telegraf} from 'telegraf';

if(!ENV.BOT_TOKEN || ENV.BOT_TOKEN === "" ) {
    throw new Error("BOT_TOKEN is not defined in environment variables");
};

export const bot: Telegraf = new Telegraf(ENV.BOT_TOKEN);
// Then we need to do dev polling
export async function launchBotDev() {
    // await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    console.log("Bot is running in development mode (polling)...");
}

// Enable graceful stopping
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));