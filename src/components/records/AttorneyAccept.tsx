"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { attorneyMutation } from "@/lib/records/attorneyClient";

type AcceptanceState = "preparing" | "email_sent" | "error";

export default function AttorneyAccept() {
  const [state, setState] = useState<AcceptanceState>("preparing");
  const [message, setMessage] = useState("Preparing the secure invitation…");
  const requestStarted = useRef(false);

  const sendSecureLink = useCallback(async (token = "") => {
    setState("preparing");
    setMessage("Sending a secure access link to the invited email address…");
    try {
      const result = await attorneyMutation("/api/records/attorney/accept/prepare", {
        ...(token ? { token } : {}),
      });
      setState("email_sent");
      setMessage(
        String(result.message || "A secure access link was sent to the invited email address.")
      );
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The invitation could not be prepared. Ask the record owner to create a new link."
      );
    }
  }, []);

  useEffect(() => {
    if (requestStarted.current) return;
    requestStarted.current = true;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = fragment.get("token") || "";
    window.history.replaceState(null, "", "/attorney/accept");
    const timer = window.setTimeout(() => void sendSecureLink(token), 0);
    return () => window.clearTimeout(timer);
  }, [sendSecureLink]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f6] px-4 py-10 text-slate-950">
      <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Attorney guest access
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Open a read only shared case</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Custody Folio verifies the invited email before opening the case. No parent account setup is
          required. Access is limited to the selected case, remains read only, expires after 30 days,
          and can be revoked by the record owner.
        </p>
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
        >
          {message}
        </p>
        {state === "email_sent" ? (
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Open the Custody Folio message in the invited mailbox and select the secure access link.
            That link will take you directly to the shared case.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {state === "email_sent" || state === "error" ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => void sendSecureLink()}
            >
              Send another secure link
            </button>
          ) : null}
          <Link href="/" className="btn-secondary">Custody Folio home</Link>
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">
          Custody Folio organizes user provided information. It does not verify allegations, provide
          legal advice, guarantee admissibility, create representation, or automatically create
          attorney client privilege.
        </p>
      </section>
    </main>
  );
}
