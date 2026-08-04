"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { attorneyMutation } from "@/lib/records/attorneyClient";
import {
  attorneyInvitationDurationDays,
  maxBrowserTimeoutMs,
} from "@/lib/records/attorneyPolicy";

type Invitation = {
  handle: string;
  email: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  caseId: string;
  accessExpiresAt: string | null;
  accessActive: boolean;
};

type Grant = {
  handle: string;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  leftAt: string | null;
  active: boolean;
};

type AccessEvent = {
  type: string;
  createdAt: string;
  metadata: Record<string, string>;
};

type AttorneyAccessState = {
  invitations: Invitation[];
  grants: Grant[];
  events: AccessEvent[];
  delivery: "owner_share" | "development_link" | "not_configured";
  featureEnabled: boolean;
};

function eventLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default function AttorneyAccessPanel({
  caseId,
  cloudStorageEnabled,
}: {
  caseId: string;
  cloudStorageEnabled: boolean;
}) {
  const [state, setState] = useState<AttorneyAccessState | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");

  const load = useCallback(async () => {
    if (!cloudStorageEnabled) return;
    try {
      const response = await fetch("/api/records/attorney/invitations", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => ({}))) as AttorneyAccessState & { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to load attorney access.");
      setState(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load attorney access.");
    }
  }, [cloudStorageEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const nextExpiry = state?.grants
      .filter((grant) => grant.active)
      .map((grant) => grant.expiresAt ? new Date(grant.expiresAt).getTime() : Number.NaN)
      .filter((value) => value > Date.now())
      .sort((left, right) => left - right)[0];
    if (!nextExpiry) return;
    const timer = window.setTimeout(
      () => void load(),
      Math.min(Math.max(0, nextExpiry - Date.now()) + 250, maxBrowserTimeoutMs)
    );
    return () => window.clearTimeout(timer);
  }, [load, state?.grants]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("attorneyEmail") || "");
    setBusy("create");
    setMessage("");
    setInvitationUrl("");
    try {
      const result = await attorneyMutation("/api/records/attorney/invitations", { email, caseId });
      setInvitationUrl(String(result.invitationUrl || ""));
      setMessage("Invitation created. Share the private link with the intended attorney. Accepted read-only access remains active until you revoke it.");
      form.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create invitation.");
    } finally {
      setBusy("");
    }
  }

  async function reinvite(invitation: Invitation) {
    setBusy(invitation.handle);
    setMessage("");
    setInvitationUrl("");
    try {
      const result = await attorneyMutation("/api/records/attorney/invitations", {
        email: invitation.email,
        caseId: invitation.caseId,
      });
      setInvitationUrl(String(result.invitationUrl || ""));
      setMessage("A new invitation was created. Accepted read-only access remains active until you revoke it. The prior access remains ended.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create a new invitation.");
    } finally {
      setBusy("");
    }
  }

  async function invitationAction(invitation: Invitation, action: "resend" | "revoke") {
    setBusy(invitation.handle);
    setMessage("");
    setInvitationUrl("");
    try {
      const result = await attorneyMutation("/api/records/attorney/invitations/action", {
        handle: invitation.handle,
        action,
      });
      setInvitationUrl(String(result.invitationUrl || ""));
      setMessage(action === "revoke" ? "Attorney access revoked immediately." : "A new invitation replaced the prior link.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update invitation.");
    } finally {
      setBusy("");
    }
  }

  async function copyInvitationLink() {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setMessage("Private invitation link copied.");
    } catch {
      setMessage("The link could not be copied automatically. Press and hold the link to copy it.");
    }
  }

  async function shareInvitationLink() {
    if (!invitationUrl) return;
    if (typeof navigator.share !== "function") {
      await copyInvitationLink();
      return;
    }
    try {
      await navigator.share({
        title: "Custody Folio attorney access",
        text: "Private read-only attorney access invitation. Open this link using the attorney account that was invited.",
        url: invitationUrl,
      });
      setMessage("Invitation share sheet opened.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("The invitation could not be shared. Copy the private link instead.");
    }
  }

  if (!cloudStorageEnabled) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-950">Attorney access</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Sign in to private cloud storage to invite an attorney to a read-only shared matter.
        </p>
      </section>
    );
  }

  const activeGrant = state?.grants.some((grant) => grant.active) || false;
  const pending = state?.invitations.find((invitation) => invitation.status === "pending");
  const newInvitationsEnabled = state?.featureEnabled === true;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="attorney-access-heading">
      <div>
        <div>
          <h2 id="attorney-access-heading" className="font-semibold text-slate-950">Attorney read-only access</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            One invited adult attorney account can view this case and download reports and evidence until you revoke access.
            This does not establish representation or attorney-client privilege.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
        Revocation blocks future requests immediately, but Custody Folio cannot recall copies already downloaded.
        Access history records dates and actions without including record contents. Deleting the case or account ends access.
      </div>

      {state?.delivery === "not_configured" ? (
        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Attorney invitations are temporarily unavailable.
        </p>
      ) : null}
      {state?.delivery === "owner_share" ? (
        <p className="mt-3 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-950">
          Custody Folio does not email this invitation. After creating it, use Share Link, Copy Link, or the QR code to deliver it through a channel you trust.
        </p>
      ) : null}
      {!newInvitationsEnabled ? (
        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          New attorney invitations are temporarily unavailable. Existing access can still be reviewed or revoked.
        </p>
      ) : null}

      <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Attorney email
          <input name="attorneyEmail" type="email" autoComplete="email" className="input" required maxLength={254} disabled={!newInvitationsEnabled || activeGrant || Boolean(pending)} />
        </label>
        <button type="submit" className="btn-primary self-end" disabled={!newInvitationsEnabled || busy === "create" || activeGrant || Boolean(pending)}>
          {busy === "create" ? "Creating…" : "Create invitation"}
        </button>
      </form>

      {invitationUrl ? (
        <div className="mt-3 rounded-md border border-teal-200 bg-teal-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-900">Private invitation link</p>
          <p className="mt-1 text-xs leading-5 text-teal-950">
            This link is shown only for sharing now. It expires in {attorneyInvitationDurationDays} days and becomes unusable after acceptance. Accepted access remains active until you revoke it.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[132px_1fr] sm:items-center">
            <div className="w-fit rounded-md border border-teal-200 bg-white p-2" aria-label="Attorney invitation QR code">
              <QRCode value={invitationUrl} size={112} bgColor="#ffffff" fgColor="#0f172a" />
            </div>
            <div className="min-w-0">
              <p className="break-all rounded border border-teal-200 bg-white p-2 font-mono text-[11px] leading-4 text-slate-700">
                {invitationUrl}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={() => void shareInvitationLink()}>
                  Share link
                </button>
                <button type="button" className="btn-secondary" onClick={() => void copyInvitationLink()}>
                  Copy link
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {message ? <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-700">{message}</p> : null}

      <div className="mt-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Invitations and grants</h3>
        {state?.invitations.length ? state.invitations.map((invitation) => (
          <div key={invitation.handle} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-medium text-slate-900">{invitation.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {eventLabel(invitation.status)} · created {new Date(invitation.createdAt).toLocaleString()}
                  {invitation.acceptedAt ? ` · granted ${new Date(invitation.acceptedAt).toLocaleString()}` : ""}
                  {invitation.accessActive ? " · active until revoked" : invitation.accessExpiresAt ? ` · legacy access ended ${new Date(invitation.accessExpiresAt).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(invitation.status === "pending" || invitation.status === "expired") ? (
                  <button type="button" className="btn-secondary" disabled={busy === invitation.handle} onClick={() => void invitationAction(invitation, "resend")}>Replace with new link</button>
                ) : null}
                {invitation.status === "accepted" && invitation.accessExpiresAt && !invitation.accessActive ? (
                  <button type="button" className="btn-secondary" disabled={busy === invitation.handle || !newInvitationsEnabled || Boolean(pending)} onClick={() => void reinvite(invitation)}>Invite again</button>
                ) : null}
                {(invitation.status === "pending" || (invitation.status === "accepted" && invitation.accessActive)) ? (
                  <button type="button" className="btn-secondary text-red-700" disabled={busy === invitation.handle} onClick={() => void invitationAction(invitation, "revoke")}>Revoke access</button>
                ) : null}
              </div>
            </div>
          </div>
        )) : <p className="text-sm text-slate-500">No attorney invitations yet.</p>}
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-900">Privacy safe access history</h3>
        <ul className="mt-2 space-y-2 text-xs text-slate-600">
          {state?.events.length ? state.events.map((event, index) => (
            <li key={`${event.createdAt}-${index}`} className="rounded border border-slate-200 px-3 py-2">
              {eventLabel(event.type)} · {new Date(event.createdAt).toLocaleString()}
              {event.metadata.reportType ? ` · ${eventLabel(event.metadata.reportType)}` : ""}
            </li>
          )) : <li>No access activity recorded.</li>}
        </ul>
      </div>
    </section>
  );
}
