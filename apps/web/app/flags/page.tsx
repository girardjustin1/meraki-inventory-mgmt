import { FlagsScreen } from "@/screens/flags/flags-screen";
import { type SearchParams, manyOf, oneOf, text, viewLocation, viewer } from "~/lib/view-params";

const TYPES = [
    "all",
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

/** Deep link: /flags?loc=&tab=reviewing&severity=high,medium&type=count-variance&flag=<id> */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return (
        <FlagsScreen
            user={await viewer()}
            location={await viewLocation(params)}
            tab={oneOf(params.tab, ["open", "reviewing", "closed"])}
            severity={manyOf(params.severity, ["high", "medium", "low"])}
            initialType={oneOf(params.type, TYPES)}
            initialFlagId={text(params.flag, 200)}
        />
    );
}
