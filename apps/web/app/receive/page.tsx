import { ReceiveScreen } from "@/screens/receive/receive-screen";
import { type SearchParams, text, viewLocation, viewer } from "~/lib/view-params";

/** Open orders to receive. Deep link: /receive?order=<id> opens one order. */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return <ReceiveScreen user={await viewer()} location={await viewLocation(params)} orderId={text(params.order, 160)} />;
}
