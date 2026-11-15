import { DigestScreen } from "@/screens/digest/digest-screen";
import { type SearchParams, oneOf } from "~/lib/view-params";

/** Deep link: /digest?period=monthly&scope=all */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return <DigestScreen period={oneOf(params.period, ["weekly", "monthly"])} location={oneOf(params.scope, ["lynnfield", "newburyport", "all"])} />;
}
