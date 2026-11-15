"use client";

import { ReceiveScreen } from "@/screens/receive/receive-screen";
import { useView } from "~/lib/use-view";
import { text } from "~/lib/view-params";

/** Open orders to receive. Deep link: /receive?order=<id> opens one order. */
export default function Page() {
    const { params, user, location } = useView();
    return <ReceiveScreen user={user} location={location} orderId={text(params.order, 160)} />;
}
