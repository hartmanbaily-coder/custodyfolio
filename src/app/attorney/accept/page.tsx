import AttorneyAccept from "@/components/records/AttorneyAccept";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Accept Attorney Access",
  description: "Review and accept a private Custody Folio attorney access invitation.",
  canonical: "/attorney/accept",
});

export default function AttorneyAcceptPage() {
  return <AttorneyAccept />;
}
