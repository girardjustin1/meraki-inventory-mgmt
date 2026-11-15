"use client";

import { useParams } from "next/navigation";
import { getCountSession } from "@/data/inventory";
import { CountReviewScreen } from "@/screens/count-review/count-review-screen";
import { CountSessionScreen } from "@/screens/count-session/count-session-screen";
import { useView } from "~/lib/use-view";

export function View() {
    const { id: raw } = useParams<{ id: string }>();
    const { user } = useView();
    const id = decodeURIComponent(raw);
    const session = getCountSession(id);
    const inReview = session?.status === "submitted" || session?.status === "approved";
    return inReview ? <CountReviewScreen sessionId={id} user={user} /> : <CountSessionScreen sessionId={id} />;
}
