import { bigint, boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Reminder settings — one row per user (upserted by openId).
 */
export const reminderSettings = mysqlTable("reminder_settings", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  /** HH:MM in 24h format, e.g. "20:00" */
  reminderTime: varchar("reminderTime", { length: 5 }).default("20:00").notNull(),
  method: mysqlEnum("method", ["email", "sms", "both", "none"]).default("email").notNull(),
  email: varchar("email", { length: 320 }).default("").notNull(),
  phone: varchar("phone", { length: 32 }).default("").notNull(),
  message: text("message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReminderSettingsRow = typeof reminderSettings.$inferSelect;
export type InsertReminderSettings = typeof reminderSettings.$inferInsert;

/**
 * OneDrive OAuth tokens — stores the refresh token so the app can sync
 * to the user's OneDrive without requiring re-authorization every time.
 */
export const oneDriveTokens = mysqlTable("onedrive_tokens", {
  id: int("id").autoincrement().primaryKey(),
  /** Identifies whose token this is — use a fixed key like 'owner' for single-user apps */
  ownerKey: varchar("ownerKey", { length: 64 }).notNull().unique(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  /** The OneDrive file item ID extracted from the sharing URL */
  fileItemId: varchar("fileItemId", { length: 256 }).default("").notNull(),
  /** The original sharing URL saved by the user */
  sharingUrl: text("sharingUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OneDriveTokensRow = typeof oneDriveTokens.$inferSelect;
export type InsertOneDriveTokens = typeof oneDriveTokens.$inferInsert;

/**
 * Activity log — records scheduled task events (OneDrive sync, reminders).
 * Used by the Settings page to show recent system activity.
 */
export const activityLog = mysqlTable("activity_log", {
  id: int("id").autoincrement().primaryKey(),
  /** Type of activity: 'onedrive_sync' | 'reminder' */
  type: mysqlEnum("type", ["onedrive_sync", "reminder"]).notNull(),
  /** 'success' | 'error' | 'skipped' */
  status: mysqlEnum("status", ["success", "error", "skipped"]).notNull(),
  /** Human-readable detail message */
  message: text("message").notNull(),
  /** Extra detail, e.g. rows synced or recipients notified */
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivityLogRow = typeof activityLog.$inferSelect;
export type InsertActivityLog = typeof activityLog.$inferInsert;

/**
 * Homework entries — one row per day, stores all task completions and financial data.
 * Replaces localStorage-based storage so data is shared across all devices.
 */
export const homeworkEntries = mysqlTable("homework_entries", {
  id: int("id").autoincrement().primaryKey(),
  /** Date in YYYY-MM-DD format */
  date: varchar("date", { length: 10 }).notNull().unique(),
  /** JSON blob of TaskValues — each task key mapped to its dollar value earned */
  tasks: text("tasks").notNull(), // JSON string
  /** Daily total earned, in POINTS */
  dailyTotal: int("daily_total").notNull().default(0),
  /** Amount spent, in POINTS */
  spent: int("spent").notNull().default(0),
  /** Running balance after this entry, in POINTS */
  balance: int("balance").notNull().default(0),
  /** Optional notes */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HomeworkEntryRow = typeof homeworkEntries.$inferSelect;
export type InsertHomeworkEntry = typeof homeworkEntries.$inferInsert;

/**
 * Backup runs — audit trail for the daily OneDrive backup (DB dump + Excel).
 * One row per backup attempt; lets the Settings page show last-backup status.
 */
export const backupRuns = mysqlTable("backup_runs", {
  id: int("id").autoincrement().primaryKey(),
  /** Epoch ms when the run started */
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  /** Epoch ms when the run finished (null while running) */
  finishedAt: bigint("finishedAt", { mode: "number" }),
  status: mysqlEnum("status", ["running", "success", "failed"]).notNull().default("running"),
  /** "cron" | "manual" | "internal" */
  triggeredBy: varchar("triggeredBy", { length: 32 }).notNull(),
  /** JSON array of uploaded OneDrive file paths */
  uploadedFiles: text("uploadedFiles"),
  errorMessage: text("errorMessage"),
});

export type BackupRunRow = typeof backupRuns.$inferSelect;
export type InsertBackupRun = typeof backupRuns.$inferInsert;
