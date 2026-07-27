import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const userId = "11111111-1111-4111-8111-111111111111";
const getRecordsAuthContext = vi.hoisted(() => vi.fn());
const storageUpload = vi.hoisted(() => vi.fn());
const scanEvidenceFile = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/authServer", () => ({
  attachRefreshedRecordsSession: (
    _request: NextRequest,
    response: Response
  ) => response,
  getRecordsAuthContext,
  isSupabaseRecordsMode: () => true,
}));

vi.mock("@/lib/records/malwareScanner", () => ({
  scanEvidenceFile,
}));

vi.mock("@/lib/security/securityEvents", () => ({
  recordSecurityEvent,
}));

import { POST } from "@/app/api/records/evidence/upload/route";

describe("evidence upload route storage ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env.RECORDS_STORAGE_MODE = "supabase";
    process.env.MALWARE_SCAN_PROVIDER = "clamav";
    process.env.RECORDS_EVIDENCE_BUCKET = "records-evidence";
    process.env.EVIDENCE_MAX_FILE_BYTES = "10485760";

    storageUpload.mockResolvedValue({ error: null });
    scanEvidenceFile.mockResolvedValue({
      status: "clean",
      provider: "clamav",
      detail: "clean",
    });
    getRecordsAuthContext.mockResolvedValue({
      userId,
      supabase: {
        storage: {
          from: vi.fn(() => ({ upload: storageUpload })),
        },
      },
    });
  });

  it("uploads the original message file to the authenticated user's exact private path", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File(["<html><body>reviewed archive</body></html>"], "message-archive.html")
    );
    formData.append("caseId", "case-1");
    formData.append("evidenceId", "evidence-1");
    const request = new NextRequest(
      "https://custodyfolio.com/api/records/evidence/upload",
      { method: "POST", body: formData }
    );

    const response = await POST(request);
    expect(response).toBeDefined();
    if (!response) throw new Error("Upload route did not return a response.");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(storageUpload).toHaveBeenCalledOnce();
    expect(storageUpload).toHaveBeenCalledWith(
      `${userId}/case-1/evidence-1/evidence-1.html`,
      expect.any(Buffer),
      {
        cacheControl: "0",
        contentType: "text/html",
        upsert: false,
      }
    );
    expect(body.evidence).toMatchObject({
      id: "evidence-1",
      userId,
      caseId: "case-1",
      originalFileName: "message-archive.html",
      fileType: "text/html",
      storageBucket: "records-evidence",
      storagePath: `${userId}/case-1/evidence-1/evidence-1.html`,
      malwareScanStatus: "clean",
    });
    expect(scanEvidenceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "message-archive.html",
        fileType: "text/html",
      })
    );
  });

  it("normalizes and uploads a DOCX selected by a browser as generic binary data", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File(
        [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])],
        "reviewed-order.docx",
        { type: "application/octet-stream" }
      )
    );
    formData.append("caseId", "case-2");
    formData.append("evidenceId", "evidence-2");
    const request = new NextRequest(
      "https://custodyfolio.com/api/records/evidence/upload",
      { method: "POST", body: formData }
    );

    const response = await POST(request);
    expect(response).toBeDefined();
    if (!response) throw new Error("Upload route did not return a response.");
    const body = await response.json();
    const docxType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    expect(response.status).toBe(200);
    expect(storageUpload).toHaveBeenCalledWith(
      `${userId}/case-2/evidence-2/evidence-2.docx`,
      expect.any(Buffer),
      {
        cacheControl: "0",
        contentType: docxType,
        upsert: false,
      }
    );
    expect(body.evidence).toMatchObject({
      id: "evidence-2",
      userId,
      caseId: "case-2",
      fileType: docxType,
      storagePath: `${userId}/case-2/evidence-2/evidence-2.docx`,
      malwareScanStatus: "clean",
    });
  });
});
