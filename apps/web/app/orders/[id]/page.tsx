import { OrderDetailScreen } from "@/screens/order-detail/order-detail-screen";
import { viewer } from "~/lib/view-params";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <OrderDetailScreen orderId={decodeURIComponent(id)} user={await viewer()} />;
}
