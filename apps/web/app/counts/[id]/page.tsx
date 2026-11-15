import { countSessions } from "@/data/inventory";
import { staticParams } from "~/lib/base-path";
import { View } from "./view";

export const generateStaticParams = () => staticParams(() => countSessions.map((session) => ({ id: session.id })));

/** A count opens as the counting flow until it is submitted, then as the manager's review. */
export default function Page() {
    return <View />;
}
