import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sealAttorneyHandle } from "@/lib/records/attorneyCrypto";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const getAttorneyGuestAuthContext = vi.hoisted(() => vi.fn());
const resolveActiveAttorneyGrant = vi.hoisted(() => vi.fn());
const recordAttorneyAccessEvent = vi.hoisted(() => vi.fn());
const getAuthoritativeEvidenceItem = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/attorneyServer", () => ({ getAttorneyGuestAuthContext }));
vi.mock("@/lib/records/attorneyAccess", () => ({
  recordAttorneyAccessEvent,
  resolveActiveAttorneyGrant,
}));
vi.mock("@/lib/records/evidenceStorage", () => ({
  assertEvidenceItemAccess: (evidence: { userId: string; caseId: string }, owner: { userId: string; caseId: string }) => ({
    ok: evidence.userId === owner.userId && evidence.caseId === owner.caseId,
  }),
  getAuthoritativeEvidenceItem,
  getEvidenceBucket: () => "records-evidence",
}));

import { POST } from "@/app/api/records/attorney/evidence/download/route";

const secret = "evidence-route-secret-that-is-longer-than-thirty-two-characters";
const grant = {
  id: "grant-1",
  owner_user_id: "owner-1",
  attorney_user_id: "attorney-1",
  invitation_id: "invite-1",
  case_key: "default",
  case_id: "case-1",
  permission_scope: "read_only" as const,
  granted_at: "2026-07-18T00:00:00.000Z",
  expires_at: "2026-07-25T00:00:00.000Z",
  revoked_at: null,
  left_at: null,
};

function request(accessHandle: string, evidenceHandle: string) {
  const csrf = "attorney-evidence-csrf";
  return new NextRequest("https://custodyfolio.com/api/records/attorney/evidence/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      Cookie: `${recordsCsrfCookieName}=${csrf}`,
      "X-L2F-CSRF": csrf,
    },
    body: JSON.stringify({ accessHandle, evidenceHandle }),
  });
}

describe("attorney evidence download authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env.ATTORNEY_PORTAL_SECRET = secret;
    getAttorneyGuestAuthContext.mockResolvedValue({
      userId: "attorney-1",
      assuranceLevel: "aal2",
      email: "counsel@example.com",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
      supabase: {
        storage: {
          from: () => ({
            download: vi.fn().mockResolvedValue({
              data: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
              error: null,
            }),
          }),
        },
      },
    });
    resolveActiveAttorneyGrant.mockResolvedValue({ grant });
    recordAttorneyAccessEvent.mockResolvedValue({ ok: true });
    getAuthoritativeEvidenceItem.mockResolvedValue({
      evidence: {
        id: "evidence-1",
        userId: "owner-1",
        caseId: "case-1",
        originalFileName: "shared-file.pdf",
        fileType: "application/pdf",
        storagePath: "owner-1/case-1/evidence-1/evidence-1.pdf",
        malwareScanStatus: "clean",
      },
    });
  });

  it("uses the centralized active-grant check and exact granted owner/case", async () => {
    const accessHandle = "opaque-grant-handle";
    const evidenceHandle = sealAttorneyHandle({
      kind: "evidence",
      id: "evidence-1",
      grantId: grant.id,
      subject: "attorney-1",
      expiresAt: Date.now() + 60_000,
    }, { ATTORNEY_PORTAL_SECRET: secret });
    const response = await POST(request(accessHandle, evidenceHandle));

    expect(response.status).toBe(200);
    expect(resolveActiveAttorneyGrant).toHaveBeenCalledWith(expect.objectContaining({
      attorneyUserId: "attorney-1",
      accessHandle,
    }));
    expect(getAuthoritativeEvidenceItem).toHaveBeenCalledWith(expect.objectContaining({
      userId: "owner-1",
      caseId: "case-1",
      evidenceId: "evidence-1",
    }));
    expect(recordAttorneyAccessEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "evidence_downloaded",
      grantId: "grant-1",
    }));
    expect(recordAttorneyAccessEvent.mock.calls[0][0]).not.toHaveProperty("metadata");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("returns a privacy-safe response before looking up evidence when the grant is unavailable", async () => {
    resolveActiveAttorneyGrant.mockResolvedValue({
      error: "Shared matter is unavailable or access has ended.",
    });
    const response = await POST(request("tampered-handle", "tampered-evidence"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Shared matter is unavailable or access has ended.",
    });
    expect(getAuthoritativeEvidenceItem).not.toHaveBeenCalled();
  });
});
