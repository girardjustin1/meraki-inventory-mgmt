import { users } from "@/data/inventory";
import { ActivityScreen } from "@/screens/activity/activity-screen";
import { type SearchParams, manyOf, oneOf, text, viewLocation, viewer } from "~/lib/view-params";

const REASONS = [
    "cycle-count",
    "received-order",
    "used-in-service",
    "damaged",
    "expired",
    "lost",
    "suspected-theft",
    "sample-or-gift",
    "returned-to-vendor",
    "transfer",
    "correction",
] as const;

/** Deep link: /activity?loc=&type=adjust&range=30&person=<user id>,system&reason=lost&scope=all&q=acetone&sort=largest */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return (
        <ActivityScreen
            user={await viewer()}
            location={await viewLocation(params)}
            type={oneOf(params.type, ["count", "receive", "adjust", "order", "flag"])}
            initialRange={oneOf(params.range, ["7", "30", "90", "year", "all"])}
            initialPeople={manyOf(params.person, [...users.map((u) => u.id), "system"])}
            initialReasons={manyOf(params.reason, REASONS)}
            initialAllLocations={params.scope === "all"}
            initialQuery={text(params.q)}
            initialSort={oneOf(params.sort, ["newest", "oldest", "largest"])}
        />
    );
}
