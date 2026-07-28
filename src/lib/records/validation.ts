import { z } from "zod";
import type { EvidenceItem } from "./types";

export const timezoneSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid IANA timezone.");

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const timeStringSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Use HH:mm.");

export const moneySchema = z.coerce
  .number()
  .finite()
  .min(0)
  .max(1_000_000);

export const custodyMatterSchema = z.object({
  caseName: z.string().trim().min(2).max(120),
  courtOrOrderNickname: z.string().trim().max(120).optional().or(z.literal("")),
  courtName: z.string().trim().max(160).optional().or(z.literal("")),
  orderDate: dateStringSchema.optional().or(z.literal("")),
  effectiveStartDate: dateStringSchema.optional().or(z.literal("")),
  effectiveEndDate: dateStringSchema.optional().or(z.literal("")),
  childDisplayLabels: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  userRoleLabel: z.string().trim().min(1).max(60),
  otherParentLabel: z.string().trim().min(1).max(60),
  defaultExchangeLocation: z.string().trim().max(160).optional().or(z.literal("")),
  timezone: timezoneSchema,
  notes: z.string().trim().max(2_000).optional().or(z.literal("")),
});

export const exchangeRuleSchema = z.object({
  ruleName: z.string().trim().min(2).max(120),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  orderedExchangeTime: timeStringSchema,
  direction: z.enum(["other_parent_to_me", "me_to_other_parent"]),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  effectiveStartDate: dateStringSchema,
  effectiveEndDate: dateStringSchema.optional().or(z.literal("")),
  orderProvisionNotes: z.string().trim().max(2_000).optional().or(z.literal("")),
});

export const exchangeLogSchema = z.object({
  orderedExchangeAt: z.string().datetime(),
  actualExchangeAt: z.string().datetime().optional().nullable(),
  direction: z.enum(["other_parent_to_me", "me_to_other_parent"]),
  arrivingParty: z.enum(["me", "other_parent", "third_party", "unknown"]).optional(),
  lateParty: z
    .enum(["me", "other_parent", "third_party", "unknown", "both", "not_applicable"])
    .optional(),
  scheduledTimeSource: z
    .enum([
      "court_order",
      "parenting_plan",
      "written_agreement",
      "verbal_agreement",
      "other",
      "unknown",
    ])
    .optional(),
  status: z.enum([
    "completed_on_time",
    "completed_late",
    "completed_early",
    "missed",
    "refused",
    "modified_by_agreement",
    "canceled",
    "other",
  ]),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  reasonGiven: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(2_000).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  witnesses: z.string().trim().max(500).optional().or(z.literal("")),
});

export const custodyDayColors = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#b45309",
  "#475569",
  "#be123c",
] as const;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a valid hex color.");

export const custodyDayAssignmentSchema = z.object({
  date: dateStringSchema,
  caregiverLabel: z.string().trim().min(1).max(60),
  color: hexColorSchema,
  startsAt: timeStringSchema.optional().or(z.literal("")),
  endsAt: timeStringSchema.optional().or(z.literal("")),
  exchangeTime: timeStringSchema.optional().or(z.literal("")),
  exchangeDirection: z
    .enum(["other_parent_to_me", "me_to_other_parent"])
    .optional()
    .or(z.literal("")),
  exchangeLocation: z.string().trim().max(160).optional().or(z.literal("")),
  notes: z.string().trim().max(1_000).optional().or(z.literal("")),
});

export const dateNoteSchema = z.object({
  noteDate: dateStringSchema,
  noteTime: timeStringSchema.optional().or(z.literal("")),
  category: z.enum([
    "exchange",
    "communication",
    "school",
    "medical",
    "expense",
    "child_support",
    "safety",
    "schedule_change",
    "child_item",
    "attorney",
    "court",
    "other",
  ]),
  title: z.string().trim().min(2).max(140),
  body: z.string().trim().min(1).max(5_000),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  includeInReports: z.boolean(),
});

export const childSupportOrderSchema = z.object({
  orderNickname: z.string().trim().min(2).max(120),
  orderedAmount: moneySchema,
  currency: z.string().trim().length(3),
  paymentFrequency: z.enum([
    "weekly",
    "biweekly",
    "monthly",
    "semi_monthly",
    "custom",
  ]),
  dueDayOrSchedule: z.string().trim().min(1).max(120),
  effectiveStartDate: dateStringSchema,
  effectiveEndDate: dateStringSchema.optional().or(z.literal("")),
  firstPaymentDueDate: dateStringSchema.optional().or(z.literal("")),
  secondPaymentDueDate: dateStringSchema.optional().or(z.literal("")),
  payerLabel: z.string().trim().min(1).max(60),
  recipientLabel: z.string().trim().min(1).max(60),
  paymentMethodExpected: z.string().trim().max(120).optional().or(z.literal("")),
  agencyOrCaseNumber: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2_000).optional().or(z.literal("")),
}).superRefine((order, context) => {
  if (order.paymentFrequency !== "custom" && !order.firstPaymentDueDate) {
    context.addIssue({
      code: "custom",
      path: ["firstPaymentDueDate"],
      message: "Enter the first payment due date so obligations can be tracked.",
    });
  }
  if (order.paymentFrequency === "semi_monthly" && !order.secondPaymentDueDate) {
    context.addIssue({
      code: "custom",
      path: ["secondPaymentDueDate"],
      message: "Enter the second monthly due date for a semi monthly order.",
    });
  }
  if (
    order.firstPaymentDueDate &&
    order.firstPaymentDueDate < order.effectiveStartDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["firstPaymentDueDate"],
      message: "The first payment due date cannot be before the order start date.",
    });
  }
  if (
    order.secondPaymentDueDate &&
    order.secondPaymentDueDate < order.effectiveStartDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["secondPaymentDueDate"],
      message: "The second payment due date cannot be before the order start date.",
    });
  }
  if (
    order.effectiveEndDate &&
    order.effectiveEndDate < order.effectiveStartDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["effectiveEndDate"],
      message: "The order end date cannot be before the order start date.",
    });
  }
  if (
    order.effectiveEndDate &&
    order.firstPaymentDueDate &&
    order.firstPaymentDueDate > order.effectiveEndDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["firstPaymentDueDate"],
      message: "The first payment due date cannot be after the order end date.",
    });
  }
  if (
    order.effectiveEndDate &&
    order.secondPaymentDueDate &&
    order.secondPaymentDueDate > order.effectiveEndDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["secondPaymentDueDate"],
      message: "The second payment due date cannot be after the order end date.",
    });
  }
});

export const childSupportPaymentSchema = z.object({
  childSupportOrderId: z.string().min(1),
  dueDate: dateStringSchema,
  amountDue: moneySchema,
  amountPaid: moneySchema,
  paymentDate: dateStringSchema.optional().or(z.literal("")),
  paymentStatus: z.enum([
    "paid",
    "partial",
    "unpaid",
    "late",
    "disputed",
    "waived_by_agreement",
    "unknown",
  ]),
  paymentMethod: z.enum([
    "state_agency",
    "wage_withholding",
    "bank_transfer",
    "check",
    "cash",
    "money_order",
    "payment_app",
    "other",
    "unknown",
  ]),
  referenceNumber: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2_000).optional().or(z.literal("")),
});

export const expenseItemSchema = z.object({
  expenseDate: dateStringSchema,
  category: z.enum([
    "medical",
    "school",
    "childcare",
    "extracurricular",
    "transportation",
    "clothing",
    "supplies",
    "other",
  ]),
  description: z.string().trim().min(2).max(180),
  amount: moneySchema,
  currency: z.string().trim().length(3),
  paidByLabel: z.string().trim().min(1).max(60),
  reimbursementRequested: z.boolean(),
  reimbursementDueDate: dateStringSchema.optional().or(z.literal("")),
  amountReimbursed: moneySchema.optional(),
  reimbursementDate: dateStringSchema.optional().or(z.literal("")),
  reimbursementStatus: z.enum([
    "not_requested",
    "requested",
    "partially_reimbursed",
    "reimbursed",
    "unpaid",
    "disputed",
    "unknown",
  ]),
  notes: z.string().trim().max(2_000).optional().or(z.literal("")),
});

export const allowedEvidenceExtensions = [
  "docx",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "heic",
  "heif",
  "txt",
  "csv",
  "html",
] as const;

export const allowedEvidenceMimeTypes = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "application/csv",
  "text/html",
]);

const blockedExtensions = new Set([
  "app",
  "bat",
  "cmd",
  "com",
  "dll",
  "dmg",
  "exe",
  "jar",
  "js",
  "msi",
  "ps1",
  "scr",
  "sh",
  "vb",
  "vbs",
]);

export const maxEvidenceFileBytes = 10 * 1024 * 1024;

export interface EvidenceFileCandidate {
  originalFileName: string;
  fileType: string;
  fileSize: number;
}

export function getFileExtension(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) || "" : "";
}

const evidenceMimeTypeByExtension: Record<string, string> = {
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  heic: "image/heic",
  heif: "image/heif",
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  txt: "text/plain",
};

export function normalizeEvidenceFileType(
  candidate: Pick<EvidenceFileCandidate, "originalFileName" | "fileType">
) {
  const extension = getFileExtension(candidate.originalFileName);
  const suppliedType = candidate.fileType.trim().toLowerCase();
  const extensionType = evidenceMimeTypeByExtension[extension];

  if (
    !suppliedType ||
    suppliedType === "application/octet-stream" ||
    (extension === "csv" &&
      ["application/csv", "application/vnd.ms-excel"].includes(suppliedType))
  ) {
    return extensionType || suppliedType || "application/octet-stream";
  }

  return suppliedType;
}

export function validateEvidenceFile(candidate: EvidenceFileCandidate) {
  const extension = getFileExtension(candidate.originalFileName);
  const fileType = normalizeEvidenceFileType(candidate);

  if (blockedExtensions.has(extension)) {
    return { ok: false as const, error: "Executable or script files are blocked." };
  }

  if (!allowedEvidenceExtensions.includes(extension as (typeof allowedEvidenceExtensions)[number])) {
    return { ok: false as const, error: "File type is not on the evidence allow list." };
  }

  if (!allowedEvidenceMimeTypes.has(fileType)) {
    return { ok: false as const, error: "File MIME type is not allowed." };
  }

  if (candidate.fileSize <= 0 || candidate.fileSize > maxEvidenceFileBytes) {
    return { ok: false as const, error: "File must be greater than 0 bytes and 10 MB or smaller." };
  }

  return { ok: true as const };
}

export function validateEvidenceFileSignature(candidate: EvidenceFileCandidate, bytes: Uint8Array) {
  const extension = getFileExtension(candidate.originalFileName);
  const fileType = normalizeEvidenceFileType(candidate);
  const startsWith = (signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);
  const asciiAt = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  const hasNullByte = bytes.some((value) => value === 0);

  if (extension === "pdf" || fileType === "application/pdf") {
    return startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])
      ? { ok: true as const }
      : { ok: false as const, error: "PDF file signature does not match the selected file." };
  }

  if (extension === "png" || fileType === "image/png") {
    return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      ? { ok: true as const }
      : { ok: false as const, error: "PNG file signature does not match the selected file." };
  }

  if (["jpg", "jpeg"].includes(extension) || fileType === "image/jpeg") {
    return startsWith([0xff, 0xd8, 0xff])
      ? { ok: true as const }
      : { ok: false as const, error: "JPEG file signature does not match the selected file." };
  }

  if (
    ["heic", "heif"].includes(extension) ||
    fileType === "image/heic" ||
    fileType === "image/heif"
  ) {
    const brand = asciiAt(4, 8);
    return brand.startsWith("ftypheic") ||
      brand.startsWith("ftypheix") ||
      brand.startsWith("ftyphevc") ||
      brand.startsWith("ftyphevx") ||
      brand.startsWith("ftypmif1")
      ? { ok: true as const }
      : { ok: false as const, error: "HEIC/HEIF file signature does not match the selected file." };
  }

  if (
    extension === "docx" ||
    fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return startsWith([0x50, 0x4b])
      ? { ok: true as const }
      : { ok: false as const, error: "DOCX file signature does not match the selected file." };
  }

  if (["txt", "csv", "html"].includes(extension) || fileType.startsWith("text/")) {
    return hasNullByte
      ? { ok: false as const, error: "Text evidence files cannot contain binary null bytes." }
      : { ok: true as const };
  }

  return { ok: true as const };
}

export function buildStoredEvidenceName(item: Pick<EvidenceItem, "id" | "originalFileName">) {
  const extension = getFileExtension(item.originalFileName);
  return `${item.id}.${extension}`;
}

export function malwareScanStub() {
  return {
    status: "not_configured" as const,
    message:
      "Production storage must call a malware scanning provider before evidence is available.",
  };
}
