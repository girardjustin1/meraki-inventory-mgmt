import { ReceiveScreen } from "@/screens/receive/receive-screen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ReceiveScreen orderId={decodeURIComponent(id)} />;
}
