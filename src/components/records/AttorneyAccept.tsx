"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import PolicyFooter from "@/components/PolicyFooter";
import { attorneyMutation } from "@/lib/records/attorneyClient";
import {
  signInRecordsSession,
  verifyRecordsMfa,
  verifyRecordsMfaEnrollment,
  type RecordsMfaEnrollment,
} from "@/lib/records/clientStore";

type AcceptanceState = "preparing" | "account" | "mfa" | "error";
type AccountMode = "create" | "sign_in";

function qrCodeSrc(qrCode: string) {
  if (qrCode.startsWith("data:image/")) return qrCode;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
}

export default function AttorneyAccept() {
  const [state, setState] = useState<AcceptanceState>("preparing");
  const [accountMode, setAccountMode] = useState<AccountMode>("create");
  const [enrollment, setEnrollment] = useState<RecordsMfaEnrollment | null>(null);
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
      setMessage(
        String(
          result.message ||
            "Invitation verified. Create or sign in to the invited attorney account below."
        )
      );
    } catch (prepareError) {
      setState("error");
      setMessage("");
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : "The invitation could not be opened. Ask the client to create a new link."
      );
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

  async function startAttorneySession(email: string, password: string) {
    const result = await signInRecordsSession(email, password, true, "attorney");
    if (result.status === "mfa_required") {
      setEnrollment(null);
      setState("mfa");
      setMessage("Password accepted. Enter the current code from your authenticator app.");
      return;
    }
    if (result.status === "mfa_enrollment_required") {
      setEnrollment(result.enrollment);
      setState("mfa");
      setMessage("Protect the attorney account with an authenticator app, then enter its code.");
      return;
    }
    window.location.replace("/attorney");
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    const adultConfirmed = form.get("adult") === "on";

    if (!email.includes("@") || !password || !adultConfirmed) {
      setError("Enter the invited email and password, then confirm adult use.");
      return;
    }
    if (accountMode === "create" && password.length < 12) {
      setError("Use a password with at least 12 characters.");
      return;
    }
    if (accountMode === "create" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (accountMode === "create") {
        await attorneyMutation("/api/records/attorney/accept/signup", {
          email,
          password,
          adultConfirmed,
        });
      }
      await startAttorneySession(email, password);
    } catch (accountError) {
      const nextError = accountError instanceof Error
        ? accountError.message
        : "The attorney account could not be opened.";
      if (nextError.includes("Sign in to existing account")) {
        setAccountMode("sign_in");
      }
      setError(nextError);
    } finally {
      setBusy(false);
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "").trim();
    if (!/^\d{6,8}$/.test(code)) {
      setError("Enter the current authenticator code.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (enrollment) {
        await verifyRecordsMfaEnrollment({ factorId: enrollment.factorId, code });
      } else {
        await verifyRecordsMfa(code);
      }
      window.location.replace("/attorney");
    } catch (mfaError) {
      setError(mfaError instanceof Error ? mfaError.message : "Authenticator code was not accepted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7f6] text-slate-950">
      <div className="grid min-h-screen place-items-center px-4 py-10">
        <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Attorney account access
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Open a read-only shared matter</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This private link is the only attorney invitation. Custody Folio will not send a second
            invitation email. Sign in or create the free attorney account named by the client, then
            complete authenticator verification.
          </p>

          <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4" aria-labelledby="attorney-start-heading">
            <h2 id="attorney-start-heading" className="text-sm font-semibold text-slate-900">
              Before you begin
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-5 text-slate-700">
              <li><strong>Use the exact email address the client invited.</strong> A different email cannot open the matter.</li>
              <li><strong>Choose Create account</strong> if this is your first Custody Folio invitation, or <strong>Sign in</strong> if you already have an attorney account.</li>
              <li><strong>Have an authenticator app ready.</strong> After your password, you will scan a QR code or enter a setup key and submit the current code.</li>
              <li><strong>Complete every step on this page.</strong> No second invitation email will arrive. Successful verification opens your read-only shared matters.</li>
            </ul>
          </section>

          {message ? (
            <p role="status" aria-live="polite" className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">
              {message}
            </p>
          ) : null}
          {error ? <p role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}

          {state === "account" ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-2" aria-label="Attorney account choice">
                <button
                  type="button"
                  className={accountMode === "create" ? "btn-primary" : "btn-secondary"}
                  onClick={() => { setAccountMode("create"); setError(""); }}
                >
                  Create account
                </button>
                <button
                  type="button"
                  className={accountMode === "sign_in" ? "btn-primary" : "btn-secondary"}
                  onClick={() => { setAccountMode("sign_in"); setError(""); }}
                >
                  Sign in
                </button>
              </div>
              <form onSubmit={submitAccount} className="mt-5 space-y-4">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  Invited attorney email
                  <input name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" className="input" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  {accountMode === "create" ? "Create password" : "Password"}
                  <input name="password" type="password" autoComplete={accountMode === "create" ? "new-password" : "current-password"} className="input" />
                </label>
                {accountMode === "create" ? (
                  <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                    Confirm password
                    <input name="confirmPassword" type="password" autoComplete="new-password" className="input" />
                  </label>
                ) : null}
                <label className="flex items-start gap-2 text-sm leading-5 text-slate-700">
                  <input name="adult" type="checkbox" defaultChecked className="mt-1" />
                  <span>I am the adult attorney invited to this read-only matter.</span>
                </label>
                <button type="submit" className="btn-primary w-full" disabled={busy}>
                  {busy ? "Opening…" : accountMode === "create" ? "Create account and continue" : "Sign in and continue"}
                </button>
              </form>
            </>
          ) : null}

          {state === "mfa" ? (
            <form onSubmit={verifyMfa} className="mt-5 space-y-4">
              <section className="rounded-md border border-slate-200 bg-slate-50 p-4" aria-labelledby="attorney-mfa-steps-heading">
                <h2 id="attorney-mfa-steps-heading" className="text-sm font-semibold text-slate-900">
                  {enrollment ? "Set up your authenticator" : "Verify your authenticator"}
                </h2>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-5 text-slate-700">
                  {enrollment ? (
                    <>
                      <li>Open your authenticator app and scan the QR code below, or enter the manual setup key.</li>
                      <li>Enter the current code shown for Custody Folio, then select Open attorney portal.</li>
                      <li>Keep this authenticator entry. You will use a new code from it whenever you sign in.</li>
                    </>
                  ) : (
                    <>
                      <li>Open the authenticator app already connected to your Custody Folio account.</li>
                      <li>Enter its current code below, then select Open attorney portal.</li>
                    </>
                  )}
                </ul>
              </section>
              {enrollment ? (
                <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                  {/* Supabase supplies a QR image or SVG data URI for TOTP enrollment. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCodeSrc(enrollment.qrCode)} alt="Authenticator setup QR code" className="mx-auto h-48 w-48" />
                  <p className="break-all text-xs text-slate-600">Manual setup key: <span className="font-mono">{enrollment.secret}</span></p>
                </div>
              ) : null}
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                Authenticator code
                <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} className="input" />
              </label>
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? "Verifying…" : "Open attorney portal"}
              </button>
            </form>
          ) : null}

          {state === "error" ? (
            <button type="button" className="btn-secondary mt-5" onClick={() => void prepareInvitation()}>
              Try this invitation again
            </button>
          ) : null}

          <div className="mt-5"><Link href="/" className="text-sm font-semibold text-teal-700">Custody Folio home</Link></div>
          <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
            Access remains read-only until the client revokes it or you leave the matter. Custody
            Folio does not verify allegations, provide legal advice, or establish representation.
          </p>
        </section>
      </div>
      <PolicyFooter recordsNote="Private single-link attorney onboarding. No second invitation email is sent." />
    </main>
  );
}
