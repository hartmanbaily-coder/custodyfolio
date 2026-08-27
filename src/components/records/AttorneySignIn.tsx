"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import PolicyFooter from "@/components/PolicyFooter";
import { getRecordsCsrfToken } from "@/lib/records/attorneyClient";
import {
  requestRecordsPasswordReset,
  signInRecordsSession,
  verifyRecordsMfa,
  verifyRecordsMfaEnrollment,
} from "@/lib/records/clientStore";
import { recordsTagline, siteName } from "@/lib/site";

type MfaEnrollment = {
  factorId: string;
  qrCode: string;
  secret?: string;
};

function qrCodeSrc(qrCode: string) {
  if (qrCode.startsWith("data:image/")) return qrCode;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
}

export default function AttorneySignIn() {
  const [mode, setMode] = useState<"email" | "login" | "reset" | "mfa">("login");
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
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
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          mfaRequired?: boolean;
          mfaEnrollmentRequired?: boolean;
          enrollment?: MfaEnrollment;
        };
        if (response.status === 403 && body.mfaRequired) {
          setEnrollment(body.mfaEnrollmentRequired && body.enrollment ? body.enrollment : null);
          setMode("mfa");
          setMessage(
            body.mfaEnrollmentRequired
              ? "Email verified. Protect this attorney account with an authenticator app."
              : "Email verified. Enter the current code from your authenticator app."
          );
          return;
        }
        if (!response.ok) throw new Error(body.error || "Secure attorney sign-in failed.");
        window.location.replace("/attorney");
      })
      .catch((returnError: unknown) => {
        setMessage("");
        setError(returnError instanceof Error ? returnError.message : "Secure attorney sign-in failed.");
      })
      .finally(() => setBusy(false));
  }, []);

  async function emailSignInLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const adultConfirmed = form.get("adult") === "on";
    if (!email.includes("@") || !adultConfirmed) {
      setError("Enter your attorney account email and confirm adult use.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/records/attorney/auth/link", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, adultConfirmed }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "Unable to request secure attorney sign-in.");
      setMessage(body.message || "If that email has an active attorney matter, a secure sign-in link will arrive shortly.");
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Unable to request secure attorney sign-in.");
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const adultConfirmed = form.get("adult") === "on";
    if (!email.includes("@") || !password || !adultConfirmed) {
      setError("Enter your email and password, then confirm adult use.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await signInRecordsSession(email, password, adultConfirmed, "attorney");
      if (result.status === "mfa_required") {
        setEnrollment(null);
        setMode("mfa");
        setMessage("Password accepted. Enter the current code from your authenticator app.");
        return;
      }
      if (result.status === "mfa_enrollment_required") {
        setEnrollment(result.enrollment);
        setMode("mfa");
        setMessage("Protect this attorney account with an authenticator app.");
        return;
      }
      window.location.replace("/attorney");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "").trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit authenticator code.");
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

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const adultConfirmed = form.get("adult") === "on";
    if (!email.includes("@") || !adultConfirmed) {
      setError("Enter your email and confirm adult use.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await requestRecordsPasswordReset(email, adultConfirmed);
      setMessage(`${result.message} After changing it, return here to open your shared matters.`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Password reset failed.");
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
            <h1 className="mt-2 text-2xl font-semibold">
              {mode === "mfa" ? "Verify authenticator" : mode === "reset" ? "Reset password" : "Open shared matters"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Attorney accounts are free, invitation-gated, and limited to read-only matters a client has shared.
            </p>

            {mode === "login" ? (
              <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4" aria-labelledby="returning-attorney-steps-heading">
                <h2 id="returning-attorney-steps-heading" className="text-sm font-semibold text-slate-900">
                  Returning attorney sign-in
                </h2>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-5 text-slate-700">
                  <li>Enter the email and password for your free attorney account.</li>
                  <li>Enter the current code from your authenticator app when prompted.</li>
                  <li>Choose a client and matter from the attorney portal. Access remains read-only until the client revokes it or you leave.</li>
                </ul>
              </section>
            ) : null}

            {message ? <p role="status" className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">{message}</p> : null}
            {error ? <p role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}

            {mode === "mfa" ? (
              <form onSubmit={verifyMfa} className="mt-5 space-y-4">
                {enrollment ? (
                  <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                    {/* Supabase supplies a QR image or SVG data URI for the TOTP enrollment. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrCodeSrc(enrollment.qrCode)} alt="Authenticator setup QR code" className="mx-auto h-48 w-48" />
                    {enrollment.secret ? <p className="break-all text-xs text-slate-600">Manual setup key: <span className="font-mono">{enrollment.secret}</span></p> : null}
                  </div>
                ) : null}
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">6-digit code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className="input" /></label>
                <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Verifying…" : "Open attorney portal"}</button>
              </form>
            ) : mode === "reset" ? (
              <form onSubmit={resetPassword} className="mt-5 space-y-4">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">Email<input name="email" type="email" autoComplete="email" className="input" /></label>
                <label className="flex items-start gap-2 text-sm text-slate-700"><input name="adult" type="checkbox" className="mt-1" /><span>I am the adult owner of this attorney account.</span></label>
                <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
                <button type="button" className="btn-secondary w-full" onClick={() => { setMode("email"); setError(""); setMessage(""); }}>Back to sign in</button>
              </form>
            ) : mode === "email" ? (
              <form onSubmit={emailSignInLink} className="mt-5 space-y-4">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">Attorney account email<input name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" className="input" /></label>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input name="adult" type="checkbox" className="mt-1" />
                  <span>
                    I am the adult attorney using this read-only account and, by continuing, agree to the current <Link href="/terms" target="_blank" className="font-semibold text-teal-700 underline">Terms</Link> and acknowledge the <Link href="/privacy" target="_blank" className="font-semibold text-teal-700 underline">Privacy Policy</Link>.
                  </span>
                </label>
                <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Email secure sign-in link"}</button>
                <button type="button" className="btn-secondary w-full" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Use password instead</button>
              </form>
            ) : (
              <form onSubmit={login} className="mt-5 space-y-4">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">Email<input name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" className="input" /></label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">Password<input name="password" type="password" autoComplete="current-password" className="input" /></label>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input name="adult" type="checkbox" className="mt-1" />
                  <span>
                    I am the adult attorney using this read-only account and, by signing in, agree to the current <Link href="/terms" target="_blank" className="font-semibold text-teal-700 underline">Terms</Link> and acknowledge the <Link href="/privacy" target="_blank" className="font-semibold text-teal-700 underline">Privacy Policy</Link>.
                  </span>
                </label>
                <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Open attorney portal"}</button>
                <button type="button" className="w-full text-sm font-semibold text-teal-700" onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Forgot password?</button>
                <button type="button" className="w-full text-sm font-semibold text-teal-700" onClick={() => { setMode("email"); setError(""); setMessage(""); }}>Email a sign-in link instead</button>
              </form>
            )}

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
