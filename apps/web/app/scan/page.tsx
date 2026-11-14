import { ScanScreen } from "@/screens/scan/scan-screen";

/**
 * Scanner. By default it runs with demo codes so it can be reviewed on a laptop.
 * `?live=1` uses the device camera (needs HTTPS or localhost, and camera permission).
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ live?: string }> }) {
    const { live } = await searchParams;
    return <ScanScreen live={live === "1"} />;
}
