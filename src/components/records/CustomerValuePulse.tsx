"use client";

import { useEffect, useState } from "react";
import { getRecordsCsrfToken } from "@/lib/records/attorneyClient";

type ResponseState =
  | { status: "loading" }
  | { status: "ready"; selectedScore: number | null; error: string }
  | { status: "saving"; selectedScore: number }
  | { status: "answered"; score: number }
  | { status: "hidden" };

export default function CustomerValuePulse() {
  const [state, setState] = useState<ResponseState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadResponse() {
      try {
        const response = await fetch("/api/records/customer-value", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const body = (await response.json().catch(() => ({}))) as {
          response?: { score?: number } | null;
        };
        if (cancelled) return;
        if (!response.ok) {
          setState({ status: "hidden" });
          return;
        }
        if (Number.isInteger(body.response?.score)) {
          setState({ status: "answered", score: Number(body.response?.score) });
          return;
        }
        setState({ status: "ready", selectedScore: null, error: "" });
      } catch {
        if (!cancelled) setState({ status: "hidden" });
      }
    }

    void loadResponse();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading" || state.status === "hidden") return null;

  if (state.status === "answered") {
    return (
      <section className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950" aria-label="Customer value response">
        <p className="font-semibold">Thank you for helping us improve Custody Folio.</p>
        <p className="mt-1 leading-6">Your score was saved without comments or case details.</p>
      </section>
    );
  }

  const selectedScore = state.selectedScore;
  const saving = state.status === "saving";

  async function submitResponse() {
    if (!selectedScore || saving) return;
    setState({ status: "saving", selectedScore });
    try {
      const csrf = await getRecordsCsrfToken();
      const response = await fetch("/api/records/customer-value", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-L2F-CSRF": csrf,
        },
        body: JSON.stringify({ score: selectedScore }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        response?: { score?: number };
      };
      if (!response.ok || !Number.isInteger(body.response?.score)) {
        setState({
          status: "ready",
          selectedScore,
          error: body.error || "Unable to save your response right now.",
        });
        return;
      }
      setState({ status: "answered", score: Number(body.response?.score) });
    } catch (error) {
      setState({
        status: "ready",
        selectedScore,
        error: error instanceof Error ? error.message : "Unable to save your response right now.",
      });
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="customer-value-question">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">One quick question</p>
      <h2 id="customer-value-question" className="mt-2 text-lg font-semibold text-slate-950">
        Has Custody Folio helped you feel more organized?
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Choose one number only. We do not collect comments or case details here.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Organization value score">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={selectedScore === score}
            disabled={saving}
            onClick={() => setState({ status: "ready", selectedScore: score, error: "" })}
            className={`grid h-11 w-11 place-items-center rounded-md border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-200 ${
              selectedScore === score
                ? "border-teal-700 bg-teal-700 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-teal-600"
            }`}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="mt-2 flex max-w-[13.25rem] justify-between text-xs text-slate-500">
        <span>Not yet</span>
        <span>Very much</span>
      </div>
      {state.status === "ready" && state.error ? (
        <p className="mt-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>
      ) : null}
      <button
        type="button"
        disabled={!selectedScore || saving}
        onClick={() => void submitResponse()}
        className="mt-4 min-h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
      >
        {saving ? "Saving response..." : "Share this score"}
      </button>
    </section>
  );
}
