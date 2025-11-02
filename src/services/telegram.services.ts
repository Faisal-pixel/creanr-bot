import { supabase } from "../config/supabase.js";
import { randomUUID } from "crypto";

export const TelegramService = {
  createLinkSession: async (subscriptionId: string, userId: string) => {
    const token = randomUUID().replace(/-/g, "").slice(0, 32);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

    const { data: newTelegramLinksSessionData, error: newTelegramLinksSessionError } =
      await supabase
        .from("telegram_link_session")
        .insert({
          subscription_id: subscriptionId,
          created_by: userId,
          token,
          expires_at: expiresAt,
        })
        .select()
        .single();

    if (newTelegramLinksSessionError) {
      console.log(
        "Error creating new telegram link session (createLinkSession function): ",
        newTelegramLinksSessionError,
      );
      throw new Error(newTelegramLinksSessionError.message);
    }

    return {
      token,
      startLink: `https://t.me/${process.env.BOT_USERNAME}?start=${token}`,
      startGroupLink: `https://t.me/${process.env.BOT_USERNAME}?startgroup=${token}`,
      session: newTelegramLinksSessionData,
    };
  },

  consumeLinkToken: async (token: string) => {
    const { data: telegramLinkSessionData, error: telegramLinkSessionError } = await supabase
      .from("telegram_link_session")
      .select("*")
      .eq("token", token)
      .eq("consumed", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (telegramLinkSessionError) {
      console.log(
        "Error selecting telegram link session when consuming token (consumeLinkToken function): ",
        telegramLinkSessionError,
      );
      throw new Error(telegramLinkSessionError.message);
    }
    if (!telegramLinkSessionData) {
      throw new Error("Invalid or expired token");
    }
    return telegramLinkSessionData;
  },

  markSessionConsumed: async (sessionId: string) => {
    const { data, error } = await supabase
      .from("telegram_link_session")
      .update({ consumed: true })
      .eq("id", sessionId)
      .select()
      .single();
    if (error) {
      console.log(
        "Error marking telegram link session as consumed (markSessionConsumed function): ",
        error,
      );
      throw new Error(error.message);
    }
    return data;
  },

  saveSubscriptionLink: async (
    subscriptionId: string,
    chat: {
      id: number;
      type: string;
      title?: string;
      invite_link?: string;
      bot_is_admin?: boolean;
    },
  ) => {
    const { error } = await supabase.from("subscription_telegram_link").upsert(
      {
        subscription_id: subscriptionId,
        tg_chat_id: chat.id,
        tg_chat_type: chat.type,
        tg_chat_title: chat.title ?? null,
        bot_is_admin: chat.bot_is_admin,
        invite_link: chat.invite_link ?? null,
        status: chat.bot_is_admin ? "active" : "pending", // if the bot is admin, we can mark it active right away
      },
      { onConflict: "subscription_id" },
    ); // that is if a subscription_id alread exists, update it

    if (error) {
      console.log(
        "Error upserting subscription telegram link (saveSubscriptionLink function): ",
        error,
      );
      throw new Error(error.message);
    }

    if (chat.bot_is_admin) {
      await supabase
        .from("subscriptions")
        .update({ subscription_state: "active" })
        .eq("id", subscriptionId);
    }
  },

  getExistingLinkBySubscriptionAndTgChatId: async (subscriptionId: string, tgChatId: number) => {
    const { data, error } = await supabase
      .from("subscription_telegram_link")
      .select("*")
      .eq("subscription_id", subscriptionId)
      .eq("tg_chat_id", tgChatId)
      .single();
    if (error) {
      // PGRST116 = No rows found. Ignore no rows found error
      console.log(
        "Error fetching existing link (getExistingLinkBySubscriptionAndTgChatId function): ",
        error,
      );
      throw new Error(error.message);
    }

    return data;
  },

  // “is this subscription linked to any chat?” if you want to block re-linking:
  getExistingLinkBySubscription: async (subscriptionId: string) => {
    const { data, error } = await supabase
      .from("subscription_telegram_link")
      .select("*")
      .eq("subscription_id", subscriptionId)
      .single();
    if (error && error.code !== "PGRST116") {
      // PGRST116 = No rows found. Ignore no rows found error
      console.log("Error fetching existing link (getExistingLinkBySubscription function): ", error);
      throw new Error(error.message);
    }
    return data;
  },

  // Creating this function just in case i do not have the subscription ID
  // find a subscription by a chat id, check if we track this chat already
  async findSubscriptionByChatId(chatIdStr: string) {
    const { data, error } = await supabase
      .from("subscription_telegram_link")
      .select("subscription_id, tg_chat_id")
      .eq("tg_chat_id", chatIdStr) // store as string to avoid JS bigint precision issues
      .maybeSingle();
    console.log("findSubscriptionByChatId data:", data);
    if (error && error.code !== "PGRST116") {
      console.log(
        "Error finding subscription by chat ID (findSubscriptionByChatId function): ",
        error,
      );
      throw new Error(error.message);
    }
    return data ?? null;
  },

  // upsert: basically insert if there is no existing row, or update if there is. It does this if the chat_id already exists
  // this function is used to set the baseline count when the bot is first added to a chat
  async upsertBaseline(chatIdStr: string, subscriptionId: string, baselineCount: number) {
    const { error } = await supabase.from("chat_stats").upsert(
      {
        chat_id: chatIdStr, // pass as string
        subscription_id: subscriptionId,
        baseline_count: baselineCount,
        baseline_at: new Date().toISOString(),
        last_count: baselineCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "chat_id" },
    );
    if (error) {
      console.log("Error upserting chat stats baseline (upsertBaseline function): ", error);
      throw new Error(error.message);
    }
  },

  async bumpJoined(chatIdStr: string, userIdStr: string) {
    const { error } = await supabase.rpc('chat_stats_bump_joined', { p_chat_id: chatIdStr, p_telegram_user_id: userIdStr });
    if (error) {
      console.log("Error bumping joined count (bumpJoined function): ", error);
      throw new Error(error.message);
    }
  },


  async bumpLeft(chatIdStr: string, userIdStr: string) {
    // same pattern as bumpJoined
    const { error } = await supabase.rpc('chat_stats_bump_left', { p_chat_id: chatIdStr, p_telegram_user_id: userIdStr });
    if (error) {
      console.log("Error bumping left count (bumpLeft function): ", error);
      throw new Error(error.message);
    }
  },
  // This is the function to save a daily count for a chat
  async saveDailyCount(chatIdStr: string, dayISO: string, count: number) {
    // I am upserting here because if there is already a count for that day, we just update it
    const { error } = await supabase
      .from("chat_daily_counts")
      .upsert({ chat_id: chatIdStr, day: dayISO, count }, { onConflict: "chat_id,day" });
    if (error) {
      console.log("Error saving daily count (saveDailyCount function): ", error);
      throw new Error(error.message);
    }

    // Since we made a new count, we want to update the chat-stats table also, setting last_count to this new count
    const { error: statsError } = await supabase
      .from("chat_stats")
      .update({ last_count: count, updated_at: new Date().toISOString() })
      .eq("chat_id", chatIdStr);
    if (statsError) {
      console.log("Error updating chat stats (saveDailyCount function): ", statsError);
      throw new Error(statsError.message);
    }
  },

  async getAllTrackedChats() {
    // get all chats we should track from your link table
    const { data, error } = await supabase
      .from('subscription_telegram_link')
      .select('tg_chat_id');
    if (error) throw error;
    return (data ?? []).map(r => String(r.tg_chat_id));
  },
};
