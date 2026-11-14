import { FlagDetailScreen } from "@/screens/flag-detail/flag-detail-screen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <FlagDetailScreen flagId={decodeURIComponent(id)} />;
}
