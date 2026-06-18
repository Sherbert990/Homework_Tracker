/**
 * Server-side cron jobs for Charlotte's HW Tracker.
 *
 * Runs inside the Express process — no Manus agent credits consumed.
 * All times are in America/Los_Angeles (PDT/PST).
 *
 * Schedule:
 *   20:00 PDT — Send homework reminder email/SMS, then sync to OneDrive Excel.
 */

import cron from "node-cron";
import { getDb, logActivity } from "./db";
import { reminderSettings, oneDriveTokens } from "../drizzle/schema";
import { sendEmailReminder, sendSmsReminder } from "./reminderSender";
import { getAllEntries, getSpendingHistory } from "./hwData";
import { eq } from "drizzle-orm";

const SITE_URL = "https://char-cat-tracker.manus.space";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MS_AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPES = "Files.ReadWrite offline_access User.Read";
const OWNER_KEY = "owner";

// ---------------------------------------------------------------------------
// Step 1: Send homework reminder
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
// Step 2: Sync to OneDrive Excel (internal logic, no HTTP call)
// ---------------------------------------------------------------------------

/** Refresh an expired access token */
async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES,
  });
  const resp = await fetch(`${MS_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return resp.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

/** Get a valid access token (refresh if expired) */
async function getValidAccessToken(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(oneDriveTokens)
    .where(eq(oneDriveTokens.ownerKey, OWNER_KEY));

  if (rows.length === 0) {
    throw new Error("No OneDrive tokens found — user not authorized");
  }

  const token = rows[0];
  const now = Date.now();
  const expiresAt = token.expiresAt?.getTime() ?? 0;

  if (now >= expiresAt - 60000) {
    // Refresh if expired or within 1 minute of expiry
    const refreshed = await refreshAccessToken(token.refreshToken);
    const newExpiresAt = new Date(now + refreshed.expires_in * 1000);

    await db
      .update(oneDriveTokens)
      .set({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: newExpiresAt,
      })
      .where(eq(oneDriveTokens.ownerKey, OWNER_KEY));

    return refreshed.access_token;
  }

  return token.accessToken;
}

/** Resolve sharing URL to item path for API calls */
async function resolveShareUrl(sharingUrl: string, accessToken: string): Promise<string> {
  const body = {
    sharing_link: sharingUrl,
  };
  const resp = await fetch(`${GRAPH_BASE}/shares/encodeShareLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to resolve share URL: ${err}`);
  }
  const data = (await resp.json()) as { value: string };
  return `${GRAPH_BASE}${data.value}`;
}

/** Sync homework data to OneDrive Excel */
async function syncExcelFile(
  accessToken: string,
  itemPath: string
): Promise<{ rows: number }> {
  // Get all homework entries
  const entries = await getAllEntries();
  const spending = await getSpendingHistory();

  // Build rows for the HW sheet
  const hwRows: (string | number)[][] = [
    ["Date", "中文", "Vocab", "Duolingo", "Extra Class", "Chinese Practice",
      "Cello", "Reading", "Cello Notes Reading", "Math", "New Year Money",
      "Stretch", "Monthly Allowance", "Daily Total (pts)", "Spent (pts)", "Balance (pts)"],
  ];
  for (const e of entries) {
    hwRows.push([
      e.date,
      e.tasks["chinese"] ?? 0,
      e.tasks["vocab"] ?? 0,
      e.tasks["duolingo"] ?? 0,
      e.tasks["extraClass"] ?? 0,
      e.tasks["chinesePractice"] ?? 0,
      e.tasks["cello"] ?? 0,
      e.tasks["reading"] ?? 0,
      e.tasks["celloNotesReading"] ?? 0,
      e.tasks["math"] ?? 0,
      e.tasks["newYearMoney"] ?? 0,
      e.tasks["stretch"] ?? 0,
      e.tasks["monthlyAllowance"] ?? 0,
      e.daily_total,
      e.spent ?? 0,
      e.balance,
    ]);
  }

  // Build rows for the Spending sheet
  const spendRows: (string | number)[][] = [
    ["Date", "Amount (pts)", "Amount ($)", "Note"],
  ];
  for (const s of spending) {
    spendRows.push([s.date, s.amount, +(s.amount / 2.5).toFixed(2), s.note ?? ""]);
  }

  // Create a workbook session for efficient updates
  const sessionResp = await fetch(`${itemPath}/workbook/createSession`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ persistChanges: true }),
  });
  if (!sessionResp.ok) {
    const err = await sessionResp.text();
    throw new Error(`Could not create workbook session: ${err}`);
  }
  const { id: sessionId } = (await sessionResp.json()) as { id: string };
  const sessionHeader = { "workbook-session-id": sessionId };

  // Convert column number to Excel column letter (1=A, 26=Z, 27=AA, etc.)
  function colToLetter(col: number): string {
    let letter = '';
    while (col > 0) {
      const rem = (col - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      col = Math.floor((col - 1) / 26);
    }
    return letter;
  }

  // Helper: update a range in a worksheet
  async function updateRange(
    sheetName: string,
    values: (string | number)[][]
  ) {
    const rows = values.length;
    const cols = values[0]?.length ?? 1;
    const endCol = colToLetter(cols);
    const range = `A1:${endCol}${rows}`;
    const url = `${itemPath}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${range}')`;
    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...sessionHeader,
      },
      body: JSON.stringify({ values }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Failed to update sheet '${sheetName}': ${err}`);
    }
  }

  // Try to update existing sheets; if they don't exist, create them
  async function ensureSheet(name: string) {
    const listResp = await fetch(`${itemPath}/workbook/worksheets`, {
      headers: { Authorization: `Bearer ${accessToken}`, ...sessionHeader },
    });
    const list = (await listResp.json()) as { value: { name: string }[] };
    const exists = list.value.some(s => s.name === name);
    if (!exists) {
      await fetch(`${itemPath}/workbook/worksheets/add`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...sessionHeader,
        },
        body: JSON.stringify({ name }),
      });
    }
  }

  await ensureSheet("HW Data");
  await ensureSheet("Spending");
  await updateRange("HW Data", hwRows);
  await updateRange("Spending", spendRows);

  // Close session
  await fetch(`${itemPath}/workbook/closeSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, ...sessionHeader },
  });

  return { rows: entries.length };
}

async function runOneDriveSync(): Promise<void> {
  console.log("[Cron] Running OneDrive sync...");
  try {
    const db = await getDb();
    if (!db) {
      await logActivity({
        type: "onedrive_sync",
        status: "error",
        message: "OneDrive sync failed: database not available",
        detail: null,
      });
      return;
    }

    // Get the sharing URL from the database
    const tokens = await db
      .select()
      .from(oneDriveTokens)
      .where(eq(oneDriveTokens.ownerKey, OWNER_KEY));

    if (tokens.length === 0 || !tokens[0].sharingUrl) {
      await logActivity({
        type: "onedrive_sync",
        status: "skipped",
        message: "OneDrive not connected",
        detail: "No sharing URL found in database",
      });
      return;
    }

    const accessToken = await getValidAccessToken();
    const itemPath = await resolveShareUrl(tokens[0].sharingUrl, accessToken);
    const result = await syncExcelFile(accessToken, itemPath);

    await logActivity({
      type: "onedrive_sync",
      status: "success",
      message: `Synced ${result.rows} rows to OneDrive Excel`,
      detail: `rows=${result.rows}`,
    });

    console.log(`[Cron] OneDrive sync done — rows=${result.rows}`);
  } catch (err) {
    console.error("[Cron] OneDrive sync error:", err);
    await logActivity({
      type: "onedrive_sync",
      status: "error",
      message: "OneDrive sync failed",
      detail: String(err),
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Register cron jobs
// ---------------------------------------------------------------------------
export function registerCronJobs(): void {
  // Daily at 20:00 America/Los_Angeles — reminder first, then OneDrive sync
  cron.schedule(
    "0 20 * * *",
    async () => {
      console.log("[Cron] 8 PM PDT job starting...");
      await runReminder();
      await runOneDriveSync();
      console.log("[Cron] 8 PM PDT job complete.");
    },
    {
      timezone: "America/Los_Angeles",
    }
  );

  console.log("[Cron] Registered: daily 8 PM PDT reminder + OneDrive sync");
}
