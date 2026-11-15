"use client";

import { CollectionsScreen } from "@/screens/collections/collections-screen";
import { useView } from "~/lib/use-view";
import { oneOf, text } from "~/lib/view-params";

/** Deep link: /collections?loc=&view=service-kit&q=pedicure&new=1 */
export default function Page() {
    const { params, user, location } = useView();
    return (
        <CollectionsScreen
            location={location}
            user={user}
            initialView={oneOf(params.view, ["all", "shelf", "service-kit", "count-list", "general"])}
            initialQuery={text(params.q)}
            creating={params.new === "1"}
        />
    );
}
