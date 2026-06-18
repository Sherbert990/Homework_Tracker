/**
 * One-time migration: seed historyData.json into the homework_entries DB table.
 * Run with: node scripts/seed-history.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Load env
dotenv.config({ path: resolve(projectRoot, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const STARTING_BALANCE_PTS = 814;

function recalcBalances(entries) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let running = STARTING_BALANCE_PTS;
  for (const e of sorted) {
    running = running + e.daily_total - e.spent;
    e.balance = Math.round(running * 100) / 100;
  }
  return sorted;
}

async function main() {
  const filePath = resolve(projectRoot, "client/src/lib/historyData.json");
  const raw = readFileSync(filePath, "utf-8");
  const { entries: rawEntries } = JSON.parse(raw);

  console.log(`📂 Loaded ${rawEntries.length} entries from historyData.json`);

  const entries = recalcBalances(rawEntries.map(e => ({
    date: e.date,
    tasks: e.tasks,
    daily_total: e.daily_total ?? 0,
    spent: e.spent ?? 0,
    balance: 0,
    notes: e.notes ?? null,
  })));

  const conn = await mysql.createConnection(DATABASE_URL);
  let inserted = 0;
  let skipped = 0;

  for (const e of entries) {
    const tasksJson = JSON.stringify(e.tasks);
    try {
      const [result] = await conn.execute(
        `INSERT INTO homework_entries (date, tasks, daily_total, spent, balance, notes)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE updatedAt = updatedAt`,
        [e.date, tasksJson, Math.round(e.daily_total), Math.round(e.spent), Math.round(e.balance), e.notes ?? null]
      );
      if (result.affectedRows > 0) inserted++;
      else skipped++;
    } catch (err) {
      console.error(`❌ Failed for ${e.date}:`, err.message);
    }
  }

  await conn.end();
  console.log(`✅ Done! Inserted: ${inserted}, Skipped (already existed): ${skipped}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
