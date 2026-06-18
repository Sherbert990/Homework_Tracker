/**
 * CHARLOTTE'S HW TRACKER — Settings Page
 * Periwinkle Dream: task weights, display unit toggle, reminder settings, OneDrive sync
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import Layout from "@/components/Layout";
import { trpc } from "@/lib/trpc";
import { useDisplayUnit } from "@/contexts/DisplayUnitContext";
import {
  loadWeights,
  saveWeights,
  DEFAULT_WEIGHTS,
  TASK_DEFS,
  type TaskValues,
  loadPrefs,
  loadReminderSettings,
  saveReminderSettings,
  type ReminderSettings,
  type ReminderMethod,
  dollarsToPts,
  POINTS_TO_DOLLARS,
} from "@/lib/dataStore";

// Dollar presets (already in $ — no conversion needed)
const DOLLAR_PRESETS = [0, 0.20, 0.40, 0.60, 0.80, 1.00, 1.20];

export default function Settings() {
  const { unit, setUnit, fmtDollars } = useDisplayUnit();

  // Format a weight (stored in dollars) according to current unit
  function fmtWeight(dollarVal: number): string {
    if (dollarVal === 0) return '—';
    if (unit === 'points') {
      const pts = dollarsToPts(dollarVal);
      return `${pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(1)} pts`;
    }
    return `$${dollarVal.toFixed(2)}`;
  }

  // Format a preset button label
  function fmtPreset(dollarVal: number): string {
    if (dollarVal === 0) return '—';
    if (unit === 'points') {
      const pts = dollarsToPts(dollarVal);
      return `${pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(1)}`;
    }
    return `$${dollarVal.toFixed(2)}`;
  }
  const [weights, setWeights] = useState<TaskValues>({ ...DEFAULT_WEIGHTS });
  const [reminder, setReminder] = useState<ReminderSettings>(loadReminderSettings());
  const [weightsSaved, setWeightsSaved] = useState(false);
  const [reminderSaved, setReminderSaved] = useState(false);
  const [testSending, setTestSending] = useState(false);

  // tRPC: load reminder settings from backend (if logged in)
  const { data: backendReminder } = trpc.reminder.get.useQuery(undefined, {
    retry: false,
  });
  const saveReminderMutation = trpc.reminder.save.useMutation();

  // Activity log
  const { data: activityData, isLoading: activityLoading } = trpc.activity.recent.useQuery(undefined, { retry: false });
  const activityUtils = trpc.useUtils().activity;

  // OneDrive backup status + manual trigger
  const { data: backupConfigured } = trpc.backup.configured.useQuery(undefined, { retry: false });
  const { data: lastBackup, isLoading: backupLoading } = trpc.backup.latest.useQuery(undefined, { retry: false });
  const backupUtils = trpc.useUtils().backup;
  const runBackupMutation = trpc.backup.runNow.useMutation();

  async function handleRunBackup() {
    try {
      const result = await runBackupMutation.mutateAsync();
      toast.success(`☁️ Backup complete — ${result.uploadedFiles.length} file(s) uploaded to OneDrive!`);
      backupUtils.latest.invalidate();
    } catch (e: any) {
      toast.error(`❌ Backup failed: ${e?.message ?? 'Unknown error'}`);
      backupUtils.latest.invalidate();
    }
  }

  useEffect(() => {
    setWeights(loadWeights());
    if (backendReminder) {
      const merged: ReminderSettings = {
        enabled: backendReminder.enabled,
        time: backendReminder.reminderTime,
        method: backendReminder.method as ReminderMethod,
        email: backendReminder.email,
        phone: backendReminder.phone,
        message: backendReminder.message ?? loadReminderSettings().message,
      };
      setReminder(merged);
      saveReminderSettings(merged);
    } else {
      setReminder(loadReminderSettings());
    }
  }, [backendReminder]);

  function handleWeightChange(key: keyof TaskValues, value: number) {
    setWeights(prev => ({ ...prev, [key]: value }));
    setWeightsSaved(false);
  }

  function handleSaveWeights() {
    saveWeights(weights);
    setWeightsSaved(true);
    toast.success('⚙️ Task weights saved!');
    setTimeout(() => setWeightsSaved(false), 2500);
  }

  function handleResetWeights() {
    setWeights({ ...DEFAULT_WEIGHTS });
    saveWeights({ ...DEFAULT_WEIGHTS });
    setWeightsSaved(true);
    toast.info('🔄 Weights reset to defaults.');
    setTimeout(() => setWeightsSaved(false), 2500);
  }

  function handleUnitToggle(newUnit: typeof unit) {
    setUnit(newUnit);
    toast.success(`✅ Display switched to ${newUnit === 'dollars' ? 'Dollars ($)' : 'Points (pts)'}`);
  }

  async function handleSaveReminder() {
    saveReminderSettings(reminder);
    try {
      await saveReminderMutation.mutateAsync({
        enabled: reminder.enabled,
        reminderTime: reminder.time,
        method: reminder.method,
        email: reminder.email,
        phone: reminder.phone,
        message: reminder.message,
      });
    } catch {
      // Not logged in or backend error — localStorage save is still good
    }
    setReminderSaved(true);
    toast.success('🔔 Reminder settings saved!');
    setTimeout(() => setReminderSaved(false), 2500);
  }

  async function handleTestSend() {
    if (reminder.method === 'none') {
      toast.error('Please select a delivery method (Email, SMS, or Both) before testing.');
      return;
    }
    if (reminder.method !== 'sms' && !reminder.email) {
      toast.error('Please enter an email address first.');
      return;
    }
    if (reminder.method !== 'email' && !reminder.phone) {
      toast.error('Please enter a phone number first.');
      return;
    }
    setTestSending(true);
    try {
      const siteUrl = window.location.origin;
      const logUrl = `${siteUrl}/log`;
      const msg = reminder.message.replace('{link}', logUrl);
      const resp = await fetch('/api/test-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          testMode: true,
          method: reminder.method,
          email: reminder.email,
          phone: reminder.phone,
          message: msg,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        toast.success(`✅ Test reminder sent! (${data.sent ?? 1} message${data.sent !== 1 ? 's' : ''} delivered)`);
      } else {
        toast.error(`❌ Send failed: ${data.error ?? 'Unknown error'}`);
      }
    } catch (e: any) {
      toast.error(`❌ Network error: ${e?.message ?? 'Could not reach server'}`);
    } finally {
      setTestSending(false);
    }
  }

  const totalMaxPerDay = Object.values(weights).reduce((s, v) => s + v, 0);
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const logUrl = `${siteUrl}/log`;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="text-4xl">⚙️</div>
          <div>
            <h1 className="font-display text-2xl font-black" style={{ color: '#3d3580' }}>
              Settings
            </h1>
            <p className="font-body text-sm" style={{ color: '#6b63b5' }}>
              Customize your homework tracker
            </p>
          </div>
        </div>

        {/* ── Section 1: Display Unit Toggle ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card p-5"
        >
          <h2 className="font-display font-bold text-base mb-1" style={{ color: '#3d3580' }}>
            💱 Display Unit
          </h2>
          <p className="font-body text-xs mb-4" style={{ color: '#8b83c5' }}>
            Choose whether to show rewards as dollars ($) or points (pts) across the whole website. Changes apply instantly — no reload needed.
          </p>
          <div className="flex gap-3">
            {([
              { value: 'dollars', label: '💵 Dollars ($)', desc: 'Show $0.60, $93.00 etc.' },
              { value: 'points', label: '⭐ Points (pts)', desc: 'Show 1.5 pts, 232.5 pts etc.' },
            ] as { value: typeof unit; label: string; desc: string }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => handleUnitToggle(opt.value)}
                className="flex-1 p-4 rounded-2xl text-left transition-all"
                style={{
                  background: unit === opt.value
                    ? 'linear-gradient(135deg, rgba(139,131,197,0.25), rgba(168,159,212,0.2))'
                    : 'rgba(255,255,255,0.6)',
                  border: unit === opt.value
                    ? '2px solid rgba(139,131,197,0.5)'
                    : '1.5px solid rgba(139,131,197,0.15)',
                  boxShadow: unit === opt.value ? '0 3px 14px rgba(139,131,197,0.2)' : 'none',
                }}
              >
                <div className="font-display font-bold text-sm mb-1" style={{ color: '#3d3580' }}>
                  {opt.label}
                  {unit === opt.value && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(139,131,197,0.25)', color: '#5a5490' }}>
                      Active ✓
                    </span>
                  )}
                </div>
                <div className="font-body text-xs" style={{ color: '#8b83c5' }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Section 2: Task Weights ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-5"
        >
          <h2 className="font-display font-bold text-base mb-1" style={{ color: '#3d3580' }}>
            📚 Task Weights ($ per completion)
          </h2>
          <p className="font-body text-xs mb-1" style={{ color: '#8b83c5' }}>
            Set how much money each homework task is worth per day. Tap a dollar amount to select it.
          </p>
          <div className="flex items-center justify-between mb-4 pt-2" style={{
            borderTop: '1px dashed rgba(147,141,219,0.2)',
          }}>
            <span className="font-body text-xs" style={{ color: '#6b63b5' }}>
              Max possible earnings per day (if all done):
            </span>
            <span className="font-display font-black text-lg" style={{ color: '#3d3580' }}>
              {unit === 'points'
                ? `${dollarsToPts(totalMaxPerDay) % 1 === 0 ? dollarsToPts(totalMaxPerDay).toFixed(0) : dollarsToPts(totalMaxPerDay).toFixed(1)} pts`
                : `$${totalMaxPerDay.toFixed(2)}`}
            </span>
          </div>

          <div className="space-y-3">
            {TASK_DEFS.map((task, i) => (
              <motion.div
                key={task.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between gap-3 p-3 rounded-xl"
                style={{
                  background: weights[task.key] > 0 ? 'rgba(147,141,219,0.08)' : 'rgba(255,255,255,0.5)',
                  border: '1.5px solid rgba(147,141,219,0.15)',
                }}
              >
                <div className="flex items-center gap-2" style={{ minWidth: 0, flex: '0 0 160px' }}>
                  <span className="text-xl flex-shrink-0">{task.emoji}</span>
                  <div className="min-w-0">
                    <span className="font-body text-sm font-semibold block truncate" style={{ color: '#3d3580' }}>
                      {task.label}
                    </span>
                    <span className="font-body text-xs" style={{ color: weights[task.key] > 0 ? '#2D6A4F' : '#b0aad8' }}>
                      {weights[task.key] === 0 ? 'Not tracked' : `${fmtWeight(weights[task.key])} / day`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                  {DOLLAR_PRESETS.map(v => (
                    <button
                      key={v}
                      onClick={() => handleWeightChange(task.key, v)}
                      className="h-8 rounded-lg text-xs font-bold transition-all"
                      style={{
                        width: v === 0 ? '2rem' : '2.6rem',
                        background: weights[task.key] === v
                          ? (v === 0 ? 'rgba(180,180,200,0.3)' : 'linear-gradient(135deg, #8b83c5, #a89fd4)')
                          : 'rgba(255,255,255,0.6)',
                        color: weights[task.key] === v && v > 0 ? 'white' : '#5a5490',
                        border: weights[task.key] === v
                          ? '1.5px solid rgba(139,131,197,0.5)'
                          : '1px solid rgba(147,141,219,0.2)',
                        boxShadow: weights[task.key] === v && v > 0 ? '0 2px 8px rgba(139,131,197,0.3)' : 'none',
                      }}
                    >  
                      {fmtPreset(v)}
                    </button>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <div className="flex gap-3 mt-4">
            <button onClick={handleSaveWeights} className="btn-periwinkle flex-1 text-sm">
              {weightsSaved ? '✅ Saved!' : '💾 Save Weights'}
            </button>
            <button
              onClick={handleResetWeights}
              className="px-4 py-2 rounded-2xl text-sm font-bold font-display"
              style={{
                background: 'rgba(147,141,219,0.12)',
                color: '#5a5490',
                border: '1.5px solid rgba(147,141,219,0.25)',
              }}
            >
              🔄 Reset Defaults
            </button>
          </div>

          <div className="mt-3 p-3 rounded-xl text-xs font-body" style={{
            background: 'rgba(255,220,100,0.12)',
            border: '1px solid rgba(255,200,50,0.3)',
            color: '#7a6000',
          }}>
            ⚠️ <strong>Note:</strong> Changing weights only affects <em>new entries</em> going forward.
            Historical entries keep their original values.
          </div>
        </motion.div>

        {/* ── Section 3: Reminder Settings ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-5"
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-bold text-base" style={{ color: '#3d3580' }}>
              🔔 Daily Reminder
            </h2>
            <button
              onClick={() => setReminder(r => ({ ...r, enabled: !r.enabled }))}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold font-display transition-all"
              style={{
                background: reminder.enabled
                  ? 'linear-gradient(135deg, #8b83c5, #a89fd4)'
                  : 'rgba(147,141,219,0.12)',
                color: reminder.enabled ? 'white' : '#5a5490',
                border: reminder.enabled ? 'none' : '1.5px solid rgba(147,141,219,0.25)',
              }}
            >
              {reminder.enabled ? '🟢 Enabled' : '⚪ Disabled'}
            </button>
          </div>
          <p className="font-body text-xs mb-4" style={{ color: '#8b83c5' }}>
            Send a reminder if today's homework hasn't been logged by the chosen time.
            The message will include a direct link to the Log Today page.
          </p>

          <div className="space-y-4">
            {/* Reminder time */}
            <div>
              <label className="font-display font-bold text-xs block mb-1.5" style={{ color: '#3d3580' }}>
                ⏰ Reminder Time
              </label>
              <input
                type="time"
                value={reminder.time}
                onChange={e => setReminder(r => ({ ...r, time: e.target.value }))}
                className="rounded-xl px-4 py-2 font-body text-sm border-0 outline-none"
                style={{
                  background: 'rgba(147,141,219,0.1)',
                  color: '#3d3580',
                  border: '1.5px solid rgba(147,141,219,0.3)',
                }}
              />
            </div>

            {/* Delivery method */}
            <div>
              <label className="font-display font-bold text-xs block mb-1.5" style={{ color: '#3d3580' }}>
                📬 Delivery Method
              </label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { value: 'email', label: '📧 Email' },
                  { value: 'sms', label: '📱 SMS Text' },
                  { value: 'both', label: '📧📱 Both' },
                  { value: 'none', label: '🔕 None' },
                ] as { value: ReminderMethod; label: string }[]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setReminder(r => ({ ...r, method: opt.value }))}
                    className="px-3 py-1.5 rounded-2xl text-xs font-bold font-display transition-all"
                    style={{
                      background: reminder.method === opt.value
                        ? 'linear-gradient(135deg, #8b83c5, #a89fd4)'
                        : 'rgba(147,141,219,0.1)',
                      color: reminder.method === opt.value ? 'white' : '#5a5490',
                      border: reminder.method === opt.value ? 'none' : '1px solid rgba(147,141,219,0.2)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Email field */}
            {(reminder.method === 'email' || reminder.method === 'both') && (
              <div>
                <label className="font-display font-bold text-xs block mb-1.5" style={{ color: '#3d3580' }}>
                  📧 Email Address
                </label>
                <input
                  type="email"
                  value={reminder.email}
                  placeholder="e.g. parent@example.com"
                  onChange={e => setReminder(r => ({ ...r, email: e.target.value }))}
                  className="w-full rounded-xl px-4 py-2 font-body text-sm border-0 outline-none"
                  style={{
                    background: 'rgba(147,141,219,0.1)',
                    color: '#3d3580',
                    border: '1.5px solid rgba(147,141,219,0.3)',
                  }}
                />
              </div>
            )}

            {/* Phone field */}
            {(reminder.method === 'sms' || reminder.method === 'both') && (
              <div>
                <label className="font-display font-bold text-xs block mb-1.5" style={{ color: '#3d3580' }}>
                  📱 Phone Number (with country code)
                </label>
                <input
                  type="tel"
                  value={reminder.phone}
                  placeholder="e.g. +1 555 123 4567"
                  onChange={e => setReminder(r => ({ ...r, phone: e.target.value }))}
                  className="w-full rounded-xl px-4 py-2 font-body text-sm border-0 outline-none"
                  style={{
                    background: 'rgba(147,141,219,0.1)',
                    color: '#3d3580',
                    border: '1.5px solid rgba(147,141,219,0.3)',
                  }}
                />
              </div>
            )}

            {/* Reminder message */}
            <div>
              <label className="font-display font-bold text-xs block mb-1.5" style={{ color: '#3d3580' }}>
                💬 Reminder Message
              </label>
              <p className="font-body text-xs mb-1.5" style={{ color: '#8b83c5' }}>
                Use <code style={{ background: 'rgba(139,131,197,0.15)', padding: '1px 4px', borderRadius: 4 }}>{'{link}'}</code> to insert the Log Today link automatically.
              </p>
              <textarea
                value={reminder.message}
                rows={3}
                onChange={e => setReminder(r => ({ ...r, message: e.target.value }))}
                className="w-full rounded-xl px-4 py-2 font-body text-sm border-0 outline-none resize-none"
                style={{
                  background: 'rgba(147,141,219,0.1)',
                  color: '#3d3580',
                  border: '1.5px solid rgba(147,141,219,0.3)',
                }}
              />
              {/* Preview */}
              <div className="mt-2 p-3 rounded-xl text-xs font-body" style={{
                background: 'rgba(181,234,215,0.15)',
                border: '1px solid rgba(181,234,215,0.4)',
                color: '#2D6A4F',
              }}>
                <strong>Preview:</strong> {reminder.message.replace('{link}', logUrl)}
              </div>
            </div>
          </div>

          {/* Save + Test Send buttons */}
          <div className="flex gap-3 mt-4">
            <button onClick={handleSaveReminder} className="btn-periwinkle flex-1 text-sm">
              {reminderSaved ? '✅ Saved!' : '💾 Save Reminder Settings'}
            </button>
            <button
              onClick={handleTestSend}
              disabled={testSending}
              className="px-4 py-2 rounded-2xl text-sm font-bold font-display transition-all"
              style={{
                background: testSending
                  ? 'rgba(147,141,219,0.2)'
                  : 'linear-gradient(135deg, #B5EAD7, #8EDFC0)',
                color: testSending ? '#8b83c5' : '#1a5c3a',
                border: '1.5px solid rgba(142,223,192,0.4)',
                cursor: testSending ? 'not-allowed' : 'pointer',
              }}
            >
              {testSending ? '⏳ Sending…' : '📤 Test Send'}
            </button>
          </div>

          {/* Status info */}
          <div className="mt-3 p-3 rounded-xl text-xs font-body" style={{
            background: 'rgba(181,234,215,0.12)',
            border: '1px solid rgba(142,223,192,0.3)',
            color: '#1a5c3a',
          }}>
            ✅ <strong>Reminder system is active.</strong> Email sending is powered by SendGrid and SMS by Twilio.
            The daily cron job checks at your configured time and sends a reminder if no homework was logged today.
            Use <strong>Test Send</strong> above to verify your settings immediately.
          </div>
        </motion.div>

        {/* ── Section 4: OneDrive Backup ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5"
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-bold text-base" style={{ color: '#3d3580' }}>
              ☁️ OneDrive Backup
            </h2>
            <span className="px-3 py-1 rounded-full text-xs font-bold font-display" style={{
              background: backupConfigured?.configured ? 'rgba(181,234,215,0.3)' : 'rgba(255,200,100,0.2)',
              color: backupConfigured?.configured ? '#1a5c3a' : '#7a5000',
              border: backupConfigured?.configured ? '1px solid rgba(142,223,192,0.4)' : '1px solid rgba(255,200,100,0.4)',
            }}>
              {backupConfigured === undefined ? '⏳ Checking…' :
               backupConfigured.configured ? '🟢 Active' : '🟡 Not configured'}
            </span>
          </div>
          <p className="font-body text-xs mb-4" style={{ color: '#8b83c5' }}>
            Every night at 1:00 AM (PT), a full database backup and an Excel workbook are
            uploaded automatically to your OneDrive backup folder. You can also back up on demand below.
          </p>

          {/* Last backup status */}
          <div className="p-4 rounded-xl mb-3" style={{
            background: 'rgba(147,141,219,0.06)',
            border: '1.5px solid rgba(147,141,219,0.15)',
          }}>
            <div className="font-display font-bold text-xs mb-2" style={{ color: '#3d3580' }}>
              📋 Last Backup
            </div>
            {backupLoading ? (
              <div className="font-body text-sm" style={{ color: '#8b83c5' }}>Loading…</div>
            ) : !lastBackup ? (
              <div className="font-body text-sm" style={{ color: '#8b83c5' }}>
                🐱 No backup has run yet. Tap “Back Up Now” to create the first one.
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full font-body font-semibold" style={{
                    background: lastBackup.status === 'success' ? '#d1fae5' : lastBackup.status === 'failed' ? '#fee2e2' : '#fef9c3',
                    color: lastBackup.status === 'success' ? '#065f46' : lastBackup.status === 'failed' ? '#991b1b' : '#854d0e',
                  }}>
                    {lastBackup.status === 'success' ? '✓ Success' : lastBackup.status === 'failed' ? '✗ Failed' : '⏳ Running'}
                  </span>
                  <span className="text-xs font-body" style={{ color: '#6b63b5' }}>
                    {new Date(lastBackup.finishedAt ?? lastBackup.startedAt).toLocaleString()}
                  </span>
                  <span className="text-xs font-body px-1.5 py-0.5 rounded-full" style={{ background: '#ede9fe', color: '#6b63b5' }}>
                    {lastBackup.triggeredBy === 'manual' ? 'manual' : lastBackup.triggeredBy === 'cron' ? 'scheduled' : lastBackup.triggeredBy}
                  </span>
                </div>
                {lastBackup.status === 'success' && lastBackup.uploadedFiles.length > 0 && (
                  <ul className="text-xs font-body mt-1" style={{ color: '#8b83c5' }}>
                    {lastBackup.uploadedFiles.map((f, i) => (
                      <li key={i} className="truncate">📄 {f.split('/').pop()}</li>
                    ))}
                  </ul>
                )}
                {lastBackup.status === 'failed' && lastBackup.errorMessage && (
                  <p className="text-xs font-body mt-1" style={{ color: '#991b1b' }}>
                    {lastBackup.errorMessage}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Manual backup button */}
          <button
            onClick={handleRunBackup}
            disabled={runBackupMutation.isPending || backupConfigured?.configured === false}
            className="w-full py-3 rounded-2xl text-sm font-bold font-display transition-all"
            style={{
              background: runBackupMutation.isPending || backupConfigured?.configured === false
                ? 'rgba(147,141,219,0.15)'
                : 'linear-gradient(135deg, #A8D8F9, #6bbfe8)',
              color: runBackupMutation.isPending || backupConfigured?.configured === false ? '#8b83c5' : '#1a3a5c',
              border: '1.5px solid rgba(107,191,232,0.3)',
              cursor: runBackupMutation.isPending || backupConfigured?.configured === false ? 'not-allowed' : 'pointer',
            }}
          >
            {runBackupMutation.isPending ? '⏳ Backing up to OneDrive…' :
             backupConfigured?.configured === false ? '🔒 Backup not configured' :
             '☁️ Back Up Now'}
          </button>
          <p className="font-body text-xs mt-2" style={{ color: '#8b83c5' }}>
            Backs up a full database dump plus an Excel workbook of all homework entries and spending history.
          </p>
        </motion.div>

        {/* ── Section 5: Recent Activity ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-5"
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-bold text-base" style={{ color: '#3d3580' }}>
              📋 Recent Activity
            </h2>
            <button
              onClick={() => activityUtils.invalidate()}
              className="text-xs px-2 py-1 rounded-lg font-body"
              style={{ background: '#ede9fe', color: '#6b63b5' }}
            >
              ↻ Refresh
            </button>
          </div>
          <p className="font-body text-xs mb-4" style={{ color: '#8b83c5' }}>
            System log of scheduled OneDrive syncs and reminder sends.
          </p>
          {activityLoading ? (
            <div className="text-center py-6 font-body text-sm" style={{ color: '#8b83c5' }}>Loading…</div>
          ) : !activityData || activityData.length === 0 ? (
            <div className="text-center py-6 font-body text-sm" style={{ color: '#8b83c5' }}>
              🐱 No activity recorded yet. Logs will appear here after the first scheduled sync or reminder.
            </div>
          ) : (
            <div className="space-y-2">
              {activityData.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(237,233,254,0.5)' }}
                >
                  <span className="text-lg mt-0.5">
                    {entry.type === 'onedrive_sync' ? '☁️' : '🔔'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs font-bold font-body"
                        style={{ color: '#3d3580' }}
                      >
                        {entry.type === 'onedrive_sync' ? 'OneDrive Sync' : 'Reminder'}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-body font-semibold"
                        style={{
                          background: entry.status === 'success' ? '#d1fae5' : entry.status === 'error' ? '#fee2e2' : '#fef9c3',
                          color: entry.status === 'success' ? '#065f46' : entry.status === 'error' ? '#991b1b' : '#854d0e',
                        }}
                      >
                        {entry.status === 'success' ? '✓ Success' : entry.status === 'error' ? '✗ Error' : '— Skipped'}
                      </span>
                      <span className="text-xs font-body ml-auto" style={{ color: '#a09ac5' }}>
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs font-body mt-0.5" style={{ color: '#6b63b5' }}>{entry.message}</p>
                    {entry.detail && (
                      <p className="text-xs font-body mt-0.5" style={{ color: '#a09ac5' }}>{entry.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

      </div>
    </Layout>
  );
}
