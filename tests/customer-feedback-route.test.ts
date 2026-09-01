import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const getRecordsAuthContext = vi.hoisted(() => vi.fn());
const recordGrowthEvent = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/authServer", () => ({
  attachRefreshedRecordsSession: (
    _request: NextRequest,
    response: Response
  ) => response,
  getRecordsAuthContext,
  isSupabaseRecordsMode: () => true,
}));

vi.mock("@/lib/marketing/growthEvents", () => ({ recordGrowthEvent }));

import { GET, POST } from "@/app/api/records/customer-feedback/route";

const userId = "00000000-0000-4000-8000-000000000321";

function requiredResponse(response: Response | undefined) {
  if (!response) throw new Error("Customer feedback route returned no response.");
  return response;
}

function queryResult(result: Record<string, unknown>) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (
      resolve: (value: Record<string, unknown>) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function postRequest(choice: unknown, withCsrf = true) {
  const token = "customer-feedback-csrf-token";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (withCsrf) {
    headers.Origin = "https://custodyfolio.com";
    headers.Cookie = `${recordsCsrfCookieName}=${token}`;
    headers["X-L2F-CSRF"] = token;
  }
  return new NextRequest("https://custodyfolio.com/api/records/customer-feedback", {
    method: "POST",
    headers,
    body: JSON.stringify({ choice }),
  });
}

describe("customer feedback consent route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CUSTOMER_FEEDBACK_INVITE_ENABLED", "true");
    resetRateLimitStore();
    getRecordsAuthContext.mockResolvedValue({
      userId,
      supabase: { from, rpc },
    });
    recordGrowthEvent.mockResolvedValue({ recorded: true, reason: null });
  });

  it("offers the invitation only while the cohort has room and no choice exists", async () => {
    from
      .mockReturnValueOnce(queryResult({ data: null, error: null }))
      .mockReturnValueOnce(queryResult({ count: 9, error: null }));

    const response = requiredResponse(
      await GET(
        new NextRequest("https://custodyfolio.com/api/records/customer-feedback")
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      eligible: true,
      choice: null,
      cohortFull: false,
    });
  });

  it("stays unavailable until feedback invitations are explicitly enabled", async () => {
    vi.stubEnv("CUSTOMER_FEEDBACK_INVITE_ENABLED", "false");

    const response = requiredResponse(
      await GET(
        new NextRequest("https://custodyfolio.com/api/records/customer-feedback")
      )
    );

    expect(response.status).toBe(501);
    expect(getRecordsAuthContext).not.toHaveBeenCalled();
  });

  it("does not offer the invitation after ten people opt in", async () => {
    from
      .mockReturnValueOnce(queryResult({ data: null, error: null }))
      .mockReturnValueOnce(queryResult({ count: 10, error: null }));

    const response = requiredResponse(
      await GET(
        new NextRequest("https://custodyfolio.com/api/records/customer-feedback")
      )
    );

    await expect(response.json()).resolves.toMatchObject({
      eligible: false,
      cohortFull: true,
    });
  });

  it("rejects a choice before authentication when CSRF is absent", async () => {
    const response = requiredResponse(await POST(postRequest("opted_in", false)));

    expect(response.status).toBe(403);
    expect(getRecordsAuthContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records explicit permission and an aggregate opt in event without sending a message", async () => {
    rpc.mockResolvedValue({
      data: [{ choice: "opted_in", cohort_full: false, opted_in_count: 1 }],
      error: null,
    });

    const response = requiredResponse(await POST(postRequest("opted_in")));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("custody_folio_record_feedback_choice", {
      p_user_id: userId,
      p_choice: "opted_in",
      p_now: expect.any(String),
    });
    expect(recordGrowthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "customer_feedback_opted_in",
        userId,
      })
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      choice: "opted_in",
      cohortFull: false,
    });
  });

  it("saves a decline without recording an opt in event", async () => {
    rpc.mockResolvedValue({
      data: [{ choice: "declined", cohort_full: false, opted_in_count: 0 }],
      error: null,
    });

    const response = requiredResponse(await POST(postRequest("declined")));

    expect(response.status).toBe(200);
    expect(recordGrowthEvent).not.toHaveBeenCalled();
  });
});
