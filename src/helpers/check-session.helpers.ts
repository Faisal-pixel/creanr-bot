import { TelegramService } from "@/services/telegram.services.js";


export default async function checkSessionHelper(token: string, ctx: any) {

    let session: Awaited<ReturnType<typeof TelegramService.consumeLinkToken>> | null = null;

    try {
        session = await TelegramService.consumeLinkToken(token);
        return session;
    } catch (error) {
        console.error("Error consuming link token: ", error);
        return ctx.reply(
            "Link expired or invalid. Please go back to dashboard and click “Open Telegram” again.",
        );
    }
}