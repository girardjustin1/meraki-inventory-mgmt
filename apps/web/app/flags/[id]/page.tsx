import { flags } from "@/data/inventory";
import { staticParams } from "~/lib/base-path";
import { View } from "./view";

export const generateStaticParams = () => staticParams(() => flags.map((flag) => ({ id: flag.id })));

export default function Page() {
    return <View />;
}
