/**
 * Server-side cron jobs for Charlotte's HW Tracker.
 *
 * Runs inside the Express process on a node-cron schedule.
 * All times are in America/Los_Angeles (PDT/PST), handled automatically.
 *
 * Schedule:
 *   20:00 — Send homework reminder email/SMS if today hasn't been logged.
 *   01:00 — Back up the full database + Excel workbook to OneDrive.
 */

import cron from "node-cron";
import { getDb, logActivity } from "./db";
import { reminderSettings } from "../drizzle/schema";
import { sendEmailReminder, sendSmsReminder } from "./reminderSender";
import { runDailyBackup, hasBackupConfig } from "./backup";

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// Daily homework reminder
// ---------------------------------------------------------------------------
async function runReminder(): Promise<void> {
  console.log("[Cron] Running daily reminder...");
  try {
    const db = await getDb();
    if (!db) {
      await logActivity({
        type: "reminder",
        status: "error",
        message: "Reminder failed: database not available",
        detail: null,
      });
      return;
    }

    const allSettings = await db.select().from(reminderSettings);
    const enabled = allSettings.filter((s) => s.enabled && s.method !== "none");

    let sent = 0;
    const logUrl = `${SITE_URL}/log`;

    for (const setting of enabled) {
      const message = (
        setting.message ??
        "Hi Charlotte! 🐱 Don't forget to log today's homework! Tap here: {link}"
      ).replace("{link}", logUrl);

      if (setting.method === "email" || setting.method === "both") {
        if (setting.email) {
          await sendEmailReminder(setting.email, message);
          sent++;
        }
      }
      if (setting.method === "sms" || setting.method === "both") {
        if (setting.phone) {
          await sendSmsReminder(setting.phone, message);
          sent++;
        }
      }
    }

    await logActivity({
      type: "reminder",
      status: "success",
      message:
        sent > 0
          ? `Reminder sent to ${enabled.length} recipient(s)`
          : "No enabled reminders found",
      detail: `sent=${sent}, total_enabled=${enabled.length}`,
    });

    console.log(`[Cron] Reminder done — sent=${sent}, enabled=${enabled.length}`);
  } catch (err) {
    console.error("[Cron] Reminder error:", err);
    await logActivity({
      type: "reminder",
      status: "error",
      message: "Reminder failed to send",
      detail: String(err),
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Register cron jobs
// ---------------------------------------------------------------------------
export function registerCronJobs(): void {
  // Daily reminder at 20:00 America/Los_Angeles
  cron.schedule(
    "0 20 * * *",
    async () => {
      console.log("[Cron] 8 PM reminder job starting...");
      await runReminder();
      console.log("[Cron] 8 PM reminder job complete.");
    },
    { timezone: "America/Los_Angeles" }
  );
  console.log("[Cron] Registered: daily 8 PM reminder");

  // Daily OneDrive backup at 01:00 America/Los_Angeles (gated on config)
  if (hasBackupConfig()) {
    cron.schedule(
      "0 1 * * *",
      () => {
        console.log("[Cron] 1 AM backup job starting...");
        runDailyBackup("cron")
          .then((result) => {
            if (result.status === "success") {
              console.log(`[Cron] Backup complete — ${result.uploadedFiles.length} file(s) uploaded`);
            } else {
              console.error(`[Cron] Backup failed: ${result.errorMessage}`);
            }
          })
          .catch((err) => console.error("[Cron] Backup unhandled error:", err));
      },
      { timezone: "America/Los_Angeles" }
    );
    console.log("[Cron] Registered: daily 1 AM OneDrive backup");
  } else {
    console.warn("[Cron] OneDrive backup env not set — daily backup disabled");
  }
}
