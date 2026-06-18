/**
 * server/backup.ts
 *
 * Daily backup of Charlotte's HW Tracker to OneDrive, modeled on the proven
 * implementation in the Tutor-Student-Management repo (see
 * docs/onedrive-backup-port.md).
 *
 * Each run uploads two files to `<ONEDRIVE_BACKUP_FOLDER>/<YYYY-MM-DD>/`:
 *   1. db-dump-<env>-<date>.json  — full, restorable dump of every table
 *   2. homework-backup-<env>-<date>.xlsx — human-readable workbook (HW Data + Spending)
 *
 * Auth is a long-lived Microsoft Graph refresh token in the environment — no
 * per-user OAuth/connect flow. Uploads are path-based with a 409 name-collision
 * retry. Every attempt is recorded in the `backup_runs` audit table.
 */
import * as XLSX from "xlsx";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  users,
  reminderSettings,
  oneDriveTokens,
  activityLog,
  homeworkEntries,
  backupRuns,
} from "../drizzle/schema";
import { getAllEntries, getSpendingHistory } from "./hwData";

type BackupTrigger = "cron" | "manual" | "internal";
type BackupStatus = "running" | "success" | "failed";
type OneDriveUploadOptions = { accessToken: string; folder: string; dateFolder: string; contentType?: string };

export type DailyBackupResult = {
  runId: number;
  status: Exclude<BackupStatus, "running">;
  startedAt: number;
  finishedAt: number;
  uploadedFiles: string[];
  errorMessage?: string;
};

export type BackupRunSummary = {
  id: number;
  startedAt: number;
  finishedAt: number | null;
  status: BackupStatus;
  triggeredBy: string;
  uploadedFiles: string[];
  errorMessage: string | null;
};

let activeBackupRun: Promise<DailyBackupResult> | null = null;

/** Whether the OneDrive backup credentials are present. Gate the feature on this. */
export function hasBackupConfig(): boolean {
  return Boolean(
    process.env.ONEDRIVE_CLIENT_ID &&
    process.env.ONEDRIVE_CLIENT_SECRET &&
    process.env.ONEDRIVE_REFRESH_TOKEN
  );
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

// ─── OAuth: refresh token → short-lived access token ─────────────────────────

export async function refreshOneDriveAccessToken(
  fetchImpl: typeof fetch = fetch
): Promise<{ accessToken: string; refreshToken?: string }> {
  const body = new URLSearchParams({
    client_id: requireEnv("ONEDRIVE_CLIENT_ID"),
    client_secret: requireEnv("ONEDRIVE_CLIENT_SECRET"),
    refresh_token: requireEnv("ONEDRIVE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
    scope: "offline_access Files.ReadWrite",
  });

  const response = await fetchImpl("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(`OneDrive token refresh failed: ${response.status} ${response.statusText} ${JSON.stringify(data)}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
  };
}

// ─── Path-based upload with name-collision retry ─────────────────────────────

function encodeOneDrivePath(pathValue: string): string {
  return pathValue.split("/").map((part) => encodeURIComponent(part)).join("/");
}

/**
 * Normalize a configured backup folder into a Graph path: Windows-style
 * backslashes become forward slashes so nested folders (e.g.
 * "有用资料\\Backup\\homework-tracker") are created as real Graph subfolders.
 */
export function normalizeBackupFolder(folder: string): string {
  return folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "HomeworkTrackerBackups";
}

export function buildOneDriveUploadUrl(folder: string, dateFolder: string, fileName: string): string {
  const pathValue = `${normalizeBackupFolder(folder)}/${dateFolder}/${fileName}`;
  return `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeOneDrivePath(pathValue)}:/content`;
}

export function withFileNameSuffix(fileName: string, suffix: number): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) return `${fileName}-${suffix}`;
  return `${fileName.slice(0, dotIndex)}-${suffix}${fileName.slice(dotIndex)}`;
}

function isOneDriveNameAlreadyExistsError(status: number, responseText: string): boolean {
  if (status !== 409) return false;
  try {
    const parsed = JSON.parse(responseText) as { error?: { code?: string } };
    return parsed.error?.code === "nameAlreadyExists";
  } catch {
    return /nameAlreadyExists/i.test(responseText);
  }
}

export async function uploadToOneDrive(
  fileBuffer: Buffer,
  fileName: string,
  options: OneDriveUploadOptions,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const uploadUrl = buildOneDriveUploadUrl(options.folder, options.dateFolder, fileName);
  const response = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": options.contentType ?? "application/octet-stream",
    },
    body: fileBuffer as unknown as BodyInit,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OneDrive upload failed: ${response.status} ${response.statusText} - ${text}`);
  }
}

export async function uploadToOneDriveWithNameRetry(
  fileBuffer: Buffer,
  fileName: string,
  options: OneDriveUploadOptions,
  fetchImpl: typeof fetch = fetch,
  maxRetries = 5
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const candidateName = attempt === 0 ? fileName : withFileNameSuffix(fileName, attempt);
    const uploadUrl = buildOneDriveUploadUrl(options.folder, options.dateFolder, candidateName);
    const response = await fetchImpl(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": options.contentType ?? "application/octet-stream",
      },
      body: fileBuffer as unknown as BodyInit,
    });

    if (response.ok) return candidateName;

    const text = await response.text().catch(() => "");
    if (isOneDriveNameAlreadyExistsError(response.status, text) && attempt < maxRetries) {
      console.warn(`[backup] OneDrive file ${candidateName} already exists; retrying with a suffix.`);
      continue;
    }

    throw new Error(`OneDrive upload failed: ${response.status} ${response.statusText} - ${text}`);
  }

  throw new Error(`OneDrive upload failed: could not find an available name for ${fileName}`);
}

// ─── Full DB dump (JSON, restorable) ─────────────────────────────────────────

export type DbDump = {
  version: 1;
  exportedAt: string;
  data: {
    users: typeof users.$inferSelect[];
    reminderSettings: typeof reminderSettings.$inferSelect[];
    oneDriveTokens: typeof oneDriveTokens.$inferSelect[];
    activityLog: typeof activityLog.$inferSelect[];
    homeworkEntries: typeof homeworkEntries.$inferSelect[];
    backupRuns: typeof backupRuns.$inferSelect[];
  };
};

export async function buildDbDump(): Promise<DbDump> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      users: await db.select().from(users),
      reminderSettings: await db.select().from(reminderSettings),
      oneDriveTokens: await db.select().from(oneDriveTokens),
      activityLog: await db.select().from(activityLog),
      homeworkEntries: await db.select().from(homeworkEntries),
      backupRuns: await db.select().from(backupRuns),
    },
  };
}

// ─── Human-readable Excel workbook (HW Data + Spending) ──────────────────────

/** Task key → column header for the HW Data sheet (keys match stored JSON). */
const HW_COLUMNS: { key: string; header: string }[] = [
  { key: "chinese", header: "中文" },
  { key: "vocab", header: "Vocab" },
  { key: "duolingo", header: "Duolingo" },
  { key: "extra_class", header: "Extra Class" },
  { key: "chinese_practice", header: "Chinese Practice" },
  { key: "cello", header: "Cello" },
  { key: "reading", header: "Reading" },
  { key: "cello_notes", header: "Cello Notes Reading" },
  { key: "math", header: "Math" },
  { key: "new_year_money", header: "New Year Money" },
  { key: "stretch", header: "Stretch" },
  { key: "monthly_allowance", header: "Monthly Allowance" },
];

/** Build an xlsx Buffer with all homework + spending data. */
export async function buildBackupBuffer(): Promise<Buffer> {
  const entries = await getAllEntries();
  const spending = await getSpendingHistory();

  // ── HW Data sheet ──
  const hwHeader = [
    "Date",
    ...HW_COLUMNS.map((c) => c.header),
    "Daily Total (pts)",
    "Spent (pts)",
    "Balance (pts)",
  ];
  const hwRows: (string | number)[][] = [hwHeader];
  for (const e of entries) {
    hwRows.push([
      e.date,
      ...HW_COLUMNS.map((c) => e.tasks[c.key] ?? 0),
      e.daily_total,
      e.spent ?? 0,
      e.balance,
    ]);
  }

  // ── Spending sheet ──
  const spendRows: (string | number)[][] = [["Date", "Amount (pts)", "Amount ($)", "Note"]];
  for (const s of spending) {
    spendRows.push([s.date, s.amount, +(s.amount / 2.5).toFixed(2), s.note ?? ""]);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hwRows), "HW Data");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(spendRows), "Spending");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ─── Audit table (backup_runs) ───────────────────────────────────────────────

function parseUploadedFiles(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function formatBackupRunSummary(row: typeof backupRuns.$inferSelect): BackupRunSummary {
  return {
    id: row.id,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    status: row.status,
    triggeredBy: row.triggeredBy,
    uploadedFiles: parseUploadedFiles(row.uploadedFiles),
    errorMessage: row.errorMessage,
  };
}

async function createBackupRun(triggeredBy: BackupTrigger): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  const result = await db.insert(backupRuns).values({
    startedAt: Date.now(),
    status: "running",
    triggeredBy,
    uploadedFiles: JSON.stringify([]),
  });
  return result[0].insertId as number;
}

async function finishBackupRun(
  id: number,
  status: Exclude<BackupStatus, "running">,
  uploadedFiles: string[],
  errorMessage?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  await db.update(backupRuns).set({
    finishedAt: Date.now(),
    status,
    uploadedFiles: JSON.stringify(uploadedFiles),
    errorMessage: errorMessage ?? null,
  }).where(sql`${backupRuns.id} = ${id}`);
}

export async function getLatestBackupRun(): Promise<BackupRunSummary | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(backupRuns).orderBy(sql`${backupRuns.startedAt} DESC`).limit(1);
  return rows[0] ? formatBackupRunSummary(rows[0]) : null;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

async function runDailyBackupUnlocked(triggeredBy: BackupTrigger): Promise<DailyBackupResult> {
  const runId = await createBackupRun(triggeredBy);
  const startedAt = Date.now();
  const uploadedFiles: string[] = [];

  try {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");
    const folder = process.env.ONEDRIVE_BACKUP_FOLDER?.trim() || "HomeworkTrackerBackups";
    const auditFolder = normalizeBackupFolder(folder); // for the recorded path (matches the real upload)
    const dateFolder = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const { accessToken, refreshToken } = await refreshOneDriveAccessToken();
    if (refreshToken && refreshToken !== process.env.ONEDRIVE_REFRESH_TOKEN) {
      console.warn("[backup] OneDrive returned a rotated refresh token. Update ONEDRIVE_REFRESH_TOKEN in the environment soon.");
    }

    const env = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || "local";

    // 1. Full JSON dump
    const dumpBuffer = Buffer.from(JSON.stringify(await buildDbDump(), null, 2), "utf8");
    const uploadedDumpName = await uploadToOneDriveWithNameRetry(dumpBuffer, `db-dump-${env}-${dateFolder}.json`, {
      accessToken,
      folder,
      dateFolder,
      contentType: "application/json",
    });
    uploadedFiles.push(`${auditFolder}/${dateFolder}/${uploadedDumpName}`);

    // 2. Human-readable Excel workbook
    const xlsxBuffer = await buildBackupBuffer();
    const uploadedXlsxName = await uploadToOneDriveWithNameRetry(xlsxBuffer, `homework-backup-${env}-${dateFolder}.xlsx`, {
      accessToken,
      folder,
      dateFolder,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    uploadedFiles.push(`${auditFolder}/${dateFolder}/${uploadedXlsxName}`);

    await finishBackupRun(runId, "success", uploadedFiles);
    return { runId, status: "success", startedAt, finishedAt: Date.now(), uploadedFiles };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishBackupRun(runId, "failed", uploadedFiles, message).catch((finishError) => {
      console.error("[backup] Failed to record backup failure:", finishError);
    });
    return { runId, status: "failed", startedAt, finishedAt: Date.now(), uploadedFiles, errorMessage: message };
  }
}

/** Run the full backup and upload all files to OneDrive. In-flight guard prevents overlap. */
export async function runDailyBackup(triggeredBy: BackupTrigger = "cron"): Promise<DailyBackupResult> {
  if (activeBackupRun) throw new Error("Backup already running");
  activeBackupRun = runDailyBackupUnlocked(triggeredBy).finally(() => {
    activeBackupRun = null;
  });
  return activeBackupRun;
}
