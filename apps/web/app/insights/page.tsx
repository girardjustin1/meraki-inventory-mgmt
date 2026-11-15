import { InsightsScreen } from "@/screens/insights/insights-screen";
import { type SearchParams, oneOf, viewLocation, viewer } from "~/lib/view-params";

/** Deep link: /insights?loc=&tab=colours */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return (
        <InsightsScreen
            location={await viewLocation(params)}
            user={await viewer()}
            initialTab={oneOf(params.tab, ["overview", "products", "colours", "seasonality", "profitability", "planning"])}
        />
    );
}
