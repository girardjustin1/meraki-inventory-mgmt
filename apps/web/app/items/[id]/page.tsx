import { ItemDetailScreen } from "@/screens/item-detail/item-detail-screen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ItemDetailScreen itemId={decodeURIComponent(id)} />;
}
