import Image from "next/image";
import Link from "next/link";
import { TrackedSignupLink } from "@/components/marketing/MarketingTracker";
import { recordsTagline, siteName } from "@/lib/site";

export default function PublicHeader() {
  return (
    <header className="border-b border-slate-200/70">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image src="/app-icons/icon-192.png" alt="" width={40} height={40} priority className="h-10 w-10 shrink-0 rounded-md" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight text-slate-950">{siteName}</span>
            <span className="mt-0.5 block text-xs leading-4 text-slate-500">{recordsTagline}</span>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium md:order-none md:w-auto">
          <Link href="/#how-it-works" className="inline-flex min-h-11 items-center text-slate-600 hover:text-teal-700">How it works</Link>
          <Link href="/guides/factual-custody-record-checklist" className="inline-flex min-h-11 items-center text-slate-600 hover:text-teal-700">Guides</Link>
          <Link href="/contact" className="inline-flex min-h-11 items-center text-slate-600 hover:text-teal-700">Support</Link>
          <Link href="/records" className="ml-auto inline-flex min-h-11 items-center text-slate-700 hover:text-teal-700 md:ml-0">Sign in</Link>
        </nav>
        <TrackedSignupLink contentCode="header_desktop" className="hidden min-h-11 shrink-0 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 md:inline-flex">Start 30 days free</TrackedSignupLink>
      </div>
    </header>
  );
}
