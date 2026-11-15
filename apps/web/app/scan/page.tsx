"use client";

import { ScanScreen } from "@/screens/scan/scan-screen";
import { useView } from "~/lib/use-view";
import { oneOf, text } from "~/lib/view-params";

/**
 * Scanner. By default it runs with demo codes so it can be reviewed on a laptop.
 * Deep link: /scan?live=1 (device camera; needs HTTPS or localhost) &mode=count &code=<barcode>
 */
export default function Page() {
    const { params, user, location } = useView();
    return (
        <ScanScreen
            user={user}
            location={location}
            live={params.live === "1"}
            initialMode={oneOf(params.mode, ["lookup", "count", "use", "receive"])}
            initialCode={text(params.code, 80)}
        />
    );
}
