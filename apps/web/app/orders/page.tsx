import { OrdersScreen } from "@/screens/orders/orders-screen";
import { type SearchParams, oneOf, viewLocation } from "~/lib/view-params";

/** Deep link: /orders?loc=&tab=open */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return <OrdersScreen location={await viewLocation(params)} tab={oneOf(params.tab, ["action", "open", "received", "all"])} />;
}
