import { CountsScreen } from "@/screens/counts/counts-screen";
import { type SearchParams, viewLocation } from "~/lib/view-params";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    return <CountsScreen location={await viewLocation(await searchParams)} />;
}
