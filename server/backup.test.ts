/**
 * server/backup.test.ts
 * Pure-function tests for the OneDrive backup module — no live credentials needed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

// Mock the data layer so buildBackupBuffer can be tested without a live DB.
// Plain functions (not vi.fn) so afterEach's restoreAllMocks can't reset them.
vi.mock("./hwData", () => ({
  getAllEntries: async () => [
    {
      date: "2026-06-10",
      tasks: {
        chinese: 0.6, vocab: 0, duolingo: 0.2, extra_class: 0, chinese_practice: 0,
        cello: 0, reading: 0, cello_notes: 0.4, math: 0, new_year_money: 0,
        stretch: 0, monthly_allowance: 0,
      },
      daily_total: 3, spent: 0, balance: 160, notes: null,
    },
  ],
  getSpendingHistory: async () => [{ date: "2026-06-01", amount: 50, note: "toy" }],
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("Backup module", () => {
  it("exports the expected functions", async () => {
    const mod = await import("./backup");
    expect(typeof mod.runDailyBackup).toBe("function");
    expect(typeof mod.buildBackupBuffer).toBe("function");
    expect(typeof mod.buildDbDump).toBe("function");
    expect(typeof mod.uploadToOneDrive).toBe("function");
    expect(typeof mod.hasBackupConfig).toBe("function");
  });

  it("hasBackupConfig is true only when all three OneDrive vars are set", async () => {
    const mod = await import("./backup");
    delete process.env.ONEDRIVE_CLIENT_ID;
    delete process.env.ONEDRIVE_CLIENT_SECRET;
    delete process.env.ONEDRIVE_REFRESH_TOKEN;
    expect(mod.hasBackupConfig()).toBe(false);
    process.env.ONEDRIVE_CLIENT_ID = "id";
    process.env.ONEDRIVE_CLIENT_SECRET = "secret";
    expect(mod.hasBackupConfig()).toBe(false);
    process.env.ONEDRIVE_REFRESH_TOKEN = "token";
    expect(mod.hasBackupConfig()).toBe(true);
  });

  it("builds a Microsoft Graph upload URL with encoded path parts", async () => {
    const mod = await import("./backup");
    expect(mod.buildOneDriveUploadUrl("HW Backups", "2026-05-19", "db dump.json")).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root:/HW%20Backups/2026-05-19/db%20dump.json:/content"
    );
  });

  it("normalizes Windows-style backslash folders into nested Graph folders", async () => {
    const mod = await import("./backup");
    expect(mod.buildOneDriveUploadUrl("有用资料\\Backup\\homework-tracker", "2026-05-19", "x.json")).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root:/%E6%9C%89%E7%94%A8%E8%B5%84%E6%96%99/Backup/homework-tracker/2026-05-19/x.json:/content"
    );
  });

  it("appends a numeric suffix before the file extension", async () => {
    const mod = await import("./backup");
    expect(mod.withFileNameSuffix("db-dump-2026-05-20.json", 1)).toBe("db-dump-2026-05-20-1.json");
  });

  it("refreshes the access token with the configured OAuth credentials", async () => {
    process.env.ONEDRIVE_CLIENT_ID = "client-id";
    process.env.ONEDRIVE_CLIENT_SECRET = "client-secret";
    process.env.ONEDRIVE_REFRESH_TOKEN = "refresh-token";
    const mod = await import("./backup");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      access_token: "access-token",
      refresh_token: "rotated-token",
    }), { status: 200 }));

    const result = await mod.refreshOneDriveAccessToken(fetchMock as typeof fetch);

    expect(result).toEqual({ accessToken: "access-token", refreshToken: "rotated-token" });
    const [, init] = fetchMock.mock.calls[0];
    expect(String((init as RequestInit).body)).toContain("grant_type=refresh_token");
    expect(String((init as RequestInit).body)).toContain("client_id=client-id");
  });

  it("formats backup run rows with parsed uploaded files", async () => {
    const mod = await import("./backup");
    expect(mod.formatBackupRunSummary({
      id: 7,
      startedAt: 1779129600000,
      finishedAt: 1779129660000,
      status: "success",
      triggeredBy: "manual",
      uploadedFiles: JSON.stringify(["HW/2026-05-19/db-dump-2026-05-19.json"]),
      errorMessage: null,
    })).toMatchObject({
      id: 7,
      status: "success",
      triggeredBy: "manual",
      uploadedFiles: ["HW/2026-05-19/db-dump-2026-05-19.json"],
      errorMessage: null,
    });
  });

  it("retries uploads with a numeric suffix on a nameAlreadyExists conflict", async () => {
    const mod = await import("./backup");
    const conflict = { error: { code: "nameAlreadyExists", message: "Name already exists" } };
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response(JSON.stringify(conflict), { status: 409, statusText: "Conflict" });
      }
      return new Response(null, { status: 201 });
    });

    const uploadedName = await mod.uploadToOneDriveWithNameRetry(
      Buffer.from("backup"),
      "db-dump-local-2026-05-20.json",
      { accessToken: "token", folder: "HW", dateFolder: "2026-05-20", contentType: "application/json" },
      fetchMock as typeof fetch
    );

    expect(uploadedName).toBe("db-dump-local-2026-05-20-1.json");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("db-dump-local-2026-05-20.json");
    expect(fetchMock.mock.calls[1][0]).toContain("db-dump-local-2026-05-20-1.json");
  });

  it("normalizeBackupFolder handles backslashes, slashes, and empty input", async () => {
    const mod = await import("./backup");
    expect(mod.normalizeBackupFolder("a\\b\\c")).toBe("a/b/c");
    expect(mod.normalizeBackupFolder("/Foo/Bar/")).toBe("Foo/Bar");
    expect(mod.normalizeBackupFolder("\\Foo\\Bar\\")).toBe("Foo/Bar");
    expect(mod.normalizeBackupFolder("")).toBe("HomeworkTrackerBackups");
  });

  it("throws a descriptive error when the token refresh fails", async () => {
    process.env.ONEDRIVE_CLIENT_ID = "id";
    process.env.ONEDRIVE_CLIENT_SECRET = "secret";
    process.env.ONEDRIVE_REFRESH_TOKEN = "token";
    const mod = await import("./backup");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, statusText: "Bad Request" }));
    await expect(mod.refreshOneDriveAccessToken(fetchMock as typeof fetch)).rejects.toThrow(/token refresh failed/i);
  });

  it("uploadToOneDrive throws on a non-OK response", async () => {
    const mod = await import("./backup");
    const fetchMock = vi.fn(async () => new Response("forbidden", { status: 403, statusText: "Forbidden" }));
    await expect(
      mod.uploadToOneDrive(Buffer.from("x"), "f.json", { accessToken: "t", folder: "HW", dateFolder: "2026-06-18" }, fetchMock as typeof fetch)
    ).rejects.toThrow(/403/);
  });

  it("builds an Excel workbook with HW Data + Spending sheets and correct task-key mapping", async () => {
    const mod = await import("./backup");
    const wb = XLSX.read(await mod.buildBackupBuffer(), { type: "buffer" });
    expect(wb.SheetNames).toEqual(["HW Data", "Spending"]);

    const hw = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["HW Data"], { header: 1 });
    const header = hw[0] as string[];
    expect(header[0]).toBe("Date");
    expect(header).toContain("中文");
    expect(header).toContain("Cello Notes Reading");
    expect(header.slice(-3)).toEqual(["Daily Total (pts)", "Spent (pts)", "Balance (pts)"]);

    const row = hw[1] as (string | number)[];
    expect(row[0]).toBe("2026-06-10");
    // snake_case keys land in the right columns
    expect(row[header.indexOf("中文")]).toBe(0.6);
    expect(row[header.indexOf("Cello Notes Reading")]).toBe(0.4);
    expect(row[header.indexOf("Balance (pts)")]).toBe(160);

    const spend = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Spending"], { header: 1 });
    expect(spend[0]).toEqual(["Date", "Amount (pts)", "Amount ($)", "Note"]);
    expect(spend[1]).toEqual(["2026-06-01", 50, 20, "toy"]); // 50 pts / 2.5 = $20
  });
});
