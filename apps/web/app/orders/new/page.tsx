"use client";

import { OrderNewScreen } from "@/screens/order-new/order-new-screen";
import { useView } from "~/lib/use-view";
import { oneOf } from "~/lib/view-params";

/** Deep link: /orders/new?loc=&vendor=amazon&urgent=1 */
export default function Page() {
    const { params, location } = useView();
    return (
        <OrderNewScreen
            location={location}
            initialVendor={oneOf(params.vendor, ["all", "nail-supply-store", "costco-bjs", "amazon", "dazzle-dry", "farmhouse-fresh", "warehouse", "other"])}
            initialUrgentOnly={params.urgent === "1"}
        />
    );
}
