import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getReminderSettings, upsertReminderSettings, getRecentActivity } from "./db";
import { getAllEntries, getEntryByDate, upsertEntry, deleteEntry, seedEntries } from "./hwData";
import { z } from "zod";

const ReminderSettingsInput = z.object({
  enabled: z.boolean(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/),
  method: z.enum(["email", "sms", "both", "none"]),
  email: z.string().default(""),
  phone: z.string().default(""),
  message: z.string().default(""),
});

const TaskValuesInput = z.object({
  chinese: z.number().default(0),
  vocab: z.number().default(0),
  duolingo: z.number().default(0),
  extra_class: z.number().default(0),
  chinese_practice: z.number().default(0),
  cello: z.number().default(0),
  reading: z.number().default(0),
  cello_notes: z.number().default(0),
  math: z.number().default(0),
  new_year_money: z.number().default(0),
  stretch: z.number().default(0),
  monthly_allowance: z.number().default(0),
});

const HWEntryInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: TaskValuesInput,
  daily_total: z.number(),
  spent: z.number().default(0),
  notes: z.string().nullable().default(null),
});

// Shape of a seed entry (balance is recalculated server-side)
const SeedEntryInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: z.record(z.string(), z.number()),
  daily_total: z.number(),
  spent: z.number().default(0),
  balance: z.number().default(0),
  notes: z.string().nullable().optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  reminder: router({
    /** Get reminder settings — stored under a fixed owner key, no login required */
    get: publicProcedure.query(async () => {
      const settings = await getReminderSettings('charlotte-owner');
      return settings;
    }),

    /** Save reminder settings — stored under a fixed owner key, no login required */
    save: publicProcedure
      .input(ReminderSettingsInput)
      .mutation(async ({ input }) => {
        await upsertReminderSettings({
          openId: 'charlotte-owner',
          enabled: input.enabled,
          reminderTime: input.reminderTime,
          method: input.method,
          email: input.email,
          phone: input.phone,
          message: input.message,
        });
        return { success: true };
      }),
  }),

  activity: router({
    /** Get recent system activity log entries (OneDrive sync, reminders) */
    recent: publicProcedure.query(async () => {
      return getRecentActivity(50);
    }),
  }),

  entry: router({
    /** Get all homework entries, sorted by date ascending */
    list: publicProcedure.query(async () => {
      return getAllEntries();
    }),

    /** Get a single entry by date */
    get: publicProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(async ({ input }) => {
        return getEntryByDate(input.date);
      }),

    /** Create or update a homework entry for a given date */
    upsert: publicProcedure
      .input(HWEntryInput)
      .mutation(async ({ input }) => {
        await upsertEntry({
          date: input.date,
          tasks: input.tasks as Record<string, number>,
          daily_total: input.daily_total,
          spent: input.spent,
          notes: input.notes,
        });
        return { success: true };
      }),

    /** Delete a homework entry by date */
    delete: publicProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(async ({ input }) => {
        await deleteEntry(input.date);
        return { success: true };
      }),

    /**
     * One-time seed endpoint: accepts the full historyData entries array and
     * inserts any that don't already exist in the DB.
     */
    seed: publicProcedure
      .input(z.object({ entries: z.array(SeedEntryInput) }))
      .mutation(async ({ input }) => {
        const count = await seedEntries(
          input.entries.map(e => ({
            date: e.date,
            tasks: e.tasks,
            daily_total: e.daily_total,
            spent: e.spent,
            balance: e.balance,
            notes: e.notes ?? null,
          }))
        );
        return { success: true, inserted: count };
      }),
  }),
});

export type AppRouter = typeof appRouter;
