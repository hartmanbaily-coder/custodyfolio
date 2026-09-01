import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const upsert = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn(() => ({ upsert })));

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => ({ from }),
}));

import { POST } from "@/app/api/marketing/events/route";

const secret = "01234567890123456789012345678901";

function request(
  body: Record<string, unknown>,
  origin = "https://custodyfolio.com"
) {
  return new NextRequest("https://custodyfolio.com/api/marketing/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

describe("public marketing event route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MARKETING_ANALYTICS_ENABLED", "true");
    vi.stubEnv("MARKETING_ANALYTICS_SECRET", secret);
    resetRateLimitStore();
    upsert.mockResolvedValue({ error: null });
  });

  it("rejects a request from another origin before storage", async () => {
    const response = await POST(
      request({ eventName: "marketing_page_viewed" }, "https://example.com")
    );

    expect(response.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("accepts only the two public event names", async () => {
    const response = await POST(
      request({ eventName: "customer_subscription_started" })
    );

    expect(response.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stores allowlisted attribution without arbitrary submitted fields", async () => {
    const response = await POST(
      request({
        eventName: "marketing_page_viewed",
        source: "community",
        medium: "organic",
        campaign: "launch",
        contentCode: "homepage",
        email: "person@example.com",
        caseName: "private matter",
      })
    );

    expect(response.status).toBe(202);
    const stored = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(stored).toMatchObject({
      event_name: "marketing_page_viewed",
      platform: "web",
      source: "community",
      medium: "organic",
      campaign: "launch",
      content_code: "homepage",
    });
    expect(JSON.stringify(stored)).not.toContain("person@example.com");
    expect(JSON.stringify(stored)).not.toContain("private matter");
  });

  it("returns no content and performs no storage while disabled", async () => {
    vi.stubEnv("MARKETING_ANALYTICS_ENABLED", "false");
    const response = await POST(
      request({ eventName: "marketing_page_viewed" })
    );

    expect(response.status).toBe(204);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("classifies an untagged visit as direct", async () => {
    const response = await POST(
      request({
        eventName: "marketing_page_viewed",
        contentCode: "homepage",
      })
    );

    expect(response.status).toBe(202);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      source: "direct",
      medium: "direct",
    });
  });
});
