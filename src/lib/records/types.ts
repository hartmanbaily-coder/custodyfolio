export type Id = string;

export type ExchangeDirection = "other_parent_to_me" | "me_to_other_parent";

export type ExchangeParty = "me" | "other_parent" | "third_party" | "unknown";

export type ExchangeLateParty = ExchangeParty | "both" | "not_applicable";

export type ExchangeScheduledTimeSource =
  | "court_order"
  | "parenting_plan"
  | "written_agreement"
  | "verbal_agreement"
  | "other"
  | "unknown";

export type ExchangeStatus =
  | "completed_on_time"
  | "completed_late"
  | "completed_early"
  | "missed"
  | "refused"
  | "modified_by_agreement"
  | "canceled"
  | "other";

export type NoteCategory =
  | "exchange"
  | "communication"
  | "school"
  | "medical"
  | "expense"
  | "child_support"
  | "safety"
  | "schedule_change"
  | "child_item"
  | "attorney"
  | "court"
  | "other";

export type PaymentFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "semi_monthly"
  | "custom";

export type PaymentStatus =
  | "paid"
  | "partial"
  | "unpaid"
  | "late"
  | "disputed"
  | "waived_by_agreement"
  | "unknown";

export type PaymentMethod =
  | "state_agency"
  | "wage_withholding"
  | "bank_transfer"
  | "check"
  | "cash"
  | "money_order"
  | "payment_app"
  | "other"
  | "unknown";

export type ExpenseCategory =
  | "medical"
  | "school"
  | "childcare"
  | "extracurricular"
  | "transportation"
  | "clothing"
  | "supplies"
  | "other";

export type ReimbursementStatus =
  | "not_requested"
  | "requested"
  | "partially_reimbursed"
  | "reimbursed"
  | "unpaid"
  | "disputed"
  | "unknown";

export type ReportType =
  | "exchange_compliance"
  | "facetime_cancellations"
  | "incident_timeline"
  | "filing_facetime_correlation"
  | "child_support_payment"
  | "expense_reimbursement"
  | "combined_attorney_summary"
  | "combined_court_packet"
  | "full_profile_export";

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "uploaded"
  | "exported"
  | "login"
  | "failed_login"
  | "password_reset_requested"
  | "password_changed";

export type CalendarEventType =
  | "scheduled_exchange"
  | "logged_exchange"
  | "custody_day"
  | "child_support_due"
  | "child_support_paid"
  | "custody_note"
  | "evidence_item"
  | "expense_item";

export type TimelineSeverity = "neutral" | "positive" | "attention" | "critical";

export interface UserProfile {
  id: Id;
  userId: Id;
  displayName?: string;
  email: string;
  timezone: string;
  attorneySharingProfileConfirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustodyMatter {
  id: Id;
  userId: Id;
  caseName: string;
  courtOrOrderNickname?: string;
  courtName?: string;
  orderDate?: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  childDisplayLabels: string[];
  userRoleLabel: string;
  otherParentLabel: string;
  defaultExchangeLocation?: string;
  timezone: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustodyExchangeRule {
  id: Id;
  caseId: Id;
  userId: Id;
  ruleName: string;
  dayOfWeek: number;
  orderedExchangeTime: string;
  direction: ExchangeDirection;
  location?: string;
  effectiveStartDate: string;
  effectiveEndDate?: string;
  orderProvisionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleException {
  id: Id;
  caseId: Id;
  userId: Id;
  exceptionDate: string;
  custodyExchangeRuleId?: Id;
  orderedExchangeTime?: string;
  status: "rescheduled" | "canceled" | "added";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustodyDayAssignment {
  id: Id;
  caseId: Id;
  userId: Id;
  date: string;
  caregiverLabel: string;
  color: string;
  startsAt?: string;
  endsAt?: string;
  exchangeTime?: string;
  exchangeDirection?: ExchangeDirection;
  exchangeLocation?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpectedExchangeEvent {
  id: Id;
  caseId: Id;
  userId: Id;
  custodyExchangeRuleId: Id;
  orderedExchangeAt: string;
  direction: ExchangeDirection;
  location?: string;
  ruleName: string;
}

export interface ExchangeLog {
  id: Id;
  caseId: Id;
  userId: Id;
  custodyExchangeRuleId?: Id;
  orderedExchangeAt: string;
  actualExchangeAt?: string | null;
  direction: ExchangeDirection;
  arrivingParty?: ExchangeParty;
  lateParty?: ExchangeLateParty;
  scheduledTimeSource?: ExchangeScheduledTimeSource;
  status: ExchangeStatus;
  location?: string;
  reasonGiven?: string;
  notes?: string;
  tags: string[];
  witnesses?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DateNote {
  id: Id;
  caseId: Id;
  userId: Id;
  noteDate: string;
  noteTime?: string;
  category: NoteCategory;
  title: string;
  body: string;
  tags: string[];
  includeInReports: boolean;
  relatedExchangeId?: Id;
  relatedChildSupportPaymentId?: Id;
  relatedExpenseId?: Id;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceItem {
  id: Id;
  caseId: Id;
  userId: Id;
  relatedExchangeId?: Id;
  relatedNoteId?: Id;
  relatedChildSupportPaymentId?: Id;
  relatedExpenseId?: Id;
  originalFileName: string;
  displayFileName?: string;
  storedFileName: string;
  fileType: string;
  fileSize: number;
  storageBucket?: string;
  storagePath?: string;
  storageUploadedAt?: string;
  storageSha256?: string;
  uploadedAt: string;
  evidenceDate?: string;
  description?: string;
  tags: string[];
  includeInReports: boolean;
  reviewStatus?: "needs_review" | "reviewed" | "submitted" | "rejected";
  reviewedAt?: string;
  submittedAt?: string;
  malwareScanStatus?: "pending" | "clean" | "blocked" | "failed";
  derivationType?: "screenshot_exhibit";
  sourceEvidenceIds?: Id[];
  createdAt: string;
  updatedAt: string;
}

export interface ChildSupportOrder {
  id: Id;
  caseId: Id;
  userId: Id;
  orderNickname: string;
  orderedAmount: number;
  currency: string;
  paymentFrequency: PaymentFrequency;
  dueDayOrSchedule: string;
  effectiveStartDate: string;
  effectiveEndDate?: string;
  firstPaymentDueDate?: string;
  secondPaymentDueDate?: string;
  payerLabel: string;
  recipientLabel: string;
  paymentMethodExpected?: string;
  agencyOrCaseNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChildSupportPayment {
  id: Id;
  caseId: Id;
  childSupportOrderId: Id;
  userId: Id;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  paymentDate?: string;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseItem {
  id: Id;
  caseId: Id;
  userId: Id;
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  paidByLabel: string;
  reimbursementRequested: boolean;
  reimbursementDueDate?: string;
  amountReimbursed?: number;
  reimbursementDate?: string;
  reimbursementStatus: ReimbursementStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: Id;
  userId: Id;
  caseId?: Id;
  entityType: string;
  entityId: Id;
  action: AuditAction;
  timestamp: string;
  metadataSummary: string;
  ipHash?: string;
  userAgentHash?: string;
}

export interface TimelineDesignation {
  id: Id;
  caseId: Id;
  userId: Id;
  eventId: Id;
  severity: TimelineSeverity;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: Id;
  caseId: Id;
  date: string;
  time?: string;
  sortAt?: string;
  type: CalendarEventType;
  title: string;
  detail?: string;
  summary?: string;
  body?: string;
  tags?: string[];
  severity?: TimelineSeverity;
  severitySource?: "automatic" | "user";
  sourceLabel?: string;
  relatedIds?: Id[];
  includeInReports?: boolean;
}

export interface RecordsDataset {
  users: UserProfile[];
  matters: CustodyMatter[];
  exchangeRules: CustodyExchangeRule[];
  scheduleExceptions: ScheduleException[];
  custodyDayAssignments: CustodyDayAssignment[];
  exchangeLogs: ExchangeLog[];
  dateNotes: DateNote[];
  evidenceItems: EvidenceItem[];
  childSupportOrders: ChildSupportOrder[];
  childSupportPayments: ChildSupportPayment[];
  expenseItems: ExpenseItem[];
  timelineDesignations: TimelineDesignation[];
  auditLogs: AuditLog[];
}

export interface DateRange {
  from: string;
  to: string;
}
