import { TasksScreen } from "@/screens/tasks/tasks-screen";
import { type SearchParams, viewLocation, viewer } from "~/lib/view-params";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    return <TasksScreen location={await viewLocation(await searchParams)} user={await viewer()} />;
}
