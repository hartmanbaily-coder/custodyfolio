import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/records/auth/login/route";

describe("retired password login route", () => {
  it("fails closed and directs callers to one-time email codes", async () => {
    const response = await POST(new NextRequest("https://custodyfolio.com/api/records/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.test", password: "not-used" }),
    }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "Password sign in has been retired. Request a one-time email code instead.",
      code: "password_sign_in_retired",
    });
  });
});
