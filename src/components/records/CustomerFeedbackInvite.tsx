"use client";

import { useEffect, useRef, useState } from "react";
import { sendAuthenticatedGrowthEvent } from "@/lib/marketing/client";
import { getRecordsCsrfToken } from "@/lib/records/attorneyClient";

type InviteState =
  | { status: "loading" }
  | { status: "hidden" }
  | { status: "ready"; saving: boolean; error: string }
  | { status: "accepted" };

export default function CustomerFeedbackInvite() {
  const [state, setState] = useState<InviteState>({ status: "loading" });
  const promptTracked = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadInvitation() {
      try {
        const response = await fetch("/api/records/customer-feedback", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const body = (await response.json().catch(() => ({}))) as {
          eligible?: boolean;
          choice?: string | null;
        };
        if (cancelled) return;
        if (!response.ok || !body.eligible || body.choice) {
          setState({ status: "hidden" });
          return;
        }
        setState({ status: "ready", saving: false, error: "" });
      } catch {
        if (!cancelled) setState({ status: "hidden" });
      }
    }

    void loadInvitation();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.status !== "ready" || promptTracked.current) return;
    promptTracked.current = true;
    void sendAuthenticatedGrowthEvent("customer_feedback_prompt_viewed");
  }, [state.status]);

  if (state.status === "loading" || state.status === "hidden") return null;

  if (state.status === "accepted") {
    return (
      <section
        className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950"
        aria-label="Customer feedback invitation accepted"
      >
        <p className="font-semibold">Thank you for helping improve Custody Folio.</p>
        <p className="mt-1 leading-6">
          You gave permission for one feedback message from support@custodyfolio.com. No message was sent by this action.
        </p>
      </section>
    );
  }

  async function saveChoice(choice: "opted_in" | "declined") {
    if (state.status !== "ready" || state.saving) return;
    setState({ status: "ready", saving: true, error: "" });
    try {
      const csrf = await getRecordsCsrfToken();
      const response = await fetch("/api/records/customer-feedback", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-L2F-CSRF": csrf,
        },
        body: JSON.stringify({ choice }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        choice?: string;
        cohortFull?: boolean;
      };
      if (!response.ok) {
        setState({
          status: "ready",
          saving: false,
          error: body.error || "Unable to save your choice right now.",
        });
        return;
      }
      if (body.cohortFull || body.choice === "cohort_full" || choice === "declined") {
        setState({ status: "hidden" });
        return;
      }
      setState({ status: "accepted" });
    } catch (error) {
      setState({
        status: "ready",
        saving: false,
        error: error instanceof Error ? error.message : "Unable to save your choice right now.",
      });
    }
  }

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-labelledby="customer-feedback-invitation"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Optional product feedback
      </p>
      <h2 id="customer-feedback-invitation" className="mt-2 text-lg font-semibold text-slate-950">
        Help improve Custody Folio
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        You have saved your first record. Would you be willing to provide feedback about how Custody Folio worked for you? We will discuss the product experience, not the contents of your records. Participation is optional and does not affect your trial or subscription.
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        If you choose Yes, Custody Folio may send one feedback message to your account email from support@custodyfolio.com. Do not send case facts, documents, evidence, names, or information about a child.
      </p>
      {state.error ? (
        <p className="mt-3 text-sm font-medium text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={state.saving}
          onClick={() => void saveChoice("opted_in")}
          className="min-h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {state.saving ? "Saving choice..." : "Yes, contact me once"}
        </button>
        <button
          type="button"
          disabled={state.saving}
          onClick={() => void saveChoice("declined")}
          className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-500 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
