/**
 * Tests for the entry tRPC procedures.
 * These tests use the in-memory hwData functions mocked to avoid real DB calls.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// Mock the hwData module so tests don't need a real DB
vi.mock("./hwData", () => ({
  getAllEntries: vi.fn().mockResolvedValue([
    {
      date: "2024-01-01",
      tasks: { chinese: 1, vocab: 0, duolingo: 1, extra_class: 0, chinese_practice: 0, cello: 0, reading: 0, cello_notes: 0, math: 0, new_year_money: 0, stretch: 0, monthly_allowance: 0 },
      daily_total: 50,
      spent: 0,
      balance: 864,
      notes: null,
    },
  ]),
  getEntryByDate: vi.fn().mockImplementation(async (date: string) => {
    if (date === "2024-01-01") {
      return {
        date: "2024-01-01",
        tasks: { chinese: 1, vocab: 0, duolingo: 1, extra_class: 0, chinese_practice: 0, cello: 0, reading: 0, cello_notes: 0, math: 0, new_year_money: 0, stretch: 0, monthly_allowance: 0 },
        daily_total: 50,
        spent: 0,
        balance: 864,
        notes: null,
      };
    }
    return null;
  }),
  upsertEntry: vi.fn().mockResolvedValue(undefined),
  deleteEntry: vi.fn().mockResolvedValue(undefined),
  seedEntries: vi.fn().mockResolvedValue(5),
}));

// Mock the db module
vi.mock("./db", () => ({
  getReminderSettings: vi.fn().mockResolvedValue(null),
  upsertReminderSettings: vi.fn().mockResolvedValue(undefined),
  getRecentActivity: vi.fn().mockResolvedValue([]),
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { appRouter } from "./routers";

function createPublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("entry.list", () => {
  it("returns all entries from the DB", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.entry.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("date");
    expect(result[0]).toHaveProperty("daily_total");
    expect(result[0]).toHaveProperty("balance");
  });
});

describe("entry.get", () => {
  it("returns an entry for a known date", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.entry.get({ date: "2024-01-01" });
    expect(result).not.toBeNull();
    expect(result?.date).toBe("2024-01-01");
    expect(result?.daily_total).toBe(50);
  });

  it("returns null for an unknown date", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.entry.get({ date: "2099-12-31" });
    expect(result).toBeNull();
  });

  it("rejects invalid date format", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(caller.entry.get({ date: "not-a-date" })).rejects.toThrow();
  });
});

describe("entry.upsert", () => {
  it("accepts a valid entry and returns success", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.entry.upsert({
      date: "2024-06-15",
      tasks: {
        chinese: 1, vocab: 1, duolingo: 0, extra_class: 0,
        chinese_practice: 0, cello: 0, reading: 0, cello_notes: 0,
        math: 0, new_year_money: 0, stretch: 0, monthly_allowance: 0,
      },
      daily_total: 80,
      spent: 0,
      notes: "Test entry",
    });
    expect(result).toEqual({ success: true });
  });

  it("rejects invalid date format", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(caller.entry.upsert({
      date: "2024/06/15",
      tasks: { chinese: 0, vocab: 0, duolingo: 0, extra_class: 0, chinese_practice: 0, cello: 0, reading: 0, cello_notes: 0, math: 0, new_year_money: 0, stretch: 0, monthly_allowance: 0 },
      daily_total: 0,
      spent: 0,
      notes: null,
    })).rejects.toThrow();
  });
});

describe("entry.delete", () => {
  it("accepts a valid date and returns success", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.entry.delete({ date: "2024-01-01" });
    expect(result).toEqual({ success: true });
  });
});

describe("entry.seed", () => {
  it("accepts a batch of entries and returns inserted count", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.entry.seed({
      entries: [
        {
          date: "2024-01-01",
          tasks: { chinese: 1, vocab: 0, duolingo: 0, extra_class: 0, chinese_practice: 0, cello: 0, reading: 0, cello_notes: 0, math: 0, new_year_money: 0, stretch: 0, monthly_allowance: 0 },
          daily_total: 50,
          spent: 0,
          balance: 864,
          notes: null,
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(typeof result.inserted).toBe("number");
  });
});
