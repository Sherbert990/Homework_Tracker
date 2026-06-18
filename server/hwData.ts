/**
 * Server-side homework data reader.
 * Reads from the homework_entries DB table (migrated from localStorage/historyData.json).
 * Used by the OneDrive sync endpoint and tRPC procedures.
 */

import { asc } from "drizzle-orm";
import { getDb } from "./db";
import { homeworkEntries } from "../drizzle/schema";

export interface HWEntry {
  date: string;
  tasks: Record<string, number>;
  daily_total: number;
  spent: number;
  balance: number;
  notes?: string | null;
}

export interface SpendingEntry {
  date: string;
  amount: number;
  note?: string;
}

/** Fetch all homework entries from DB, sorted by date ascending. */
export async function getAllEntries(): Promise<HWEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(homeworkEntries).orderBy(asc(homeworkEntries.date));
  return rows.map(r => ({
    date: r.date,
    tasks: JSON.parse(r.tasks) as Record<string, number>,
    daily_total: r.dailyTotal,
    spent: r.spent,
    balance: r.balance,
    notes: r.notes ?? null,
  }));
}

/** Fetch a single entry by date (YYYY-MM-DD). Returns null if not found. */
export async function getEntryByDate(date: string): Promise<HWEntry | null> {
  const db = await getDb();
  if (!db) return null;
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(homeworkEntries).where(eq(homeworkEntries.date, date)).limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    date: r.date,
    tasks: JSON.parse(r.tasks) as Record<string, number>,
    daily_total: r.dailyTotal,
    spent: r.spent,
    balance: r.balance,
    notes: r.notes ?? null,
  };
}

/** Recalculate running balances for all entries in sorted order. */
const STARTING_BALANCE_PTS = 814;

function recalcBalances(entries: HWEntry[]): HWEntry[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let running = STARTING_BALANCE_PTS;
  for (const e of sorted) {
    running = running + e.daily_total - e.spent;
    e.balance = Math.round(running * 100) / 100;
  }
  return sorted;
}

/**
 * Upsert a homework entry. Recalculates all balances and writes the updated
 * balance back to the affected row.
 */
export async function upsertEntry(entry: Omit<HWEntry, 'balance'>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq } = await import("drizzle-orm");

  // Load all entries, upsert in memory, recalc balances, then write back
  const all = await getAllEntries();
  const idx = all.findIndex(e => e.date === entry.date);
  const newEntry: HWEntry = { ...entry, balance: 0 };
  if (idx >= 0) {
    all[idx] = newEntry;
  } else {
    all.push(newEntry);
  }
  const recalced = recalcBalances(all);

  // Write only the affected entry and any entries after it (balance chain)
  const startIdx = recalced.findIndex(e => e.date >= entry.date);
  const toWrite = startIdx >= 0 ? recalced.slice(startIdx) : recalced;

  for (const e of toWrite) {
    await db.insert(homeworkEntries).values({
      date: e.date,
      tasks: JSON.stringify(e.tasks),
      dailyTotal: Math.round(e.daily_total),
      spent: Math.round(e.spent),
      balance: Math.round(e.balance),
      notes: e.notes ?? null,
    }).onDuplicateKeyUpdate({
      set: {
        tasks: JSON.stringify(e.tasks),
        dailyTotal: Math.round(e.daily_total),
        spent: Math.round(e.spent),
        balance: Math.round(e.balance),
        notes: e.notes ?? null,
      },
    });
  }
}

/**
 * Delete an entry by date and recalculate all subsequent balances.
 */
export async function deleteEntry(date: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq } = await import("drizzle-orm");

  await db.delete(homeworkEntries).where(eq(homeworkEntries.date, date));

  // Recalc and update all entries after the deleted date
  const remaining = await getAllEntries();
  const recalced = recalcBalances(remaining);
  const affected = recalced.filter(e => e.date >= date);
  for (const e of affected) {
    await db.update(homeworkEntries)
      .set({ balance: Math.round(e.balance) })
      .where(eq(homeworkEntries.date, e.date));
  }
}

/**
 * Seed the DB from a list of entries (used for one-time migration from historyData.json).
 * Skips entries that already exist (by date).
 */
export async function seedEntries(entries: HWEntry[]): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const recalced = recalcBalances([...entries]);
  let inserted = 0;
  for (const e of recalced) {
    try {
      await db.insert(homeworkEntries).values({
        date: e.date,
        tasks: JSON.stringify(e.tasks),
        dailyTotal: Math.round(e.daily_total),
        spent: Math.round(e.spent),
        balance: Math.round(e.balance),
        notes: e.notes ?? null,
      }).onDuplicateKeyUpdate({
        set: { updatedAt: new Date() }, // no-op update so existing rows are skipped
      });
      inserted++;
    } catch {
      // skip duplicates
    }
  }
  return inserted;
}

export async function getSpendingHistory(): Promise<SpendingEntry[]> {
  const entries = await getAllEntries();
  return entries
    .filter(e => e.spent > 0)
    .map(e => ({ date: e.date, amount: e.spent }));
}
