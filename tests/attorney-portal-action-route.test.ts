import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const getAttorneyGuestAuthContext = vi.hoisted(() => vi.fn());
const resolveActiveAttorneyGrant = vi.hoisted(() => vi.fn());
const recordAttorneyAccessEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/attorneyServer", () => ({ getAttorneyGuestAuthContext }));
vi.mock("@/lib/records/attorneyAccess", () => ({
  recordAttorneyAccessEvent,
  resolveActiveAttorneyGrant,
}));
vi.mock("@/lib/records/authServer", () => ({
  attachRefreshedRecordsSession: (_request: NextRequest, response: Response) => response,
}));

import { POST } from "@/app/api/records/attorney/portal/action/route";

function request(body: Record<string, unknown>) {
  const csrf = "attorney-portal-action-csrf";
  return new NextRequest("https://custodyfolio.com/api/records/attorney/portal/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      Cookie: `${recordsCsrfCookieName}=${csrf}`,
      "X-L2F-CSRF": csrf,
    },
    body: JSON.stringify(body),
  });
}

describe("attorney portal export actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    getAttorneyGuestAuthContext.mockResolvedValue({
      userId: "attorney-1",
      supabase: {},
    });
    resolveActiveAttorneyGrant.mockResolvedValue({
      grant: {
        id: "grant-1",
        owner_user_id: "owner-1",
        attorney_user_id: "attorney-1",
        case_id: "case-1",
      },
    });
    recordAttorneyAccessEvent.mockResolvedValue({ ok: true });
  });

  it("records a section PDF or CSV as a report download without record contents", async () => {
    const response = await POST(request({
      accessHandle: "opaque-access",
      action: "report_downloaded",
      sectionId: "evidence",
    }));

    expect(response.status).toBe(200);
    expect(recordAttorneyAccessEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "report_downloaded",
      metadata: { sectionId: "evidence" },
    }));
  });

  it("rejects unrecognized section export identifiers", async () => {
    const response = await POST(request({
      accessHandle: "opaque-access",
      action: "report_downloaded",
      sectionId: "account_settings",
    }));

    expect(response.status).toBe(400);
    expect(recordAttorneyAccessEvent).not.toHaveBeenCalled();
  });

  it("allows the complete profile report and records only its type", async () => {
    const response = await POST(request({
      accessHandle: "opaque-access",
      action: "report_downloaded",
      reportType: "full_profile_export",
    }));

    expect(response.status).toBe(200);
    expect(recordAttorneyAccessEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "report_downloaded",
      metadata: { reportType: "full_profile_export" },
    }));
  });
});
