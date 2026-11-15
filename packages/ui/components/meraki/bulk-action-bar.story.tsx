import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ClipboardCheck, Download01, Edit05, MarkerPin01, PauseCircle, QrCode02, ShoppingCart01, Target04, Truck01 } from "@untitledui/icons";
import { BulkActionBar } from "./bulk-action-bar";
import type { BulkActionBarProps } from "./bulk-action-bar";

const Demo = (props: Partial<BulkActionBarProps>) => {
    const [count, setCount] = useState(props.count ?? 12);
    const [last, setLast] = useState("Nothing chosen yet");
    const act = (label: string) => () => setLast(`Chose: ${label}`);
    return (
        <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-xl ring-1 ring-secondary">
                <BulkActionBar
                    totalMatching={145}
                    {...props}
                    count={count}
                    onSelectAll={() => setCount(145)}
                    onClear={() => setCount(0)}
                    onToggleAll={() => setCount(count >= 145 ? 0 : 145)}
                    actions={[
                        { id: "order", label: "Add to order", icon: ShoppingCart01, onAction: act("Add to order") },
                        { id: "count", label: "Count these", icon: ClipboardCheck, onAction: act("Count these") },
                        { id: "edit", label: "Edit quantities", icon: Edit05, onAction: act("Edit quantities") },
                        { id: "par", label: "Set par level", icon: Target04, onAction: act("Set par level") },
                        { id: "vendor", label: "Change vendor", icon: Truck01, onAction: act("Change vendor") },
                        { id: "move", label: "Move to area or shelf", icon: MarkerPin01, onAction: act("Move") },
                        { id: "pause", label: "Pause reorder", icon: PauseCircle, onAction: act("Pause reorder") },
                        { id: "labels", label: "Print QR labels", icon: QrCode02, onAction: act("Print QR labels") },
                        { id: "export", label: "Export selected", icon: Download01, onAction: act("Export selected") },
                    ]}
                />
            </div>
            <p className="text-sm text-tertiary">{count === 0 ? "Selection cleared: the bar is gone." : last}</p>
        </div>
    );
};

const meta: Meta<typeof BulkActionBar> = {
    title: "Meraki/Bulk action bar",
    component: BulkActionBar,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    render: (args) => <Demo {...args} />,
};

export default meta;
type Story = StoryObj<typeof BulkActionBar>;

/** Count, select all, clear, then the actions. Extra actions sit under More. */
export const Default: Story = { args: { count: 12 } };

/** Everything that matches is selected, so "Select all" is not offered. */
export const AllSelected: Story = { args: { count: 145 } };

/** On a phone the bar docks above the tab bar with the two main actions. */
export const Mobile: Story = { args: { count: 3 }, globals: { viewport: { value: "mobile", isRotated: false } } };
