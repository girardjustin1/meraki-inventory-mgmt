"use client";

import { countSessions, stock, users } from "@/data/inventory";
import { CountsScreen } from "@/screens/counts/counts-screen";
import { useView } from "~/lib/use-view";
import { manyOf, oneOf, text } from "~/lib/view-params";

/** Every area a count can cover: the shelves' areas, plus any a sample count names. */
const AREAS = [...new Set([...stock.map((s) => s.area), ...countSessions.map((c) => c.area)])];

/** Only the filters that are set, so an empty one adds no chip. */
const filtersOf = (picked: Record<string, string[]>) => Object.fromEntries(Object.entries(picked).filter(([, values]) => values.length > 0));

/** Deep link: /counts?loc=&view=review&q=closet&assignee=<user id>&area=Nail Area,Wax Room&sort=variance */
export default function Page() {
    const { params, user, location } = useView();
    return (
        <CountsScreen
            user={user}
            location={location}
            initialView={oneOf(params.view, ["due", "in-progress", "review", "done", "all"])}
            initialQuery={text(params.q)}
            initialFilters={filtersOf({
                assignee: manyOf(
                    params.assignee,
                    users.map((u) => u.id),
                ),
                area: manyOf(params.area, AREAS),
            })}
            initialSort={oneOf(params.sort, ["due", "variance"])}
        />
    );
}
