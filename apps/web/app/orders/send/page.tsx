import { OrderSendScreen } from "@/screens/order-send/order-send-screen";
import { type SearchParams, text, viewLocation, viewer } from "~/lib/view-params";

/** Send approved orders to their vendors. Deep link: /orders/send?loc=&order=<id>, or &orders=<id>,<id> to send only those. */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    const only = (text(params.orders, 800) ?? "").split(",").filter(Boolean).slice(0, 20);
    return (
        <OrderSendScreen
            user={await viewer()}
            location={await viewLocation(params)}
            orderIds={only.length ? only : undefined}
            initialOrderId={text(params.order, 160)}
        />
    );
}
