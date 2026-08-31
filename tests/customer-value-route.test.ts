import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const getRecordsAuthContext = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());
const single = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/authServer", () => ({
  attachRefreshedRecordsSession: (
    _request: NextRequest,
    response: Response
  ) => response,
  getRecordsAuthContext,
  isSupabaseRecordsMode: () => true,
}));

import { GET, POST } from "@/app/api/records/customer-value/route";

const userId = "00000000-0000-4000-8000-000000000321";

function postRequest(score: unknown, withCsrf = true) {
  const token = "customer-value-csrf-token";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (withCsrf) {
    headers.Origin = "https://custodyfolio.com";
    headers.Cookie = `${recordsCsrfCookieName}=${token}`;
    headers["X-L2F-CSRF"] = token;
  }
  return new NextRequest("https://custodyfolio.com/api/records/customer-value", {
    method: "POST",
    headers,
    body: JSON.stringify({ score }),
  });
}

describe("customer value response route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    maybeSingle.mockResolvedValue({ data: null, error: null });
    single.mockResolvedValue({
      data: { score: 5, responded_at: "2026-08-31T01:15:00.000Z" },
      error: null,
    });

    const readQuery = {
      select: vi.fn(() => readQuery),
      eq: vi.fn(() => readQuery),
      maybeSingle,
    };
    const writeQuery = {
      select: vi.fn(() => writeQuery),
      single,
    };
    upsert.mockReturnValue(writeQuery);
    from.mockImplementation(() => ({ ...readQuery, upsert }));
    getRecordsAuthContext.mockResolvedValue({
      userId,
      supabase: { from },
    });
  });

  it("returns the authenticated customer response without case content", async () => {
    maybeSingle.mockResolvedValue({
      data: { score: 4, responded_at: "2026-08-31T01:00:00.000Z" },
      error: null,
    });
    const response = await GET(
      new NextRequest("https://custodyfolio.com/api/records/customer-value")
    );

    if (!response) throw new Error("Customer value route returned no response.");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      response: { score: 4, respondedAt: "2026-08-31T01:00:00.000Z" },
    });
  });

  it("rejects a write before authentication when CSRF is absent", async () => {
    const response = await POST(postRequest(5, false));

    if (!response) throw new Error("Customer value route returned no response.");
    expect(response.status).toBe(403);
    expect(getRecordsAuthContext).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects scores outside the one through five range", async () => {
    const response = await POST(postRequest(6));

    if (!response) throw new Error("Customer value route returned no response.");
    expect(response.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stores only the score, prompt, customer identity, and timestamps", async () => {
    const response = await POST(postRequest(5));

    if (!response) throw new Error("Customer value route returned no response.");
    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        prompt_key: "organization_value_v1",
        score: 5,
      }),
      { onConflict: "user_id,prompt_key" }
    );
    const stored = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual([
      "prompt_key",
      "responded_at",
      "score",
      "updated_at",
      "user_id",
    ]);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      response: { score: 5 },
    });
  });
});
