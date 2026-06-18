/**
 * CHARLOTTE'S HW TRACKER — History Page
 * Periwinkle Dream: browse all past entries, filter by month, export Excel
 * Emphasizes activity counts; dollar/point amounts shown as secondary info
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import { useDisplayUnit } from "@/contexts/DisplayUnitContext";
import {
  formatDate,
  ptsToDollars,
  TASK_DEFS,
} from "@/lib/dataStore";
import { exportToExcel } from "@/lib/exportExcel";
import { trpc } from "@/lib/trpc";

export default function History() {
  const { fmtDollars } = useDisplayUnit();
  const { data: rawEntries = [], isLoading } = trpc.entry.list.useQuery();
  const entries = useMemo(() => [...rawEntries].reverse(), [rawEntries]);
  const [search, setSearch] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  // Summary stats for the filtered view
  const allActive = useMemo(() => entries.filter(e => e.daily_total > 0 || e.spent > 0), [entries]);

  // Get unique months
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const e of allActive) set.add(e.date.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [allActive]);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (e.daily_total === 0 && e.spent === 0) return false;
      if (filterMonth && !e.date.startsWith(filterMonth)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!e.date.includes(s) && !(e.notes ?? '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [entries, search, filterMonth]);

  // Summary counts for filtered range
  const filteredStats = useMemo(() => {
    const totalTasks = filtered.reduce((sum, e) =>
      sum + TASK_DEFS.filter(t => e.tasks[t.key] > 0).length, 0);
    const activeDays = filtered.filter(e => e.daily_total > 0).length;
    const taskCounts: Record<string, number> = {};
    for (const e of filtered) {
      for (const t of TASK_DEFS) {
        if (e.tasks[t.key] > 0) taskCounts[t.key] = (taskCounts[t.key] ?? 0) + 1;
      }
    }
    const topTask = TASK_DEFS.slice().sort((a, b) => (taskCounts[b.key] ?? 0) - (taskCounts[a.key] ?? 0))[0];
    return { totalTasks, activeDays, topTask, taskCounts };
  }, [filtered]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-black" style={{ color: '#3d3580' }}>
              📅 History
            </h1>
            <p className="font-body text-sm" style={{ color: '#6b63b5' }}>
              {filtered.length} entries shown
            </p>
          </div>
          <button
            onClick={() => exportToExcel(rawEntries as any)}
            className="btn-mint text-sm"
          >
            📥 Export Excel
          </button>
        </div>

        {/* Activity summary cards — emphasize counts */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Active Days', value: filteredStats.activeDays.toLocaleString(), emoji: '📅', color: '#3d3580' },
            { label: 'Tasks Done', value: filteredStats.totalTasks.toLocaleString(), emoji: '✅', color: '#2D6A4F' },
            { label: 'Top Subject', value: filteredStats.topTask ? `${filteredStats.topTask.emoji} ${filteredStats.topTask.label}` : '—', emoji: '🏆', color: '#c97a2a' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass-card p-3 text-center"
            >
              <div className="text-xl mb-1">{stat.emoji}</div>
              <div className="font-display font-black text-base" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="font-body text-xs" style={{ color: '#8b83c5' }}>{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Filters */}
        <div className="glass-card p-4 mb-5 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="🔍 Search by date or notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] rounded-xl px-4 py-2 font-body text-sm border-0 outline-none"
            style={{
              background: 'rgba(147,141,219,0.1)',
              color: '#3d3580',
              border: '1.5px solid rgba(147,141,219,0.3)',
            }}
          />
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="rounded-xl px-4 py-2 font-body text-sm border-0 outline-none"
            style={{
              background: 'rgba(147,141,219,0.1)',
              color: '#3d3580',
              border: '1.5px solid rgba(147,141,219,0.3)',
            }}
          >
            <option value="">All Months</option>
            {months.map(m => {
              const d = new Date(m + '-01');
              const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              return <option key={m} value={m}>{label}</option>;
            })}
          </select>
          {(search || filterMonth) && (
            <button
              onClick={() => { setSearch(''); setFilterMonth(''); }}
              className="px-3 py-2 rounded-xl text-sm font-body"
              style={{ background: 'rgba(147,141,219,0.15)', color: '#6b63b5' }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Entry list */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <div className="text-4xl mb-2">😿</div>
              <p className="font-body text-sm" style={{ color: '#8b83c5' }}>No entries found.</p>
            </div>
          ) : (
            filtered.map((entry, i) => {
              const completedTasks = TASK_DEFS.filter(t => entry.tasks[t.key] > 0);
              return (
                <motion.div
                  key={entry.date}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="glass-card p-4 hover:scale-[1.005] transition-transform"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Date + task count badges (primary) */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-display font-bold text-sm" style={{ color: '#3d3580' }}>
                          {formatDate(entry.date)}
                        </span>
                        {completedTasks.length > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{
                            background: 'linear-gradient(135deg, rgba(139,131,197,0.25), rgba(196,191,238,0.25))',
                            color: '#3d3580',
                          }}>
                            ✅ {completedTasks.length} task{completedTasks.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {entry.spent > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{
                            background: 'rgba(255,214,176,0.35)',
                            color: '#8B5E3C',
                          }}>
                            🛍️ spent {fmtDollars(ptsToDollars(entry.spent))}
                          </span>
                        )}
                      </div>

                      {/* Task emoji icons */}
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {completedTasks.map(t => (
                          <span key={t.key} className="text-xs px-1.5 py-0.5 rounded-lg" style={{
                            background: 'rgba(139,131,197,0.1)',
                            color: '#5a5490',
                          }}>
                            {t.emoji} {t.label}
                          </span>
                        ))}
                      </div>

                      {entry.notes && (
                        <span className="text-xs italic" style={{ color: '#8b83c5' }}>
                          📝 {entry.notes}
                        </span>
                      )}
                    </div>

                    {/* Right side: balance (secondary) + edit */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        {entry.daily_total > 0 && (
                          <div className="font-body text-xs font-semibold" style={{ color: '#5a5490' }}>
                            +{fmtDollars(ptsToDollars(entry.daily_total))}
                          </div>
                        )}
                        <div className="font-body text-xs" style={{ color: '#8b83c5' }}>
                          Bal: {fmtDollars(ptsToDollars(entry.balance))}
                        </div>
                      </div>
                      <Link href={`/log/${entry.date}`}>
                        <button
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-all hover:scale-110"
                          style={{ background: 'rgba(139,131,197,0.15)', color: '#6b63b5' }}
                        >
                          ✏️
                        </button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
