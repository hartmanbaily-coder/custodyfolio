import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appleReviewAuthConfig,
  appleReviewCodeMatches,
} from "@/lib/records/appleReviewAuth";

const reviewUserId = "724f81aa-b6d1-4b8a-ab59-aec5fe29e7ea";
const now = Date.parse("2026-09-02T18:00:00.000Z");
const code = "481729";
const codeHash = createHash("sha256").update(code).digest("hex");

describe("time-limited Apple review authentication", () => {
  it("accepts only a valid, enabled, scoped, unexpired configuration", () => {
    const config = appleReviewAuthConfig({
      APPLE_REVIEW_SANDBOX_ENABLED: "true",
      APPLE_REVIEW_SANDBOX_USER_ID: reviewUserId,
      APPLE_REVIEW_SANDBOX_EXPIRES_AT: "2026-09-20T18:00:00.000Z",
      APPLE_REVIEW_AUTH_CODE_SHA256: codeHash,
    }, now);
    expect(config).toEqual({
      userId: reviewUserId,
      expiresAt: Date.parse("2026-09-20T18:00:00.000Z"),
      codeHash,
    });
    expect(config && appleReviewCodeMatches(code, config)).toBe(true);
    expect(config && appleReviewCodeMatches("481728", config)).toBe(false);
  });

  it("fails closed when disabled, expired, overlong, or missing its code hash", () => {
    const base = {
      APPLE_REVIEW_SANDBOX_ENABLED: "true",
      APPLE_REVIEW_SANDBOX_USER_ID: reviewUserId,
      APPLE_REVIEW_SANDBOX_EXPIRES_AT: "2026-09-20T18:00:00.000Z",
      APPLE_REVIEW_AUTH_CODE_SHA256: codeHash,
    };
    expect(appleReviewAuthConfig({ ...base, APPLE_REVIEW_SANDBOX_ENABLED: "false" }, now)).toBeNull();
    expect(appleReviewAuthConfig({ ...base, APPLE_REVIEW_SANDBOX_EXPIRES_AT: "2026-09-01T18:00:00.000Z" }, now)).toBeNull();
    expect(appleReviewAuthConfig({ ...base, APPLE_REVIEW_SANDBOX_EXPIRES_AT: "2026-11-01T18:00:00.000Z" }, now)).toBeNull();
    expect(appleReviewAuthConfig({ ...base, APPLE_REVIEW_AUTH_CODE_SHA256: "" }, now)).toBeNull();
  });

  it("rejects non-six-digit review codes before comparing hashes", () => {
    const config = {
      userId: reviewUserId,
      expiresAt: now + 60_000,
      codeHash,
    };
    expect(appleReviewCodeMatches("48172", config)).toBe(false);
    expect(appleReviewCodeMatches("48172a", config)).toBe(false);
  });

  it("uses a separately scoped identity and code for the attorney workspace", () => {
    const attorneyUserId = "4f99752a-ea56-4e56-b067-10957d2c9e22";
    const attorneyCode = "735902";
    const attorneyHash = createHash("sha256").update(attorneyCode).digest("hex");
    const config = appleReviewAuthConfig({
      APPLE_REVIEW_SANDBOX_ENABLED: "true",
      APPLE_REVIEW_SANDBOX_USER_ID: reviewUserId,
      APPLE_REVIEW_AUTH_CODE_SHA256: codeHash,
      APPLE_REVIEW_ATTORNEY_USER_ID: attorneyUserId,
      APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256: attorneyHash,
      APPLE_REVIEW_SANDBOX_EXPIRES_AT: "2026-09-20T18:00:00.000Z",
    }, now, "attorney");
    expect(config?.userId).toBe(attorneyUserId);
    expect(config && appleReviewCodeMatches(attorneyCode, config)).toBe(true);
    expect(config && appleReviewCodeMatches(code, config)).toBe(false);
  });
});
