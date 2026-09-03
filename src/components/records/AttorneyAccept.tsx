"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import PolicyFooter from "@/components/PolicyFooter";
import { attorneyMutation } from "@/lib/records/attorneyClient";
import {
  requestRecordsEmailCode,
  verifyRecordsEmailCode,
} from "@/lib/records/clientStore";

type AcceptanceState = "preparing" | "account" | "email_sent" | "error";

export default function AttorneyAccept() {
  const [state, setState] = useState<AcceptanceState>("preparing");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [message, setMessage] = useState("Verifying the private invitation…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestStarted = useRef(false);

  const prepareInvitation = useCallback(async (token = "") => {
    setState("preparing");
    setError("");
    setMessage("Verifying the private invitation…");
    try {
      const result = await attorneyMutation("/api/records/attorney/accept/prepare", {
        ...(token ? { token } : {}),
      });
      setState("account");
      setMessage(String(result.message || "Invitation verified. Enter the invited attorney email below."));
    } catch (prepareError) {
      setState("error");
      setMessage("");
      setError(prepareError instanceof Error ? prepareError.message : "The invitation could not be opened. Ask the client to create a new link.");
    }
  }, []);

  useEffect(() => {
    if (requestStarted.current) return;
    requestStarted.current = true;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = fragment.get("token") || "";
    window.history.replaceState(null, "", "/attorney/accept");
    const timer = window.setTimeout(() => void prepareInvitation(token), 0);
    return () => window.clearTimeout(timer);
  }, [prepareInvitation]);

  function identityIsValid() {
    if (!email.trim().includes("@") || !adultConfirmed || !legalAccepted) {
      setError("Enter the invited email, confirm adult use, and accept the current policies.");
      return false;
    }
    return true;
  }

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!identityIsValid()) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestRecordsEmailCode({
        email,
        adultConfirmed,
        legalAccepted,
        workspace: "attorney",
      });
      setState("email_sent");
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The email code could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identityIsValid()) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the invited email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await verifyRecordsEmailCode({
        email,
        code,
        adultConfirmed,
        legalAccepted,
        workspace: "attorney",
      });
      if (result.attorneyAccessHandle) {
        window.sessionStorage.setItem("l2f.attorney.access", result.attorneyAccessHandle);
      }
      window.location.replace("/attorney");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "The email code was not accepted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fffdf9] text-slate-950">
      <div className="grid min-h-screen place-items-center px-4 py-10">
        <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Attorney account access</p>
          <h1 className="mt-2 text-2xl font-semibold">Open a read-only shared matter</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This private invitation is bound to the attorney email named by the client. That mailbox is verified with a one-time code; no password or authenticator app is required.
          </p>

          <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4" aria-labelledby="attorney-start-heading">
            <h2 id="attorney-start-heading" className="text-sm font-semibold text-slate-900">Before you begin</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-5 text-slate-700">
              <li><strong>Use the exact email address the client invited.</strong> A different email cannot open the matter.</li>
              <li><strong>Request a code.</strong> Custody Folio sends a 6-digit, one-time code to that mailbox.</li>
              <li><strong>Enter the code here.</strong> A correct, current code opens the read-only attorney portal.</li>
            </ul>
          </section>

          {message ? <p role="status" aria-live="polite" className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">{message}</p> : null}
          {error ? <p role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}

          {state === "account" || state === "email_sent" ? (
            <form onSubmit={state === "email_sent" ? verifyCode : requestCode} className="mt-5 space-y-4">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                Invited attorney email
                <input value={email} onChange={(event) => setEmail(event.currentTarget.value)} readOnly={state === "email_sent"} type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" className="input" />
              </label>
              {state === "email_sent" ? (
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  6-digit email code
                  <input value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className="input text-center font-mono text-lg tracking-[0.3em]" autoFocus />
                </label>
              ) : null}
              <label className="flex items-start gap-2 text-sm leading-5 text-slate-700">
                <input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.currentTarget.checked)} className="mt-1 size-5 shrink-0" />
                <span>I am the adult attorney invited to this read-only matter.</span>
              </label>
              <label className="flex items-start gap-2 text-sm leading-5 text-slate-700">
                <input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.currentTarget.checked)} className="mt-1 size-5 shrink-0" />
                <span>I agree to the <Link href="/terms" className="font-semibold text-teal-700 underline underline-offset-2">Terms of Use</Link> and acknowledge the <Link href="/privacy" className="font-semibold text-teal-700 underline underline-offset-2">Privacy Policy</Link>.</span>
              </label>
              <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? (state === "email_sent" ? "Verifying…" : "Sending…") : state === "email_sent" ? "Open attorney portal" : "Email me a sign-in code"}</button>
              {state === "email_sent" ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <button type="button" className="font-semibold text-teal-700" onClick={() => { setState("account"); setCode(""); setMessage(""); setError(""); }}>Use a different email</button>
                  <button type="button" disabled={busy} className="font-semibold text-teal-700" onClick={() => void requestCode()}>Send a new code</button>
                </div>
              ) : null}
            </form>
          ) : null}

          {state === "error" ? <button type="button" className="btn-secondary mt-5" onClick={() => void prepareInvitation()}>Try this invitation again</button> : null}
          <div className="mt-5"><Link href="/" className="text-sm font-semibold text-teal-700">Custody Folio home</Link></div>
          <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
            Access remains read-only until the client revokes it or you leave the matter. Custody Folio does not verify allegations, provide legal advice, or establish representation.
          </p>
        </section>
      </div>
      <PolicyFooter recordsNote="Private attorney onboarding requires control of the invited email address." />
    </main>
  );
}
