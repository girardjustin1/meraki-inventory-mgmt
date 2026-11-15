"use client";

import { useParams } from "next/navigation";
import { TaskDetailScreen } from "@/screens/task-detail/task-detail-screen";
import { useView } from "~/lib/use-view";

export function View() {
    const { id } = useParams<{ id: string }>();
    const { user } = useView();
    return <TaskDetailScreen taskId={decodeURIComponent(id)} user={user} />;
}
