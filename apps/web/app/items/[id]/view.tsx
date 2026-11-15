"use client";

import { useParams } from "next/navigation";
import { ItemDetailScreen } from "@/screens/item-detail/item-detail-screen";
import { useView } from "~/lib/use-view";
import { oneOf } from "~/lib/view-params";

export function View() {
    const { id } = useParams<{ id: string }>();
    const { params, location } = useView();
    return <ItemDetailScreen itemId={decodeURIComponent(id)} location={location} initialTab={oneOf(params.tab, ["history", "orders", "flags", "settings"])} />;
}
