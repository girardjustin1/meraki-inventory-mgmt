import { CollectionDetailScreen } from "@/screens/collection-detail/collection-detail-screen";
import { type SearchParams, viewLocation, viewer } from "~/lib/view-params";

/** Deep link: /collections/col-pedicure?loc=newburyport */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
    const { id } = await params;
    return <CollectionDetailScreen collectionId={decodeURIComponent(id)} location={await viewLocation(await searchParams)} user={await viewer()} />;
}
