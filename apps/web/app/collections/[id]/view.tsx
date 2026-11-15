"use client";

import { useParams } from "next/navigation";
import { CollectionDetailScreen } from "@/screens/collection-detail/collection-detail-screen";
import { useView } from "~/lib/use-view";

export function View() {
    const { id } = useParams<{ id: string }>();
    const { user, location } = useView();
    return <CollectionDetailScreen collectionId={decodeURIComponent(id)} location={location} user={user} />;
}
