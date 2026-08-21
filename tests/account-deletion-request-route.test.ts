import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { POST } from "@/app/api/records/account/deletion-request/route";

const userId = "11111111-1111-4111-8111-111111111111";
const getRecordsAuthContext = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());
const revokeSessions = vi.hoisted(() => vi.fn());
const deleteUser = vi.hoisted(() => vi.fn());
const clearRecordsSessionCookies = vi.hoisted(() => vi.fn());
const deleteRecordsEvidenceForUser = vi.hoisted(() => vi.fn());
const beginRecordsAccountDeletion = vi.hoisted(() => vi.fn());
const clearRecordsAccountDeletion = vi.hoisted(() => vi.fn());
const completeRecordsAccountDeletion = vi.hoisted(() => vi.fn());
const csrf = "account-deletion-csrf-token";

vi.mock("@/lib/records/authServer", () => ({
  clearRecordsSessionCookies,
  getRecordsAuthContext,
  isSupabaseRecordsMode: () => true,
  recordsAccessCookieName: "l2f-records-access",
}));

vi.mock("@/lib/security/securityEvents", () => ({
  recordSecurityEvent,
}));

vi.mock("@/lib/records/accountDeletion", () => ({
  beginRecordsAccountDeletion,
  clearRecordsAccountDeletion,
  completeRecordsAccountDeletion,
  deleteRecordsEvidenceForUser,
}));

function makeRequest(
  body: unknown,
  input: { origin?: string; csrfHeader?: string; csrfCookie?: string } = {}
) {
  return new NextRequest("https://custodyfolio.com/api/records/account/deletion-request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: input.origin || "https://custodyfolio.com",
      Cookie: `l2f-records-access=test-access-token; ${recordsCsrfCookieName}=${input.csrfCookie || csrf}`,
      "X-L2F-CSRF": input.csrfHeader || csrf,
    },
    body: JSON.stringify(body),
  });
}

describe("records immediate account deletion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    deleteRecordsEvidenceForUser.mockResolvedValue({ ok: true, deletedObjects: 2 });
    beginRecordsAccountDeletion.mockResolvedValue("2026-08-21T00:00:00.000Z");
    clearRecordsAccountDeletion.mockResolvedValue(undefined);
    completeRecordsAccountDeletion.mockResolvedValue(undefined);
    revokeSessions.mockResolvedValue({ error: null });
    deleteUser.mockResolvedValue({ error: null });
    getRecordsAuthContext.mockResolvedValue({
      supabase: {
        auth: {
          admin: {
            signOut: revokeSessions,
            deleteUser,
          },
        },
      },
      userId,
      email: "reviewer@example.test",
      caseId: "demo-case",
    });
  });

  it("permanently deletes evidence, sessions, Auth identity, and cascaded account data", async () => {
    const response = await POST(makeRequest({ confirmation: "DELETE" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      clearLocalSession: true,
      deletedAt: expect.any(String),
      message: expect.stringContaining("permanently deleted"),
    });
    expect(deleteRecordsEvidenceForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId })
    );
    expect(revokeSessions).toHaveBeenCalledWith("test-access-token", "global");
    expect(deleteUser).toHaveBeenCalledWith(userId, false);
    expect(beginRecordsAccountDeletion).toHaveBeenCalledWith(
      expect.objectContaining({ userId })
    );
    expect(completeRecordsAccountDeletion).toHaveBeenCalledWith(
      expect.objectContaining({ userId })
    );
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "info",
        status: 200,
        type: "account_deletion_completed",
        userId,
      })
    );
    expect(clearRecordsSessionCookies).toHaveBeenCalledWith(response);
  });

  it("stops before deleting the identity when private evidence cleanup fails", async () => {
    deleteRecordsEvidenceForUser.mockResolvedValue({ ok: false, error: "cleanup failed" });

    const response = await POST(makeRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("private files could not be removed"),
    });
    expect(revokeSessions).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("does not delete the user unless global session revocation succeeds", async () => {
    revokeSessions.mockResolvedValue({ error: new Error("revocation unavailable") });

    const response = await POST(makeRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("active sessions could not be closed"),
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(clearRecordsSessionCookies).not.toHaveBeenCalled();
  });

  it("clears local cookies and reports a partial provider failure if Auth deletion fails", async () => {
    deleteUser.mockResolvedValue({ error: new Error("delete unavailable") });

    const response = await POST(makeRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("could not be fully deleted"),
    });
    expect(clearRecordsSessionCookies).toHaveBeenCalledWith(response);
  });

  it("requires an exact irreversible-deletion confirmation", async () => {
    const response = await POST(makeRequest({ confirmation: "delete" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Confirm permanent deletion before continuing.",
    });
    expect(deleteRecordsEvidenceForUser).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("requires an authenticated AAL2 records session", async () => {
    getRecordsAuthContext.mockResolvedValue({
      error: NextResponse.json({ error: "Multi factor verification required." }, { status: 403 }),
    });

    const response = await POST(makeRequest({ confirmation: "DELETE" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Multi factor verification required.",
    });
    expect(deleteRecordsEvidenceForUser).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin request before touching the account", async () => {
    const response = await POST(
      makeRequest(
        { confirmation: "DELETE" },
        { origin: "https://attacker.example" }
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "This request could not be verified. Refresh and try again.",
    });
    expect(getRecordsAuthContext).not.toHaveBeenCalled();
    expect(deleteRecordsEvidenceForUser).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
