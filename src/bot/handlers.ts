import { TelegramService } from "../services/telegram.services.js";
import { bot } from "./bot.js";
import { SubscriptionService } from "../services/subscription.services.js";
import { Markup } from "telegraf";
import { escapeHTML } from "@/helpers/escape-html.helpers.js";
import { escapeMDV2 } from "@/helpers/escape-mdv2.helpers.js";
import checkSessionHelper from "@/helpers/check-session.helpers.js";

const userTokenMemory = new Map<number, string>(); // the key is the userid (the telegram numeric user id), and the value is the token they are working with
/** Necessary when telegram later tells us 'the bot was added to a group by user X', we need to know which plan/token that user started linking
. This Map helps connect the dots. Will probably change to redis when deployed */

bot.start(async (ctx) => {
  const payload = (ctx.payload || "").trim(); // deep-link token after /start
  console.log("This is the payload:", payload);
  if (!payload) {
    return ctx.reply("Hi! Send /help to get started.");
  }
  // Here, I check whether the payload is still valid. I also use it to
  const session = await checkSessionHelper(payload, ctx);

  // Then i set the user id and payload in memory
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

  // Once we have gotten details about the subscription, then let construct the message I will be sending

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

  // console.log("Admin rights joined: ", adminRights.join("+"));

  // console.log("What is ctx: ", ctx);

  // await ctx.replyWithMarkdownV2(
  //   // [
  //   //   `*Link Subscription Plan*`,
  //   //   `Plan: _${sub?.sub_name || "Unknown Plan"}_`,
  //   //   `Price: _${sub?.price_amount || "Unknown Price"}_`,
  //   //   ``,
  //   //   `Please choose where to activate this plan:`,
  //   // ].join("\n"),
  //   `*Link Subscription Plan*\n` +
  //     `Plan: _${planName}_\n` +
  //     `Price: _${price}_\n` +
  //     `Billing Cycle: _${sub?.billing_cycle || "Unknown Billing Cycle"}_\n\n` +
  //     `Please choose where to activate this plan:`,
  //   Markup.inlineKeyboard([
  //     [
  //       Markup.button.url(
  //         "Select a Telegram Group",
  //         `https://t.me/${process.env.BOT_USERNAME}?startgroup=${payload}&admin=${adminRights.join("+")}`,
  //       ),
  //     ],
  //     [Markup.button.callback("Use a Telegram Channel instead", `USE_CHANNEL:${payload}`)],
  //   ]),
  // );

  // Then i want to check whether the subscriciption is already linked to a telegram chat
  const existingLink = await TelegramService.getExistingLinkBySubscription(session.subscription_id);
  if (existingLink) {
    const stateText = existingLink.bot_is_admin ? "active ✅" : "pending ⏳";
    await ctx.reply(
      `This subscription is already linked to "${existingLink.tg_chat_title}" (${stateText}).`,
    );
    return;
  }

  // If the subscription is not linked yet, then i can proceed to ask the user to select a group or channel

  await ctx.replyWithMarkdownV2(
    `*Link Subscription Plan*\n` +
      `Plan: _${planName}_\n` +
      `Price: _${price}_\n` +
      `Billing Cycle: _${sub?.billing_cycle || "Unknown Billing Cycle"}_\n\n` +
      `Please choose where to activate this plan:`,
    Markup.keyboard([
      [
        // Button 1: GROUPS the user admins
        {
          text: "Select a Telegram Group",
          request_chat: {
            // for details about it check https://core.telegram.org/bots/api#keyboardbuttonrequestchat
            request_id: 1001, // any number you choose
            chat_is_channel: false, // false => show GROUPS (supergroups)
            // Only show groups where the USER is an admin (or owner)
            // chat_is_created: true, // Optional. Pass True to request a chat owned by the user. Otherwise, no additional restrictions are applied. Turning this off since we want a situation where we can over user that can be made admin on creanr and shuld be able to add the bot
            user_administrator_rights: {
              can_manage_chat: true, // requiring any admin right filters to admin-only
              can_delete_messages: true,
              can_restrict_members: true,
              can_promote_members: true,
              can_change_info: true,
              can_invite_users: true,
              can_post_stories: true,
              can_edit_stories: true,
              can_delete_stories: true,
              can_post_messages: true,
              can_edit_messages: true,
              can_pin_messages: true,
              can_manage_topics: true,
              can_manage_direct_messages: true,
              can_manage_video_chats: true,
            },
            bot_administrator_rights: {
              // To check administrator rights your bot will need inside the group check: https://core.telegram.org/bots/api#chatadministratorrights
              can_manage_chat: true,
              can_delete_messages: true,
              can_restrict_members: true,
              can_promote_members: true,
              can_change_info: true,
              can_invite_users: true,
              can_post_stories: true,
              can_edit_stories: true,
              can_delete_stories: true,
              can_post_messages: true,
              can_edit_messages: true,
              can_pin_messages: true,
              can_manage_topics: true,
              can_manage_direct_messages: true,
              can_manage_video_chats: true,
            },
            // Only show chats where bot is (or will be) allowed to join
            bot_is_member: false, // allow selection even if bot isn’t there yet
            request_title: true, // Optional. Pass True to request the chat title to be returned to the bot
            request_photo: true, // Optional. Pass True to request the chat photo to be returned to the bot
            request_username: true, // Optional. Pass True to request the chat username to be returned to the bot
          },
        } as any,
      ],
      [
        // Button 2: CHANNELS the user admins
        {
          text: "Use a Telegram Channel instead",
          request_chat: {
            request_id: 2001,
            chat_is_channel: true, // true => show CHANNELS
            user_administrator_rights: {
              can_manage_chat: true,
              can_delete_messages: true,
              can_restrict_members: true,
              can_promote_members: true,
              can_change_info: true,
              can_invite_users: true,
              can_post_stories: true,
              can_edit_stories: true,
              can_delete_stories: true,
              can_post_messages: true,
              can_edit_messages: true,
              can_pin_messages: true,
              can_manage_topics: true,
              can_manage_direct_messages: true,
              can_manage_video_chats: true,
            },
            bot_administrator_rights: {
              // To check administrator rights your bot will need inside the group check: https://core.telegram.org/bots/api#chatadministratorrights
              can_manage_chat: true,
              can_delete_messages: true,
              can_restrict_members: true,
              can_promote_members: true,
              can_change_info: true,
              can_invite_users: true,
              can_post_stories: true,
              can_edit_stories: true,
              can_delete_stories: true,
              can_post_messages: true,
              can_edit_messages: true,
              can_pin_messages: true,
              can_manage_topics: true,
              can_manage_direct_messages: true,
              can_manage_video_chats: true,
            },
            bot_is_member: false, // allow selection even if bot isn’t there yet
            request_title: true, // Optional. Pass True to request the chat title to be returned to the bot
            request_photo: true, // Optional. Pass True to request the chat photo to be returned to the bot
            request_username: true, // Optional. Pass True to request the chat username to be returned to the bot
          },
        } as any,
      ],
    ])
      .resize()
      .oneTime(),
  );
});

// Now here is the bot event that listens for any message
type CTX = {
  chat_shared?: unknown;
};
bot.on("message", async (ctx, next) => {
  // ctx is the basically an object that contains info about the message and the user that sent it
  // if the message does not carry a chat_shared field, this is because any message can come in, but I want to specifically know
  // and confirm that the user selected a group or channel, and chat_shared only comes from that specific action
  if (!(ctx.message as CTX)?.chat_shared) return next();

  console.log("this is ctx", ctx);
  console.log("Received message: ", ctx.message);
  const chatShared = (ctx.message as any).chat_shared; // I am saving the chat shared field here

  // If no chat shared info, or the chat shared field is falsy/empty then it probably beans they did not select a group or channel
  // so i reply them to use the provided buttons
  if (!chatShared) {
    await ctx.reply("Please use the provided buttons to select a group or channel.");
    return;
  }

  // I am extracting the chat id from the chat shared field to be able to know the chat the user selected
  const chatId = chatShared.chat_id;

  // 1) Read chat details (type + title): From ctx, i can get more information about a chat using the getChat method by passing in
  // the chat id
  const chat = await ctx.telegram.getChat(chatId);

  // Once I have the details about the chat, then I want to check the type of chat that was selected
  // chat.type will be 'supergroup' or 'channel' (ignore 'group' if you don’t support it)
  const tg_chat_type = chat.type; // 'supergroup' | 'channel'

  // I am also getting the title from the chat details
  const tg_chat_title = "title" in chat ? (chat.title ?? null) : null;

  // Now here from the ctx, I have a method getChatMember that helps me get details about a member from the group chat, I just
  // need to specify the chat id and the user id. The user id will be the person that sent the message hence ctx.from.id
  const member = await ctx.telegram.getChatMember(chatId, ctx.from!.id);

  // Then I am check the status of the member in that chat to confirm they are an admin
  const status = (member as any).status; // 'creator' | 'administrator' | ...

  // If the status is not creator or administrator, then it definitely means they are not an admin. They must be an admin
  // to be able to proceed with the connection process
  if (status !== "creator" && status !== "administrator") {
    await ctx.reply("You must be an admin of that chat. Please choose another one.");
    return;
  }

  // Remember that I stored the token earlier in userTokenMemory by user id, I am going to need it to confirm that the token
  // is still valid and in session and also to get the subscription id the user is tryig to link
  const token = userTokenMemory.get(ctx.from!.id);
  if (!token) {
    await ctx.reply("Session (Token) not found. Please start again from your dashboard.");
    return;
  }
  const session = await checkSessionHelper(token, ctx);

  // **DB short-circuit: already linked to *this same* chat?**
  // If by any chance they get to this stage and the subscription they are trying to link is already linked to a telegram chat
  // then I want to inform them that the subscription is already linked and avoid duplicate links
  const existingLink = await TelegramService.getExistingLinkBySubscription(session.subscription_id);
  if (existingLink) {
    const stateText = existingLink.bot_is_admin ? "active ✅" : "pending ⏳";
    await ctx.reply(`This subscription is already linked to "${tg_chat_title}" (${stateText}).`);
    return;
  }

  // Now what I just did is confirm that the person is an admin of the chat and also that that they are still in session
  // Now i need to confirm that the bot is already in the group chat and also an admin
  // Code below confirms the bot's status in the chat and to check whether bot has been added to the chat or not

  // So i can can get information about the bot itself using getMe
  const me = await ctx.telegram.getMe();

  // Defining a bunch of variables: botStatus which will help me know whether the bot is in the chat or not and also let me know
  // their status (admin/member/none), botIsAdmin is a boolean to know whether bot is admin or not and botCanInvite to know
  // whether bot has rights to invite users
  let botStatus: "none" | "member" | "admin" = "none";
  let botIsAdmin = false;
  let botCanInvite = false;

  try {
    // Remember the getChatMember method I used earlier to get details about a user in a chat? I am using it again here but this
    // time to get details about the bot in that chat
    const bm = await ctx.telegram.getChatMember(chatId, me.id); // bm stands for 'bot member'

    // then i can confirm the status of the bot in that chat
    const s = (bm as any).status as string; // 'administrator' | 'member' | 'left' | 'kicked'...

    // Its important for the bot to be an administrator, if it is set true and set the botStatus to admin, it it is not
    // then check if it is a member and set botStatus to member, else set botStatus to none
    if (s === "administrator") {
      botIsAdmin = true;
      botStatus = "admin";
    } else if (s === "member") botStatus = "member";
    else botStatus = "none";

    // Now if the bot is an admin, I want to check whether it has rights to invite users
    // rights to invite live under bm.can_* when admin; in Telegraf raw object it’s often bm.can_invite_users
    if (botIsAdmin) {
      const r: any = bm; // r stands for 'rights'
      botCanInvite = !!(r.can_invite_users || r.can_manage_chat); // can_manage_chat usually implies invite too
    }
  } catch {
    // If the bot isn’t there, Telegram often throws 400/403; treat as "none"
    botStatus = "none";
    botIsAdmin = false;
    botCanInvite = false;
  }

  if (botStatus === "none") {
    // Not in the chat yet — tell the user and wait for my_chat_member update
    await ctx.reply(
      "Nice! Now add me to that chat (Telegram should prompt you). I’ll finish setup once I’m inside.",
    );
    return;
  }

  // 4)Now that we have confirmed that the bot is an admin & can invite → let us use our bot to create an invite link the bot
  // controls
  let invite_link: string | null = null;
  if (botIsAdmin && botCanInvite) {
    try {
      // Give the link a name so you can revoke/rotate later
      const invite = await ctx.telegram.createChatInviteLink(chatId, {
        // check telegram docs for all options: https://core.telegram.org/bots/api#createchatinvitelink
        name: `Creanr ${new Date().toISOString()}`, //	Invite link name; 0-32 characters.
        // Optional controls:
        // expire_date: Math.floor(Date.now()/1000) + 60*60*24, // 24h expiry
        // member_limit: 100,
        // creates_join_request: false,
      });
      invite_link = invite.invite_link;
    } catch {
      // If we can’t create it (rights missing), just leave invite_link null
      invite_link = null;
    }
  }

  // 5)Now that i have created the chat invite link, lets now update the DB with all the details
  // 5) Resolve the subscription_id (from your earlier /start step)

  // 6) Save to DB
  if (tg_chat_type !== "supergroup" && tg_chat_type !== "channel") {
    await ctx.reply("Unsupported chat type. Please use a Group or Channel.");
    return;
  }

  // I reach out to my telegram service to save the subscription link with all the details
  await TelegramService.saveSubscriptionLink(session.subscription_id, {
    id: Number(chatId) as number,
    type: tg_chat_type, // 'supergroup' | 'channel'
    title: tg_chat_title as string,
    bot_is_admin: botIsAdmin,
    invite_link: invite_link as string,
  });

  // 7) Friendly message depending on state
  if (botIsAdmin) {
    try {
      const countNow = await ctx.telegram.getChatMembersCount(chatId);
      await TelegramService.upsertBaseline(String(chatId), session.subscription_id, countNow);
    } catch (e) {
      console.error("Failed to seed baseline chat_stats:", e);
    }
    await ctx.reply(`Linked successfully ✅\nI’m admin in "${tg_chat_title}".`);
    await TelegramService.markSessionConsumed(session.id);
  } else {
    await ctx.reply(
      `Linked in "${tg_chat_title}" as pending. Please promote me to admin so I can manage invites and post.`,
    );
  }
});

/********************************* Code here is to know when a person joins or leaves a group chat******************** */
// Fires when ANY user's status changes in a chat where your bot is present
bot.on('chat_member', async (ctx) => {
  const ev = ctx.chatMember; // ev stands for 'event'
  if (!ev) return; // if there is no event, just return
  // Here i am getting the id of the chat where the event happened (the chat that triggered the event)
  const chatId = ev.chat.id;
  // I convert it into a string
  const chatIdStr = String(chatId);

  // We only want to track events in chats where we have a subscription linked to it
  const link = await TelegramService.findSubscriptionByChatId(chatIdStr);
  console.log("Received chat_member update:", chatIdStr);
  console.log("Found link for chat_member update:", link);
  // If by any chance our bot is in a group chat, but is not linked to any subscription, then we just return
  if (!link) return;

  /**
   * ev.old_chat_member gives the folowing object: { check out explanation here: https://core.telegram.org/bots/api#chatmembermember
   *  status: string; // always member
   *  user: Object of user
   *  until_date: number
   * }
   */
  const oldS = ev.old_chat_member.status; // 'left' | 'member' | 'restricted' | 'kicked' | ... oldS stands for 'old status'
  const newS = ev.new_chat_member.status;
  console.log(`Chat member update in chat ${chatIdStr}: ${oldS} -> ${newS}`);

  // A variable joined that stores true or false whether a user old status was left or kicked and the new status is member or
  // restricted
  const joined =
    (oldS === 'left' || oldS === 'kicked') &&
    (newS === 'member' || newS === 'restricted');

  // A variable left that stores true or false whether a user old status was member or restricted and the new status is left or 
  // kicked
  const left =
    (oldS === 'member' || oldS === 'restricted') &&
    (newS === 'left' || newS === 'kicked');

  try {
    if (joined) {
      await TelegramService.bumpJoined(chatIdStr, String(ev.new_chat_member.user.id));
    }
    if (left) {
      await TelegramService.bumpLeft(chatIdStr, String(ev.old_chat_member.user.id));
    }
  } catch (e) {
    console.error('Failed to record join/leave:', e);
  }
});



/**

bot.action(/USE_CHANNEL:(.+)/, async (ctx) => {
  const token = ctx.match[1];
  await ctx.answerCbQuery(); // removes the little “loading” circle

  // Tell the user what to do manually
  await ctx.replyWithMarkdownV2(
    [
      "📢 *Connect a Channel*",
      "",
      escapeMDV2(`1️⃣ Go to your Channel’s info page → *Administrators* → *Add Admin*
  2️⃣ Search for *@${process.env.BOT_USERNAME}* and add me.
  3️⃣ Make sure I have *Post Messages* and *Manage Chat* rights.
  4️⃣ After you add me, come back here and tap the button below to re-check.`),
    ].join("\n"),
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Re-check now", `RECHECK_CHANNEL:${token}`)],
    ]),
  );
});

bot.action(/RECHECK_CHANNEL:(.+)/, async (ctx) => {
  const token = ctx.match[1];
  await ctx.answerCbQuery("Checking…");

  // In reality you’d wait for a “my_chat_member” update from Telegram
  // that shows the bot was promoted inside a channel.

  await ctx.reply(
    "If you’ve just added me as an admin, I’ll detect it automatically in a few seconds!",
  );
});
 */
bot.command("ping", (ctx) => ctx.reply("pong 🏓"));
console.log("Registered /ping handler");
