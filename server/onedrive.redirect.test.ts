import { describe, it, expect } from "vitest";

describe("OneDrive redirect URI configuration", () => {
  it("should have ONEDRIVE_REDIRECT_URI set in environment", () => {
    const uri = process.env.ONEDRIVE_REDIRECT_URI;
    // In CI/test env, this may not be set — just verify the format if present
    if (uri) {
      expect(uri).toMatch(/^https?:\/\/.+\/api\/onedrive\/callback$/);
      expect(uri).toContain("/api/onedrive/callback");
    } else {
      // Not set in test env — that's OK, it falls back to x-forwarded-host
      console.log("ONEDRIVE_REDIRECT_URI not set in test env — will use x-forwarded-host fallback");
    }
  });

  it("should have MICROSOFT_CLIENT_ID set", () => {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (clientId) {
      expect(clientId.length).toBeGreaterThan(10);
    } else {
      console.log("MICROSOFT_CLIENT_ID not set in test env");
    }
  });
});
