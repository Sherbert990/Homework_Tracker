/**
 * OneDrive OAuth + Excel sync via Microsoft Graph API.
 *
 * Flow:
 *   1. GET  /api/onedrive/auth        → redirects to Microsoft login
 *   2. GET  /api/onedrive/callback    → exchanges code for tokens, stores in DB
 *   3. POST /api/onedrive/sync        → refreshes token if needed, writes Excel via Graph
 *   4. GET  /api/onedrive/status      → returns whether the app is authorized
 */

import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb, logActivity } from "./db";
import { oneDriveTokens } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getAllEntries, getSpendingHistory } from "./hwData";

const OWNER_KEY = "owner";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MS_AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPES = "Files.ReadWrite offline_access User.Read";

function getClientId(): string {
  return process.env.MICROSOFT_CLIENT_ID ?? "";
}
function getClientSecret(): string {
  return process.env.MICROSOFT_CLIENT_SECRET ?? "";
}
function getRedirectUri(req: Request): string {
  // Use the ONEDRIVE_REDIRECT_URI env var if set (for deployed environments)
  if (process.env.ONEDRIVE_REDIRECT_URI) {
    return process.env.ONEDRIVE_REDIRECT_URI;
  }
  // Fall back to the published domain from VITE_APP_ID-derived domain or forwarded host
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
  // Prefer x-forwarded-host (set by Manus gateway) over raw host
  const host = (req.headers["x-forwarded-host"] as string) ?? (req.headers.host as string) ?? "";
  // Strip port if present (deployed sites don't use ports in URLs)
  const cleanHost = host.split(":")[0];
  return `${proto}://${cleanHost}/api/onedrive/callback`;
}

/** Exchange auth code for tokens */
async function exchangeCode(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: SCOPES,
  });
  const resp = await fetch(`${MS_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return resp.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

/** Refresh an expired access token */
async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
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
    .where(eq(oneDriveTokens.ownerKey, OWNER_KEY))
    .limit(1);

  if (!rows.length) throw new Error("Not authorized — please connect OneDrive first");

  const row = rows[0];
  const now = new Date();

  // If token expires within 5 minutes, refresh it
  if (row.expiresAt <= new Date(now.getTime() + 5 * 60 * 1000)) {
    const refreshed = await refreshAccessToken(row.refreshToken);
    const expiresAt = new Date(now.getTime() + refreshed.expires_in * 1000);
    await db
      .update(oneDriveTokens)
      .set({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt,
      })
      .where(eq(oneDriveTokens.ownerKey, OWNER_KEY));
    return refreshed.access_token;
  }

  return row.accessToken;
}

/**
 * Resolve a OneDrive sharing URL to a Graph API drive item path.
 * Uses the sharing URL encoding trick from Graph docs.
 */
async function resolveShareUrl(
  sharingUrl: string,
  accessToken: string
): Promise<string> {
  // Encode the sharing URL as base64url (no padding)
  const encoded = Buffer.from(sharingUrl)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const shareId = `u!${encoded}`;
  const url = `${GRAPH_BASE}/shares/${shareId}/driveItem`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Could not resolve sharing URL: ${err}`);
  }
  const item = (await resp.json()) as { id: string; parentReference?: { driveId?: string } };
  const driveId = item.parentReference?.driveId;
  if (!driveId) throw new Error("Could not determine drive ID from sharing URL");
  return `${GRAPH_BASE}/drives/${driveId}/items/${item.id}`;
}

/**
 * Build a simple XLSX-compatible CSV payload for the homework data.
 * We use the Graph API workbook session to update cells directly.
 */
async function syncExcelFile(
  accessToken: string,
  itemPath: string,
  sharingUrl: string
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

export function registerOneDriveRoutes(app: Express) {
  /** Step 1: Start OAuth flow */
  app.get("/api/onedrive/auth", (req: Request, res: Response) => {
    const clientId = getClientId();
    if (!clientId) {
      res.status(500).json({ error: "MICROSOFT_CLIENT_ID is not configured" });
      return;
    }
    const redirectUri = getRedirectUri(req);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SCOPES,
      response_mode: "query",
      state: "hw-tracker",
    });
    res.redirect(`${MS_AUTH_BASE}/authorize?${params.toString()}`);
  });

  /** Step 2: OAuth callback — exchange code for tokens */
  app.get("/api/onedrive/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error) {
      res.redirect(`/settings?onedrive_error=${encodeURIComponent(error)}`);
      return;
    }
    if (!code) {
      res.redirect("/settings?onedrive_error=no_code");
      return;
    }

    try {
      const redirectUri = getRedirectUri(req);
      const tokens = await exchangeCode(code, redirectUri);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get the saved sharing URL from DB (if any)
      const existing = await db
        .select()
        .from(oneDriveTokens)
        .where(eq(oneDriveTokens.ownerKey, OWNER_KEY))
        .limit(1);

      const sharingUrl = existing[0]?.sharingUrl ?? "";

      await db
        .insert(oneDriveTokens)
        .values({
          ownerKey: OWNER_KEY,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
          fileItemId: "",
          sharingUrl,
        })
        .onDuplicateKeyUpdate({
          set: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt,
          },
        });

      res.redirect("/settings?onedrive_connected=1");
    } catch (err) {
      console.error("[OneDrive Callback] Error:", err);
      res.redirect(`/settings?onedrive_error=${encodeURIComponent(String(err))}`);
    }
  });

  /** Step 3: Sync data to OneDrive Excel */
  app.post("/api/onedrive/sync", async (req: Request, res: Response) => {
    try {
      const sharingUrl: string = req.body?.url ?? "";

      const db = await getDb();
      if (!db) {
        res.status(500).json({ success: false, error: "Database not available" });
        return;
      }

      // Save the sharing URL if provided
      if (sharingUrl) {
        await db
          .update(oneDriveTokens)
          .set({ sharingUrl })
          .where(eq(oneDriveTokens.ownerKey, OWNER_KEY));
      }

      // Get a valid access token
      let accessToken: string;
      try {
        accessToken = await getValidAccessToken();
      } catch {
        await logActivity({
          type: "onedrive_sync",
          status: "error",
          message: "Manual sync failed: OneDrive not connected",
          detail: "needsAuth=true",
        }).catch(() => {});
        res.status(401).json({
          success: false,
          error: "Not authorized. Please connect your OneDrive account first.",
          needsAuth: true,
        });
        return;
      }

      // Resolve the sharing URL to a Graph API item path
      const urlToUse =
        sharingUrl ||
        (
          await db
            .select()
            .from(oneDriveTokens)
            .where(eq(oneDriveTokens.ownerKey, OWNER_KEY))
            .limit(1)
        )[0]?.sharingUrl ||
        "";

      if (!urlToUse) {
        res.status(400).json({
          success: false,
          error: "No OneDrive file URL configured. Please enter the sharing URL in Settings.",
        });
        return;
      }

      const itemPath = await resolveShareUrl(urlToUse, accessToken);
      const { rows } = await syncExcelFile(accessToken, itemPath, urlToUse);

      // Log manual sync success to activity log
      await logActivity({
        type: "onedrive_sync",
        status: "success",
        message: `Manual sync: ${rows} rows written to OneDrive Excel`,
        detail: `rows=${rows}, source=manual`,
      }).catch(() => {}); // non-blocking

      res.json({ success: true, rows });
    } catch (err) {
      console.error("[OneDrive Sync] Error:", err);
      // Log manual sync error to activity log
      await logActivity({
        type: "onedrive_sync",
        status: "error",
        message: "Manual sync failed",
        detail: String(err),
      }).catch(() => {}); // non-blocking
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  /**
   * Scheduled sync endpoint — called by the Manus cron scheduler.
   * Lives under /api/scheduled/ so the platform-injected session cookie is allowed.
   * Reuses the same sync logic as /api/onedrive/sync but needs no body — it reads
   * the saved sharing URL from the database automatically.
   */
  app.post("/api/scheduled/onedrive-sync", async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) {
        res.status(500).json({ success: false, error: "Database not available" });
        return;
      }

      // Get a valid access token (auto-refreshes if expired)
      let accessToken: string;
      try {
        accessToken = await getValidAccessToken();
      } catch (authErr) {
        res.status(401).json({
          success: false,
          error: "Not authorized. Please connect OneDrive in the Settings page first.",
          needsAuth: true,
        });
        return;
      }

      // Load the saved sharing URL from the database
      const tokenRows = await db
        .select()
        .from(oneDriveTokens)
        .where(eq(oneDriveTokens.ownerKey, OWNER_KEY))
        .limit(1);

      const sharingUrl = tokenRows[0]?.sharingUrl ?? "";
      if (!sharingUrl) {
        res.status(400).json({
          success: false,
          error: "No OneDrive file URL configured. Please enter the sharing URL in Settings.",
        });
        return;
      }

      const itemPath = await resolveShareUrl(sharingUrl, accessToken);
      const { rows } = await syncExcelFile(accessToken, itemPath, sharingUrl);

      console.log(`[Scheduled OneDrive Sync] Synced ${rows} rows successfully`);
      await logActivity({
        type: "onedrive_sync",
        status: "success",
        message: `Synced ${rows} rows to OneDrive Excel`,
        detail: `rows=${rows}`,
      });
      res.json({ success: true, rows });
    } catch (err) {
      console.error("[Scheduled OneDrive Sync] Error:", err);
      await logActivity({
        type: "onedrive_sync",
        status: "error",
        message: "OneDrive sync failed",
        detail: String(err),
      });
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  /** Step 4: Check authorization status */
  app.get("/api/onedrive/status", async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) {
        res.json({ connected: false });
        return;
      }
      const rows = await db
        .select()
        .from(oneDriveTokens)
        .where(eq(oneDriveTokens.ownerKey, OWNER_KEY))
        .limit(1);

      if (!rows.length) {
        res.json({ connected: false });
        return;
      }

      res.json({
        connected: true,
        sharingUrl: rows[0].sharingUrl ?? "",
        expiresAt: rows[0].expiresAt,
      });
    } catch (err) {
      res.json({ connected: false, error: String(err) });
    }
  });

  /** Save just the sharing URL (without syncing) */
  app.post("/api/onedrive/save-url", async (req: Request, res: Response) => {
    try {
      const sharingUrl: string = req.body?.url ?? "";
      if (!sharingUrl) {
        res.status(400).json({ success: false, error: "No URL provided" });
        return;
      }
      const db = await getDb();
      if (!db) {
        res.status(500).json({ success: false, error: "Database not available" });
        return;
      }
      // Upsert the sharing URL
      await db
        .insert(oneDriveTokens)
        .values({
          ownerKey: OWNER_KEY,
          accessToken: "",
          refreshToken: "",
          expiresAt: new Date(0),
          fileItemId: "",
          sharingUrl,
        })
        .onDuplicateKeyUpdate({ set: { sharingUrl } });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });
}
