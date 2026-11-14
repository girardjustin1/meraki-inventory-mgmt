import { OrderSendScreen } from "@/screens/order-send/order-send-screen";
import { type SearchParams, text, viewLocation, viewer } from "~/lib/view-params";

/** Send approved orders to their vendors. Deep link: /orders/send?loc=&order=<id> */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return <OrderSendScreen user={await viewer()} location={await viewLocation(params)} initialOrderId={text(params.order, 160)} />;
}
