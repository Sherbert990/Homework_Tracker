/**
 * CHARLOTTE'S HW TRACKER — Log Entry Page
 * Periwinkle Dream: log or edit a day's homework tasks with yes/no checkboxes
 * Weights come from Settings and determine the $ earned per task.
 * Data is stored server-side via tRPC so all devices stay in sync.
 */

import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import Layout from "@/components/Layout";
import { useDisplayUnit } from "@/contexts/DisplayUnitContext";
import { trpc } from "@/lib/trpc";
import {
  getTodayString,
  formatDate,
  ptsToDollars,
  dollarsToPts,
  loadWeights,
  TASK_DEFS,
  type TaskValues,
} from "@/lib/dataStore";

// Treat any task value > 0 as "done"
const EMPTY_DONE: Record<string, boolean> = {};
TASK_DEFS.forEach(t => { EMPTY_DONE[t.key] = false; });

export default function LogEntry() {
  const { fmtValue, fmtDollars, unit } = useDisplayUnit();
  const params = useParams<{ date?: string }>();
  const [, navigate] = useLocation();
  const today = getTodayString();
  const targetDate = params.date ?? today;

  const [date, setDate] = useState(targetDate);
  const [done, setDone] = useState<Record<string, boolean>>({ ...EMPTY_DONE });
  const [spent, setSpent] = useState(0);
  const [notes, setNotes] = useState('');
  const [isExisting, setIsExisting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [weights, setWeights] = useState<TaskValues>(loadWeights());

  useEffect(() => {
    setWeights(loadWeights());
  }, []);

  // Load entry for the selected date from the server
  const { data: existingEntry, isLoading: entryLoading } = trpc.entry.get.useQuery(
    { date },
    { retry: false }
  );

  const utils = trpc.useUtils();
  const upsertMutation = trpc.entry.upsert.useMutation({
    onMutate: async (newEntry) => {
      // Cancel any in-flight refetches so they don't overwrite our optimistic update
      await utils.entry.get.cancel({ date: newEntry.date });
      await utils.entry.list.cancel();

      // Snapshot the previous value for rollback
      const previousEntry = utils.entry.get.getData({ date: newEntry.date });
      const previousList = utils.entry.list.getData();

      // Optimistically update the single-entry cache
      const optimisticEntry = {
        date: newEntry.date,
        tasks: newEntry.tasks as Record<string, number>,
        daily_total: newEntry.daily_total,
        spent: newEntry.spent ?? 0,
        balance: previousEntry?.balance ?? 0, // balance will be recalculated server-side
        notes: newEntry.notes ?? null,
      };
      utils.entry.get.setData({ date: newEntry.date }, optimisticEntry);

      // Also optimistically update the list cache so Home/History/Dashboard update instantly
      utils.entry.list.setData(undefined, prev => {
        if (!prev) return [optimisticEntry];
        const idx = prev.findIndex(e => e.date === newEntry.date);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = optimisticEntry;
          return updated;
        }
        // New entry: insert in sorted position
        return [...prev, optimisticEntry].sort((a, b) => a.date.localeCompare(b.date));
      });

      return { previousEntry, previousList };
    },
    onError: (_err, newEntry, context) => {
      // Roll back to the snapshot on error
      if (context?.previousEntry !== undefined) {
        utils.entry.get.setData({ date: newEntry.date }, context.previousEntry);
      }
      if (context?.previousList !== undefined) {
        utils.entry.list.setData(undefined, context.previousList);
      }
    },
    onSettled: (_data, _err, newEntry) => {
      // Always refetch to sync with server truth
      utils.entry.get.invalidate({ date: newEntry.date });
      utils.entry.list.invalidate();
    },
  });
  const deleteMutation = trpc.entry.delete.useMutation({
    onMutate: async ({ date: deleteDate }) => {
      await utils.entry.get.cancel({ date: deleteDate });
      await utils.entry.list.cancel();
      const previousEntry = utils.entry.get.getData({ date: deleteDate });
      const previousList = utils.entry.list.getData();
      // Optimistically remove the entry
      utils.entry.get.setData({ date: deleteDate }, null);
      utils.entry.list.setData(undefined, prev => prev?.filter(e => e.date !== deleteDate) ?? []);
      return { previousEntry, previousList };
    },
    onError: (_err, { date: deleteDate }, context) => {
      if (context?.previousEntry !== undefined) {
        utils.entry.get.setData({ date: deleteDate }, context.previousEntry);
      }
      if (context?.previousList !== undefined) {
        utils.entry.list.setData(undefined, context.previousList);
      }
    },
    onSettled: (_data, _err, { date: deleteDate }) => {
      utils.entry.get.invalidate({ date: deleteDate });
      utils.entry.list.invalidate();
    },
  });

  // Populate form when server data loads
  useEffect(() => {
    if (existingEntry) {
      const newDone: Record<string, boolean> = {};
      TASK_DEFS.forEach(t => {
        newDone[t.key] = (existingEntry.tasks[t.key] ?? 0) > 0;
      });
      setDone(newDone);
      setSpent(ptsToDollars(existingEntry.spent ?? 0));
      setNotes(existingEntry.notes ?? '');
      setIsExisting(true);
    } else if (!entryLoading) {
      setDone({ ...EMPTY_DONE });
      setSpent(0);
      setNotes('');
      setIsExisting(false);
    }
  }, [existingEntry, entryLoading, date]);

  // Calculate daily total based on done tasks × their weights
  const dailyTotal = TASK_DEFS.reduce((sum, task) => {
    return sum + (done[task.key] ? (weights[task.key] ?? 0) : 0);
  }, 0);

  function toggleTask(key: string) {
    setDone(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    // Convert done booleans back to task values (weight in dollars if done, 0 if not)
    const tasks = {} as TaskValues;
    TASK_DEFS.forEach(t => {
      (tasks as any)[t.key] = done[t.key] ? (weights[t.key] ?? 0) : 0;
    });

    // dailyTotal is in dollars — convert to points for storage
    const dailyTotalPts = dollarsToPts(dailyTotal);
    // spent is entered in dollars — convert to points for storage
    const spentPts = spent > 0 ? dollarsToPts(spent) : 0;

    try {
      await upsertMutation.mutateAsync({
        date,
        tasks,
        daily_total: dailyTotalPts,
        spent: spentPts,
        notes: notes || null,
      });
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);
      toast.success(isExisting ? '✅ Entry updated!' : '🎉 Entry saved! Great work!');
      setTimeout(() => navigate('/'), 1200);
    } catch {
      toast.error('❌ Failed to save. Please try again.');
    }
  }

  // Navigate to previous or next day
  function shiftDay(delta: number) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (next > today) return;
    setDate(next);
  }

  async function handleDelete() {
    if (confirm('Delete this entry?')) {
      try {
        await deleteMutation.mutateAsync({ date });
        toast.info('Entry deleted.');
        navigate('/history');
      } catch {
        toast.error('❌ Failed to delete. Please try again.');
      }
    }
  }

  const doneCount = Object.values(done).filter(Boolean).length;
  const totalTasks = TASK_DEFS.filter(t => (weights[t.key] ?? 0) > 0).length;
  const isSaving = upsertMutation.isPending;

  return (
    <Layout>
      <AnimatePresence>
        {showConfetti && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
          >
            <div className="text-6xl animate-bounce">🎉</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="text-4xl">✏️</div>
          <div>
            <h1 className="font-display text-2xl font-black" style={{ color: '#3d3580' }}>
              {isExisting ? 'Edit Entry' : 'Log Homework'}
            </h1>
            <p className="font-body text-sm" style={{ color: '#6b63b5' }}>
              {formatDate(date)}
            </p>
          </div>
        </div>

        {/* Date picker with prev/next arrows */}
        <div className="glass-card p-4 mb-5">
          <label className="font-display font-bold text-sm block mb-2" style={{ color: '#3d3580' }}>
            📅 Date
          </label>
          <div className="flex items-center gap-2">
            {/* Previous day */}
            <button
              onClick={() => shiftDay(-1)}
              title="Previous day"
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all font-bold text-lg"
              style={{
                background: 'rgba(147,141,219,0.12)',
                color: '#5a5490',
                border: '1.5px solid rgba(147,141,219,0.25)',
              }}
            >
              ‹
            </button>

            {/* Date input */}
            <input
              type="date"
              value={date}
              max={today}
              onChange={e => setDate(e.target.value)}
              className="flex-1 rounded-xl px-4 py-2 font-body text-sm border-0 outline-none"
              style={{
                background: 'rgba(147,141,219,0.1)',
                color: '#3d3580',
                border: '1.5px solid rgba(147,141,219,0.3)',
              }}
            />

            {/* Next day (disabled if already on today) */}
            <button
              onClick={() => shiftDay(1)}
              disabled={date >= today}
              title="Next day"
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all font-bold text-lg"
              style={{
                background: date >= today ? 'rgba(147,141,219,0.05)' : 'rgba(147,141,219,0.12)',
                color: date >= today ? 'rgba(90,84,144,0.3)' : '#5a5490',
                border: '1.5px solid rgba(147,141,219,0.25)',
                cursor: date >= today ? 'not-allowed' : 'pointer',
              }}
            >
              ›
            </button>
          </div>
        </div>

        {/* Loading state */}
        {entryLoading && (
          <div className="glass-card p-8 mb-5 text-center">
            <div className="text-3xl mb-2">🐱</div>
            <p className="font-body text-sm" style={{ color: '#8b83c5' }}>Loading entry…</p>
          </div>
        )}

        {/* Task checkboxes */}
        {!entryLoading && (
          <div className="glass-card p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-bold text-base" style={{ color: '#3d3580' }}>
                📚 Homework Tasks
              </h2>
              <span className="font-body text-xs px-3 py-1 rounded-full" style={{
                background: 'rgba(147,141,219,0.15)',
                color: '#5a5490',
              }}>
                {doneCount}/{totalTasks} done
              </span>
            </div>
            <div className="space-y-2">
              {TASK_DEFS.map((task, i) => {
                const taskWeight = weights[task.key] ?? 0;
                if (taskWeight === 0) return null;
                const isDone = done[task.key];
                return (
                  <motion.button
                    key={task.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => toggleTask(task.key)}
                    className="w-full text-left p-3 rounded-xl transition-all"
                    style={{
                      background: isDone
                        ? 'linear-gradient(135deg, rgba(147,141,219,0.2), rgba(181,234,215,0.15))'
                        : 'rgba(255,255,255,0.6)',
                      border: isDone
                        ? '1.5px solid rgba(147,141,219,0.4)'
                        : '1.5px solid rgba(147,141,219,0.15)',
                      boxShadow: isDone ? '0 2px 10px rgba(147,141,219,0.15)' : 'none',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          background: isDone
                            ? 'linear-gradient(135deg, #8b83c5, #a89fd4)'
                            : 'rgba(255,255,255,0.8)',
                          border: isDone ? 'none' : '2px solid rgba(147,141,219,0.4)',
                          boxShadow: isDone ? '0 2px 6px rgba(139,131,197,0.35)' : 'none',
                        }}
                      >
                        {isDone && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <span className="text-xl flex-shrink-0">{task.emoji}</span>
                      <span
                        className="font-body text-sm font-semibold flex-1"
                        style={{ color: isDone ? '#3d3580' : '#7a7aaa' }}
                      >
                        {task.label}
                      </span>
                      <span
                        className="font-display text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          background: isDone
                            ? 'rgba(147,141,219,0.25)'
                            : 'rgba(200,200,220,0.2)',
                          color: isDone ? '#3d3580' : '#aaa8cc',
                        }}
                      >
                        {isDone ? `+${fmtDollars(taskWeight)}` : fmtDollars(taskWeight)}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Daily total */}
            <div className="mt-4 pt-4 flex items-center justify-between" style={{
              borderTop: '1.5px dashed rgba(147,141,219,0.3)',
            }}>
              <span className="font-display font-bold text-sm" style={{ color: '#3d3580' }}>
                ✨ Today's Earnings
              </span>
              <span className="font-brand text-2xl" style={{ color: '#6b63b5' }}>
                {fmtDollars(dailyTotal)}
              </span>
            </div>
          </div>
        )}

        {/* Spending */}
        {!entryLoading && (
          <div className="glass-card p-5 mb-5">
            <h2 className="font-display font-bold text-base mb-3" style={{ color: '#3d3580' }}>
              💸 Spending
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs mb-1 block" style={{ color: '#6b63b5' }}>
                  Amount Spent ({unit === 'dollars' ? '$' : 'pts'})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={spent || ''}
                  placeholder="0"
                  onChange={e => setSpent(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl px-3 py-2 font-body text-sm border-0 outline-none"
                  style={{
                    background: 'rgba(147,141,219,0.1)',
                    color: '#3d3580',
                    border: '1.5px solid rgba(147,141,219,0.3)',
                  }}
                />
              </div>
              <div>
                <label className="font-body text-xs mb-1 block" style={{ color: '#6b63b5' }}>
                  Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  placeholder="What did you buy?"
                  onChange={e => setNotes(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 font-body text-sm border-0 outline-none"
                  style={{
                    background: 'rgba(147,141,219,0.1)',
                    color: '#3d3580',
                    border: '1.5px solid rgba(147,141,219,0.3)',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!entryLoading && (
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving || (dailyTotal === 0 && spent === 0)}
              className="btn-periwinkle flex-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? '⏳ Saving…' : isExisting ? '✅ Update Entry' : '🎉 Save Entry'}
            </button>
            {isExisting && (
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-2xl text-sm font-bold font-display"
                style={{
                  background: 'rgba(147,141,219,0.12)',
                  color: '#6b63b5',
                  border: '1.5px solid rgba(147,141,219,0.3)',
                }}
              >
                🗑️ Delete
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
