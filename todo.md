
- [x] Fix points/dollar toggle to work globally via React context (not just localStorage reload)
- [x] Dashboard: emphasize activity counts (# homework completed) over $ earned/spent
- [x] History: emphasize activity counts over $ earned/spent
- [x] Add "Test Send" button in reminder settings to immediately trigger a test reminder
- [x] Remove stale "backend upgrade coming soon" warning from reminder section
- [x] Add OneDrive Excel sync feature with settings section for file URL
- [x] Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET secrets
- [x] Add onedrive_tokens table to DB schema for storing refresh tokens
- [x] Build /api/onedrive/auth and /api/onedrive/callback OAuth routes
- [x] Build /api/onedrive/sync endpoint that writes Excel via Microsoft Graph API
- [x] Add OneDrive authorization UI in Settings page (Authorize button + status)

- [x] Fix Settings task weight section: show values in points when unit=points (multiply by 2.5)
- [x] Fix LogEntry task weight badges: show correct point values (e.g. 1.5 pts not $0.6) when unit=points
- [x] Fix Test Send: permission error 'cron cookie' — use public endpoint or bypass auth for test send
- [x] Fix OneDrive redirect_uri: use published domain (char-cat-tracker.manus.space) not localhost
- [x] Set up daily 1 AM cron job to trigger OneDrive sync endpoint

- [x] Generate PWA icons (192x192, 512x512, 180x180 apple-touch-icon, maskable)
- [x] Create manifest.json with app name, icons, theme color, display mode
- [x] Write service worker with offline caching strategy
- [x] Register service worker in index.html
- [x] Add apple-touch-icon and theme-color meta tags to index.html
- [x] Add iOS splash screen meta tags
- [x] Test PWA install on iPad Safari (pending deploy — user to verify after publishing)

- [x] Fix auth gate: Settings page (and all pages) must NOT require Manus sign-in — remove any protectedProcedure / auth redirect blocking unauthenticated users

- [x] Log Today page: add left/right arrow buttons beside the date picker to navigate to previous/next day
- [x] Dashboard page: add date range filter (start date + end date) defaulting to current month, applied to all charts

- [x] Dashboard Activity chart: auto-switch granularity — daily (≤42 days), weekly (≤180 days), monthly (longer)
- [x] Fix scheduled OneDrive sync: add /api/scheduled/onedrive-sync endpoint accessible by cron cookie, update scheduled task prompt

- [x] Fix timezone: use device local time for all "today" date calculations instead of UTC — fixed getTodayString, Dashboard todayString/presets, LogEntry shiftDay, Home weekDays, exportExcel filename

- [x] Fix duplicate OneDrive sync: consolidated to single daily 1 AM task calling /api/scheduled/onedrive-sync
- [x] Fix 8 PM reminder not being received: created daily 8 PM cron task calling /api/scheduled/reminder with siteUrl

- [x] Settings page: remove Install App section
- [x] Settings page: add Recent Activity section showing OneDrive sync and reminder events with timestamps and status
- [x] Add activity_log DB table to record scheduled task events (type, status, message, timestamp)
- [x] Write activity log entries from /api/scheduled/onedrive-sync and /api/scheduled/reminder endpoints
- [x] Add tRPC procedure to fetch recent activity log entries

- [x] Migrate homework entries from localStorage to server-side MySQL DB
- [x] Add homework_entries table to drizzle schema and push migration
- [x] Add server DB helpers: getEntries, upsertEntry, deleteEntry, seedEntries
- [x] Add tRPC procedures: entry.list, entry.upsert, entry.delete, entry.seed
- [x] Add one-time seed endpoint to migrate historyData.json into DB (1,018 entries seeded)
- [x] Update LogEntry page to write to server via tRPC
- [x] Update Home page to read entries from server
- [x] Update History page to read entries from server
- [x] Update Dashboard page to read entries from server
- [x] Update Rewards page to read entries from server
- [x] Update hwData.ts (used by OneDrive sync) to read from DB instead of localStorage

- [x] Sync Now button: write activity log entry on success/failure (same as scheduled sync)
- [x] LogEntry save: add optimistic updates so UI reflects changes instantly before server confirms

- [x] Replace Manus scheduled task with server-side node-cron job (8 PM PDT: reminder + OneDrive sync)
- [x] Disable the Manus agent scheduled task after server-side cron is in place
