"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import PolicyFooter from "@/components/PolicyFooter";
import { getRecordsCsrfToken } from "@/lib/records/attorneyClient";
import {
  requestRecordsEmailCode,
  verifyRecordsEmailCode,
} from "@/lib/records/clientStore";
import { recordsTagline, siteName } from "@/lib/site";

export default function AttorneySignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [codeRequested, setCodeRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const returnHandled = useRef(false);

  useEffect(() => {
    if (returnHandled.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") !== "attorney-return") return;
    returnHandled.current = true;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = fragment.get("access_token") || "";
    const refreshToken = fragment.get("refresh_token") || "";
    const expiresIn = fragment.get("expires_in") || "3600";
    window.history.replaceState(null, "", "/attorney/sign-in");
    if (!accessToken || !refreshToken) {
      setError("Secure attorney sign-in link is invalid or expired.");
      return;
    }
    setBusy(true);
    setMessage("Verifying the secure attorney sign-in link…");
    void getRecordsCsrfToken()
      .then(async (csrf) => {
        const response = await fetch("/api/records/attorney/auth/session", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-L2F-CSRF": csrf },
          body: JSON.stringify({ accessToken, refreshToken, expiresIn }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Secure attorney sign-in failed.");
        window.location.replace("/attorney");
      })
      .catch((returnError: unknown) => {
        setMessage("");
        setError(returnError instanceof Error ? returnError.message : "Secure attorney sign-in failed.");
      })
      .finally(() => setBusy(false));
  }, []);

  function identityIsValid() {
    if (!email.trim().includes("@") || !adultConfirmed || !legalAccepted) {
      setError("Enter your attorney email, confirm adult use, and accept the current policies.");
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
      setCodeRequested(true);
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
      setError("Enter the 6-digit code from your email.");
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
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-4 sm:px-6">
        <header>
          <Link href="/" className="inline-flex items-center gap-3">
            <Image src="/app-icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-md bg-slate-950" />
            <span><span className="block text-sm font-semibold">{siteName}</span><span className="block text-xs text-slate-500">{recordsTagline}</span></span>
          </Link>
        </header>

        <section className="mx-auto grid w-full max-w-lg flex-1 place-items-center py-8">
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Attorney portal</p>
            <h1 className="mt-2 text-2xl font-semibold">Open shared matters</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use the email address connected to your invitation. We will send a one-time code; no password or authenticator app is required.
            </p>
            <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4" aria-labelledby="returning-attorney-steps-heading">
              <h2 id="returning-attorney-steps-heading" className="text-sm font-semibold text-slate-900">Returning attorney sign-in</h2>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-5 text-slate-700">
                <li>Enter the exact email used for your attorney account.</li>
                <li>Enter the 6-digit code sent to that mailbox.</li>
                <li>Choose a client and matter. Access remains read-only until it is revoked or you leave.</li>
              </ul>
            </section>

            {message ? <p role="status" className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">{message}</p> : null}
            {error ? <p role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}

            <form onSubmit={codeRequested ? verifyCode : requestCode} className="mt-5 space-y-4">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                Attorney account email
                <input value={email} onChange={(event) => setEmail(event.currentTarget.value)} readOnly={codeRequested} type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" className="input" />
              </label>
              {codeRequested ? (
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  6-digit email code
                  <input value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className="input text-center font-mono text-lg tracking-[0.3em]" autoFocus />
                </label>
              ) : null}
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.currentTarget.checked)} className="mt-1 size-5 shrink-0" />
                <span>I am the adult attorney using this read-only account.</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.currentTarget.checked)} className="mt-1 size-5 shrink-0" />
                <span>I agree to the current <Link href="/terms" target="_blank" className="font-semibold text-teal-700 underline">Terms</Link> and acknowledge the <Link href="/privacy" target="_blank" className="font-semibold text-teal-700 underline">Privacy Policy</Link>.</span>
              </label>
              <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? (codeRequested ? "Verifying…" : "Sending…") : codeRequested ? "Open attorney portal" : "Email me a sign-in code"}</button>
              {codeRequested ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <button type="button" className="font-semibold text-teal-700" onClick={() => { setCodeRequested(false); setCode(""); setMessage(""); setError(""); }}>Use a different email</button>
                  <button type="button" disabled={busy} className="font-semibold text-teal-700" onClick={() => void requestCode()}>Send a new code</button>
                </div>
              ) : null}
            </form>

            <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
              Need an account? The client must first send an attorney invitation. There is no public attorney signup and no attorney subscription.
            </p>
          </div>
        </section>
      </div>
      <PolicyFooter recordsNote="Read-only attorney access remains available until the client revokes it or the attorney leaves the matter." />
    </main>
  );
}
