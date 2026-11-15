import { HomeScreen } from "@/screens/home/home-screen";
import { type SearchParams, viewLocation, viewer } from "~/lib/view-params";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return <HomeScreen user={await viewer()} location={await viewLocation(params)} />;
}
