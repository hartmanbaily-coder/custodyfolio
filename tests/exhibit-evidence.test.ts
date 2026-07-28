import { File } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveScreenshotExhibitToFiles } from "@/lib/records/exhibitEvidence";
import { createEmptyRecordsDatasetForUser } from "@/lib/records/seed";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saving a compiled exhibit to Files", () => {
  it("stores originals separately, relates the derived PDF, verifies persistence, and reloads", async () => {
    let dataset = createEmptyRecordsDatasetForUser("owner-1", "owner@example.com");
    let reloads = 0;
    const original = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "original.png", { type: "image/png" });
    const pdf = new File(["%PDF-1.7\ncompiled"], "compiled.pdf", { type: "application/pdf" });
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("/api/records/dataset?caseId=default");
      expect(new Headers(init?.headers).get("x-custody-folio-account")).toBe("owner-1");
      return new Response(JSON.stringify({ dataset }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveScreenshotExhibitToFiles({
      request: {
        pdfFile: pdf as unknown as globalThis.File,
        sources: [{ id: "source-1", file: original as unknown as globalThis.File }],
        saveOriginals: true,
        metadata: { label: "Exhibit A", includeInReports: true },
      },
      caseId: "case-1",
      userId: "owner-1",
      uploadFile: async (file, evidenceId) => ({
        storedFileName: `${evidenceId}.${file.name.endsWith("pdf") ? "pdf" : "png"}`,
        storagePath: `owner-1/case-1/${evidenceId}/stored`,
        storageSha256: "not-returned-to-attorney",
        malwareScanStatus: "clean",
      }),
      updateDataset: async (updater) => {
        dataset = updater(dataset);
      },
      reloadDataset: async () => {
        reloads += 1;
      },
    });

    expect(dataset.evidenceItems).toHaveLength(2);
    const savedPdf = dataset.evidenceItems.find((item) => item.derivationType === "screenshot_exhibit");
    const savedOriginal = dataset.evidenceItems.find((item) => item.originalFileName === "original.png");
    expect(savedOriginal?.includeInReports).toBe(false);
    expect(savedPdf?.includeInReports).toBe(true);
    expect(savedPdf?.sourceEvidenceIds).toEqual([savedOriginal?.id]);
    expect(reloads).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("binds the cloud confirmation request when saving only the generated PDF", async () => {
    let dataset = createEmptyRecordsDatasetForUser("owner-1", "owner@example.com");
    let reloads = 0;
    const original = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "original.png", {
      type: "image/png",
    });
    const pdf = new File(["%PDF-1.7\ncompiled"], "compiled.pdf", {
      type: "application/pdf",
    });
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("/api/records/dataset?caseId=default");
      expect(new Headers(init?.headers).get("x-custody-folio-account")).toBe("owner-1");
      return new Response(JSON.stringify({ dataset }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveScreenshotExhibitToFiles({
      request: {
        pdfFile: pdf as unknown as globalThis.File,
        sources: [{ id: "source-1", file: original as unknown as globalThis.File }],
        saveOriginals: false,
        metadata: { includeInReports: true },
      },
      caseId: "case-1",
      userId: "owner-1",
      uploadFile: async (_file, evidenceId) => ({
        storedFileName: `${evidenceId}.pdf`,
        storagePath: `owner-1/case-1/${evidenceId}/stored`,
        storageSha256: "not-returned-to-attorney",
        malwareScanStatus: "clean",
      }),
      updateDataset: async (updater) => {
        dataset = updater(dataset);
      },
      reloadDataset: async () => {
        reloads += 1;
      },
    });

    expect(dataset.evidenceItems).toHaveLength(1);
    expect(dataset.evidenceItems[0]?.derivationType).toBe("screenshot_exhibit");
    expect(reloads).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cleans up a temporary first upload when a later upload fails before metadata is saved", async () => {
    let uploads = 0;
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      if (String(url) === "/api/records/auth/csrf") {
        return new Response(JSON.stringify({ token: "csrf-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    const original = new File(["png"], "original.png", { type: "image/png" });
    const pdf = new File(["%PDF"], "compiled.pdf", { type: "application/pdf" });

    await expect(saveScreenshotExhibitToFiles({
      request: {
        pdfFile: pdf as unknown as globalThis.File,
        sources: [{ id: "source-1", file: original as unknown as globalThis.File }],
        saveOriginals: true,
        metadata: { includeInReports: true },
      },
      caseId: "case-1",
      userId: "owner-1",
      uploadFile: async () => {
        uploads += 1;
        if (uploads === 2) throw new Error("scanner unavailable");
        return { storagePath: "owner-1/case-1/file/stored", malwareScanStatus: "clean" };
      },
      updateDataset: () => undefined,
      reloadDataset: async () => undefined,
    })).rejects.toThrow("scanner unavailable");

    expect(calls).toEqual([
      "/api/records/auth/csrf",
      "/api/records/evidence/cleanup-upload",
    ]);
  });
});
