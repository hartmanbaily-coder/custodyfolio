import { siteName } from "@/lib/site";
import type { EvidenceItem } from "./types";
import { evidenceFileName } from "./validation";

type EvidencePrintItem = Pick<
  EvidenceItem,
  | "id"
  | "originalFileName"
  | "displayFileName"
  | "evidenceDate"
  | "uploadedAt"
  | "fileType"
  | "fileSize"
  | "malwareScanStatus"
  | "reviewStatus"
  | "includeInReports"
  | "tags"
  | "description"
> & Partial<Pick<EvidenceItem, "storagePath">>;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reviewStatusLabel(status: EvidenceItem["reviewStatus"]) {
  if (status === "reviewed") return "Reviewed";
  if (status === "submitted") return "Submitted";
  if (status === "rejected") return "Rejected";
  return "Needs review";
}

export function buildEvidencePrintHtml(item: EvidencePrintItem) {
  const fileName = evidenceFileName(item);
  const rows = [
    ["File name", fileName],
    ...(fileName !== item.originalFileName
      ? [["Original uploaded name", item.originalFileName]]
      : []),
    ["Record date", item.evidenceDate || ""],
    ["Uploaded", item.uploadedAt],
    ["File type", item.fileType],
    ["File size", `${item.fileSize} bytes`],
    ["Storage", item.storagePath ? "Private file attached" : "Metadata only"],
    ["Scan status", item.malwareScanStatus || "pending"],
    ["Review status", reviewStatusLabel(item.reviewStatus)],
    ["Included in reports", item.includeInReports ? "Yes" : "No"],
    ["Tags", item.tags.join(", ")],
    ["Description", item.description || ""],
  ];

  return `<!doctype html>
    <html>
      <head>
        <title>File Sheet - ${escapeHtml(fileName)}</title>
        <style>
          @page { margin: 0.55in; }
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 0; }
          h1 { font-size: 22px; margin: 0 0 8px; }
          p { color: #475569; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; vertical-align: top; text-align: left; }
          th { width: 180px; background: #f8fafc; }
          .notice { border: 1px solid #fde68a; background: #fffbeb; padding: 12px; margin-top: 20px; font-size: 13px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(siteName)} File Sheet</h1>
        <p>Private custody records workspace. Use privacy minded labels and verify the source document before submission.</p>
        <div class="notice">This sheet is metadata for organizing records. It is not legal advice and does not replace the original document.</div>
        <table>
          <tbody>
            ${rows
              .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
              .join("")}
          </tbody>
        </table>
      </body>
    </html>`;
}
