import { describe, expect, it } from "vitest";
import {
  buildReportPreview,
  buildSectionExportPacket,
} from "@/lib/records/reports";
import {
  generatePrintableReportPdf,
  printableReportPacket,
} from "@/lib/records/reportPdf";
import { createRecordsSeed, demoCaseId, demoUserId } from "@/lib/records/seed";

const range = { from: "2026-05-01", to: "2026-06-15" };

async function pdfBytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("printable report PDF", () => {
  it("creates a populated PDF for lawyer/court summary and chart exports", async () => {
    const dataset = createRecordsSeed();
    const packet = buildSectionExportPacket(
      dataset,
      demoUserId,
      demoCaseId,
      range,
      "timeline"
    );
    const generated = generatePrintableReportPdf(packet);
    const bytes = await pdfBytes(generated.blob);

    expect(generated.blob.type).toBe("application/pdf");
    expect(new TextDecoder("ascii").decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(generated.byteLength).toBe(bytes.byteLength);
    expect(generated.byteLength).toBeGreaterThan(5_000);
    expect(generated.pageCount).toBeGreaterThan(0);
  });

  it("creates the full reports-tab PDF without HTML print rendering", async () => {
    const dataset = createRecordsSeed();
    const preview = buildReportPreview(
      dataset,
      demoUserId,
      demoCaseId,
      range,
      "combined_court_packet"
    );
    const generated = generatePrintableReportPdf(
      printableReportPacket(preview, range)
    );
    const bytes = await pdfBytes(generated.blob);

    expect(new TextDecoder("ascii").decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(generated.byteLength).toBeGreaterThan(5_000);
    expect(generated.pageCount).toBeGreaterThanOrEqual(2);
  });
});
