"use client";

import { users } from "@/data/inventory";
import { ActivityScreen } from "@/screens/activity/activity-screen";
import { useView } from "~/lib/use-view";
import { manyOf, oneOf, text } from "~/lib/view-params";

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
export default function Page() {
    const { params, user, location } = useView();
    return (
        <ActivityScreen
            user={user}
            location={location}
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
