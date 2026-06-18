import { describe, expect, it } from "vitest";
import "dotenv/config";

describe("OneDrive credentials", () => {
  it("MICROSOFT_CLIENT_ID is set and non-empty", () => {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    expect(clientId, "MICROSOFT_CLIENT_ID must be set").toBeTruthy();
    expect(clientId!.length, "MICROSOFT_CLIENT_ID must be non-empty").toBeGreaterThan(0);
  });

  it("MICROSOFT_CLIENT_SECRET is set and non-empty", () => {
    const secret = process.env.MICROSOFT_CLIENT_SECRET;
    expect(secret, "MICROSOFT_CLIENT_SECRET must be set").toBeTruthy();
    expect(secret!.length, "MICROSOFT_CLIENT_SECRET must be non-empty").toBeGreaterThan(0);
  });

  it("credentials look like valid Azure values", () => {
    const clientId = process.env.MICROSOFT_CLIENT_ID ?? "";
    const secret = process.env.MICROSOFT_CLIENT_SECRET ?? "";
    // Azure client IDs are GUIDs: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(guidPattern.test(clientId), `Client ID should be a GUID, got: ${clientId}`).toBe(true);
    // Client secrets are at least 20 chars
    expect(secret.length, "Client secret should be at least 20 characters").toBeGreaterThanOrEqual(20);
  });
});
