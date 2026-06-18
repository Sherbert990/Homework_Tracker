/**
 * CHARLOTTE'S HW TRACKER — Data Store
 * Manages homework entries in localStorage, seeded with historical data.
 *
 * DATA FORMAT (in historyData.json and localStorage):
 *   - daily_total, spent, balance are all stored in POINTS
 *   - To convert to dollars: value / POINTS_TO_DOLLARS (÷ 2.5)
 *   - Starting balance before tracking: 814 pts = $325.60
 *
 * DISPLAY:
 *   - Always show dollars (pts ÷ 2.5) for balance, earned, spent
 *   - Use pts symbol only if explicitly showing raw points
 */

import historyData from './historyData.json';

/** Conversion factor: points → dollars */
export const POINTS_TO_DOLLARS = 2.5;

/** Starting balance before tracking began (April 2023), in points */
export const STARTING_BALANCE_PTS = 814;

/** Starting balance in dollars */
export const STARTING_BALANCE_USD = STARTING_BALANCE_PTS / POINTS_TO_DOLLARS; // $325.60

export interface TaskValues {
  chinese: number;
  vocab: number;
  duolingo: number;
  extra_class: number;
  chinese_practice: number;
  cello: number;
  reading: number;
  cello_notes: number;
  math: number;
  new_year_money: number;
  stretch: number;
  monthly_allowance: number;
}

export interface HWEntry {
  date: string; // YYYY-MM-DD
  tasks: TaskValues;
  daily_total: number; // in POINTS
  spent: number;       // in POINTS
  balance: number;     // in POINTS (running total)
  notes: string | null;
}

export interface TaskDef {
  key: keyof TaskValues;
  label: string;
  emoji: string;
}

export const TASK_DEFS: TaskDef[] = historyData.tasks as TaskDef[];

// Default weights in DOLLARS (original point weights ÷ 2.5)
// Chinese=1.5pts→$0.60, Vocab=1pt→$0.40, Duolingo=0.5pt→$0.20,
// Extra Class=1pt→$0.40, Chinese Practice=1pt→$0.40, Cello=1pt→$0.40,
// Reading=1pt→$0.40, Cello Notes=1pt→$0.40, Math=1.5pts→$0.60,
// New Year Money=1pt→$0.40, Stretch=0.5pt→$0.20, Monthly Allowance=1pt→$0.40
export const DEFAULT_WEIGHTS: TaskValues = {
  chinese: 0.60,
  vocab: 0.40,
  duolingo: 0.20,
  extra_class: 0.40,
  chinese_practice: 0.40,
  cello: 0.40,
  reading: 0.40,
  cello_notes: 0.40,
  math: 0.60,
  new_year_money: 0.40,
  stretch: 0.20,
  monthly_allowance: 0.40,
};

const STORAGE_KEY = 'charlotte_hw_tracker_v3';
const WEIGHTS_KEY = 'charlotte_hw_weights_v1';
const PREFS_KEY = 'charlotte_hw_prefs_v1';
const REMINDER_KEY = 'charlotte_hw_reminder_v1';

// ─── Display Unit Preference ─────────────────────────────────────────────────

export type DisplayUnit = 'dollars' | 'points';

export interface AppPrefs {
  displayUnit: DisplayUnit;
}

export const DEFAULT_PREFS: AppPrefs = { displayUnit: 'dollars' };

export function loadPrefs(): AppPrefs {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) return { ...DEFAULT_PREFS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(prefs: AppPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/**
 * Format a value (in POINTS) according to the current display unit preference.
 * If unit is 'dollars', converts and shows $X.XX.
 * If unit is 'points', shows X.X pts.
 */
export function formatValue(pts: number, unit: DisplayUnit): string {
  if (unit === 'dollars') return formatCurrency(ptsToDollars(pts));
  return formatPoints(pts);
}

// ─── Reminder Settings ───────────────────────────────────────────────────────

export type ReminderMethod = 'email' | 'sms' | 'both' | 'none';

export interface ReminderSettings {
  enabled: boolean;
  time: string;          // HH:MM in 24h format, e.g. "20:00"
  method: ReminderMethod;
  email: string;
  phone: string;
  message: string;
}

export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  time: '20:00',
  method: 'email',
  email: '',
  phone: '',
  message: "Hi Charlotte! 🐱 Don't forget to log today's homework! Tap here to log: {link}",
};

export function loadReminderSettings(): ReminderSettings {
  try {
    const stored = localStorage.getItem(REMINDER_KEY);
    if (stored) return { ...DEFAULT_REMINDER, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_REMINDER };
}

export function saveReminderSettings(settings: ReminderSettings): void {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(settings));
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

/** Convert points to dollars */
export function ptsToDollars(pts: number): number {
  return Math.round((pts / POINTS_TO_DOLLARS) * 100) / 100;
}

/** Convert dollars to points */
export function dollarsToPts(usd: number): number {
  return Math.round(usd * POINTS_TO_DOLLARS * 100) / 100;
}

// ─── Weights ─────────────────────────────────────────────────────────────────

export function loadWeights(): TaskValues {
  try {
    const stored = localStorage.getItem(WEIGHTS_KEY);
    if (stored) return { ...DEFAULT_WEIGHTS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_WEIGHTS };
}

export function saveWeights(weights: TaskValues): void {
  localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights));
}

// ─── Entries ──────────────────────────────────────────────────────────────────

function loadEntries(): HWEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as HWEntry[];
    }
  } catch {
    // ignore
  }
  // Seed with history data — all values are in POINTS as stored in the Excel
  const seeded = (historyData.entries as HWEntry[]).map(e => ({
    ...e,
    balance: e.balance ?? 0,
    spent: e.spent ?? 0,
    notes: e.notes ?? null,
  }));
  saveEntries(seeded);
  return seeded;
}

function saveEntries(entries: HWEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function getAllEntries(): HWEntry[] {
  return loadEntries().sort((a, b) => a.date.localeCompare(b.date));
}

export function getEntryByDate(date: string): HWEntry | null {
  const entries = loadEntries();
  return entries.find(e => e.date === date) ?? null;
}

/**
 * Recalculates running balances from scratch, starting from STARTING_BALANCE_PTS.
 * Balance[i] = Balance[i-1] + daily_total[i] - spent[i]  (all in points)
 */
function recalcBalances(entries: HWEntry[]): HWEntry[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let running = STARTING_BALANCE_PTS;
  for (const e of sorted) {
    running = running + e.daily_total - e.spent;
    e.balance = Math.round(running * 100) / 100;
  }
  return sorted;
}

export function upsertEntry(entry: Omit<HWEntry, 'balance'>): HWEntry[] {
  const entries = loadEntries();
  const idx = entries.findIndex(e => e.date === entry.date);
  const newEntry: HWEntry = { ...entry, balance: 0 };
  if (idx >= 0) {
    entries[idx] = newEntry;
  } else {
    entries.push(newEntry);
  }
  const recalced = recalcBalances(entries);
  saveEntries(recalced);
  return recalced;
}

export function deleteEntry(date: string): HWEntry[] {
  const entries = loadEntries().filter(e => e.date !== date);
  const recalced = recalcBalances(entries);
  saveEntries(recalced);
  return recalced;
}

/** Returns current balance in POINTS */
export function getCurrentBalancePts(): number {
  const entries = getAllEntries();
  if (entries.length === 0) return STARTING_BALANCE_PTS;
  return entries[entries.length - 1].balance ?? STARTING_BALANCE_PTS;
}

/** Returns current balance in DOLLARS */
export function getCurrentBalanceUSD(): number {
  return ptsToDollars(getCurrentBalancePts());
}

/** Total earned across all entries in DOLLARS */
export function getTotalEarnedUSD(entries: HWEntry[]): number {
  const totalPts = entries.reduce((s, e) => s + e.daily_total, 0);
  return ptsToDollars(totalPts + STARTING_BALANCE_PTS);
}

/** Total spent across all entries in DOLLARS */
export function getTotalSpentUSD(entries: HWEntry[]): number {
  return ptsToDollars(entries.reduce((s, e) => s + e.spent, 0));
}

/** Returns today's date as YYYY-MM-DD in the device's local timezone (e.g. PDT). */
export function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Format points value with pts symbol */
export function formatPoints(pts: number): string {
  return `${pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(1)} pts`;
}

export function getMonthlyStats(entries: HWEntry[], year: number, month: number) {
  const filtered = entries.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const totalEarnedPts = filtered.reduce((s, e) => s + e.daily_total, 0);
  const totalSpentPts = filtered.reduce((s, e) => s + e.spent, 0);
  const totalEarnedUSD = ptsToDollars(totalEarnedPts);
  const totalSpentUSD = ptsToDollars(totalSpentPts);
  const daysActive = filtered.filter(e => e.daily_total > 0).length;
  return { totalEarnedPts, totalSpentPts, totalEarnedUSD, totalSpentUSD, daysActive, entries: filtered };
}

export function getStreakDays(entries: HWEntry[]): number {
  const today = getTodayString();
  const sorted = [...entries]
    .filter(e => e.daily_total > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) return 0;

  let streak = 0;
  let current = new Date(today + 'T00:00:00');

  for (const entry of sorted) {
    const entryDate = new Date(entry.date + 'T00:00:00');
    const diffDays = Math.round((current.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0 || diffDays === 1) {
      streak++;
      current = entryDate;
    } else {
      break;
    }
  }
  return streak;
}

export function getTaskCompletion(entries: HWEntry[]) {
  const counts: Record<string, number> = {};
  for (const key of Object.keys(entries[0]?.tasks ?? {})) {
    counts[key] = 0;
  }
  for (const e of entries) {
    for (const [key, val] of Object.entries(e.tasks)) {
      if (val > 0) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

export function resetToHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Keep old function names for backward compatibility
export function getCurrentBalance(): number {
  return getCurrentBalancePts();
}

export function getTaskMoney(balance: number): number {
  return ptsToDollars(balance);
}
