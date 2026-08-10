import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import { pageMetadata, supportEmail, supportMailto } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Open-Source Notices",
  description: "Open-source software notices and source-code information for Custody Folio.",
  canonical: "/open-source",
});

const sections: PolicySection[] = [
  {
    title: "Open-source software",
    body: [
      "Custody Folio includes open-source software developed by third parties. Each component remains subject to its own copyright notices and license terms.",
      "Open-source licenses provide rights in the covered components only. They do not grant rights in the Custody Folio name, branding, original interface, customer records, or proprietary application code.",
    ],
  },
  {
    title: "heic-to 1.5.2",
    body: [
      "HEIC and HEIF image conversion is provided by heic-to version 1.5.2, distributed under the GNU Lesser General Public License version 3.0.",
      "Project source and notices: https://www.npmjs.com/package/heic-to/v/1.5.2 and https://github.com/hoppergee/heic-to",
      "License text: https://www.gnu.org/licenses/lgpl-3.0.html",
    ],
  },
  {
    title: "libheif 1.22.2",
    body: [
      "heic-to incorporates libheif version 1.22.2 for HEIC and HEIF decoding. libheif is distributed under the GNU Lesser General Public License version 3 or, at the user's option, a later version.",
      "Project source and notices: https://github.com/strukturag/libheif/tree/v1.22.2",
      "The upstream source links above identify the corresponding source for the unmodified library versions included by Custody Folio.",
    ],
  },
  {
    title: "License rights and warranty",
    body: [
      "You may obtain, study, modify, and redistribute the covered library source under the applicable license. Nothing on this page limits rights granted by an open-source license.",
      "The covered open-source components are provided without the warranties disclaimed in their respective licenses.",
      "For a copy of an included notice or assistance identifying the corresponding library source, contact support.",
    ],
  },
];

export default function OpenSourcePage() {
  return (
    <PolicyPage
      title="Open-Source Notices"
      description="Licenses and source-code information for third-party components included with Custody Folio."
      sections={sections}
    >
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
        <h2 className="text-base font-semibold text-slate-950">License and source links</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li><a href="https://github.com/hoppergee/heic-to" className="font-semibold text-emerald-700 underline underline-offset-2">heic-to source code</a></li>
          <li><a href="https://github.com/strukturag/libheif/tree/v1.22.2" className="font-semibold text-emerald-700 underline underline-offset-2">libheif 1.22.2 corresponding source</a></li>
          <li><a href="https://www.gnu.org/licenses/lgpl-3.0.html" className="font-semibold text-emerald-700 underline underline-offset-2">GNU LGPL version 3 license text</a></li>
        </ul>
        <h2 className="mt-5 text-base font-semibold text-slate-950">Request a notice</h2>
        <p className="mt-2">
          Email{" "}
          <a href={supportMailto} className="font-mono font-semibold text-emerald-700 underline underline-offset-2">
            {supportEmail}
          </a>{" "}
          with the component and app version. Do not include case records or sensitive information.
        </p>
      </section>
    </PolicyPage>
  );
}
