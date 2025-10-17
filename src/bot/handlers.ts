import { TelegramService } from "../services/telegram.services.js";
import { bot } from "./bot.js";
import { SubscriptionService } from "../services/subscription.services.js";
import { Markup } from "telegraf";
import { escapeHTML } from "@/helpers/escape-html.helpers.js";
import { escapeMDV2 } from "@/helpers/escape-mdv2.helpers.js";

const userTokenMemory = new Map<number, string>(); // the key is the userid (the telegram numeric user id), and the value is the token they are working with
/** Necessary when telegram later tells us 'the bot was added to a group by user X', we need to know which plan/token that user started linking
. This Map helps connect the dots. Will probably change to redis when deployed */

bot.start(async (ctx) => {
  const payload = (ctx.payload || "").trim(); // deep-link token after /start
  console.log("This is the payload:", payload);
  if (!payload) {
    return ctx.reply("Hi! Send /help to get started.");
  }

  const session = await TelegramService.consumeLinkToken(payload);
  if (!session) {
    return ctx.reply(
      "Link expired or invalid. Please go back to dashboard and click “Open Telegram” again.",
    );
  }

  userTokenMemory.set(ctx.from.id, payload);

  // (Optional) fetch subscription details to show nicer card
  let sub = null;
  try {
    sub = await SubscriptionService.getSubscriptionById(session.subscription_id);
  } catch (error) {
    console.error("Error fetching subscription details: ", error);
    return ctx.reply(
      "An error occurred while fetching your subscription details. Please try again later.",
    );
  }

  const planName = escapeMDV2(sub?.sub_name ?? "Unknown Plan");
  const price = escapeMDV2(String(sub?.price_amount ?? "Unknown Price"));

  const adminRights = [
    "manage_chat", // full chat management
    "delete_messages",
    "ban_users",
    "invite_users",
    "pin_messages",
    "promote_members", // ability to add/promote admins (filters to high-privilege users)
    "manage_video_chats",
    "restrict_members",
  ];

  await ctx.replyWithMarkdownV2(
    // [
    //   `*Link Subscription Plan*`,
    //   `Plan: _${sub?.sub_name || "Unknown Plan"}_`,
    //   `Price: _${sub?.price_amount || "Unknown Price"}_`,
    //   ``,
    //   `Please choose where to activate this plan:`,
    // ].join("\n"),
    `*Link Subscription Plan*\n` +
      `Plan: _${planName}_\n` +
      `Price: _${price}_\n\n` +
      `Please choose where to activate this plan:`,
    Markup.inlineKeyboard([
      [
        Markup.button.url(
          "Select a Telegram Group",
          `https://t.me/${process.env.BOT_USERNAME}?startgroup=${payload}&admin_rights=${adminRights.join(",")}`,
        ),
      ],
      [Markup.button.callback("Use a Telegram Channel instead", `USE_CHANNEL:${payload}`)],
    ]),
  );
});

bot.command("ping", (ctx) => ctx.reply("pong 🏓"));
console.log("Registered /ping handler");
