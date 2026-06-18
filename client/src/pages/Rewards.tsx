/**
 * CHARLOTTE'S HW TRACKER — Rewards Page
 * Periwinkle Dream: real money balance, spending history, add spending
 *
 * DATA NOTE: balance, daily_total, spent are all stored in POINTS.
 * Always convert ÷ 2.5 before displaying as dollars.
 * When user enters a dollar amount to spend, convert × 2.5 to store as points.
 * Data is loaded from the server via tRPC so all devices stay in sync.
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import Layout from "@/components/Layout";
import { useDisplayUnit } from "@/contexts/DisplayUnitContext";
import { trpc } from "@/lib/trpc";
import {
  getTodayString,
  formatDate,
  formatCurrency,
  ptsToDollars,
  dollarsToPts,
  STARTING_BALANCE_USD,
  STARTING_BALANCE_PTS,
} from "@/lib/dataStore";

export default function Rewards() {
  const { fmtDollars } = useDisplayUnit();
  const [showSpendForm, setShowSpendForm] = useState(false);
  const [spendAmount, setSpendAmount] = useState('');
  const [spendNote, setSpendNote] = useState('');
  const [spendDate, setSpendDate] = useState(getTodayString());

  const { data: entries = [], isLoading } = trpc.entry.list.useQuery();
  const utils = trpc.useUtils();
  const upsertMutation = trpc.entry.upsert.useMutation({
    onSuccess: () => { utils.entry.list.invalidate(); },
  });
  const { data: existingForDate } = trpc.entry.get.useQuery(
    { date: spendDate },
    { enabled: showSpendForm }
  );

  // All balances/totals converted to dollars for display
  const balanceUSD = useMemo(() => {
    if (entries.length === 0) return STARTING_BALANCE_USD;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    return ptsToDollars(sorted.at(-1)?.balance ?? STARTING_BALANCE_PTS);
  }, [entries]);

  const totalEarnedUSD = useMemo(() => {
    const earnedPts = entries.reduce((s, e) => s + e.daily_total, 0);
    return ptsToDollars(earnedPts) + STARTING_BALANCE_USD;
  }, [entries]);

  const totalSpentUSD = useMemo(() =>
    ptsToDollars(entries.reduce((s, e) => s + e.spent, 0)),
    [entries]
  );

  const spendingHistory = useMemo(() =>
    [...entries].filter(e => e.spent > 0).sort((a, b) => b.date.localeCompare(a.date)),
    [entries]
  );

  const percentRemaining = totalEarnedUSD > 0
    ? Math.min((balanceUSD / totalEarnedUSD) * 100, 100)
    : 0;

  async function handleAddSpend() {
    const amountUSD = parseFloat(spendAmount);
    if (isNaN(amountUSD) || amountUSD <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }
    if (amountUSD > balanceUSD) {
      toast.error(`Not enough balance! You only have ${fmtDollars(balanceUSD)}.`);
      return;
    }

    const amountPts = dollarsToPts(amountUSD);
    const existing = existingForDate;

    try {
      await upsertMutation.mutateAsync({
        date: spendDate,
        tasks: existing?.tasks ?? {
          chinese: 0, vocab: 0, duolingo: 0, extra_class: 0,
          chinese_practice: 0, cello: 0, reading: 0, cello_notes: 0,
          math: 0, new_year_money: 0, stretch: 0, monthly_allowance: 0,
        },
        daily_total: existing?.daily_total ?? 0,
        spent: (existing?.spent ?? 0) + amountPts,
        notes: spendNote || existing?.notes || null,
      });
      setSpendAmount('');
      setSpendNote('');
      setShowSpendForm(false);
      toast.success(`💸 Recorded spending of ${fmtDollars(amountUSD)}!`);
    } catch {
      toast.error('❌ Failed to record spending. Please try again.');
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="text-4xl">💰</div>
          <div>
            <h1 className="font-display text-2xl font-black" style={{ color: '#3d3580' }}>
              Rewards
            </h1>
            <p className="font-body text-sm" style={{ color: '#6b63b5' }}>
              Your homework earnings and spending
            </p>
          </div>
        </div>

        {/* Balance card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="glass-card p-6 mb-5"
          style={{
            background: 'linear-gradient(135deg, rgba(139,131,197,0.15), rgba(196,191,238,0.10))',
          }}
        >
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <img
              src="/cat_coin_jar_golden_b7d9ab63.png"
              alt="Reward jar"
              className="w-28 h-28 object-contain flex-shrink-0"
            />
            <div className="flex-1 text-center sm:text-left">
              <div className="font-body text-sm mb-1" style={{ color: '#6b63b5' }}>
                Current Balance
              </div>
              <div className="font-brand text-4xl mb-2" style={{ color: '#3d3580' }}>
                {isLoading ? '…' : fmtDollars(balanceUSD)}
              </div>
              <div className="font-body text-xs mb-3" style={{ color: '#8b83c5' }}>
                Available to spend
              </div>
              {/* Progress bar */}
              <div>
                <div className="flex justify-between font-body text-xs mb-1" style={{ color: '#8b83c5' }}>
                  <span>Balance remaining</span>
                  <span>{percentRemaining.toFixed(1)}% of total earned</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(139,131,197,0.15)' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentRemaining}%` }}
                    transition={{ duration: 1, delay: 0.3 }}
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #8b83c5, #c4bfee)' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total Earned', value: isLoading ? '…' : fmtDollars(totalEarnedUSD), emoji: '💵', color: '#2D6A4F' },
            { label: 'Total Spent', value: isLoading ? '…' : fmtDollars(totalSpentUSD), emoji: '🛍️', color: '#c97a2a' },
            { label: 'Purchases', value: isLoading ? '…' : spendingHistory.length.toString(), emoji: '🎁', color: '#5a5490' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
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

        {/* Add spending button */}
        <div className="mb-5">
          <button
            onClick={() => setShowSpendForm(v => !v)}
            className="btn-periwinkle w-full text-sm"
          >
            {showSpendForm ? '✕ Cancel' : '💸 Record a Spending'}
          </button>
        </div>

        {/* Spend form */}
        <AnimatePresence>
          {showSpendForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="glass-card p-5 mb-5 overflow-hidden"
            >
              <h3 className="font-display font-bold text-base mb-4" style={{ color: '#3d3580' }}>
                💸 Record Spending
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="font-body text-xs mb-1 block" style={{ color: '#6b63b5' }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={spendDate}
                    max={getTodayString()}
                    onChange={e => setSpendDate(e.target.value)}
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
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.20"
                    value={spendAmount}
                    placeholder="0.00"
                    onChange={e => setSpendAmount(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 font-body text-sm border-0 outline-none"
                    style={{
                      background: 'rgba(147,141,219,0.1)',
                      color: '#3d3580',
                      border: '1.5px solid rgba(147,141,219,0.3)',
                    }}
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="font-body text-xs mb-1 block" style={{ color: '#6b63b5' }}>
                  What did you buy? (optional)
                </label>
                <input
                  type="text"
                  value={spendNote}
                  placeholder="e.g. New book, Roblox, Toy..."
                  onChange={e => setSpendNote(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 font-body text-sm border-0 outline-none"
                  style={{
                    background: 'rgba(147,141,219,0.1)',
                    color: '#3d3580',
                    border: '1.5px solid rgba(147,141,219,0.3)',
                  }}
                />
              </div>
              <button
                onClick={handleAddSpend}
                disabled={upsertMutation.isPending || !spendAmount || parseFloat(spendAmount) <= 0}
                className="btn-periwinkle w-full text-sm disabled:opacity-50"
              >
                {upsertMutation.isPending ? '⏳ Saving…' : '✅ Confirm Spending'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spending history */}
        <div className="glass-card p-5">
          <h2 className="font-display font-bold text-base mb-4" style={{ color: '#3d3580' }}>
            🛍️ Spending History
          </h2>
          {isLoading ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-2">🐱</div>
              <p className="font-body text-sm" style={{ color: '#8b83c5' }}>Loading…</p>
            </div>
          ) : spendingHistory.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-2">🐱</div>
              <p className="font-body text-sm" style={{ color: '#8b83c5' }}>
                No spending recorded yet. Save up!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {spendingHistory.map((e, i) => (
                <motion.div
                  key={e.date + i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{
                    background: 'rgba(255,214,176,0.12)',
                    border: '1px solid rgba(255,214,176,0.3)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-xl">🛍️</div>
                    <div>
                      <div className="font-body text-sm font-semibold" style={{ color: '#3d3580' }}>
                        {e.notes || 'Spending'}
                      </div>
                      <div className="font-body text-xs" style={{ color: '#8b83c5' }}>
                        {formatDate(e.date)}
                      </div>
                    </div>
                  </div>
                  <div className="font-display font-bold text-base" style={{ color: '#c97a2a' }}>
                    -{formatCurrency(ptsToDollars(e.spent))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
