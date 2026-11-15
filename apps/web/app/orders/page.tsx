import { users, vendors } from "@/data/inventory";
import { OrdersScreen } from "@/screens/orders/orders-screen";
import { type SearchParams, manyOf, oneOf, text, viewLocation, viewer } from "~/lib/view-params";

const STATUSES = ["draft", "awaiting-approval", "approved", "sent", "partially-received", "received", "cancelled"] as const;

/** Only the filters that are set, so an empty one adds no chip. */
const filtersOf = (picked: Record<string, string[]>) => Object.fromEntries(Object.entries(picked).filter(([, values]) => values.length > 0));

/** Deep link: /orders?loc=&tab=open&q=acetone&vendor=amazon,costco-bjs&status=sent&by=<user id>&sort=expected */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return (
        <OrdersScreen
            user={await viewer()}
            location={await viewLocation(params)}
            tab={oneOf(params.tab, ["action", "open", "received", "all"])}
            initialQuery={text(params.q)}
            initialFilters={filtersOf({
                vendor: manyOf(
                    params.vendor,
                    vendors.map((v) => v.id),
                ),
                status: manyOf(params.status, STATUSES),
                by: manyOf(
                    params.by,
                    users.map((u) => u.id),
                ),
            })}
            initialSort={oneOf(params.sort, ["newest", "oldest", "total", "expected"])}
        />
    );
}
