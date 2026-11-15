import { ScanScreen } from "@/screens/scan/scan-screen";
import { type SearchParams, oneOf, text, viewLocation, viewer } from "~/lib/view-params";

/**
 * Scanner. By default it runs with demo codes so it can be reviewed on a laptop.
 * Deep link: /scan?live=1 (device camera; needs HTTPS or localhost) &mode=count &code=<barcode>
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return (
        <ScanScreen
            user={await viewer()}
            location={await viewLocation(params)}
            live={params.live === "1"}
            initialMode={oneOf(params.mode, ["lookup", "count", "use", "receive"])}
            initialCode={text(params.code, 80)}
        />
    );
}
