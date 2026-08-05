import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  checkPwnedPassword,
  isPwnedPasswordCheckEnabled,
} from "@/lib/security/pwnedPasswords";

function hashParts(password: string) {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: hash.slice(0, 5), suffix: hash.slice(5) };
}

describe("pwned password protection", () => {
  it("sends only the five-character hash prefix and rejects an exact compromised suffix", async () => {
    const password = "LongEnoughCompromisedPassword!42";
    const { prefix, suffix } = hashParts(password);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`https://api.pwnedpasswords.com/range/${prefix}`);
      expect(String(url)).not.toContain(password);
      expect(init?.headers).toMatchObject({
        Accept: "text/plain",
        "Add-Padding": "true",
        "User-Agent": "CustodyFolio-Records/1.0",
      });
      return new Response(`00000000000000000000000000000000000:0\r\n${suffix}:27\r\n`);
    });

    await expect(checkPwnedPassword(password, { fetchImpl })).resolves.toEqual({
      status: "compromised",
      occurrenceCount: 27,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("accepts a password whose suffix is absent and ignores padded zero-count entries", async () => {
    const password = "Unique-Password-For-This-Test!93";
    const fetchImpl = vi.fn(async () =>
      new Response("00000000000000000000000000000000000:0\r\nABCDEFABCDEFABCDEFABCDEFABCDEFABCDE:2\r\n")
    );

    await expect(checkPwnedPassword(password, { fetchImpl })).resolves.toEqual({
      status: "safe",
    });
  });

  it("fails closed when the password safety service cannot be verified", async () => {
    const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));

    await expect(checkPwnedPassword("Another-Long-Password!73", { fetchImpl })).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("requires an explicit production flag", () => {
    expect(isPwnedPasswordCheckEnabled({ PWNED_PASSWORD_CHECK_ENABLED: "true" })).toBe(true);
    expect(isPwnedPasswordCheckEnabled({ PWNED_PASSWORD_CHECK_ENABLED: "false" })).toBe(false);
    expect(isPwnedPasswordCheckEnabled({})).toBe(false);
  });
});
