import { purchaseOrders } from "@/data/inventory";
import { staticParams } from "~/lib/base-path";
import { View } from "./view";

export const generateStaticParams = () => staticParams(() => purchaseOrders.map((order) => ({ id: order.id })));

/** Older link shape. The order now lives in the query string so the list and the order share one page. */
export default function Page() {
    return <View />;
}
