import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/records/auth/signup/route";

describe("retired password signup route", () => {
  it("fails closed and directs account creation to one-time email codes", async () => {
    const response = await POST(new NextRequest("https://custodyfolio.com/api/records/auth/signup", { method: "POST" }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ code: "password_signup_retired" });
  });
});
