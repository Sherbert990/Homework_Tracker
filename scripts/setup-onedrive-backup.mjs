/**
 * setup-onedrive-backup.mjs — one-time OneDrive OAuth setup (PORTABLE / generic).
 *
 * Mints a long-lived ONEDRIVE_REFRESH_TOKEN for the daily DB→OneDrive backup.
 * Run once locally, then paste the printed env vars into the deployment environment.
 *
 * Prereqs (see docs/onedrive-backup-port.md §1):
 *   - An Azure app registration with delegated scopes `offline_access Files.ReadWrite`
 *     and a redirect URI of `http://localhost`.
 *   - ONEDRIVE_CLIENT_ID and ONEDRIVE_CLIENT_SECRET set in the environment (or a .env
 *     file loaded by "dotenv/config" below).
 *
 * Usage:
 *   node scripts/setup-onedrive-backup.mjs
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const clientId = process.env.ONEDRIVE_CLIENT_ID;
const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
const redirectUri = process.env.ONEDRIVE_REDIRECT_URI || "http://localhost";
const scopes = "offline_access Files.ReadWrite";

if (!clientId || !clientSecret) {
  console.error("Set ONEDRIVE_CLIENT_ID and ONEDRIVE_CLIENT_SECRET before running this script.");
  process.exit(1);
}

const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("response_mode", "query");
authUrl.searchParams.set("scope", scopes);

console.log("\nOpen this URL, sign in, and approve access:\n");
console.log(authUrl.toString());
console.log("\nAfter the browser redirects, copy the full redirected URL or just the code value.\n");

const rl = createInterface({ input, output });
const answer = (await rl.question("Redirected URL or code: ")).trim();
rl.close();

let code = answer;
try {
  const parsed = new URL(answer);
  code = parsed.searchParams.get("code") || "";
} catch {
  // The user pasted just the authorization code.
}

if (!code) {
  console.error("No authorization code found.");
  process.exit(1);
}

const body = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  code,
  redirect_uri: redirectUri,
  grant_type: "authorization_code",
  scope: scopes,
});

const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body,
});
const data = await response.json().catch(() => ({}));

if (!response.ok || !data.refresh_token) {
  console.error("Failed to exchange code for refresh token:");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("\nAdd these values to the app environment:\n");
console.log(`ONEDRIVE_CLIENT_ID=${clientId}`);
console.log("ONEDRIVE_CLIENT_SECRET=<keep your existing secret>");
console.log(`ONEDRIVE_REFRESH_TOKEN=${data.refresh_token}`);
console.log(`ONEDRIVE_BACKUP_FOLDER=${process.env.ONEDRIVE_BACKUP_FOLDER || "AppBackups"}`);
console.log("BACKUP_CRON_SECRET=<choose a long random string>");
console.log("\nIf Microsoft returned a new refresh token during future backup runs, update ONEDRIVE_REFRESH_TOKEN.");
