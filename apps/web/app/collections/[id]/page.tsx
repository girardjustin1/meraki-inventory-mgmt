import { collections } from "@/data/inventory";
import { staticParams } from "~/lib/base-path";
import { View } from "./view";

export const generateStaticParams = () => staticParams(() => collections.map((collection) => ({ id: collection.id })));

/** Deep link: /collections/col-pedicure?loc=newburyport */
export default function Page() {
    return <View />;
}
