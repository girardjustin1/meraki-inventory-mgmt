"use client";

import { ReportsScreen } from "@/screens/reports/reports-screen";
import { useView } from "~/lib/use-view";
import { oneOf } from "~/lib/view-params";

/** Deep link: /reports?loc=&period=6m */
export default function Page() {
    const { params, location } = useView();
    return <ReportsScreen location={location} initialPeriod={oneOf(params.period, ["3m", "6m", "ytd"])} />;
}
