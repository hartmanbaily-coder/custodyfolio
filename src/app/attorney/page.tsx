import AttorneyPortal from "@/components/records/AttorneyPortal";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Attorney Access",
  description: "Open custody records that a Custody Folio user shared with your verified account.",
  canonical: "/attorney",
});

export default function AttorneyPortalPage() {
  return <AttorneyPortal />;
}
