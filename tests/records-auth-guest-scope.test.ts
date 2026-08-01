import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  clearRecordsSessionCookies,
  getRecordsAuthContext,
  recordsSessionScopeCookieName,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";

describe("attorney guest session boundary", () => {
  it("blocks an attorney guest session from the parent records workspace", async () => {
    const request = new NextRequest("https://custodyfolio.com/api/records/dataset", {
      headers: { Cookie: `${recordsSessionScopeCookieName}=attorney_guest` },
    });

    const context = await getRecordsAuthContext(request);

    expect("error" in context).toBe(true);
    if ("error" in context) {
      const errorResponse = context.error;
      expect(errorResponse).toBeDefined();
      if (!errorResponse) throw new Error("Expected an attorney guest scope error response.");
      expect(errorResponse.status).toBe(403);
      await expect(errorResponse.json()).resolves.toMatchObject({
        error: expect.stringContaining("limited to the read only attorney portal"),
      });
    }
  });

  it("marks and clears the scoped attorney guest session cookie", () => {
    const response = NextResponse.json({ ok: true });
    setRecordsSessionCookies(
      response,
      {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
      },
      "guest-case",
      "attorney_guest"
    );
    expect(response.cookies.get(recordsSessionScopeCookieName)?.value).toBe("attorney_guest");

    clearRecordsSessionCookies(response);
    expect(response.cookies.get(recordsSessionScopeCookieName)?.value).toBe("");
  });
});
