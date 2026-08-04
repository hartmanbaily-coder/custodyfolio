import type { Metadata } from "next";
import AttorneySignIn from "@/components/records/AttorneySignIn";

export const metadata: Metadata = {
  title: "Attorney sign in",
  description: "Sign in to read-only matters shared with your attorney account.",
  alternates: { canonical: "/attorney/sign-in" },
  robots: { index: false, follow: false },
};

export default function AttorneySignInPage() {
  return <AttorneySignIn />;
}
