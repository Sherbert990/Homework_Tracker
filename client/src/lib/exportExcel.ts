/**
 * CHARLOTTE'S HW TRACKER — Excel Export
 * Exports all homework history to an .xlsx file with real dollar values.
 *
 * DATA NOTE: daily_total, spent, balance are stored in POINTS.
 * All exported values are converted to dollars (÷ 2.5).
 */

import * as XLSX from 'xlsx';
import type { HWEntry } from './dataStore';
import { TASK_DEFS, ptsToDollars, STARTING_BALANCE_USD } from './dataStore';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function exportToExcel(entries: HWEntry[]): void {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  // Build header row
  const headers = [
    'Date',
    ...TASK_DEFS.map(t => `${t.label} (done)`),
    'Daily Earned ($)',
    'Spent ($)',
    'Balance ($)',
    'Notes',
  ];

  // Build data rows — convert all point values to dollars
  const rows = sorted.map(e => {
    const taskValues = TASK_DEFS.map(t => {
      const v = e.tasks[t.key];
      return v > 0 ? 'Yes' : null;
    });
    return [
      e.date,
      ...taskValues,
      e.daily_total > 0 ? round2(ptsToDollars(e.daily_total)) : null,
      e.spent > 0 ? round2(ptsToDollars(e.spent)) : null,
      round2(ptsToDollars(e.balance)),
      e.notes ?? null,
    ];
  });

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, // Date
    ...TASK_DEFS.map(() => ({ wch: 18 })),
    { wch: 16 }, // Daily Earned
    { wch: 12 }, // Spent
    { wch: 14 }, // Balance
    { wch: 25 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Homework Tracker');

  // Spending summary sheet — convert to dollars
  const spendRows = sorted.filter(e => e.spent > 0).map(e => [
    e.date,
    round2(ptsToDollars(e.spent)),
    round2(ptsToDollars(e.balance)),
    e.notes ?? '',
  ]);
  const spendWs = XLSX.utils.aoa_to_sheet([
    ['Date', 'Amount Spent ($)', 'Balance After ($)', 'Notes'],
    ...spendRows,
  ]);
  spendWs['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, spendWs, 'Spending History');

  // Summary sheet
  const totalEarnedUSD = round2(ptsToDollars(sorted.reduce((s, e) => s + e.daily_total, 0)) + STARTING_BALANCE_USD);
  const totalSpentUSD = round2(ptsToDollars(sorted.reduce((s, e) => s + e.spent, 0)));
  const currentBalanceUSD = sorted.length > 0 ? round2(ptsToDollars(sorted[sorted.length - 1].balance)) : STARTING_BALANCE_USD;

  const summaryWs = XLSX.utils.aoa_to_sheet([
    ['Charlotte\'s HW Tracker — Summary'],
    [],
    ['Starting Balance (pre-tracking)', `$${STARTING_BALANCE_USD.toFixed(2)}`],
    ['Total Earned (incl. starting)', `$${totalEarnedUSD.toFixed(2)}`],
    ['Total Spent', `$${totalSpentUSD.toFixed(2)}`],
    ['Current Balance', `$${currentBalanceUSD.toFixed(2)}`],
    [],
    ['Total Days Tracked', sorted.filter(e => e.daily_total > 0).length],
    ['Total Spending Events', sorted.filter(e => e.spent > 0).length],
    ['Exported On', new Date().toLocaleDateString('en-US', { dateStyle: 'long' })],
  ]);
  summaryWs['!cols'] = [{ wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // Generate file — use local date for filename
  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(wb, `CharlotteHWTracker_${today}.xlsx`);
}
