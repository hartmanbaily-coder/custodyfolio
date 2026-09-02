import { createHash, timingSafeEqual } from "node:crypto";

const reviewCodePattern = /^\d{6}$/;
const sha256Pattern = /^[a-f0-9]{64}$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AppleReviewAuthConfig = {
  userId: string;
  expiresAt: number;
  codeHash: string;
};

export type AppleReviewWorkspace = "records" | "attorney";

export function appleReviewAuthConfig(
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
  workspace: AppleReviewWorkspace = "records"
): AppleReviewAuthConfig | null {
  if (env.APPLE_REVIEW_SANDBOX_ENABLED?.trim().toLowerCase() !== "true") return null;

  const userIdKey = workspace === "attorney"
    ? "APPLE_REVIEW_ATTORNEY_USER_ID"
    : "APPLE_REVIEW_SANDBOX_USER_ID";
  const codeHashKey = workspace === "attorney"
    ? "APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256"
    : "APPLE_REVIEW_AUTH_CODE_SHA256";
  const userId = String(env[userIdKey] || "").trim();
  const expiresAt = Date.parse(String(env.APPLE_REVIEW_SANDBOX_EXPIRES_AT || ""));
  const codeHash = String(env[codeHashKey] || "").trim().toLowerCase();

  if (
    !uuidPattern.test(userId) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + 45 * 24 * 60 * 60 * 1000 ||
    !sha256Pattern.test(codeHash)
  ) {
    return null;
  }

  return { userId, expiresAt, codeHash };
}

export function appleReviewCodeMatches(
  code: string,
  config: AppleReviewAuthConfig
) {
  if (!reviewCodePattern.test(code)) return false;
  const supplied = Buffer.from(createHash("sha256").update(code).digest("hex"), "hex");
  const expected = Buffer.from(config.codeHash, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
