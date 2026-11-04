import { describe, expect, it } from "vitest";
import { checkGoogleClaims } from "./google-claims";

const now = Date.UTC(2026, 10, 4, 12);
const expect_ = { clientId: "client-123.apps.googleusercontent.com", nonce: "n-abc", now };
const good = {
  iss: "https://accounts.google.com", aud: expect_.clientId, exp: now / 1000 + 600, nonce: "n-abc",
  sub: "1094", email: "Ada@Example.com", email_verified: true, name: "Ada Obi",
};

describe("Google ID token claims", () => {
  it("accepts a valid token and normalises the email", () => {
    expect(checkGoogleClaims(good, expect_)).toEqual({ sub: "1094", email: "ada@example.com", name: "Ada Obi" });
    expect(checkGoogleClaims({ ...good, iss: "accounts.google.com", aud: ["x", expect_.clientId] }, expect_).sub).toBe("1094");
  });

  it("rejects tokens meant for someone else, expired, replayed or from another issuer", () => {
    for (const bad of [
      { ...good, aud: "other-client" }, { ...good, exp: now / 1000 - 1 }, { ...good, nonce: "n-other" },
      { ...good, iss: "https://evil.example" }, { ...good, sub: "" }, null, "token",
    ]) expect(() => checkGoogleClaims(bad, expect_)).toThrow("failed");
  });

  it("refuses unverified email addresses (they could take over another account)", () => {
    expect(() => checkGoogleClaims({ ...good, email_verified: false }, expect_)).toThrow("unverified");
    expect(() => checkGoogleClaims({ ...good, email: "" }, expect_)).toThrow("unverified");
  });

  it("falls back to the email's name when Google sends none", () => {
    expect(checkGoogleClaims({ ...good, name: undefined }, expect_).name).toBe("ada");
  });
});
