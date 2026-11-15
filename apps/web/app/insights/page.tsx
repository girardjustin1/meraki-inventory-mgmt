"use client";

import { InsightsScreen } from "@/screens/insights/insights-screen";
import { useView } from "~/lib/use-view";
import { oneOf } from "~/lib/view-params";

/** Deep link: /insights?loc=&tab=colours */
export default function Page() {
    const { params, user, location } = useView();
    return (
        <InsightsScreen
            location={location}
            user={user}
            initialTab={oneOf(params.tab, ["overview", "products", "colours", "seasonality", "profitability", "planning"])}
        />
    );
}
