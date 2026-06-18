import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb, logActivity } from "../db";
import { reminderSettings } from "../../drizzle/schema";
import { sendEmailReminder, sendSmsReminder } from "../reminderSender";
import { registerCronJobs } from "../cron";
import { runDailyBackup, hasBackupConfig } from "../backup";

/** Guards the internal backup trigger with the shared BACKUP_CRON_SECRET. */
function isBackupCronAuthorized(req: express.Request): boolean {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret) return false;
  return req.headers["x-backup-cron-secret"] === secret || req.headers.authorization === `Bearer ${secret}`;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  /**
   * Test reminder endpoint — called from the Settings page to verify reminder config.
   * Uses a different path from /api/scheduled/ to avoid platform gateway restrictions.
   */
  app.post("/api/test-reminder", async (req, res) => {
    try {
      const method: string = req.body?.method ?? "none";
      const email: string = req.body?.email ?? "";
      const phone: string = req.body?.phone ?? "";
      const message: string = req.body?.message ?? "Test reminder from Charlotte's HW Tracker";

      let sent = 0;
      if (method === "email" || method === "both") {
        if (email) { await sendEmailReminder(email, message); sent++; }
      }
      if (method === "sms" || method === "both") {
        if (phone) { await sendSmsReminder(phone, message); sent++; }
      }
      res.json({ success: true, sent, testMode: true });
    } catch (err) {
      console.error("[Test Reminder] Error:", err);
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  /**
   * Scheduled reminder endpoint — called by the cron scheduler.
   * Checks all users with enabled reminders and sends email/SMS if today
   * hasn't been logged. The scheduler passes the site URL in the body.
   * Auth: uses the session cookie when available.
   */
  app.post("/api/scheduled/reminder", async (req, res) => {
    try {
      const testMode: boolean = req.body?.testMode === true;
      const siteUrl: string = req.body?.siteUrl ?? (req.headers.origin as string) ?? "";
      const logUrl = siteUrl ? `${siteUrl}/log` : "/log";

      let sent = 0;

      if (testMode) {
        // Test mode: send directly to the provided recipient info without DB lookup
        const method: string = req.body?.method ?? "none";
        const email: string = req.body?.email ?? "";
        const phone: string = req.body?.phone ?? "";
        const message: string = req.body?.message ?? "Test reminder from Charlotte's HW Tracker";

        if (method === "email" || method === "both") {
          if (email) { await sendEmailReminder(email, message); sent++; }
        }
        if (method === "sms" || method === "both") {
          if (phone) { await sendSmsReminder(phone, message); sent++; }
        }
        res.json({ success: true, sent, testMode: true });
        return;
      }

      // Scheduled mode: look up all enabled reminder settings from DB
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      const allSettings = await db.select().from(reminderSettings);
      const enabled = allSettings.filter(s => s.enabled && s.method !== "none");

      for (const setting of enabled) {
        const message = (setting.message ?? "Hi Charlotte! 🐱 Don't forget to log today's homework! Tap here: {link}")
          .replace("{link}", logUrl);

        if (setting.method === "email" || setting.method === "both") {
          if (setting.email) await sendEmailReminder(setting.email, message);
          sent++;
        }
        if (setting.method === "sms" || setting.method === "both") {
          if (setting.phone) await sendSmsReminder(setting.phone, message);
          sent++;
        }
      }

      await logActivity({
        type: "reminder",
        status: "success",
        message: sent > 0 ? `Reminder sent to ${enabled.length} recipient(s)` : "No enabled reminders found",
        detail: `sent=${sent}, total_enabled=${enabled.length}`,
      });
      res.json({ success: true, sent, total: enabled.length });
    } catch (err) {
      console.error("[Scheduled Reminder] Error:", err);
      await logActivity({
        type: "reminder",
        status: "error",
        message: "Reminder failed to send",
        detail: String(err),
      });
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * Internal backup trigger — runs the full OneDrive backup (DB dump + Excel).
   * Guarded by the BACKUP_CRON_SECRET header so it can be called by an external
   * scheduler if ever needed. The Settings page uses the tRPC backup.runNow route.
   */
  app.post("/api/internal/run-backup", async (req, res) => {
    if (!isBackupCronAuthorized(req)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (!hasBackupConfig()) {
      res.status(503).json({ ok: false, error: "OneDrive backup is not configured" });
      return;
    }
    try {
      const result = await runDailyBackup("internal");
      res.status(result.status === "success" ? 200 : 500).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /already running/i.test(message) ? 409 : 500;
      res.status(status).json({ ok: false, error: message });
    }
  });

  /**
   * Manual activity log endpoint — called from the Settings page when the user
   * triggers a manual Sync Now. Writes a log entry to the activity_log table.
   */
  app.post("/api/log-activity", async (req, res) => {
    try {
      const { type, status, message, detail } = req.body ?? {};
      if (!type || !status || !message) {
        res.status(400).json({ error: "Missing required fields: type, status, message" });
        return;
      }
      await logActivity({ type, status, message, detail: detail ?? null });
      res.json({ success: true });
    } catch (err) {
      console.error("[Log Activity] Error:", err);
      res.status(500).json({ error: String(err) });
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Register server-side cron jobs (runs only in the server process, not Vite)
    registerCronJobs();
  });
}

startServer().catch(console.error);
