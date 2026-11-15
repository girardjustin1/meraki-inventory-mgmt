import { TaskDetailScreen } from "@/screens/task-detail/task-detail-screen";
import { viewer } from "~/lib/view-params";

/** A task or pickup run. The assignee sees the pick list to tick off; the asker sees progress. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <TaskDetailScreen taskId={decodeURIComponent(id)} user={await viewer()} />;
}
