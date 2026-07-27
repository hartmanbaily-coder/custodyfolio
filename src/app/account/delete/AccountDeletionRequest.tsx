"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getRecordsCsrfToken } from "@/lib/records/attorneyClient";
import { notifyNativeSessionInvalidated } from "@/lib/records/clientStore";
import { accountDeletionMailto } from "@/lib/site";

type SessionStatus = "checking" | "authenticated" | "unauthenticated" | "unavailable";

type RequestState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; deletedAt: string; message: string }
  | { status: "error"; message: string };

export function AccountDeletionRequest() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("checking");
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const response = await fetch("/api/records/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (cancelled) return;

        if (response.ok) {
          const body = (await response.json()) as { session?: { email?: string } };
          setEmail(body.session?.email || "");
          setSessionStatus("authenticated");
          return;
        }

        setSessionStatus(response.status === 401 || response.status === 403 ? "unauthenticated" : "unavailable");
      } catch {
        if (!cancelled) setSessionStatus("unavailable");
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitDeletionRequest() {
    if (!confirmed || sessionStatus !== "authenticated") return;

    setRequestState({ status: "submitting" });
    try {
      const csrf = await getRecordsCsrfToken();
      const response = await fetch("/api/records/account/deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-L2F-CSRF": csrf },
        credentials: "same-origin",
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        deletedAt?: string;
        clearLocalSession?: boolean;
      };

      if (body.clearLocalSession === true || (response.ok && body.deletedAt)) {
        notifyNativeSessionInvalidated();
      }

      if (!response.ok || !body.deletedAt) {
        setRequestState({
          status: "error",
          message:
            body.error ||
            "Unable to delete the account. Sign in again or contact support.",
        });
        return;
      }

      setRequestState({
        status: "success",
        deletedAt: body.deletedAt,
        message: body.message || "Your account was permanently deleted.",
      });
    } catch {
      setRequestState({
        status: "error",
        message: "Unable to delete the account. Check your connection and try again.",
      });
    }
  }

  const canSubmit =
    sessionStatus === "authenticated" && confirmed && requestState.status !== "submitting";

  if (requestState.status === "success") {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h2 className="text-base font-semibold">Account deleted</h2>
        <p className="mt-3">{requestState.message}</p>
        <p className="mt-2 text-xs">
          Completed {new Date(requestState.deletedAt).toLocaleString()}.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900 transition hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        >
          Return to home page
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-base font-semibold text-slate-950">Permanently delete account</h2>
      <p className="mt-3">
        This is self-service deletion, not a request for approval. After you confirm, your account,
        active records, and private evidence files will be deleted immediately and you will be signed out.
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        {sessionStatus === "checking" && <p>Checking records sign-in status...</p>}
        {sessionStatus === "authenticated" && (
          <p>
            Signed in as{" "}
            <span className="font-semibold text-slate-900">{email || "your records account"}</span>.
          </p>
        )}
        {sessionStatus === "unauthenticated" && (
          <p>
            Sign in and complete authenticator verification first, then return to this page to delete
            the account.
          </p>
        )}
        {sessionStatus === "unavailable" && (
          <p>
            We could not verify your sign-in. Try again or contact support from the email address
            connected to your account.
          </p>
        )}
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
        />
        <span>
          I understand this will permanently delete my account and associated Custody Folio
          records. This cannot be undone. Limited copies may remain temporarily in backups or when
          retention is required by law.
        </span>
      </label>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={submitDeletionRequest}
          disabled={!canSubmit}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white transition hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          {requestState.status === "submitting" ? "Deleting account..." : "Permanently delete my account"}
        </button>
        <Link
          href="/records"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-100"
        >
          Open records workspace
        </Link>
        <a
          href={accountDeletionMailto}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-100"
        >
          Email support instead
        </a>
      </div>

      {requestState.status === "error" && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-900">
          {requestState.message}
        </div>
      )}
    </section>
  );
}
