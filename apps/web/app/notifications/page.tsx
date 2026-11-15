import { NotificationsScreen } from "@/screens/notifications/notifications-screen";
import { type SearchParams, viewLocation, viewer } from "~/lib/view-params";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    return <NotificationsScreen location={await viewLocation(await searchParams)} user={await viewer()} />;
}
