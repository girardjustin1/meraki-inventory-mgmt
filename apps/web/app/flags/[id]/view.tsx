"use client";

import { useParams } from "next/navigation";
import { FlagDetailScreen } from "@/screens/flag-detail/flag-detail-screen";
import { useView } from "~/lib/use-view";

export function View() {
    const { id } = useParams<{ id: string }>();
    const { user } = useView();
    return <FlagDetailScreen flagId={decodeURIComponent(id)} user={user} />;
}
