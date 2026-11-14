import { ReceiveScreen } from "@/screens/receive/receive-screen";

/** Open orders to receive. `?order=<id>` opens one order directly. */
export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
    const { order } = await searchParams;
    return <ReceiveScreen orderId={order} />;
}
