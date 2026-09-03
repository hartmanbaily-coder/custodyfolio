import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/records/auth/password/update/route";

describe("retired password update route", () => {
  it("does not accept password changes after the passwordless migration", async () => {
    const response = await POST(new NextRequest("https://custodyfolio.com/api/records/auth/password/update", { method: "POST" }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ code: "password_update_retired" });
  });
});
