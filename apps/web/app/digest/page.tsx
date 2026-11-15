"use client";

import { DigestScreen } from "@/screens/digest/digest-screen";
import { useView } from "~/lib/use-view";
import { oneOf } from "~/lib/view-params";

/** Deep link: /digest?period=monthly&scope=all */
export default function Page() {
    const { params } = useView();
    return <DigestScreen period={oneOf(params.period, ["weekly", "monthly"])} location={oneOf(params.scope, ["lynnfield", "newburyport", "all"])} />;
}
