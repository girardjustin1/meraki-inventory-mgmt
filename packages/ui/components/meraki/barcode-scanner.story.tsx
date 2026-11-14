import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BarcodeScanner } from "./barcode-scanner";
import type { BarcodeScannerProps } from "./barcode-scanner";
import { DEMO_CODES, describeCode, lookupCode } from "./scan-lookup";

const Demo = (props: Partial<BarcodeScannerProps>) => {
    const [reads, setReads] = useState<{ code: string; format: string }[]>([]);
    return (
        <div className="mx-auto flex max-w-md flex-col gap-3">
            <BarcodeScanner {...props} onDetect={(code, format) => setReads((r) => [{ code, format }, ...r].slice(0, 5))} className="h-96 rounded-2xl" />
            <ul className="flex flex-col gap-1 text-sm text-tertiary">
                {reads.length === 0 && <li>Nothing scanned yet.</li>}
                {reads.map((r, i) => {
                    const result = lookupCode(r.code, "lynnfield");
                    return (
                        <li key={`${r.code}-${i}`} className="flex flex-col rounded-lg bg-primary px-3 py-2 ring-1 ring-secondary ring-inset">
                            <span className="font-semibold text-primary">{describeCode(r.code)}</span>
                            <span className="truncate">
                                {r.code} · {r.format} · {result.kind}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

const meta: Meta<typeof BarcodeScanner> = {
    title: "Meraki/Barcode scanner",
    component: BarcodeScanner,
    parameters: { layout: "padded" },
    render: (args) => <Demo {...args} />,
};

export default meta;
type Story = StoryObj<typeof BarcodeScanner>;

/** No camera needed: each button reports one demo code. */
export const Simulated: Story = { args: { simulate: { codes: DEMO_CODES, label: (code) => describeCode(code) } } };

/** Uses the real camera. The browser will ask for permission. */
export const LiveCamera: Story = {};

export const RequestingPermission: Story = { args: { forceState: "requesting" } };
export const PermissionDenied: Story = { args: { forceState: "denied" } };
export const NoCamera: Story = { args: { forceState: "no-camera" } };
export const Paused: Story = { args: { paused: true, simulate: { codes: DEMO_CODES, label: (code) => describeCode(code) } } };
