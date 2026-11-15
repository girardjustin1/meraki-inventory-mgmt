import { CollectionsScreen } from "@/screens/collections/collections-screen";
import { type SearchParams, oneOf, text, viewLocation, viewer } from "~/lib/view-params";

/** Deep link: /collections?loc=&view=service-kit&q=pedicure&new=1 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return (
        <CollectionsScreen
            location={await viewLocation(params)}
            user={await viewer()}
            initialView={oneOf(params.view, ["all", "shelf", "service-kit", "count-list", "general"])}
            initialQuery={text(params.q)}
            creating={params.new === "1"}
        />
    );
}
