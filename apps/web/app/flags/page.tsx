"use client";

import { users } from "@/data/inventory";
import { FlagsScreen } from "@/screens/flags/flags-screen";
import { useView } from "~/lib/use-view";
import { manyOf, oneOf, text } from "~/lib/view-params";

const TYPES = [
    "received-mismatch",
    "variant-mismatch",
    "order-spike",
    "overdue-receipt",
    "count-variance",
    "over-par",
    "stockout-risk",
    "repeat-out-of-stock",
    "missed-count",
    "unexplained-adjustment",
    "data-quality",
] as const;

/**
 * Deep link:
 * /flags?loc=&tab=reviewing&severity=high,medium&type=count-variance&assignee=unassigned,<user id>&source=real&q=acetone&sort=newest&flag=<id>
 */
export default function Page() {
    const { params, user, location } = useView();
    return (
        <FlagsScreen
            user={user}
            location={location}
            tab={oneOf(params.tab, ["open", "reviewing", "closed", "all"])}
            severity={manyOf(params.severity, ["high", "medium", "low"])}
            initialTypes={manyOf(params.type, TYPES)}
            initialAssignees={manyOf(params.assignee, ["unassigned", ...users.map((u) => u.id)])}
            initialSources={manyOf(params.source, ["real", "sample"])}
            initialQuery={text(params.q)}
            initialSort={oneOf(params.sort, ["priority", "newest", "largest"])}
            initialFlagId={text(params.flag, 200)}
        />
    );
}
