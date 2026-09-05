import type { ReactNode } from "react";

import PublicHeader from "@/components/marketing/PublicHeader";
import PolicyFooter from "@/components/PolicyFooter";
import {
  policyLastUpdated,
} from "@/lib/site";

export type PolicySection = {
  title: string;
  body: string[];
};

type PolicyPageProps = {
  title: string;
  description: string;
  notice?: string;
  sections: PolicySection[];
  children?: ReactNode;
  introduction?: ReactNode;
};

export function PolicyPage({ title, description, notice, sections, children, introduction }: PolicyPageProps) {
  return (
    <main className="min-h-screen [overflow-wrap:anywhere] bg-[#fffdf9] text-slate-950">
      <PublicHeader />

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <section className="max-w-3xl pb-8">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">{title}</h1>
            <p className="mt-4 text-base leading-7 text-slate-600">{description}</p>
            <p className="mt-3 text-xs leading-5 text-slate-500">Last updated {policyLastUpdated}.</p>
          </section>

          {introduction}

          {sections.length > 3 && (
            <details className="mb-8 max-w-3xl border-y border-slate-200 py-3">
              <summary className="cursor-pointer py-2 text-sm font-semibold text-teal-700">On this page</summary>
              <nav aria-label="On this page" className="mt-2 grid gap-x-6 sm:grid-cols-2">
                {sections.map((section, index) => (
                  <a key={section.title} href={`#section-${index + 1}`} className="py-2 text-sm leading-6 text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-teal-700">{section.title}</a>
                ))}
              </nav>
            </details>
          )}

          <div className="max-w-3xl divide-y divide-slate-200">
            {sections.map((section, index) => (
              <section key={section.title} id={`section-${index + 1}`} className="scroll-mt-8 py-7 first:pt-0">
                <h2 className="text-xl font-semibold tracking-tight text-slate-950">{section.title}</h2>
                <div className="mt-3 space-y-3 text-base leading-7 text-slate-600">
                  {section.body.map((item) => <p key={item}>{item}</p>)}
                </div>
              </section>
            ))}
          </div>

          {children}
        </div>
      </div>

      <PolicyFooter notice={notice} />
    </main>
  );
}
