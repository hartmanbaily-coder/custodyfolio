"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { attorneyMutation, getRecordsCsrfToken } from "@/lib/records/attorneyClient";
import { readRecordsSession, signOutRecordsSession } from "@/lib/records/clientStore";

type AcceptanceState = "preparing" | "signed_out" | "accepting" | "accepted" | "error";

export default function AttorneyAccept() {
  const [state, setState] = useState<AcceptanceState>("preparing");
  const [message, setMessage] = useState("Preparing the secure invitation…");
  const acceptanceStarted = useRef(false);

  const accept = useCallback(async () => {
    if (acceptanceStarted.current) return;
    acceptanceStarted.current = true;
    setState("accepting");
    setMessage("Verifying the invitation and opening the shared case…");
    try {
      const result = await attorneyMutation("/api/records/attorney/accept", {});
      const accessHandle = String(result.accessHandle || "");
      if (!accessHandle) throw new Error("Invitation acceptance did not return shared access.");
      window.sessionStorage.setItem("l2f.attorney.access", accessHandle);
      setState("accepted");
      setMessage("Invitation accepted. Your 30-day read-only access period has started…");
      window.location.replace("/attorney");
    } catch (error) {
      acceptanceStarted.current = false;
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Invitation is invalid, expired, already used, or belongs to another account."
      );
    }
  }, []);

  async function changeAccount() {
    setState("preparing");
    setMessage("Signing out so you can use the invited attorney account…");
    try {
      await signOutRecordsSession();
    } catch {
      // The logout route clears local cookies even when global revocation cannot be confirmed.
    }
    window.location.replace("/records?next=/attorney/accept&invite=1");
  }

  useEffect(() => {
    let active = true;
    async function prepare() {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const token = fragment.get("token") || "";
      window.history.replaceState(null, "", "/attorney/accept");
      if (token) {
        try {
          const csrf = await getRecordsCsrfToken();
          await fetch("/api/records/attorney/accept/prepare", {
            method: "POST",
            cache: "no-store",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-L2F-CSRF": csrf },
            body: JSON.stringify({ token }),
          });
        } catch {
          // Keep the response generic; final acceptance performs authoritative validation.
        }
      }
      const session = await readRecordsSession().catch(() => ({ status: "signed_out" as const }));
      if (!active) return;
      if (session.status !== "signed_in") {
        setState("signed_out");
        setMessage("Sign in with the invited email account, or create that account, then complete authenticator verification.");
      } else {
        await accept();
      }
    }
    void prepare();
    return () => {
      active = false;
    };
  }, [accept]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f6] px-4 py-10 text-slate-950">
      <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Attorney guest access</p>
        <h1 className="mt-2 text-2xl font-semibold">Accept a read-only invitation</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Acceptance starts 30 days of read-only access, during which you may return as often as needed.
          Custody Folio organizes user provided information. It does not verify allegations, provide legal advice,
          guarantee admissibility, create representation, or automatically create attorney-client privilege.
        </p>
        <p role="status" aria-live="polite" className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {message}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {state === "signed_out" ? (
            <>
              <Link href="/records?next=/attorney/accept&invite=1" className="btn-primary">Sign in and verify MFA</Link>
              <Link href="/records?next=/attorney/accept&invite=1&mode=signup" className="btn-secondary">Create attorney account</Link>
            </>
          ) : null}
          {state === "error" ? (
            <>
              <button type="button" className="btn-primary" onClick={() => void accept()}>
                Try accepting again
              </button>
              <button type="button" className="btn-secondary" onClick={() => void changeAccount()}>
                Use a different account
              </button>
            </>
          ) : null}
          {state === "accepted" ? <Link href="/attorney" className="btn-secondary">Open attorney portal</Link> : null}
          <Link href="/records" className="btn-secondary">My Records</Link>
        </div>
      </section>
    </main>
  );
}
