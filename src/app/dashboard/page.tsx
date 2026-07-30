import RecordsApp from "@/components/records/RecordsApp";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Records Workspace",
  description: "Privately organize custody records, files, calendars, and reports.",
  canonical: "/records",
});

export default function DashboardPage() {
  return <RecordsApp />;
}
