"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBlankRecordsDataset,
  createEmptyRecordsDatasetForUser,
  createRecordsSeed,
  demoCaseId,
  demoUserId,
} from "./seed";
import {
  datasetAccountId,
  recordsAccountBindingHeaderName,
} from "./accountBoundary";
import { defaultRecordsTimezone, safeRecordsTimezone } from "./dateRanges";
import type { AuditAction, RecordsDataset } from "./types";

const storageKey = "l2f.records.dataset.v1";
const sessionKey = "l2f.records.session.v1";
const failedLoginKey = "l2f.records.failed-login.v1";
const remoteDatasetKey = "default";
const recordsStorageConnectionError =
  "Could not reach secure records storage. Check your connection and try saving again.";

export type RecordsStorageMode = "local" | "supabase";
export type RecordsSession = {
  userId: string;
  caseId: string;
  email: string;
  authMode: RecordsStorageMode;
};

export type RecordsMfaEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export type RecordsSignInResult =
  | { status: "signed_in"; session: RecordsSession }
  | { status: "mfa_required" }
  | { status: "mfa_enrollment_required"; enrollment: RecordsMfaEnrollment };

export type RecordsSessionReadResult =
  | { status: "signed_in"; session: RecordsSession }
  | { status: "mfa_required" }
  | { status: "signed_out" };

export type RecordsAuthMessage = {
  ok: boolean;
  message: string;
};

let remoteSessionStateRequest: Promise<RecordsSessionReadResult> | null = null;

export const recordsStorageMode: RecordsStorageMode =
  process.env.NEXT_PUBLIC_RECORDS_STORAGE_MODE === "supabase" ? "supabase" : "local";

function cloneDataset(dataset: RecordsDataset): RecordsDataset {
  return JSON.parse(JSON.stringify(dataset)) as RecordsDataset;
}

function browserRecordsTimezone() {
  if (typeof window === "undefined") return defaultRecordsTimezone;
  try {
    return safeRecordsTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return defaultRecordsTimezone;
  }
}

function normalizeDataset(dataset: Partial<RecordsDataset>, fallback: RecordsDataset): RecordsDataset {
  return {
    ...fallback,
    ...dataset,
    users: dataset.users || fallback.users,
    matters: dataset.matters || fallback.matters,
    exchangeRules: dataset.exchangeRules || fallback.exchangeRules,
    scheduleExceptions: dataset.scheduleExceptions || fallback.scheduleExceptions,
    custodyDayAssignments: dataset.custodyDayAssignments || fallback.custodyDayAssignments,
    exchangeLogs: dataset.exchangeLogs || fallback.exchangeLogs,
    dateNotes: dataset.dateNotes || fallback.dateNotes,
    evidenceItems: dataset.evidenceItems || fallback.evidenceItems,
    childSupportOrders: dataset.childSupportOrders || fallback.childSupportOrders,
    childSupportPayments: dataset.childSupportPayments || fallback.childSupportPayments,
    expenseItems: dataset.expenseItems || fallback.expenseItems,
    timelineDesignations: dataset.timelineDesignations || fallback.timelineDesignations,
    auditLogs: dataset.auditLogs || fallback.auditLogs,
  };
}

function readLocalDataset() {
  if (typeof window === "undefined") return createRecordsSeed();
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) return createRecordsSeed();

  try {
    return normalizeDataset(JSON.parse(stored) as Partial<RecordsDataset>, createRecordsSeed());
  } catch {
    return createRecordsSeed();
  }
}

function persistLocalDataset(dataset: RecordsDataset) {
  window.localStorage.setItem(storageKey, JSON.stringify(dataset));
}

function isFetchNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "TypeError" ||
    error.message === "Load failed" ||
    error.message === "Failed to fetch" ||
    error.message.includes("NetworkError")
  );
}

export async function fetchRecordsStorage(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  try {
    return await fetch(input, init);
  } catch (firstError) {
    if (!isFetchNetworkError(firstError)) throw firstError;
  }

  try {
    return await fetch(input, init);
  } catch (secondError) {
    if (!isFetchNetworkError(secondError)) throw secondError;
    throw new Error(recordsStorageConnectionError, { cause: secondError });
  }
}

export function parseRecordsSessionResponse(
  status: number,
  body: { session?: RecordsSession; error?: string; mfaRequired?: boolean }
): RecordsSessionReadResult {
  if (status === 403 && body.mfaRequired) return { status: "mfa_required" };
  if (status === 401) return { status: "signed_out" };
  if (status < 200 || status >= 300) {
    throw new Error(body.error || "Records session unavailable.");
  }
  if (!body.session?.userId || !body.session.email) {
    throw new Error("Records session response was invalid.");
  }

  return { status: "signed_in", session: body.session };
}

async function fetchRemoteSessionState() {
  const response = await fetch("/api/records/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = (await response.json().catch(() => ({}))) as {
    session?: RecordsSession;
    error?: string;
    mfaRequired?: boolean;
  };

  const state = parseRecordsSessionResponse(response.status, body);
  if (state.status === "signed_out") {
    notifyNativeSessionInvalidated();
  }
  return state;
}

async function readRemoteSessionState() {
  const request = remoteSessionStateRequest || fetchRemoteSessionState();
  remoteSessionStateRequest = request;

  try {
    return await request;
  } finally {
    if (remoteSessionStateRequest === request) {
      remoteSessionStateRequest = null;
    }
  }
}

async function readRemoteSession() {
  const state = await readRemoteSessionState();
  if (state.status === "signed_in") return state.session;
  if (state.status === "mfa_required") {
    throw new Error("Multi factor verification required.");
  }
  throw new Error("Sign in to your records workspace.");
}

async function readRemoteDataset(session: RecordsSession) {
  const response = await fetchRecordsStorage(
    `/api/records/dataset?caseId=${encodeURIComponent(remoteDatasetKey)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        [recordsAccountBindingHeaderName]: session.userId,
      },
    }
  );

  const body = (await response.json().catch(() => ({}))) as {
    dataset?: Partial<RecordsDataset> | null;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error || `Records dataset load failed with ${response.status}.`);
  }

  const emptyDataset = createEmptyRecordsDatasetForUser(
    session.userId,
    session.email,
    browserRecordsTimezone()
  );
  if (body.dataset) return normalizeDataset(body.dataset, emptyDataset);

  const initial = emptyDataset;
  await persistRemoteDataset(initial, session.userId);
  return initial;
}

async function persistRemoteDataset(dataset: RecordsDataset, accountId: string) {
  const response = await fetchRecordsStorage(
    `/api/records/dataset?caseId=${encodeURIComponent(remoteDatasetKey)}`,
    {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        [recordsAccountBindingHeaderName]: accountId,
      },
      body: JSON.stringify({ dataset }),
    }
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Records dataset save failed with ${response.status}.`);
  }
}

export function useRecordsStore() {
  const [dataset, setDataset] = useState<RecordsDataset>(() =>
    recordsStorageMode === "supabase" ? createBlankRecordsDataset() : createRecordsSeed()
  );
  const [hydrated, setHydrated] = useState(false);
  const [storageStatus, setStorageStatus] = useState(
    recordsStorageMode === "supabase" ? "Cloud records storage pending." : "Private drafting storage."
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const datasetRef = useRef(dataset);
  const remoteWriteChainRef = useRef<Promise<void>>(Promise.resolve());

  const setCurrentDataset = useCallback((next: RecordsDataset) => {
    datasetRef.current = next;
    setDataset(next);
  }, []);

  const persistDataset = useCallback((next: RecordsDataset) => {
    if (typeof window === "undefined") return Promise.resolve();

    if (recordsStorageMode === "supabase") {
      let accountId: string;
      try {
        accountId = datasetAccountId(next);
      } catch (error) {
        return Promise.reject(error);
      }
      const write = remoteWriteChainRef.current.then(() =>
        persistRemoteDataset(next, accountId)
      );
      remoteWriteChainRef.current = write.catch(() => undefined);
      return write
        .then(() => {
          setStorageStatus("Cloud records storage saved.");
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Cloud records storage save failed.";
          setStorageStatus(message);
          throw new Error(message);
        });
    }

    persistLocalDataset(next);
    return Promise.resolve();
  }, []);

  const reloadDataset = useCallback(async () => {
    try {
      if (recordsStorageMode === "supabase") {
        const remoteSession = await readRemoteSession();
        const remote = await readRemoteDataset(remoteSession);
        setCurrentDataset(remote);
        setStorageStatus("Cloud records storage connected.");
        setStorageError(null);
      } else {
        setCurrentDataset(readLocalDataset());
        setStorageStatus("Private drafting storage.");
        setStorageError(null);
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Records storage unavailable.";
      if (recordsStorageMode === "supabase") {
        setCurrentDataset(createBlankRecordsDataset());
      } else {
        setCurrentDataset(createRecordsSeed());
      }
      setStorageStatus(message);
      setStorageError(message);
      return false;
    } finally {
      setHydrated(true);
    }
  }, [setCurrentDataset]);

  const prepareForAccountBoundary = useCallback(() => {
    remoteWriteChainRef.current = Promise.resolve();
    setCurrentDataset(createBlankRecordsDataset());
    setHydrated(false);
    setStorageError(null);
    setStorageStatus("Cloud records storage pending.");
  }, [setCurrentDataset]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void reloadDataset();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [reloadDataset]);

  function updateDataset(updater: (current: RecordsDataset) => RecordsDataset) {
    const previous = datasetRef.current;
    const next = updater(cloneDataset(datasetRef.current));
    setCurrentDataset(next);
    return persistDataset(next).catch((error: unknown) => {
      if (datasetRef.current === next) setCurrentDataset(previous);
      throw error;
    });
  }

  function resetDemoData() {
    const currentProfile =
      dataset.users.find((user) => user.userId !== demoUserId) || dataset.users[0];
    const next =
      recordsStorageMode === "supabase" && currentProfile
        ? createEmptyRecordsDatasetForUser(
            currentProfile.userId,
            currentProfile.email,
            currentProfile.timezone || browserRecordsTimezone()
          )
        : createRecordsSeed();
    setCurrentDataset(next);
    void persistDataset(next)
      .then(() => setStorageStatus(recordsStorageMode === "supabase" ? "Cloud records storage reset." : "Private drafting storage."))
      .catch((error: unknown) =>
        setStorageStatus(error instanceof Error ? error.message : "Cloud records storage reset failed.")
      );
  }

  return {
    dataset,
    hydrated,
    updateDataset,
    resetDemoData,
    reloadDataset,
    storageStatus,
    storageError,
    recordsStorageMode,
    prepareForAccountBoundary,
  };
}

export function readSession() {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(sessionKey);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as RecordsSession;
  } catch {
    return null;
  }
}

export function writeSession(email: string) {
  const session = { userId: demoUserId, caseId: demoCaseId, email, authMode: "local" as const };
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
  return session;
}

export function clearSession() {
  window.localStorage.removeItem(sessionKey);
}

export async function readRecordsSession() {
  if (recordsStorageMode === "supabase") return readRemoteSessionState();
  const session = readSession();
  return session ? { status: "signed_in" as const, session } : { status: "signed_out" as const };
}

export async function signInRecordsSession(
  email: string,
  password: string,
  adultConfirmed: boolean
): Promise<RecordsSignInResult> {
  const response = await fetch("/api/records/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, adultConfirmed }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    session?: RecordsSession;
    error?: string;
    mfaRequired?: boolean;
    mfaEnrollmentRequired?: boolean;
    enrollment?: RecordsMfaEnrollment;
  };

  if (response.status === 403 && body.mfaRequired) {
    if (body.mfaEnrollmentRequired && body.enrollment?.factorId && body.enrollment.qrCode) {
      return { status: "mfa_enrollment_required", enrollment: body.enrollment };
    }
    return { status: "mfa_required" };
  }

  if (!response.ok || !body.session) {
    throw new Error(body.error || `Sign in failed with ${response.status}.`);
  }

  return { status: "signed_in", session: body.session };
}

export async function signUpRecordsAccount(
  email: string,
  password: string,
  adultConfirmed: boolean,
  invitedAttorney = false
): Promise<RecordsAuthMessage> {
  const endpoint = invitedAttorney
    ? "/api/records/attorney/accept/signup"
    : "/api/records/auth/signup";
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (invitedAttorney) {
    const csrfResponse = await fetch("/api/records/auth/csrf", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const csrfBody = (await csrfResponse.json().catch(() => ({}))) as {
      token?: string;
      error?: string;
    };
    if (!csrfResponse.ok || !csrfBody.token) {
      throw new Error(csrfBody.error || "Unable to prepare a secure request.");
    }
    headers["X-L2F-CSRF"] = csrfBody.token;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(
      invitedAttorney ? { email, adultConfirmed } : { email, password, adultConfirmed }
    ),
  });

  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
    detail?: string;
  };

  if (!response.ok) {
    throw new Error([body.error, body.detail].filter(Boolean).join(" ") || `Account creation failed with ${response.status}.`);
  }

  return {
    ok: body.ok === true,
    message:
      body.message ||
      (invitedAttorney
        ? "Look for “Your secure Custody Folio attorney access link” from Custody Folio and check junk or spam if it does not arrive within a few minutes."
        : "Step 1 of 2: check your email to confirm that you own the address. After you sign in, you will separately set up an authenticator as the second security factor."),
  };
}

export async function acceptAttorneyInviteSession(input: {
  accessToken: string;
  refreshToken: string;
  expiresIn?: string | number | null;
  onboardingToken: string;
}) {
  const csrfResponse = await fetch("/api/records/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const csrfBody = (await csrfResponse.json().catch(() => ({}))) as {
    token?: string;
    error?: string;
  };
  if (!csrfResponse.ok || !csrfBody.token) {
    throw new Error(csrfBody.error || "Unable to prepare secure attorney onboarding.");
  }

  const response = await fetch("/api/records/attorney/accept/session", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-L2F-CSRF": csrfBody.token,
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    accepted?: boolean;
    accessHandle?: string;
    accessExpiresAt?: string;
    error?: string;
  };
  if (
    !response.ok ||
    body.ok !== true ||
    body.accepted !== true ||
    !body.accessHandle ||
    !body.accessExpiresAt
  ) {
    throw new Error(body.error || `Attorney account link failed with ${response.status}.`);
  }
  return {
    accessHandle: body.accessHandle,
    accessExpiresAt: body.accessExpiresAt,
  };
}

export async function requestRecordsPasswordReset(
  email: string,
  adultConfirmed: boolean
): Promise<RecordsAuthMessage> {
  const response = await fetch("/api/records/auth/password/reset", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, adultConfirmed }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error || `Password reset failed with ${response.status}.`);
  }

  return {
    ok: body.ok === true,
    message: body.message || "If an account exists for that email, a password reset link will be sent.",
  };
}

export async function resendRecordsSignupConfirmation(
  email: string,
  adultConfirmed: boolean
): Promise<RecordsAuthMessage> {
  const response = await fetch("/api/records/auth/signup/resend", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, adultConfirmed }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error || `Confirmation resend failed with ${response.status}.`);
  }

  return {
    ok: body.ok === true,
    message:
      body.message ||
      "If an unconfirmed account exists for that email, a new confirmation link will be sent.",
  };
}

export async function acceptRecordsRecoverySession(input: {
  accessToken: string;
  refreshToken: string;
  expiresIn?: string | number | null;
}) {
  const response = await fetch("/api/records/auth/recovery/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `Recovery session failed with ${response.status}.`);
  }
}

export async function updateRecordsPassword(password: string): Promise<RecordsAuthMessage> {
  const response = await fetch("/api/records/auth/password/update", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error || `Password update failed with ${response.status}.`);
  }

  return {
    ok: body.ok === true,
    message: body.message || "Password updated. Sign in again with your new password.",
  };
}

async function verifyMfaAt(endpoint: string, body: Record<string, string>) {
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const parsed = (await response.json().catch(() => ({}))) as {
    session?: RecordsSession;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(parsed.error || `MFA verification failed with ${response.status}.`);
  }

  if (!parsed.session) {
    const state = await fetchRemoteSessionState().catch(() => null);
    if (state?.status === "signed_in") return state.session;
    if (state?.status === "mfa_required") {
      throw new Error("Authenticator verification did not complete. Enter a fresh code and try again.");
    }

    throw new Error(parsed.error || "MFA verification response was incomplete. Sign in and try again.");
  }

  return parsed.session;
}

export async function verifyRecordsMfa(code: string) {
  return verifyMfaAt("/api/records/auth/mfa/verify", { code });
}

export async function verifyRecordsMfaEnrollment(input: { factorId: string; code: string }) {
  return verifyMfaAt("/api/records/auth/mfa/enroll/verify", input);
}

export async function signOutRecordsSession() {
  if (recordsStorageMode !== "supabase") {
    notifyNativeSessionInvalidated();
    clearSession();
    return;
  }

  try {
    const response = await fetch("/api/records/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Server session revocation could not be confirmed.");
    }
  } finally {
    notifyNativeSessionInvalidated();
  }
}

export function readFailedLoginState() {
  if (typeof window === "undefined") return { count: 0, lockedUntil: 0 };
  const stored = window.localStorage.getItem(failedLoginKey);
  if (!stored) return { count: 0, lockedUntil: 0 };

  try {
    return JSON.parse(stored) as { count: number; lockedUntil: number };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

export function recordFailedLoginAttempt() {
  const current = readFailedLoginState();
  const nextCount = current.count + 1;
  const lockedUntil = nextCount >= 5 ? Date.now() + 5 * 60 * 1000 : current.lockedUntil;
  const next = { count: nextCount, lockedUntil };
  window.localStorage.setItem(failedLoginKey, JSON.stringify(next));
  return next;
}

export function clearFailedLoginAttempts() {
  window.localStorage.removeItem(failedLoginKey);
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

type NativeDownloadHandler = {
  postMessage: (message: {
    fileName: string;
    body: string;
    contentType: string;
    base64Encoded?: boolean;
    renderAsPDF?: boolean;
  }) => void;
};

type NativeChunkedDownloadHandler = {
  postMessage: (
    message:
      | {
          action: "start";
          transferId: string;
          fileName: string;
          contentType: string;
          byteCount: number;
        }
      | {
          action: "chunk";
          transferId: string;
          sequence: number;
          body: string;
        }
      | {
          action: "complete";
          transferId: string;
          chunks: number;
        }
      | {
          action: "cancel";
          transferId: string;
        }
  ) => void;
};

type NativeSessionHandler = {
  postMessage: (message: { action: "clearLocalSession" }) => void;
};

type NativeNavigationHandler = {
  postMessage: (message: {
    action: "historyChanged";
    canGoBack: boolean;
    canGoForward: boolean;
  }) => void;
};

type NativeAppearanceHandler = {
  postMessage: (message: {
    action: "setAppearance";
    preference: "system" | "light" | "dark";
  }) => void;
};

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        lostToFoundDownload?: NativeDownloadHandler;
        lostToFoundDownloadV2?: NativeChunkedDownloadHandler;
        lostToFoundNavigation?: NativeNavigationHandler;
        lostToFoundSession?: NativeSessionHandler;
        custodyFolioAppearance?: NativeAppearanceHandler;
      };
    };
  }
}

function nativeDownloadHandler() {
  if (typeof window === "undefined") return undefined;
  return window.webkit?.messageHandlers?.lostToFoundDownload;
}

function nativeChunkedDownloadHandler() {
  if (typeof window === "undefined") return undefined;
  return window.webkit?.messageHandlers?.lostToFoundDownloadV2;
}

export function notifyNativeSessionInvalidated() {
  if (typeof window === "undefined") return;
  window.webkit?.messageHandlers?.lostToFoundSession?.postMessage({
    action: "clearLocalSession",
  });
}

export function notifyNativeNavigationChanged({
  canGoBack,
  canGoForward,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
}) {
  if (typeof window === "undefined") return;
  window.webkit?.messageHandlers?.lostToFoundNavigation?.postMessage({
    action: "historyChanged",
    canGoBack,
    canGoForward,
  });
}

const browserDownloadUrlLifetimeMilliseconds = 60_000;

function downloadBlobFileInBrowser(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Safari may not read a blob URL until its download preview or print process
  // starts. Revoking it synchronously can leave that process on about:blank.
  setTimeout(() => URL.revokeObjectURL(url), browserDownloadUrlLifetimeMilliseconds);
}

export function downloadTextFile(fileName: string, body: string, contentType: string) {
  const nativeHandler = nativeDownloadHandler();
  if (nativeHandler) {
    nativeHandler.postMessage({ fileName, body, contentType });
    return;
  }

  downloadBlobFileInBrowser(fileName, new Blob([body], { type: contentType }));
}

export function shareHtmlAsPdf(fileName: string, html: string) {
  const nativeHandler = nativeDownloadHandler();
  if (!nativeHandler) return false;

  nativeHandler.postMessage({
    fileName,
    body: html,
    contentType: "text/html",
    renderAsPDF: true,
  });
  return true;
}

function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = "";

  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize));
  }

  return btoa(binary);
}

const nativeDownloadChunkBytes = 64 * 1024;
const maximumLegacyNativeDownloadBytes = 4 * 1024 * 1024;
const maximumChunkedNativeDownloadBytes = 25 * 1024 * 1024;

function yieldNativeDownloadTurn() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function downloadBlobFileInChunks(
  handler: NativeChunkedDownloadHandler,
  fileName: string,
  blob: Blob
) {
  if (blob.size > maximumChunkedNativeDownloadBytes) {
    throw new Error("This file exceeds the 25 MB protected-share limit.");
  }

  const transferId = createId("native-export");
  let chunks = 0;
  handler.postMessage({
    action: "start",
    transferId,
    fileName,
    contentType: blob.type || "application/octet-stream",
    byteCount: blob.size,
  });

  try {
    for (let offset = 0; offset < blob.size; offset += nativeDownloadChunkBytes) {
      const bytes = new Uint8Array(
        await blob.slice(offset, offset + nativeDownloadChunkBytes).arrayBuffer()
      );
      handler.postMessage({
        action: "chunk",
        transferId,
        sequence: chunks,
        body: bytesToBase64(bytes),
      });
      chunks += 1;
      await yieldNativeDownloadTurn();
    }
    handler.postMessage({ action: "complete", transferId, chunks });
  } catch (error) {
    handler.postMessage({ action: "cancel", transferId });
    throw error;
  }
}

export async function downloadBlobFile(fileName: string, blob: Blob) {
  const chunkedHandler = nativeChunkedDownloadHandler();
  if (chunkedHandler) {
    await downloadBlobFileInChunks(chunkedHandler, fileName, blob);
    return;
  }

  const nativeHandler = nativeDownloadHandler();
  if (nativeHandler) {
    if (blob.size > maximumLegacyNativeDownloadBytes) {
      throw new Error(
        "This file is too large for the installed TestFlight build. Update Custody Folio, or save it to Files instead."
      );
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    nativeHandler.postMessage({
      fileName,
      body: bytesToBase64(bytes),
      contentType: blob.type || "application/octet-stream",
      base64Encoded: true,
    });
    return;
  }

  downloadBlobFileInBrowser(fileName, blob);
}

export function withAudit(
  dataset: RecordsDataset,
  input: {
    userId: string;
    caseId?: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    metadataSummary: string;
  }
) {
  dataset.auditLogs.unshift({
    id: createId("audit"),
    timestamp: nowIso(),
    ...input,
  });
  return dataset;
}

export function useSelectedRecords(dataset: RecordsDataset, userId: string, caseId: string) {
  return useMemo(
    () => ({
      matters: dataset.matters.filter((item) => item.userId === userId),
      matter: dataset.matters.find((item) => item.userId === userId && item.id === caseId),
      exchangeRules: dataset.exchangeRules.filter(
        (item) => item.userId === userId && item.caseId === caseId
      ),
      custodyDayAssignments: dataset.custodyDayAssignments.filter(
        (item) => item.userId === userId && item.caseId === caseId
      ),
      exchangeLogs: dataset.exchangeLogs.filter(
        (item) => item.userId === userId && item.caseId === caseId
      ),
      dateNotes: dataset.dateNotes.filter((item) => item.userId === userId && item.caseId === caseId),
      evidenceItems: dataset.evidenceItems.filter(
        (item) => item.userId === userId && item.caseId === caseId
      ),
      childSupportOrders: dataset.childSupportOrders.filter(
        (item) => item.userId === userId && item.caseId === caseId
      ),
      childSupportPayments: dataset.childSupportPayments.filter(
        (item) => item.userId === userId && item.caseId === caseId
      ),
      expenseItems: dataset.expenseItems.filter(
        (item) => item.userId === userId && item.caseId === caseId
      ),
      auditLogs: dataset.auditLogs.filter(
        (item) => item.userId === userId && (!item.caseId || item.caseId === caseId)
      ),
    }),
    [dataset, userId, caseId]
  );
}
