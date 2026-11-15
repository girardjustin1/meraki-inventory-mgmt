import { ItemDetailScreen } from "@/screens/item-detail/item-detail-screen";
import { type SearchParams, oneOf, viewLocation } from "~/lib/view-params";

/** Deep link: /items/<id>?loc=&tab=orders */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
    const [{ id }, query] = await Promise.all([params, searchParams]);
    return <ItemDetailScreen itemId={decodeURIComponent(id)} location={await viewLocation(query)} initialTab={oneOf(query.tab, ["history", "orders", "flags", "settings"])} />;
}
