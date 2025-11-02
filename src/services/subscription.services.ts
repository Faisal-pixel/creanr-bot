import { supabase } from "@/config/supabase.js";

export const SubscriptionService = {
  // Subscription related services would go here
  getSubscriptionById: async (subscriptionId: string) => {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .single();

      if (error) {
        console.log("Error fetching subscription by ID (getSubscriptionById function): ", error);
        throw new Error(error.message);
      }
      return data;
  },

  // Now let us create the function userHasActiveSubscription... this will help us check if a user has an active subscription
  // This will be done in 3 steps:
  /**
   * Find the subscription connected to the telegram chat the user is trying to access. We will check the subscription_telegram_link table
   * Then we find the member that owns the telegram account trying to access the subscription (using chat_id) by checking the
   * platform_identity table (remember this table holds records of differently platforms (discord or telegram) linked to the members table)
   * 
   * Finally we check membership table for that member + subscription and confirm that the membership is active
   */

  /**
   * Check if a given Telegram user has an ACTIVE membership
   * for the subscription that is linked to a specific Telegram chat.
   *
   * Inputs:
   *  - chat_id: Telegram chat id (string is safer for bigints)
   *  - telegram_user_id: Telegram numeric user id (as string)
   *
   * Returns: boolean
   */
  userHasActiveMembership: async ({
    chat_id,
    telegram_user_id,
  }: {
    chat_id: string;            // e.g. "-1001234567890" this is the id of the chat
    telegram_user_id: string;   // e.g. "123456789"  this is the id of the user trying to access
  }): Promise<boolean> => {
    // 1) Find the subscription connected to this chat
    const { data: link, error: linkErr } = await supabase
      .from("subscription_telegram_link")
      .select("subscription_id, tg_chat_id")
      .eq("tg_chat_id", chat_id)     // pass as string to avoid bigint precision issues client-side
      .maybeSingle();

    if (linkErr) {
      console.log("Error getting subscription link by chat_id (getSubscriptionLinkByChatId function): ", linkErr);
      return false;
    }
    if (!link?.subscription_id) {
      // No subscription linked to this chat → no one can be active
      return false;
    }
    const subscriptionId = link.subscription_id as string;

    // 2) Find which MEMBER owns this Telegram account
    // platform_identity links a member to a Telegram user id
    const { data: identity, error: idErr } = await supabase
      .from("platform_identity")
      .select("member_id")
      .eq("platform", "telegram")
      .eq("external_user_id", telegram_user_id)
      .maybeSingle();

    if (idErr) {
      console.log("Error getting platform_identity (getPlatformIdentity function): ", idErr);
      return false;
    }
    if (!identity?.member_id) {
      // This Telegram user is not linked to any member in your DB
      return false;
    }
    const memberId = identity.member_id as string;

    // 3) Check membership table: member + subscription, active & not expired
    // So we check the membership table for a row matching this member id and subscription id
    // that has status "active" or "expiring_soon" and ends_at in the future
    const nowIso = new Date().toISOString();

    const { data: membership, error: memErr } = await supabase
      .from("membership")
      .select("id, status, ends_at")
      .eq("member_id", memberId)
      .eq("subscription_id", subscriptionId)
      .in("status", ["active", "expiring_soon"])  // allow both to pass gate
      .gte("ends_at", nowIso)                     // not expired
      .maybeSingle();

    if (memErr) {
      console.log("Error querying membership (checkMembership function): ", memErr);
      return false;
    }

    // If we found a matching membership row that is valid, they are active.
    return !!membership;
  },
};