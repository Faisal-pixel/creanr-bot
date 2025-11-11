import { kickExpiredMembersOnce } from "@/workers/kick-expire-members.js";
import { runOncePublishScheduled } from "@/workers/post-scheduler.js";
import cron from "node-cron";

console.log("🕒 Cron scheduler started...");

// run every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log("Running: kickExpiredMembersOnce...");
  try {
    await kickExpiredMembersOnce();
    console.log("✅ Done checking for expired members");
  } catch (e) {
    console.error("❌ kickExpiredMembersOnce failed:", e);
  }
});


cron.schedule("* * * * *", async () => {
  console.log("Cron started - scheduling publish job every minute");
  try {
    await runOncePublishScheduled(10);
  } catch (e) {
    console.error("scheduled publish failed:", e);
  }
});
