import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/records/auth/password/reset/route";

describe("retired password recovery route", () => {
  it("fails closed because email-code sign in does not need password recovery", async () => {
    const response = await POST(new NextRequest("https://custodyfolio.com/api/records/auth/password/reset", { method: "POST" }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ code: "password_recovery_retired" });
  });
});
