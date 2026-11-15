"use client";

import { TasksScreen } from "@/screens/tasks/tasks-screen";
import { useView } from "~/lib/use-view";

export default function Page() {
    const { user, location } = useView();
    return <TasksScreen location={location} user={user} />;
}
