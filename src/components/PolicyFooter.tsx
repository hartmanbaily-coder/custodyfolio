import Link from "next/link";

import {
  legalDisclaimer,
  publicPolicyLinks,
  recordsTagline,
  supportEmail,
  supportMailto,
} from "@/lib/site";

type PolicyFooterProps = {
  className?: string;
  compact?: boolean;
  notice?: string;
  recordsNote?: string;
};

function PolicyLinks({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={mobile ? "grid grid-cols-2 gap-2 text-sm" : "mt-4 flex flex-wrap gap-2 text-sm"}>
      {publicPolicyLinks.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`border border-slate-200 bg-white font-medium text-slate-700 transition hover:border-teal-500 hover:text-teal-800 ${
            mobile
              ? "flex min-h-11 items-center rounded-md px-3 py-2"
              : "rounded-md px-3 py-2"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function PolicyDetails({ notice, recordsNote }: Pick<PolicyFooterProps, "notice" | "recordsNote">) {
  return (
    <section className="space-y-4 text-sm leading-6 text-slate-600">
      {notice && (
        <div>
          <p className="font-semibold text-slate-950">Page note</p>
          <p className="mt-1">{notice}</p>
        </div>
      )}

      {recordsNote && (
        <div>
          <p className="font-semibold text-slate-950">Records note</p>
          <p className="mt-1">{recordsNote}</p>
        </div>
      )}

      <div>
        <p className="font-semibold text-slate-950">Disclaimer</p>
        <p className="mt-1">{legalDisclaimer}</p>
      </div>

      <p>
        Support:{" "}
        <a href={supportMailto} className="font-mono font-semibold text-teal-700 underline underline-offset-2">
          {supportEmail}
        </a>
      </p>
    </section>
  );
}

function CompactPolicyFooter({
  className,
  notice,
  recordsNote,
}: Pick<PolicyFooterProps, "className" | "notice" | "recordsNote">) {
  return (
    <footer
      data-testid="workspace-policy-footer"
      className={`border-t border-slate-200 bg-white/80 ${className || ""}`}
    >
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            Policies &amp; support
          </p>
          <nav
            aria-label="Policy and support links"
            className="flex min-w-0 flex-nowrap gap-x-4 overflow-x-auto pb-1 text-xs font-semibold sm:flex-wrap sm:overflow-visible sm:pb-0"
          >
            {publicPolicyLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 whitespace-nowrap text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-teal-800"
              >
                {item.label}
              </Link>
            ))}
            <a
              href={supportMailto}
              className="shrink-0 whitespace-nowrap text-teal-700 underline decoration-teal-200 underline-offset-4 hover:text-teal-900"
            >
              Support
            </a>
          </nav>
        </div>

        <div className="mt-3 grid min-w-0 gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs leading-5 text-slate-600 sm:grid-cols-2 sm:gap-4">
          {notice && (
            <p className="[overflow-wrap:anywhere]">
              <span className="font-semibold text-slate-800">Page:</span> {notice}
            </p>
          )}
          {recordsNote && (
            <p className="[overflow-wrap:anywhere]">
              <span className="font-semibold text-slate-800">Records:</span> {recordsNote}
            </p>
          )}
          <p className="[overflow-wrap:anywhere]">
            <span className="font-semibold text-slate-800">Legal:</span> {legalDisclaimer}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function PolicyFooter({
  className = "",
  compact = false,
  notice,
  recordsNote,
}: PolicyFooterProps) {
  if (compact) {
    return (
      <CompactPolicyFooter
        className={className}
        notice={notice}
        recordsNote={recordsNote}
      />
    );
  }

  return (
    <footer className={`border-t border-slate-200 bg-white/75 ${className}`}>
      <details data-testid="mobile-policy-menu" className="group mx-auto max-w-7xl lg:hidden">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
              Policy center
            </span>
            <span className="mt-1 block truncate text-xs text-slate-500">
              Privacy, terms, security, support
            </span>
          </span>
          <span aria-hidden="true" className="grid shrink-0 gap-1">
            <span className="h-0.5 w-5 rounded-full bg-slate-600" />
            <span className="h-0.5 w-5 rounded-full bg-slate-600" />
            <span className="h-0.5 w-5 rounded-full bg-slate-600" />
          </span>
        </summary>
        <div className="border-t border-slate-200 px-4 pb-6 pt-5 sm:px-6">
          <PolicyLinks mobile />
          <div className="mt-5 border-t border-slate-200 pt-5">
            <PolicyDetails notice={notice} recordsNote={recordsNote} />
          </div>
        </div>
      </details>

      <div className="mx-auto hidden max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[1.1fr_minmax(0,1fr)] lg:px-8">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Policy center
          </p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            {recordsTagline}
          </p>
          <PolicyLinks />
        </section>

        <PolicyDetails notice={notice} recordsNote={recordsNote} />
      </div>
    </footer>
  );
}
