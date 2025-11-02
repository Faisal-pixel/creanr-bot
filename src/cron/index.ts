import { kickExpiredMembersOnce } from "@/workers/kick-expire-members.js";
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
