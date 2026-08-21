import { recordsAccountBindingHeaderName } from "./accountBoundary";
import {
  assertEvidenceItemAccess,
  isEvidenceStoragePathOwnedByUser,
} from "./evidenceStorage";
import type { EvidenceItem } from "./types";

export async function uploadEvidenceFileToPrivateStorage(input: {
  file: File;
  evidenceId: string;
  caseId: string;
  userId: string;
}): Promise<Partial<EvidenceItem>> {
  const { file, evidenceId, caseId, userId } = input;
  const body = new FormData();
  body.append("file", file);
  body.append("caseId", caseId);
  body.append("evidenceId", evidenceId);

  const response = await fetch("/api/records/evidence/upload", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      [recordsAccountBindingHeaderName]: userId,
    },
    body,
  });
  const parsed = (await response.json().catch(() => ({}))) as {
    evidence?: Partial<EvidenceItem>;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(parsed.error || "File upload failed.");
  }

  const uploadAccess =
    parsed.evidence?.id &&
    parsed.evidence.userId &&
    parsed.evidence.caseId &&
    parsed.evidence.originalFileName &&
    parsed.evidence.storagePath
      ? assertEvidenceItemAccess(
          {
            id: parsed.evidence.id,
            userId: parsed.evidence.userId,
            caseId: parsed.evidence.caseId,
            originalFileName: parsed.evidence.originalFileName,
            storagePath: parsed.evidence.storagePath,
            malwareScanStatus: parsed.evidence.malwareScanStatus,
          },
          { userId, caseId }
        )
      : null;
  if (
    parsed.evidence?.malwareScanStatus !== "clean" ||
    parsed.evidence.id !== evidenceId ||
    !uploadAccess?.ok ||
    !isEvidenceStoragePathOwnedByUser(parsed.evidence.storagePath || "", userId)
  ) {
    throw new Error("File upload response was incomplete.");
  }

  return parsed.evidence;
}
