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
  }
};