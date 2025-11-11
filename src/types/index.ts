export type SubscriptionTelegramLinkTableData = {
    id: string; 
    subscription_id: string;
    tg_chat_id: string;
    tg_chat_type: string;
    tg_chat_title: string | null;
    bot_is_admin: boolean;
    status: 'pending' | 'active' | 'paused';
    invite_link: string | null;
    created_at: string;
    updated_at: string;
}

export type SubscriptionsTableData = {
    id: string;
    sub_name: string;
    description: string;
    platform: 'telegram' | 'discord' | 'whatsapp';
    platform_group_id: string | null;
    price_currency: string;
    price_amount: number;
    billing_cycle: 'monthly' | 'quarterly' | 'annually' | 'bi-annual' | 'one-time_payment';
    allow_gifting: boolean;
    subscription_state: 'active' | 'pending' | 'paused';
    community_id: string;
    created_at: string;
    join_token_link: string | null;
    join_token_link_created_at: string | null;
}
