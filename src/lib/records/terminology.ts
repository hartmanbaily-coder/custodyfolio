import type { CaseTerminology } from "./types";

export const defaultCaseTerminology: CaseTerminology = {
  parentingTime: "Parenting time",
  communication: "Communication",
  notesEvents: "Notes & events",
  filesEvidence: "Files & evidence",
  financialRecords: "Financial records",
};

export const caseTerminologyFields: Array<{
  key: keyof CaseTerminology;
  label: string;
  example: string;
}> = [
  {
    key: "parentingTime",
    label: "Parenting time",
    example: "Exchange, pickup/drop-off, missed visit, schedule change",
  },
  {
    key: "communication",
    label: "Communication",
    example: "Phone call, video call, message, follow-up notice",
  },
  {
    key: "notesEvents",
    label: "Notes & events",
    example: "Observation, appointment, school event, general note",
  },
  {
    key: "filesEvidence",
    label: "Files & evidence",
    example: "Photo, screenshot, receipt, document, audio",
  },
  {
    key: "financialRecords",
    label: "Financial records",
    example: "Expense, reimbursement, child support payment",
  },
];

export function cleanTerminologyLabel(value: unknown, fallback: string) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
  return cleaned || fallback;
}

export function resolveCaseTerminology(
  input: Partial<CaseTerminology> | null | undefined
): CaseTerminology {
  return {
    parentingTime: cleanTerminologyLabel(
      input?.parentingTime,
      defaultCaseTerminology.parentingTime
    ),
    communication: cleanTerminologyLabel(
      input?.communication,
      defaultCaseTerminology.communication
    ),
    notesEvents: cleanTerminologyLabel(
      input?.notesEvents,
      defaultCaseTerminology.notesEvents
    ),
    filesEvidence: cleanTerminologyLabel(
      input?.filesEvidence,
      defaultCaseTerminology.filesEvidence
    ),
    financialRecords: cleanTerminologyLabel(
      input?.financialRecords,
      defaultCaseTerminology.financialRecords
    ),
  };
}
