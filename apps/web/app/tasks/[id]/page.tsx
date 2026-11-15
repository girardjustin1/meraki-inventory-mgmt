import { tasks } from "@/data/inventory";
import { staticParams } from "~/lib/base-path";
import { View } from "./view";

export const generateStaticParams = () => staticParams(() => tasks.map((task) => ({ id: task.id })));

/** A task or pickup run. The assignee sees the pick list to tick off; the asker sees progress. */
export default function Page() {
    return <View />;
}
