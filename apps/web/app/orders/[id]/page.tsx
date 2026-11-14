import { OrderDetailScreen } from "@/screens/order-detail/order-detail-screen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <OrderDetailScreen orderId={decodeURIComponent(id)} />;
}
