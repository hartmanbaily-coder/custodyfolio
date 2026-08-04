import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAttorneyInvitationToken } from "@/lib/records/attorneyCrypto";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const invitationMaybeSingle = vi.hoisted(() => vi.fn());
const checkAttorneyGuestEntitlement = vi.hoisted(() => vi.fn());
const setAttorneyAcceptanceCookie = vi.hoisted(() => vi.fn((response) => response));

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      gt: vi.fn(() => query),
      maybeSingle: invitationMaybeSingle,
    };
    return { from: vi.fn(() => query) };
  },
}));
vi.mock("@/lib/records/authServer", () => ({ isSupabaseRecordsMode: () => true }));
vi.mock("@/lib/records/attorneyEntitlement", () => ({ checkAttorneyGuestEntitlement }));
vi.mock("@/lib/records/attorneyServer", () => ({
  attorneyAcceptanceCookieName: "l2f-attorney-invite",
  setAttorneyAcceptanceCookie,
}));

import { POST } from "@/app/api/records/attorney/accept/prepare/route";

function request(input: { bodyToken?: string; cookieToken?: string } = {}) {
  const csrf = "attorney-prepare-csrf";
  const cookie = [
    `${recordsCsrfCookieName}=${csrf}`,
    input.cookieToken ? `l2f-attorney-invite=${input.cookieToken}` : "",
  ].filter(Boolean).join("; ");
  return new NextRequest("https://custodyfolio.com/api/records/attorney/accept/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      Cookie: cookie,
      "X-L2F-CSRF": csrf,
    },
    body: JSON.stringify(input.bodyToken ? { token: input.bodyToken } : {}),
  });
}

describe("single-link attorney invitation preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    checkAttorneyGuestEntitlement.mockReturnValue({ allowed: true });
    invitationMaybeSingle.mockResolvedValue({ data: { id: "invite-1" }, error: null });
  });

  it("validates the original private link and binds it to an HttpOnly cookie", async () => {
    const token = createAttorneyInvitationToken();
    const response = await POST(request({ bodyToken: token }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining("will not send another invitation email"),
    });
    expect(setAttorneyAcceptanceCookie).toHaveBeenCalledWith(response, token);
  });

  it("continues from the bound cookie without sending or generating another link", async () => {
    const token = createAttorneyInvitationToken();
    const response = await POST(request({ cookieToken: token }));

    expect(response.status).toBe(200);
    expect(setAttorneyAcceptanceCookie).toHaveBeenCalledWith(response, token);
  });

  it("rejects an invalid, expired, or used invitation", async () => {
    invitationMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(request({ bodyToken: createAttorneyInvitationToken() }));

    expect(response.status).toBe(404);
    expect(setAttorneyAcceptanceCookie).not.toHaveBeenCalled();
  });
});
