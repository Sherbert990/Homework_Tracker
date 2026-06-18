# Porting Spec: Daily DB → OneDrive Backup

A portable, stack-agnostic guide for adding a **daily database backup that uploads to a
OneDrive folder**, modeled on the implementation in the Tutor-Student-Management repo.

**How to use this doc:** Drop it into the target repo and tell Claude Code:
> "Implement the backup feature described in `docs/onedrive-backup-port.md`. Adapt the
> schema/storage sections to this project. Ask me before guessing table names or the server entrypoint."

---

## 0. Architecture at a glance

The backup is **not** an OS-level cron or launchd job. It is an **in-process
`node-cron` schedule that runs inside the always-on application server**, plus a
Microsoft Graph OAuth integration for the OneDrive upload.

```
┌─ app server (always-on) ─────────────────────────────┐
│  on boot:                                             │
│    if OneDrive env configured →                       │
│      cron.schedule("0 1 * * *", runDailyBackup,       │
│                     { timezone })                     │
│                                                       │
│  POST /api/internal/run-backup  (manual trigger,      │
│      guarded by BACKUP_CRON_SECRET header)            │
└───────────────────────────────────────────────────────┘
                      │ runDailyBackup()
                      ▼
   1. refresh Graph access token (from refresh token)
   2. build JSON dump of all tables
   3. build per-tenant .xlsx workbook(s)
   4. PUT each file to OneDrive (path-based, 409-retry)
   5. record run in `backup_runs` audit table
```

**Why in-process node-cron (not OS cron / Vercel cron):**
- Works on any always-on host (Railway/Render/VPS/Docker) with zero extra infra.
- Timezone-aware via the `{ timezone }` option (handles DST automatically).
- Co-located with the DB/storage layer it already imports — no duplicated config.

> If a future target is **serverless** (no long-lived process), node-cron will not fire.
> In that case keep the `runDailyBackup()` function and the `/api/internal/run-backup`
> endpoint, and trigger it from a platform scheduler (Vercel Cron / GitHub Actions /
> cloud scheduler) that POSTs the endpoint with the secret header. This spec assumes an
> **always-on Node server**, so the cron path below is primary.

---

## 1. Prerequisites — Azure app registration (one time, manual)

OneDrive upload uses Microsoft Graph with an OAuth **refresh token** (long-lived,
delegated). You must register an app first:

1. Azure Portal → **App registrations** → New registration.
2. Supported account types: personal Microsoft accounts (and/or org, per your needs).
3. Add a **redirect URI** of type "Web" — `http://localhost` is fine for the one-time
   token mint.
4. **Certificates & secrets** → new client secret. Copy the secret value.
5. **API permissions** → Microsoft Graph → Delegated → add `Files.ReadWrite` and
   `offline_access` (the latter is what makes Graph return a refresh token).

You now have `ONEDRIVE_CLIENT_ID` and `ONEDRIVE_CLIENT_SECRET`. The refresh token is
minted by the setup script in §3.

---

## 2. Environment contract

| Var | Purpose |
|---|---|
| `ONEDRIVE_CLIENT_ID` | Azure app (client) ID |
| `ONEDRIVE_CLIENT_SECRET` | Azure client secret |
| `ONEDRIVE_REFRESH_TOKEN` | Long-lived token minted in §3; used to get short-lived access tokens |
| `ONEDRIVE_BACKUP_FOLDER` | Target folder in the drive root, e.g. `AppBackups` (default if unset) |
| `BACKUP_CRON_SECRET` | Shared secret guarding the manual `/api/internal/run-backup` endpoint |

Gate the whole feature on the first three being present. If they're missing, **log a
warning and skip** — do not crash the server. Backup is optional infrastructure.

```ts
function hasBackupConfig(): boolean {
  return Boolean(
    process.env.ONEDRIVE_CLIENT_ID &&
    process.env.ONEDRIVE_CLIENT_SECRET &&
    process.env.ONEDRIVE_REFRESH_TOKEN
  );
}
```

---

## 3. One-time OAuth setup script

A small interactive Node script that walks the operator through the auth-code → refresh-token
exchange. Run it once locally; paste the resulting `ONEDRIVE_REFRESH_TOKEN` into the
deployment environment. (Adapt from the reference repo's `scripts/setup-onedrive-backup.mjs`.)

Flow:
1. Build the authorize URL with `scope = "offline_access Files.ReadWrite"`,
   `response_type=code`, the redirect URI, and the client ID.
2. Print it; operator signs in and approves; browser redirects to
   `http://localhost?code=...`.
3. Operator pastes the full redirected URL (or just the `code`).
4. Exchange the code at
   `https://login.microsoftonline.com/common/oauth2/v2.0/token` with
   `grant_type=authorization_code` → response contains `refresh_token`.
5. Print the env vars to add.

---

## 4. Backup module (`backup.ts`)

Pure functions, no scheduling. Export `runDailyBackup(trigger)` as the entry point.

### 4a. Token refresh

```ts
export async function refreshAccessToken(): Promise<{ accessToken: string; refreshToken?: string }> {
  const body = new URLSearchParams({
    client_id: requireEnv("ONEDRIVE_CLIENT_ID"),
    client_secret: requireEnv("ONEDRIVE_CLIENT_SECRET"),
    refresh_token: requireEnv("ONEDRIVE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
    scope: "offline_access Files.ReadWrite",
  });
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.access_token !== "string") {
    throw new Error(`Token refresh failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}
```

> **Refresh-token rotation gotcha:** Graph may return a *new* refresh token on a refresh.
> If `data.refresh_token` differs from `process.env.ONEDRIVE_REFRESH_TOKEN`, **log a loud
> warning** telling the operator to update the env var. The reference repo does exactly
> this — old tokens eventually expire, so a silent rotation will break backups weeks later.

### 4b. Path-based upload with name-collision retry

Upload to a deterministic path under the drive root. On HTTP 409 `nameAlreadyExists`,
retry with a numeric suffix (`file-1.json`, `file-2.json`, …).

```ts
function buildUploadUrl(folder: string, dateFolder: string, fileName: string): string {
  const f = folder.replace(/^\/+|\/+$/g, "") || "AppBackups";
  const path = `${f}/${dateFolder}/${fileName}`
    .split("/").map(encodeURIComponent).join("/");
  return `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`;
}

export async function uploadWithNameRetry(
  buffer: Buffer, fileName: string,
  opts: { accessToken: string; folder: string; dateFolder: string; contentType?: string },
  maxRetries = 5,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const name = attempt === 0 ? fileName : withSuffix(fileName, attempt);
    const res = await fetch(buildUploadUrl(opts.folder, opts.dateFolder, name), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": opts.contentType ?? "application/octet-stream",
      },
      body: buffer as unknown as BodyInit,
    });
    if (res.ok) return name;
    const text = await res.text().catch(() => "");
    if (res.status === 409 && /nameAlreadyExists/i.test(text) && attempt < maxRetries) continue;
    throw new Error(`Upload failed: ${res.status} ${res.statusText} — ${text}`);
  }
  throw new Error(`Upload failed: no available name for ${fileName}`);
}
```

### 4c. Build the dump  ⚠️ SCHEMA-SPECIFIC — ADAPT THIS

This is the **only part that does not port verbatim.** The reference repo dumps its own
tables (users, tutors, students, lessons, payments, …). In the target project:

- Replace the table list with **this project's** tables.
- Produce two artifacts (the reference repo does both — keep whichever you need):
  1. **JSON dump** — `{ version, exportedAt, data: { <table>: rows[] } }`. Full fidelity,
     restorable.
  2. **Excel workbook** (`xlsx` package) — one sheet per table, human-readable. Optional;
     drop if you only need the JSON.
- If the target has **no multi-tenant split**, produce one file per run, not one per tenant.

```ts
export async function buildDbDump() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      // TODO: list THIS project's tables
      // users:   await db.select().from(users),
      // widgets: await db.select().from(widgets),
    },
  };
}
```

### 4d. Orchestrator + audit

```ts
export async function runDailyBackup(trigger: "cron" | "manual" = "cron") {
  const runId = await createBackupRun(trigger);          // audit row, status "running"
  try {
    const folder = process.env.ONEDRIVE_BACKUP_FOLDER?.trim() || "AppBackups";
    const dateFolder = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD
    const { accessToken, refreshToken } = await refreshAccessToken();
    if (refreshToken && refreshToken !== process.env.ONEDRIVE_REFRESH_TOKEN) {
      console.warn("[backup] Refresh token rotated — update ONEDRIVE_REFRESH_TOKEN soon.");
    }
    const env = process.env.NODE_ENV ?? "local";
    const uploaded: string[] = [];

    const dump = Buffer.from(JSON.stringify(await buildDbDump(), null, 2), "utf8");
    uploaded.push(await uploadWithNameRetry(
      dump, `db-dump-${env}-${dateFolder}.json`,
      { accessToken, folder, dateFolder, contentType: "application/json" },
    ));
    // ...repeat for any .xlsx workbooks...

    await finishBackupRun(runId, "success", uploaded);
    return { status: "success", uploaded };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishBackupRun(runId, "failed", [], message).catch(() => {});
    return { status: "failed", errorMessage: message };
  }
}
```

Add a **`backup_runs`** table (or equivalent): `id, startedAt, finishedAt, status
('running'|'success'|'failed'), triggeredBy, uploadedFiles (JSON), errorMessage`. This is
how you tell from the DB whether last night's backup actually succeeded.

Use a module-level in-flight guard so two triggers can't run concurrently:
```ts
let active: Promise<...> | null = null;
export function runDailyBackup(t) {
  if (active) throw new Error("Backup already running");
  active = runDailyBackupUnlocked(t).finally(() => { active = null; });
  return active;
}
```

---

## 5. Wire into server bootstrap

In the server entrypoint (where the app starts listening), register the cron **once at
boot**, gated on config:

```ts
import cron from "node-cron";
import { runDailyBackup } from "./backup";

if (hasBackupConfig()) {
  cron.schedule("0 1 * * *", () => {        // 01:00 daily
    runDailyBackup("cron")
      .then(r => console.log(`[backup] ${r.status}`, r.uploaded ?? r.errorMessage))
      .catch(err => console.error("[backup] Unhandled:", err));
  }, { timezone: "America/Los_Angeles" });  // ← set the operator's timezone
  console.log("[backup] Daily backup scheduled at 01:00");
} else {
  console.warn("[backup] OneDrive env not set — daily backup disabled");
}
```

Manual trigger endpoint (for testing + on-demand runs), guarded by the shared secret:

```ts
app.post("/api/internal/run-backup", async (req, res) => {
  const secret = process.env.BACKUP_CRON_SECRET;
  const ok = secret && (
    req.headers["x-backup-cron-secret"] === secret ||
    req.headers.authorization === `Bearer ${secret}`
  );
  if (!ok) return res.status(401).json({ ok: false, error: "Unauthorized" });
  if (!hasBackupConfig()) return res.status(503).json({ ok: false, error: "Not configured" });
  const result = await runDailyBackup("manual");
  res.json({ ok: result.status === "success", result });
});
```

Add `node-cron` (and `xlsx` if doing Excel) to dependencies.

---

## 6. Verification checklist

1. Run the §3 setup script → get a refresh token → set all 5 env vars locally.
2. `POST /api/internal/run-backup` with the secret header → expect `200 { ok: true }`.
3. Check the OneDrive folder → `<folder>/<YYYY-MM-DD>/db-dump-*.json` exists.
4. Query `backup_runs` → newest row is `status = "success"` with the file list.
5. Run the trigger twice in the same day → second file gets a `-1` suffix (409-retry works).
6. Unset one OneDrive env var, restart → server boots, logs "daily backup disabled", does
   not crash.

---

## 7. Adaptation summary (what changes per project)

| Section | Ports verbatim? |
|---|---|
| §1 Azure registration | Yes (do once per Microsoft account / drive) |
| §2 Env contract | Yes |
| §3 Setup script | Yes (copy as-is) |
| §4a Token refresh | Yes |
| §4b Upload + retry | Yes |
| **§4c Build dump** | **No — rewrite table list + tenant logic for this schema** |
| §4d Orchestrator + `backup_runs` | Yes (adapt table names) |
| §5 Bootstrap wiring | Yes (set timezone; match this project's server entrypoint + router style) |
