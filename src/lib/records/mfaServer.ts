import { defaultCaseIdForUser } from "./accountBoundary";

export interface RecordsTotpFactor {
  id: string;
  status?: string | null;
}

export function cleanMfaCode(value: unknown) {
  return typeof value === "string" ? value.replace(/\s/g, "") : "";
}

export function isValidMfaCode(value: string) {
  return /^\d{6,8}$/.test(value);
}

export function selectTotpFactorForVerification<T extends RecordsTotpFactor>(factors: readonly T[]) {
  return (
    factors.find((factor) => factor.status === "verified") ||
    factors.find((factor) => factor.status == null) ||
    null
  );
}

export function sessionFromMfaVerify(data: { user: { id: string; email?: string } }) {
  return {
    userId: data.user.id,
    caseId: defaultCaseIdForUser(data.user.id),
    email: data.user.email || "",
    authMode: "supabase" as const,
  };
}
