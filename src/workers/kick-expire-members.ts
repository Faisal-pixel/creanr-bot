import { bot } from "@/bot/bot.js";           // your Telegraf instance export
import { supabase } from "@/config/supabase.js";

// I will then call this worker either using node-cron for local dev, 
export async function kickExpiredMembersOnce() {
  // 1) Ask DB who to kick right now
  const { data, error } = await supabase
    .rpc("expired_members_to_kick", { p_limit: 200 });

  if (error) {
    console.error("Failed to fetch expired members:", error);
    return;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    console.log("No expired members to kick.");
    return;
  }

  for (const row of rows) {
    const chatId = Number(row.chat_id);
    const userId = Number(row.telegram_user_id);

    try {
      // 2) Kick
      await bot.telegram.banChatMember(chatId, userId);

      // allow rejoin later via approved bot link
      await bot.telegram.unbanChatMember(chatId, userId);

      // 3) Mark as processed in DB
      await supabase
        .from("membership")
        .update({
          status: "cancelled",                 // if this is your chosen terminal status
          removed_from_chat_at: new Date().toISOString(),
        })
        .eq("id", row.membership_id);
    } catch (e) {
      // Common failure reasons: bot lost admin, insufficient rights, user already left, etc.
      console.error(
        `Failed to kick user ${userId} from chat ${chatId}:`,
        // e?.response?.description || 
        (e as Error)?.message || e
      );

      // still mark removed_from_chat_at to avoid infinite retries if you want,
      // OR skip marking so it will retry next run (your choice).
      await supabase
        .from("membership")
        .update({
          removed_from_chat_at: new Date().toISOString(),
        })
        .eq("id", row.membership_id);
    }
  }
}
