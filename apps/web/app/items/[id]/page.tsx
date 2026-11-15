import { items } from "@/data/inventory";
import { staticParams } from "~/lib/base-path";
import { View } from "./view";

export const generateStaticParams = () => staticParams(() => items.map((item) => ({ id: item.id })));

/** Deep link: /items/<id>?loc=&tab=orders */
export default function Page() {
    return <View />;
}
