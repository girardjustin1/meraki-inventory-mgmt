import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { labelCodeForItem, labelCodeForShelf } from "@/components/meraki/scan-lookup";
import { ScanScreen } from "./scan-screen";

const meta: Meta<typeof ScanScreen> = { title: "Screens/Scan/Scan", component: ScanScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof ScanScreen>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

/** Look up mode with one item just scanned. The buttons in the camera area stand in for real scans. */
export const Mobile: Story = { args: { initialCode: "766150110173" }, globals: mobile };
export const Desktop: Story = { args: { initialCode: "766150110173" } };
/** Nothing scanned yet. */
export const Empty: Story = { globals: mobile };
/** Count mode: two items already counted in this session, a third waiting to be saved. */
export const CountMode: Story = {
    args: { initialMode: "count", initialCode: "875520003110", initialScans: ["766150110173", labelCodeForItem("sup-cnc-acetone")] },
    globals: mobile,
};
/** Receive mode: the scanned item is matched to its open order line. */
export const ReceiveMode: Story = { args: { initialMode: "receive", initialCode: "766150110173" }, globals: mobile };
/** A barcode that is not in the catalogue yet. */
export const UnknownCode: Story = { args: { initialCode: "0123456789012" }, globals: mobile };
/** A Meraki shelf label opens everything on that shelf. */
export const ShelfLabel: Story = { args: { initialCode: labelCodeForShelf("lynnfield", "Nail Area", "1A") }, globals: mobile };
/** Camera permission refused: instructions for iPhone, and typing still works. */
export const PermissionDenied: Story = { args: { scannerState: "denied" }, globals: mobile };
/** Real camera. The browser asks for permission. */
export const LiveCamera: Story = { args: { live: true }, globals: mobile };
