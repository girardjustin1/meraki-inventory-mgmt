import { getCountSession } from "@/data/inventory";
import { CountReviewScreen } from "@/screens/count-review/count-review-screen";
import { CountSessionScreen } from "@/screens/count-session/count-session-screen";

/** A count opens as the counting flow until it is submitted, then as the manager's review. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = getCountSession(id);
    const inReview = session?.status === "submitted" || session?.status === "approved";
    return inReview ? <CountReviewScreen sessionId={id} /> : <CountSessionScreen sessionId={id} />;
}
