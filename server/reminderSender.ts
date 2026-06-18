/**
 * CHARLOTTE'S HW TRACKER — Reminder Sender
 * Sends email reminders via SendGrid and SMS via Twilio.
 */

import { ENV } from "./_core/env";

export async function sendEmailReminder(to: string, message: string): Promise<boolean> {
  if (!ENV.sendgridApiKey || !ENV.sendgridFromEmail) {
    console.warn("[Reminder] SendGrid not configured — skipping email");
    return false;
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.sendgridApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: ENV.sendgridFromEmail, name: "Charlotte's HW Tracker 🐱" },
        subject: "📚 Homework Reminder from Charlotte's Tracker!",
        content: [
          { type: "text/plain", value: message },
          {
            type: "text/html",
            value: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f5f3ff; border-radius: 16px;">
                <div style="text-align: center; margin-bottom: 16px;">
                  <span style="font-size: 48px;">🐱</span>
                  <h2 style="color: #3d3580; margin: 8px 0;">Charlotte's HW Tracker</h2>
                </div>
                <div style="background: white; border-radius: 12px; padding: 20px; color: #3d3580; font-size: 16px; line-height: 1.6;">
                  ${message.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color: #8b83c5;">$1</a>')}
                </div>
                <p style="text-align: center; color: #8b83c5; font-size: 12px; margin-top: 16px;">
                  Sent with 💜 from Charlotte's HW Tracker
                </p>
              </div>
            `,
          },
        ],
      }),
    });

    if (response.ok || response.status === 202) {
      console.log(`[Reminder] Email sent to ${to}`);
      return true;
    } else {
      const body = await response.text();
      console.error(`[Reminder] SendGrid error ${response.status}: ${body}`);
      return false;
    }
  } catch (err) {
    console.error("[Reminder] Email send failed:", err);
    return false;
  }
}

export async function sendSmsReminder(to: string, message: string): Promise<boolean> {
  if (!ENV.twilioAccountSid || !ENV.twilioAuthToken || !ENV.twilioFromPhone) {
    console.warn("[Reminder] Twilio not configured — skipping SMS");
    return false;
  }

  try {
    const params = new URLSearchParams({
      To: to,
      From: ENV.twilioFromPhone,
      Body: message,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ENV.twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${ENV.twilioAccountSid}:${ENV.twilioAuthToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    if (response.ok) {
      console.log(`[Reminder] SMS sent to ${to}`);
      return true;
    } else {
      const body = await response.text();
      console.error(`[Reminder] Twilio error ${response.status}: ${body}`);
      return false;
    }
  } catch (err) {
    console.error("[Reminder] SMS send failed:", err);
    return false;
  }
}
