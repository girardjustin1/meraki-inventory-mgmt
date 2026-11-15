"use client";

import { useParams } from "next/navigation";
import { OrderDetailScreen } from "@/screens/order-detail/order-detail-screen";
import { useView } from "~/lib/use-view";

export function View() {
    const { id } = useParams<{ id: string }>();
    const { user } = useView();
    return <OrderDetailScreen orderId={decodeURIComponent(id)} user={user} />;
}
