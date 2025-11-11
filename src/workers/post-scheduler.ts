// src/workers/postScheduler.ts
import { supabase } from "@/config/supabase.js";
import { bot } from "@/bot/bot.js"; // adjust path to your bot export
import { TelegramService } from "@/services/telegram.services.js"; // for finding chat/subscription mapping
import { ENV } from "@/config/env.js";

/**
 * Fetch a batch of scheduled posts that are due.
 * We first SELECT candidates, then try to "claim" them one-by-one by updating status -> 'publishing'
 * only when current status is still 'scheduled'. This avoids double-processing between parallel workers.
 */
async function fetchAndClaimDuePosts(limit = 5) {
  // 1) find candidate ids
  const nowIso = new Date().toISOString();
  const { data: candidates, error: selErr } = await supabase
    .from("scheduled_posts")
    .select("id, subscription_id")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (selErr) throw selErr;
  if (!candidates || candidates.length === 0) return [];

  const claimed = [];

  // 2) attempt to claim each candidate (atomic-ish): update status where id & status='scheduled'
  for (const row of candidates) {
    const { id } = row as { id: string };
    const { data: updated, error: updErr } = await supabase
      .from("scheduled_posts")
      .update({ status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "scheduled")
      .select("*")
      .maybeSingle();

    if (updErr) {
      console.error("Claim update error for", id, updErr);
      continue;
    }
    // if updated is null, another worker claimed it; skip
    if (updated) claimed.push(updated);
  }

  return claimed;
}

/** Get attachments for a scheduled post */
async function getAttachmentsForPost(postId: string) {
  const { data, error } = await supabase
    .from("post_attachments")
    .select("*")
    .eq("scheduled_posts_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching attachments for post", postId, error);
    return [];
  }
  return data ?? [];
}

/** Helper returning a public URL for a storage path (if you store attachments in supabase storage) */
function makePublicUrlForPath(storagePath: string) {
  // If you use supabase storage (bucket name 'attachments'), adapt accordingly.
  // Example: supabase.storage.from('attachments').getPublicUrl(storagePath)
  // But supabase client on server can create signed URLs too.
  // For this example we assume your storage is public or your storage helper returns a public link.
  // Replace with your real storage code.
  return `https://www.example.com/storage/attachments/${storagePath}`;
}

/** Post a single scheduled post to a chat */
async function publishPostToChat(post: any) {
  // Get linked chat info (subscription -> subscription_telegram_link)
  const subscriptionId = post.subscription_id;
  const link = await TelegramService.getExistingLinkBySubscription(subscriptionId);
  if (!link) throw new Error("No linked chat for subscription " + subscriptionId);

  const chatId = Number(link.tg_chat_id);
  const text = post.body ?? "";
  const title = post.title ?? null;

  // fetch attachments
  const attachments = await getAttachmentsForPost(post.id);

  // If there are no attachments, send a simple text message (HTML). Use sendMessage with HTML enabled.
  if (!attachments || attachments.length === 0) {
    await bot.telegram.sendMessage(chatId, text, { parse_mode: "HTML" });
    return;
  }

  // If attachments exist — handle basic cases:
  // - If there is one image and a body: sendPhoto(caption = body)
  // - If multiple images: sendMediaGroup
  // - If single file: sendDocument
  // - If single video: sendVideo
  // This is simplified; adapt to your needs.
  const images = attachments.filter((a: any) => a.attachment_type === "image");
  const videos = attachments.filter((a: any) => a.attachment_type === "video");
  const files = attachments.filter((a: any) => a.attachment_type === "file");

  // helper to map storage path to URL
  const urlFor = (att: any) => {
    if (att.storage_path.startsWith("http")) return att.storage_path;
    return makePublicUrlForPath(att.storage_path);
  };

  // prefer photo group if multiple images
  if (images.length > 1) {
    // sendMediaGroup expects array of InputMediaPhoto-like objects
    const media = images.map((img: any, idx: number) => {
      return {
        type: "photo",
        media: urlFor(img),
        caption: idx === 0 && text ? text : undefined, // caption only on first item
      };
    });
    await bot.telegram.sendMediaGroup(chatId, media as any);
    return;
  }

  // single image
  if (images.length === 1) {
    const img = images[0];
    await bot.telegram.sendPhoto(chatId, urlFor(img), { caption: text || undefined, parse_mode: "HTML" });
    return;
  }

  // single video
  if (videos.length === 1) {
    const v = videos[0];
    await bot.telegram.sendVideo(chatId, urlFor(v), { caption: text || undefined, parse_mode: "HTML" });
    return;
  }

  // single file / document
  if (files.length === 1) {
    const f = files[0];
    await bot.telegram.sendDocument(chatId, urlFor(f), { caption: text || undefined, parse_mode: "HTML" });
    return;
  }

  // If none of the above matched, fallback to text
  await bot.telegram.sendMessage(chatId, text, { parse_mode: "HTML" });
}

/** Main worker tick: claim up to N posts and publish them */
export async function runOncePublishScheduled(limit = 5) {
  try {
    const posts = await fetchAndClaimDuePosts(limit);
    if (!posts || posts.length === 0) {
      // nothing to do
      return;
    }

    for (const post of posts) {
      try {
        await publishPostToChat(post);

        // mark published
        const { error: pubErr } = await supabase
          .from("scheduled_posts")
          .update({ status: "published", posted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", post.id);

        if (pubErr) {
          console.error("Failed to mark post published for", post.id, pubErr);
        }
      } catch (e: any) {
        console.error("Failed to publish post", post.id, e);

        // mark post failed, store last error in extra json
        const errJson = { last_error: String(e).slice(0, 2000), failed_at: new Date().toISOString() };
        await supabase
          .from("scheduled_posts")
          .update({ status: "failed", extra: { ...(post.extra ?? {}), ...errJson }, updated_at: new Date().toISOString() })
          .eq("id", post.id);
      }
    }
  } catch (e) {
    console.error("runOncePublishScheduled fatal:", e);
  }
}

/** If you want a continuous worker (loop every X seconds) */
export async function startLoopingWorker(pollIntervalMs = 15_000) {
  console.log("Starting scheduled post worker loop, interval:", pollIntervalMs);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOncePublishScheduled(5);
    } catch (e) {
      console.error("worker loop error:", e);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

/** If you want a single-run CLI */
if (import.meta.url === `file://${process.argv[1]}` || process.argv.includes("--run-once")) {
  // run once and exit
  runOncePublishScheduled(parseInt(process.env.BATCH_LIMIT || "5", 10)).then(() => process.exit(0));
}
