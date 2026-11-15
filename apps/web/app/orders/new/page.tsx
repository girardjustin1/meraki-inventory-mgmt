import { OrderNewScreen } from "@/screens/order-new/order-new-screen";
import { type SearchParams, oneOf, viewLocation } from "~/lib/view-params";

/** Deep link: /orders/new?loc=&vendor=amazon&urgent=1 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return (
        <OrderNewScreen
            location={await viewLocation(params)}
            initialVendor={oneOf(params.vendor, ["all", "nail-supply-store", "costco-bjs", "amazon", "dazzle-dry", "farmhouse-fresh", "warehouse", "other"])}
            initialUrgentOnly={params.urgent === "1"}
        />
    );
}
