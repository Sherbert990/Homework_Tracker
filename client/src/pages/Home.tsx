/**
 * CHARLOTTE'S HW TRACKER — Home Page
 * Periwinkle Dream: dashboard overview with today's tasks, rewards, and streak
 *
 * DATA NOTE: daily_total, balance, spent are all stored in POINTS.
 * Always use fmtValue(pts) or fmtDollars(usd) from useDisplayUnit() for display.
 * Data is loaded from the server via tRPC so all devices stay in sync.
 */

import { useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import { useDisplayUnit } from "@/contexts/DisplayUnitContext";
import { trpc } from "@/lib/trpc";
import {
  getTodayString,
  formatDate,
  ptsToDollars,
  TASK_DEFS,
  STARTING_BALANCE_PTS,
} from "@/lib/dataStore";

// Use a loose type compatible with what the server returns
interface HWEntry {
  date: string;
  tasks: Record<string, number>;
  daily_total: number;
  spent: number;
  balance: number;
  notes?: string | null;
}

function getStreakDays(entries: HWEntry[]): number {
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

export default function Home() {
  const { fmtDollars } = useDisplayUnit();
  const today = getTodayString();

  const { data: entries = [], isLoading } = trpc.entry.list.useQuery();

  const streak = useMemo(() => getStreakDays(entries), [entries]);
  const totalDays = useMemo(() => entries.filter(e => e.daily_total > 0).length, [entries]);

  const balanceUSD = useMemo(() => {
    if (entries.length === 0) return ptsToDollars(STARTING_BALANCE_PTS);
    const last = [...entries].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    return ptsToDollars(last?.balance ?? STARTING_BALANCE_PTS);
  }, [entries]);

  const totalSpentUSD = useMemo(() =>
    ptsToDollars(entries.reduce((s, e) => s + e.spent, 0)), [entries]);

  const todayEntry = useMemo(() => entries.find(e => e.date === today), [entries, today]);
  const todayEarnedUSD = todayEntry ? ptsToDollars(todayEntry.daily_total) : 0;

  // Weekly streak (last 7 days)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - (6 - i));
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const entry = entries.find(e => e.date === dateStr);
    return {
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
      date: dateStr,
      done: (entry?.daily_total ?? 0) > 0,
      isToday: dateStr === today,
    };
  }), [entries, today]);

  return (
    <Layout>
      {/* Welcome Header */}
      <div className="flex items-center gap-4 mb-8">
        <img
          src="/cat_studying_golden_9ed7c413.png"
          alt="Studying cat"
          className="w-24 h-20 object-contain hidden sm:block"
        />
        <div>
          <h1 className="font-display text-3xl font-black" style={{ color: '#3d3580' }}>
            Hi Charlotte! 🐱✨
          </h1>
          <p className="font-body text-sm mt-1" style={{ color: '#6b63b5' }}>
            {isLoading ? 'Loading…' : todayEntry
              ? `Great job today! You earned ${fmtDollars(todayEarnedUSD)} 🌟`
              : 'Ready to do some homework today?'}
          </p>
        </div>
      </div>

      {/* Stats row — Balance, Streak, Total Days */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Balance', value: isLoading ? '…' : fmtDollars(balanceUSD), emoji: '🏦', color: '#3d3580' },
          { label: 'Day Streak', value: isLoading ? '…' : `${streak} days`, emoji: '🔥', color: '#c97a2a' },
          { label: 'Total Days', value: isLoading ? '…' : totalDays.toLocaleString(), emoji: '📅', color: '#5a5490' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="glass-card p-4 text-center"
          >
            <div className="text-2xl mb-1">{stat.emoji}</div>
            <div className="font-display text-xl font-black" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="font-body text-xs mt-0.5" style={{ color: '#8b83c5' }}>
              {stat.label}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid md:grid-cols-2 gap-5 mb-6">
        {/* Today's homework */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold" style={{ color: '#3d3580' }}>
              📝 Today's Homework
            </h2>
            <span className="font-body text-xs px-2 py-1 rounded-full" style={{
              background: 'rgba(139,131,197,0.12)',
              color: '#6b63b5',
            }}>
              {formatDate(today)}
            </span>
          </div>

          {isLoading ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-2">🐱</div>
              <p className="font-body text-sm" style={{ color: '#8b83c5' }}>Loading…</p>
            </div>
          ) : todayEntry ? (
            <div>
              <div className="flex flex-wrap gap-2 mb-4">
                {TASK_DEFS.map(t => {
                  const val = todayEntry.tasks[t.key] ?? 0;
                  if (val === 0) return null;
                  return (
                    <span key={t.key} className="text-sm px-2 py-1 rounded-lg font-body" style={{
                      background: 'rgba(139,131,197,0.15)',
                      color: '#3d3580',
                    }}>
                      {t.emoji} {t.label}
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center justify-between pt-3" style={{
                borderTop: '1px dashed rgba(139,131,197,0.25)',
              }}>
                <span className="font-body text-sm" style={{ color: '#6b63b5' }}>Earned today</span>
                <span className="font-display font-black text-lg" style={{ color: '#3d3580' }}>
                  {fmtDollars(todayEarnedUSD)}
                </span>
              </div>
              <Link href={`/log/${today}`}>
                <button className="btn-periwinkle w-full mt-3 text-sm">
                  ✏️ Edit Today's Entry
                </button>
              </Link>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="text-5xl mb-3">😺</div>
              <p className="font-body text-sm mb-4" style={{ color: '#8b83c5' }}>
                No homework logged yet today. Let's get started!
              </p>
              <Link href="/log">
                <button className="btn-periwinkle text-sm">
                  ✨ Log Today's Homework
                </button>
              </Link>
            </div>
          )}
        </motion.div>

        {/* Reward Jar */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-5 text-center"
        >
          <h2 className="font-display text-lg font-bold mb-3" style={{ color: '#3d3580' }}>
            💰 Reward Jar
          </h2>
          <img
            src="/cat_coin_jar_golden_b7d9ab63.png"
            alt="Cat coin jar"
            className="w-28 h-28 object-contain mx-auto mb-2"
          />
          <div className="font-brand text-3xl mb-1" style={{ color: '#5a5490' }}>
            {isLoading ? '…' : fmtDollars(balanceUSD)}
          </div>
          <div className="font-body text-xs mb-1" style={{ color: '#8b83c5' }}>
            Current balance
          </div>
          <div className="font-body text-xs mb-4" style={{ color: '#6b63b5' }}>
            Total spent: {isLoading ? '…' : fmtDollars(totalSpentUSD)}
          </div>
          <Link href="/rewards">
            <button className="btn-mint w-full text-sm">
              🛍️ View Rewards
            </button>
          </Link>
        </motion.div>
      </div>

      {/* Weekly Streak */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-5 mb-5"
      >
        <h2 className="font-display text-lg font-bold mb-4" style={{ color: '#3d3580' }}>
          🔥 This Week's Streak
        </h2>
        <div className="flex justify-between items-center">
          {weekDays.map((day, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="font-body text-xs" style={{ color: '#8b83c5' }}>{day.label}</span>
              <div className={`streak-day ${day.done ? 'done' : day.isToday ? 'today' : 'empty'}`}>
                {day.done ? '🐱' : day.isToday ? '⭐' : day.label.slice(0, 2)}
              </div>
            </div>
          ))}
        </div>
        <p className="font-body text-xs text-center mt-3" style={{ color: '#8b83c5' }}>
          {streak === 0 ? '🌱 Start your streak today!' :
           streak === 1 ? '🎉 1-day streak! Keep it up!' :
           `🔥 ${streak}-day streak! Amazing!`}
        </p>
      </motion.div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { href: '/dashboard', emoji: '📊', title: 'Dashboard', sub: 'Long-term progress & charts' },
          { href: '/history', emoji: '📅', title: 'History', sub: 'Browse all past entries' },
          { href: '/settings', emoji: '⚙️', title: 'Settings', sub: 'Manage task weights' },
        ].map((card, i) => (
          <Link key={card.href} href={card.href}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.05 }}
              className="glass-card p-4 cursor-pointer hover:scale-105 transition-transform"
            >
              <div className="text-2xl mb-1">{card.emoji}</div>
              <div className="font-display font-bold text-sm" style={{ color: '#3d3580' }}>{card.title}</div>
              <div className="font-body text-xs" style={{ color: '#8b83c5' }}>{card.sub}</div>
            </motion.div>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
