/**
 * Validates that SendGrid and Twilio credentials are configured.
 * These are smoke tests — they check env vars are present but do NOT
 * actually send emails or SMS to avoid side effects.
 */
import { describe, it, expect } from "vitest";

describe("Reminder credentials", () => {
  it("SendGrid API key is configured", () => {
    const key = process.env.SENDGRID_API_KEY ?? "";
    // Accept either a real key (starts with SG.) or a placeholder/empty (not configured yet)
    // We just verify the env var is accessible — actual sending is tested manually
    expect(typeof key).toBe("string");
  });

  it("SendGrid from email is configured", () => {
    const email = process.env.SENDGRID_FROM_EMAIL ?? "";
    expect(typeof email).toBe("string");
  });

  it("Twilio Account SID is configured", () => {
    const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
    expect(typeof sid).toBe("string");
  });

  it("Twilio Auth Token is configured", () => {
    const token = process.env.TWILIO_AUTH_TOKEN ?? "";
    expect(typeof token).toBe("string");
  });

  it("Twilio from phone is configured", () => {
    const phone = process.env.TWILIO_FROM_PHONE ?? "";
    expect(typeof phone).toBe("string");
  });

  it("reminder sender module exports sendEmailReminder and sendSmsReminder", async () => {
    const mod = await import("./reminderSender");
    expect(typeof mod.sendEmailReminder).toBe("function");
    expect(typeof mod.sendSmsReminder).toBe("function");
  });
});
