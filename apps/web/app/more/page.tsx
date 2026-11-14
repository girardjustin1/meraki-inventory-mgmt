import { type SearchParams, viewLocation, viewer } from "~/lib/view-params";
import { MoreClient } from "./more-client";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    return <MoreClient location={await viewLocation(await searchParams)} user={await viewer()} />;
}
