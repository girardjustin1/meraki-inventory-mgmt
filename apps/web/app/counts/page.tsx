import { countSessions, stock, users } from "@/data/inventory";
import { CountsScreen } from "@/screens/counts/counts-screen";
import { type SearchParams, manyOf, oneOf, text, viewLocation, viewer } from "~/lib/view-params";

/** Every area a count can cover: the shelves' areas, plus any a sample count names. */
const AREAS = [...new Set([...stock.map((s) => s.area), ...countSessions.map((c) => c.area)])];

/** Only the filters that are set, so an empty one adds no chip. */
const filtersOf = (picked: Record<string, string[]>) => Object.fromEntries(Object.entries(picked).filter(([, values]) => values.length > 0));

/** Deep link: /counts?loc=&view=review&q=closet&assignee=<user id>&area=Nail Area,Wax Room&sort=variance */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return (
        <CountsScreen
            user={await viewer()}
            location={await viewLocation(params)}
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
