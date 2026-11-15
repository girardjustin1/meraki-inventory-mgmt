import { purchaseOrders } from "@/data/inventory";
import { staticParams } from "~/lib/base-path";
import { View } from "./view";

export const generateStaticParams = () => staticParams(() => purchaseOrders.map((order) => ({ id: order.id })));

export default function Page() {
    return <View />;
}
