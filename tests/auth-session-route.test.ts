import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/records/auth/session/route";

const getRecordsAuthContext = vi.hoisted(() => vi.fn());
const clearRecordsSessionCookies = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/authServer", () => ({
  attachRefreshedRecordsSession: (
    _request: NextRequest,
    response: NextResponse,
  ) => response,
  clearRecordsSessionCookies,
  getRecordsAuthContext,
  isSupabaseRecordsMode: () => true,
}));

function makeRequest() {
  return new NextRequest("https://custodyfolio.com/api/records/auth/session");
}

describe("records auth session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears stale cookies when a saved session can no longer be renewed", async () => {
    getRecordsAuthContext.mockResolvedValue({
      error: NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 }),
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(clearRecordsSessionCookies).toHaveBeenCalledOnce();
    expect(clearRecordsSessionCookies).toHaveBeenCalledWith(response);
  });

  it("preserves a pending MFA session", async () => {
    getRecordsAuthContext.mockResolvedValue({
      error: NextResponse.json(
        { error: "Multi factor verification required.", mfaRequired: true },
        { status: 403 },
      ),
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
    expect(clearRecordsSessionCookies).not.toHaveBeenCalled();
  });
});
