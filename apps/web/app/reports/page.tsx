import { ReportsScreen } from "@/screens/reports/reports-screen";
import { type SearchParams, oneOf, viewLocation } from "~/lib/view-params";

/** Deep link: /reports?loc=&period=6m */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return <ReportsScreen location={await viewLocation(params)} initialPeriod={oneOf(params.period, ["3m", "6m", "ytd"])} />;
}
