import { supabase } from "../config/supabase.js";
import { randomUUID } from "crypto";

export const TelegramService = {
  createLinkSession: async (subscriptionId: string, userId: string) => {
    const token = randomUUID().replace(/-/g, "").slice(0, 32);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

    const { data: newTelegramLinksSessionData, error: newTelegramLinksSessionError } = await supabase
      .from("telegram_link_session")
      .insert({ subscription_id: subscriptionId, created_by: userId, token, expires_at: expiresAt })
      .select()
      .single();

    if (newTelegramLinksSessionError) {
        console.log("Error creating new telegram link session (createLinkSession function): ", newTelegramLinksSessionError);
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
        console.log("Error selecting telegram link session when consuming token (consumeLinkToken function): ", telegramLinkSessionError);
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
        console.log("Error marking telegram link session as consumed (markSessionConsumed function): ", error);
        throw new Error(error.message);
    }
    return data;
  },

  saveSubscriptionLink: async (subscriptionId: string, chat: {
    id: number; type: string; title?: string; invite_link?: string; bot_is_admin?: boolean;
  }) => {
    const { error } = await supabase
    .from('subscription_telegram_link')
    .upsert({
      subscription_id: subscriptionId,
      tg_chat_id: chat.id,
      tg_chat_type: chat.type,
      tg_chat_title: chat.title ?? null,
      bot_is_admin: chat.bot_is_admin,
      invite_link: chat.invite_link ?? null,
      status: chat.bot_is_admin ? 'active' : 'pending', // if the bot is admin, we can mark it active right away
    }, { onConflict: 'subscription_id' }); // that is if a subscription_id alread exists, update it

    if (error) {
      console.log("Error upserting subscription telegram link (saveSubscriptionLink function): ", error);
      throw new Error(error.message);
    }
 
    if(chat.bot_is_admin) {
        await supabase.from('subscriptions').update({ subscription_state: 'active' }).eq('id', subscriptionId);
    }
  },

  getExistingLinkBySubscriptionAndTgChatId: async (subscriptionId: string, tgChatId: number) => {
    const { data, error } = await supabase
      .from('subscription_telegram_link')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .eq('tg_chat_id', tgChatId)
      .single();
    if (error) { // PGRST116 = No rows found. Ignore no rows found error
      console.log("Error fetching existing link (getExistingLinkBySubscriptionAndTgChatId function): ", error);
      throw new Error(error.message);
    }

    
    return data;
  },

  // “is this subscription linked to any chat?” if you want to block re-linking:
  getExistingLinkBySubscription: async (subscriptionId: string) => {
    const { data, error } = await supabase
      .from('subscription_telegram_link')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .single();
    if (error) {
      console.log("Error fetching existing link (getExistingLinkBySubscription function): ", error);
      throw new Error(error.message);
    }
    return data;
  }

};
