import { File } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadEvidenceFileToPrivateStorage } from "@/lib/records/evidenceClient";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("private evidence upload client", () => {
  it("binds Files and Screenshot PDF uploads to the active account", async () => {
    const file = new File(["%PDF-1.7"], "compiled.pdf", { type: "application/pdf" });
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("x-custody-folio-account")).toBe("owner-1");
      expect(init?.body).toBeInstanceOf(FormData);
      const body = init?.body as FormData;
      expect(body.get("caseId")).toBe("case-1");
      expect(body.get("evidenceId")).toBe("evidence-1");

      return new Response(JSON.stringify({
        evidence: {
          id: "evidence-1",
          userId: "owner-1",
          caseId: "case-1",
          originalFileName: "compiled.pdf",
          storagePath: "owner-1/case-1/evidence-1/evidence-1.pdf",
          malwareScanStatus: "clean",
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const uploaded = await uploadEvidenceFileToPrivateStorage({
      file: file as unknown as globalThis.File,
      evidenceId: "evidence-1",
      caseId: "case-1",
      userId: "owner-1",
    });

    expect(uploaded.storagePath).toBe("owner-1/case-1/evidence-1/evidence-1.pdf");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a successful response whose private path does not belong to the account", async () => {
    const file = new File(["%PDF-1.7"], "compiled.pdf", { type: "application/pdf" });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({
        evidence: {
          id: "evidence-1",
          userId: "owner-1",
          caseId: "case-1",
          storagePath: "other-owner/case-1/evidence-1/evidence-1.pdf",
          malwareScanStatus: "clean",
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));

    await expect(uploadEvidenceFileToPrivateStorage({
      file: file as unknown as globalThis.File,
      evidenceId: "evidence-1",
      caseId: "case-1",
      userId: "owner-1",
    })).rejects.toThrow("File upload response was incomplete.");
  });
});
