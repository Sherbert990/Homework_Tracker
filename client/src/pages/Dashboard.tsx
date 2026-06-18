/**
 * CHARLOTTE'S HW TRACKER — Dashboard Page
 * Periwinkle Dream: long-term charts, monthly stats, task breakdown, homework slicer
 *
 * Summary stats emphasize ACTIVITY COUNTS (days, tasks completed) over dollar amounts.
 * Dollar/point values shown in charts but secondary in summary cards.
 *
 * Filters: homework type slicer + date range (default = current month).
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Area, AreaChart,
} from "recharts";
import Layout from "@/components/Layout";
import { useDisplayUnit } from "@/contexts/DisplayUnitContext";
import {
  STARTING_BALANCE_PTS,
  formatCurrency,
  ptsToDollars,
  TASK_DEFS,
} from "@/lib/dataStore";
import { exportToExcel } from "@/lib/exportExcel";
import { trpc } from "@/lib/trpc";

const PERIWINKLE_COLORS = [
  '#8b83c5', '#a89fd4', '#c4bfee', '#B5EAD7', '#8EDFC0',
  '#FFD6B0', '#F9C8A8', '#A8D8F9', '#F0C8A8', '#C8F0A8',
  '#D4A8F0', '#A8F0D4',
];

type ChartTab = 'tasks' | 'money' | 'balance' | 'spending';

// Helper: first day of current month as YYYY-MM-DD
function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// Helper: today as YYYY-MM-DD in local timezone
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Dashboard() {
  const { fmtDollars, unit } = useDisplayUnit();
  const { data: allEntries = [] } = trpc.entry.list.useQuery();

  const [activeTab, setActiveTab] = useState<ChartTab>('tasks');
  const [selectedTask, setSelectedTask] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>(currentMonthStart());
  const [dateTo, setDateTo] = useState<string>(todayString());

  // ── Filtered entries (by date range) ────────────────────────────────────────
  const entries = useMemo(() => {
    return allEntries.filter(e => {
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo && e.date > dateTo) return false;
      return true;
    });
  }, [allEntries, dateFrom, dateTo]);

  // ── Summary stats (from filtered entries) ───────────────────────────────────
  // Current balance from the last entry (all-time, not range-filtered)
  const balanceUSD = useMemo(() => {
    if (allEntries.length === 0) return ptsToDollars(STARTING_BALANCE_PTS);
    const last = [...allEntries].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    return ptsToDollars(last?.balance ?? STARTING_BALANCE_PTS);
  }, [allEntries]);
  const totalEarnedUSD = useMemo(() =>
    ptsToDollars(entries.reduce((s, e) => s + e.daily_total, 0) + STARTING_BALANCE_PTS),
    [entries]
  );
  const totalSpentUSD = useMemo(() =>
    ptsToDollars(entries.reduce((s, e) => s + e.spent, 0)),
    [entries]
  );
  const activeDays = entries.filter(e => e.daily_total > 0).length;
  const totalTasksDone = useMemo(() =>
    entries.reduce((sum, e) => sum + TASK_DEFS.filter(t => e.tasks[t.key] > 0).length, 0),
    [entries]
  );
  const avgTasksPerDay = activeDays > 0 ? (totalTasksDone / activeDays).toFixed(1) : '0';
  const avgPerDayUSD = activeDays > 0
    ? ptsToDollars(entries.reduce((s, e) => s + e.daily_total, 0) / activeDays)
    : 0;

  // ── Task completion counts (for pie/bar — filtered) ─────────────────────────
  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of TASK_DEFS) counts[t.key] = 0;
    for (const e of entries) {
      for (const t of TASK_DEFS) {
        if ((e.tasks as any)[t.key] > 0) counts[t.key]++;
      }
    }
    return TASK_DEFS.map((t, i) => ({
      name: t.label,
      emoji: t.emoji,
      key: t.key,
      count: counts[t.key],
      color: PERIWINKLE_COLORS[i],
    })).sort((a, b) => b.count - a.count);
  }, [entries]);

  // ── Dynamic granularity for the Activity chart ─────────────────────────────
  // ≤ 42 days  → daily   (show each individual day)
  // ≤ 180 days → weekly  (group by ISO week)
  // > 180 days → monthly (group by month)
  const activityGranularity = useMemo((): 'daily' | 'weekly' | 'monthly' => {
    if (!dateFrom || !dateTo) return 'monthly'; // all-time → monthly
    const msRange = new Date(dateTo + 'T00:00:00').getTime() - new Date(dateFrom + 'T00:00:00').getTime();
    const days = msRange / 86_400_000;
    if (days <= 42) return 'daily';
    if (days <= 180) return 'weekly';
    return 'monthly';
  }, [dateFrom, dateTo]);

  // ── Activity chart data (granularity-aware) ──────────────────────────────────
  const activityChartData = useMemo(() => {
    const map: Record<string, { label: string; count: number; sortKey: string }> = {};

    for (const e of entries) {
      if (e.daily_total === 0 && e.spent === 0) continue;
      const d = new Date(e.date + 'T00:00:00');
      let key: string;
      let label: string;

      if (activityGranularity === 'daily') {
        key = e.date;
        label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (activityGranularity === 'weekly') {
        // ISO week: find Monday of the week
        const day = d.getDay(); // 0=Sun
        const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
        const mon = new Date(d);
        mon.setDate(d.getDate() + diff);
        key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
        label = mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }

      if (!map[key]) map[key] = { label, count: 0, sortKey: key };
      const done = selectedTask === 'all' ? e.daily_total > 0 : (e.tasks as any)[selectedTask] > 0;
      if (done) map[key].count++;
    }

    // For daily granularity, fill in every calendar day in range (even zeros)
    if (activityGranularity === 'daily' && dateFrom && dateTo) {
      const cur = new Date(dateFrom + 'T00:00:00');
      const end = new Date(dateTo + 'T00:00:00');
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (!map[key]) {
          map[key] = {
            label: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            count: 0,
            sortKey: key,
          };
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    return Object.values(map)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(({ label, count }) => ({ month: label, count }));
  }, [entries, selectedTask, activityGranularity, dateFrom, dateTo]);

  // ── Monthly money data (filtered) ───────────────────────────────────────────
  const monthlyMoneyData = useMemo(() => {
    const map: Record<string, { month: string; earned: number; spent: number }> = {};
    for (const e of entries) {
      if (e.daily_total === 0 && e.spent === 0) continue;
      const d = new Date(e.date + 'T00:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (!map[key]) map[key] = { month: label, earned: 0, spent: 0 };
      map[key].earned += ptsToDollars(e.daily_total);
      map[key].spent += ptsToDollars(e.spent);
    }
    return Object.values(map).slice(-18);
  }, [entries]);

  // ── Balance over time (weekly sample — filtered) ─────────────────────────────
  const balanceData = useMemo(() => {
    const withBalance = entries.filter(e => e.balance !== null && e.balance !== undefined);
    const sampled = withBalance.filter((_, i) => i % 7 === 0 || i === withBalance.length - 1);
    return sampled.map(e => ({
      date: e.date.slice(5),
      balance: ptsToDollars(e.balance),
    }));
  }, [entries]);

  // ── Spending events (filtered) ───────────────────────────────────────────────
  const spendingData = useMemo(() => {
    return entries
      .filter(e => e.spent > 0)
      .map(e => ({
        date: e.date.slice(5),
        fullDate: e.date,
        spent: ptsToDollars(e.spent),
        notes: e.notes ?? '',
      }))
      .slice(-20);
  }, [entries]);

  const currencySymbol = unit === 'dollars' ? '$' : 'pts';

  const TABS: { key: ChartTab; label: string }[] = [
    { key: 'tasks', label: '🎯 Activities' },
    { key: 'money', label: '💵 Earnings' },
    { key: 'balance', label: '📈 Balance' },
    { key: 'spending', label: '💸 Spending' },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card px-3 py-2 text-xs font-body" style={{ color: '#3d3580' }}>
          <p className="font-bold mb-1">{label}</p>
          {payload.map((p: any) => (
            <p key={p.name} style={{ color: p.color }}>
              {p.name}: {typeof p.value === 'number'
                ? (p.name.includes('Days') || p.name.includes('Tasks') || p.name.includes('Count')
                    ? p.value
                    : fmtDollars(p.value))
                : p.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const slicerOptions = [
    { key: 'all', label: 'All Tasks', emoji: '📚' },
    ...TASK_DEFS.map(t => ({ key: t.key, label: t.label, emoji: t.emoji })),
  ];

  // Preset date range helpers
  function setPreset(preset: 'thisMonth' | 'lastMonth' | 'last3' | 'last6' | 'thisYear' | 'allTime') {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${y}-${pad(m + 1)}-${pad(now.getDate())}`;
    if (preset === 'thisMonth') {
      setDateFrom(`${y}-${pad(m + 1)}-01`);
      setDateTo(today);
    } else if (preset === 'lastMonth') {
      const lm = m === 0 ? 12 : m;
      const ly = m === 0 ? y - 1 : y;
      const lastDay = new Date(ly, lm, 0).getDate();
      setDateFrom(`${ly}-${pad(lm)}-01`);
      setDateTo(`${ly}-${pad(lm)}-${lastDay}`);
    } else if (preset === 'last3') {
      const d = new Date(now); d.setMonth(d.getMonth() - 3);
      setDateFrom(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setDateTo(today);
    } else if (preset === 'last6') {
      const d = new Date(now); d.setMonth(d.getMonth() - 6);
      setDateFrom(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setDateTo(today);
    } else if (preset === 'thisYear') {
      setDateFrom(`${y}-01-01`);
      setDateTo(today);
    } else if (preset === 'allTime') {
      setDateFrom('');
      setDateTo('');
    }
  }

  const isAllTime = !dateFrom && !dateTo;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-black" style={{ color: '#3d3580' }}>
              📊 Dashboard
            </h1>
            <p className="font-body text-sm" style={{ color: '#6b63b5' }}>
              Your long-term homework progress
            </p>
          </div>
          <button
            onClick={() => exportToExcel(entries as any)}
            className="btn-mint text-sm flex items-center gap-2"
          >
            📥 Export to Excel
          </button>
        </div>

        {/* ── Date Range Filter ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="glass-card p-4 mb-5"
        >
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="font-display font-bold text-sm" style={{ color: '#3d3580' }}>
              📆 Date Range
            </span>
            {!isAllTime && (
              <button
                onClick={() => setPreset('allTime')}
                className="text-xs px-2 py-0.5 rounded-full font-body"
                style={{ background: 'rgba(139,131,197,0.15)', color: '#5a5490' }}
              >
                ✕ Clear
              </button>
            )}
          </div>

          {/* Preset quick-select buttons */}
          <div className="flex flex-wrap gap-2 mb-3">
            {([
              { id: 'thisMonth', label: 'This Month' },
              { id: 'lastMonth', label: 'Last Month' },
              { id: 'last3', label: 'Last 3 Months' },
              { id: 'last6', label: 'Last 6 Months' },
              { id: 'thisYear', label: 'This Year' },
              { id: 'allTime', label: 'All Time' },
            ] as { id: Parameters<typeof setPreset>[0]; label: string }[]).map(p => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className="px-3 py-1 rounded-2xl text-xs font-bold font-display transition-all"
                style={{
                  background: 'rgba(139,131,197,0.1)',
                  color: '#5a5490',
                  border: '1px solid rgba(139,131,197,0.2)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom from/to date inputs */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="font-body text-xs font-semibold" style={{ color: '#6b63b5' }}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="rounded-xl px-3 py-1.5 font-body text-sm border-0 outline-none"
                style={{
                  background: 'rgba(147,141,219,0.1)',
                  color: '#3d3580',
                  border: '1.5px solid rgba(147,141,219,0.3)',
                }}
              />
            </div>
            <span className="font-body text-xs" style={{ color: '#8b83c5' }}>—</span>
            <div className="flex items-center gap-2">
              <label className="font-body text-xs font-semibold" style={{ color: '#6b63b5' }}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="rounded-xl px-3 py-1.5 font-body text-sm border-0 outline-none"
                style={{
                  background: 'rgba(147,141,219,0.1)',
                  color: '#3d3580',
                  border: '1.5px solid rgba(147,141,219,0.3)',
                }}
              />
            </div>
            <span className="font-body text-xs ml-1" style={{ color: '#8b83c5' }}>
              {entries.length} {entries.length === 1 ? 'day' : 'days'} in range
            </span>
          </div>
        </motion.div>

        {/* Summary stats — ACTIVITY COUNTS are primary, money is secondary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'Active Days',
              value: activeDays.toLocaleString(),
              emoji: '📅',
              sub: 'days with homework',
              color: '#3d3580',
            },
            {
              label: 'Tasks Completed',
              value: totalTasksDone.toLocaleString(),
              emoji: '✅',
              sub: `${avgTasksPerDay} tasks/day avg`,
              color: '#2D6A4F',
            },
            {
              label: 'Balance',
              value: fmtDollars(balanceUSD),
              emoji: '💰',
              sub: 'current balance',
              color: '#5a5490',
            },
            {
              label: 'Avg/Day',
              value: fmtDollars(avgPerDayUSD),
              emoji: '📈',
              sub: 'earned per active day',
              color: '#c97a2a',
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="glass-card p-4 text-center"
            >
              <div className="text-2xl mb-1">{stat.emoji}</div>
              <div className="font-display text-lg font-black" style={{ color: stat.color }}>{stat.value}</div>
              <div className="font-body text-xs" style={{ color: '#8b83c5' }}>{stat.label}</div>
              <div className="font-body text-xs mt-0.5" style={{ color: '#b0aad8' }}>{stat.sub}</div>
            </motion.div>
          ))}
        </div>

        {/* Homework Type Slicer */}
        <div className="glass-card p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-display font-bold text-sm" style={{ color: '#3d3580' }}>
              🔍 Filter by Homework Type
            </span>
            {selectedTask !== 'all' && (
              <button
                onClick={() => setSelectedTask('all')}
                className="text-xs px-2 py-0.5 rounded-full font-body"
                style={{ background: 'rgba(139,131,197,0.15)', color: '#5a5490' }}
              >
                ✕ Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {slicerOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSelectedTask(opt.key)}
                className="px-3 py-1.5 rounded-2xl text-xs font-bold font-display transition-all"
                style={{
                  background: selectedTask === opt.key
                    ? 'linear-gradient(135deg, #8b83c5, #a89fd4)'
                    : 'rgba(139,131,197,0.1)',
                  color: selectedTask === opt.key ? 'white' : '#5a5490',
                  boxShadow: selectedTask === opt.key ? '0 2px 8px rgba(139,131,197,0.3)' : 'none',
                  border: selectedTask === opt.key ? 'none' : '1px solid rgba(139,131,197,0.2)',
                }}
              >
                {opt.emoji} {opt.label}
              </button>
            ))}
          </div>
          {selectedTask !== 'all' && (
            <p className="font-body text-xs mt-2" style={{ color: '#8b83c5' }}>
              Showing activity chart for: <strong style={{ color: '#3d3580' }}>
                {slicerOptions.find(o => o.key === selectedTask)?.label}
              </strong>
            </p>
          )}
        </div>

        {/* Chart tabs */}
        <div className="glass-card p-5">
          <div className="flex gap-2 mb-5 flex-wrap">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="px-4 py-2 rounded-2xl text-sm font-bold font-display transition-all"
                style={{
                  background: activeTab === tab.key
                    ? 'linear-gradient(135deg, #8b83c5, #a89fd4)'
                    : 'rgba(139,131,197,0.1)',
                  color: activeTab === tab.key ? 'white' : '#5a5490',
                  boxShadow: activeTab === tab.key ? '0 3px 12px rgba(139,131,197,0.3)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Activities tab — shows task completion counts (primary chart) */}
          {activeTab === 'tasks' && (
            <div>
              <h3 className="font-display font-bold text-sm mb-1" style={{ color: '#3d3580' }}>
                {activityGranularity === 'daily' ? 'Daily' : activityGranularity === 'weekly' ? 'Weekly' : 'Monthly'} Activity Count
                {selectedTask !== 'all' && (
                  <span className="ml-2 text-xs font-body" style={{ color: '#8b83c5' }}>
                    — {slicerOptions.find(o => o.key === selectedTask)?.emoji} {slicerOptions.find(o => o.key === selectedTask)?.label} only
                  </span>
                )}
              </h3>
              <p className="font-body text-xs mb-3" style={{ color: '#8b83c5' }}>
                {activityGranularity === 'daily'
                  ? (selectedTask === 'all' ? 'Homework done each day' : 'Days this task was completed')
                  : activityGranularity === 'weekly'
                  ? (selectedTask === 'all' ? 'Days with homework per week' : 'Days this task was completed per week')
                  : (selectedTask === 'all' ? 'Days with any homework done per month' : 'Days this task was completed per month')}
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs" style={{ background: 'rgba(139,131,197,0.12)', color: '#8b83c5' }}>
                  auto: {activityGranularity}
                </span>
              </p>
              {activityChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <div className="text-4xl mb-2">🐱</div>
                  <p className="font-body text-sm" style={{ color: '#8b83c5' }}>No data in this date range.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={activityChartData} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,131,197,0.15)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#8b83c5', fontFamily: 'Quicksand' }} angle={-45} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10, fill: '#8b83c5', fontFamily: 'Quicksand' }} tickFormatter={v => `${v}d`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Days Done" fill="url(#periwinkleGrad)" radius={[6, 6, 0, 0]} />
                    <defs>
                      <linearGradient id="periwinkleGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b83c5" />
                        <stop offset="100%" stopColor="#c4bfee" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              )}

              {/* Task breakdown bar chart + pie */}
              <div className="grid md:grid-cols-2 gap-6 mt-6">
                <div>
                  <h3 className="font-display font-bold text-sm mb-3" style={{ color: '#3d3580' }}>
                    Task Count (in range)
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={taskCounts} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#8b83c5', fontFamily: 'Quicksand' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#8b83c5', fontFamily: 'Quicksand' }} width={130} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Days Done" radius={[0, 6, 6, 0]}>
                        {taskCounts.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm mb-3" style={{ color: '#3d3580' }}>
                    Task Distribution (in range)
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={taskCounts}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {taskCounts.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'money' && (
            <div>
              <h3 className="font-display font-bold text-sm mb-3" style={{ color: '#3d3580' }}>
                Monthly Earnings
              </h3>
              {monthlyMoneyData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <div className="text-4xl mb-2">🐱</div>
                  <p className="font-body text-sm" style={{ color: '#8b83c5' }}>No data in this date range.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyMoneyData} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,131,197,0.15)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#8b83c5', fontFamily: 'Quicksand' }} angle={-45} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10, fill: '#8b83c5', fontFamily: 'Quicksand' }} tickFormatter={v => unit === 'dollars' ? `$${v}` : `${v}pts`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="earned" name="Earned" fill="url(#periwinkleGrad2)" radius={[6, 6, 0, 0]} />
                    <defs>
                      <linearGradient id="periwinkleGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b83c5" />
                        <stop offset="100%" stopColor="#c4bfee" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {activeTab === 'balance' && (
            <div>
              <h3 className="font-display font-bold text-sm mb-3" style={{ color: '#3d3580' }}>
                Balance Over Time
              </h3>
              {balanceData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <div className="text-4xl mb-2">🐱</div>
                  <p className="font-body text-sm" style={{ color: '#8b83c5' }}>No data in this date range.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={balanceData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                    <defs>
                      <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b83c5" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#8b83c5" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,131,197,0.15)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#8b83c5', fontFamily: 'Quicksand' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#8b83c5', fontFamily: 'Quicksand' }} tickFormatter={v => unit === 'dollars' ? `$${v}` : `${v}pts`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="balance" name="Balance" stroke="#8b83c5" fill="url(#balGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {activeTab === 'spending' && (
            <div>
              <h3 className="font-display font-bold text-sm mb-3" style={{ color: '#3d3580' }}>
                Spending Events
              </h3>
              {spendingData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <div className="text-4xl mb-2">🐱</div>
                  <p className="font-body text-sm" style={{ color: '#8b83c5' }}>No spending in this date range.</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={spendingData} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,131,197,0.15)" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#8b83c5', fontFamily: 'Quicksand' }} angle={-45} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: '#8b83c5', fontFamily: 'Quicksand' }} tickFormatter={v => unit === 'dollars' ? `$${v}` : `${v}pts`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="spent" name="Spent" fill="#FFD6B0" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {/* Spending table */}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs font-body">
                      <thead>
                        <tr style={{ borderBottom: '1.5px solid rgba(139,131,197,0.2)' }}>
                          {['Date', 'Amount', 'Notes'].map(h => (
                            <th key={h} className="text-left py-2 px-2 font-bold font-display" style={{ color: '#3d3580' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...spendingData].reverse().map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(139,131,197,0.08)' }}>
                            <td className="py-2 px-2" style={{ color: '#3d3580' }}>{row.fullDate}</td>
                            <td className="py-2 px-2 font-bold" style={{ color: '#5a5490' }}>{fmtDollars(row.spent)}</td>
                            <td className="py-2 px-2" style={{ color: '#8b83c5' }}>{row.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
