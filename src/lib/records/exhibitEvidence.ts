import { getRecordsCsrfToken } from "./attorneyClient";
import { recordsAccountBindingHeaderName } from "./accountBoundary";
import { createId, nowIso, withAudit } from "./clientStore";
import type { EvidenceItem, RecordsDataset } from "./types";
import {
  buildStoredEvidenceName,
  normalizeEvidenceFileType,
  validateEvidenceFile,
} from "./validation";

export interface ExhibitSaveRequest {
  pdfFile: File;
  sources: Array<{ id: string; file: File }>;
  saveOriginals: boolean;
  metadata: {
    label?: string;
    title?: string;
    dateFrom?: string;
    dateTo?: string;
    description?: string;
    includeInReports: boolean;
  };
}

export async function saveScreenshotExhibitToFiles(input: {
  request: ExhibitSaveRequest;
  caseId: string;
  userId: string;
  uploadFile: (file: File, evidenceId: string) => Promise<Partial<EvidenceItem>>;
  updateDataset: (updater: (current: RecordsDataset) => RecordsDataset) => Promise<void> | void;
  reloadDataset: () => Promise<void>;
}) {
  const { request, caseId, userId } = input;
  const filesToSave = [
    ...(request.saveOriginals ? request.sources.map((source) => source.file) : []),
    request.pdfFile,
  ];
  for (const file of filesToSave) {
    const normalizedFileType = normalizeEvidenceFileType({
      originalFileName: file.name,
      fileType: file.type,
    });
    const validation = validateEvidenceFile({
      originalFileName: file.name,
      fileType: normalizedFileType,
      fileSize: file.size,
    });
    if (!validation.ok) throw new Error(validation.error);
  }

  const uploadedRecords: Array<{
    id: string;
    file: File;
    uploaded: Partial<EvidenceItem>;
    isOriginal: boolean;
  }> = [];
  let metadataSaved = false;

  async function cleanup(file: File, evidenceId: string) {
    const csrf = await getRecordsCsrfToken();
    await fetch("/api/records/evidence/cleanup-upload", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-L2F-CSRF": csrf },
      body: JSON.stringify({ caseId, evidenceId, originalFileName: file.name }),
    }).catch(() => undefined);
  }

  try {
    for (const file of filesToSave) {
      const id = createId("evidence");
      const uploaded = await input.uploadFile(file, id);
      uploadedRecords.push({ id, file, uploaded, isOriginal: file !== request.pdfFile });
    }

    const now = nowIso();
    const sourceEvidenceIds = uploadedRecords.filter((record) => record.isOriginal).map((record) => record.id);
    const dateLabel =
      request.metadata.dateFrom && request.metadata.dateTo && request.metadata.dateFrom !== request.metadata.dateTo
        ? `${request.metadata.dateFrom} through ${request.metadata.dateTo}`
        : request.metadata.dateFrom || request.metadata.dateTo || "";
    const exhibitDescription = [
      request.metadata.label,
      request.metadata.title,
      dateLabel ? `Date: ${dateLabel}.` : "",
      request.metadata.description,
      `Compiled from ${request.sources.length} user-selected screenshot${request.sources.length === 1 ? "" : "s"}. This derived PDF does not replace the separately preserved originals.`,
    ].filter(Boolean).join(" ").slice(0, 2000);

    const nextEvidenceItems: EvidenceItem[] = uploadedRecords.map((record) => ({
      id: record.id,
      caseId,
      userId,
      originalFileName: record.file.name,
      storedFileName: record.uploaded.storedFileName || buildStoredEvidenceName({ id: record.id, originalFileName: record.file.name }),
      fileType:
        record.uploaded.fileType ||
        normalizeEvidenceFileType({
          originalFileName: record.file.name,
          fileType: record.file.type,
        }),
      fileSize: record.file.size,
      storageBucket: record.uploaded.storageBucket,
      storagePath: record.uploaded.storagePath,
      storageUploadedAt: record.uploaded.storageUploadedAt,
      storageSha256: record.uploaded.storageSha256,
      uploadedAt: now,
      evidenceDate: request.metadata.dateFrom || request.metadata.dateTo || undefined,
      description: record.isOriginal
        ? "Original screenshot preserved separately from a user-compiled exhibit."
        : exhibitDescription,
      tags: record.isOriginal ? ["original screenshot"] : ["compiled screenshot exhibit"],
      includeInReports: record.isOriginal ? false : request.metadata.includeInReports,
      reviewStatus: "needs_review",
      malwareScanStatus: record.uploaded.malwareScanStatus || "pending",
      derivationType: record.isOriginal ? undefined : "screenshot_exhibit",
      sourceEvidenceIds: record.isOriginal || sourceEvidenceIds.length === 0 ? undefined : sourceEvidenceIds,
      createdAt: now,
      updatedAt: now,
    }));

    await input.updateDataset((current) => withAudit(
      { ...current, evidenceItems: [...nextEvidenceItems, ...current.evidenceItems] },
      {
        userId,
        caseId,
        action: "uploaded",
        entityType: "screenshotExhibit",
        entityId: uploadedRecords.at(-1)?.id || createId("evidence"),
        metadataSummary: `Compiled screenshot exhibit saved with ${sourceEvidenceIds.length} separately preserved original file record${sourceEvidenceIds.length === 1 ? "" : "s"}.`,
      }
    ));
    metadataSaved = true;

    const verificationResponse = await fetch("/api/records/dataset?caseId=default", {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        [recordsAccountBindingHeaderName]: userId,
      },
    });
    const verification = (await verificationResponse.json().catch(() => ({}))) as {
      dataset?: Partial<RecordsDataset>;
      error?: string;
    };
    const savedIds = new Set(verification.dataset?.evidenceItems?.map((item) => item.id) || []);
    if (!verificationResponse.ok || uploadedRecords.some((record) => !savedIds.has(record.id))) {
      throw new Error(verification.error || "Files were saved, but cloud reload confirmation failed.");
    }
    await input.reloadDataset();
  } catch (error) {
    if (!metadataSaved) await Promise.all(uploadedRecords.map((record) => cleanup(record.file, record.id)));
    throw error;
  }
}
