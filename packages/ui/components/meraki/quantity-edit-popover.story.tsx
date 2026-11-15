import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { FillLevel } from "@/data/types";
import { REASON_LABEL } from "@/engine/reasons";
import { QuantityEditPopover } from "./quantity-edit-popover";
import type { QuantityChange, QuantityEditPopoverProps } from "./quantity-edit-popover";

const Controlled = (props: Partial<QuantityEditPopoverProps>) => {
    const [onHand, setOnHand] = useState(props.level?.onHand ?? 6);
    const [fillLevel, setFillLevel] = useState<FillLevel | undefined>(props.level?.fillLevel);
    const [last, setLast] = useState<QuantityChange | null>(null);
    return (
        <div className="flex max-w-sm flex-col gap-3">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-primary px-4 py-2 ring-1 ring-secondary ring-inset">
                <span className="text-sm text-secondary">{props.item?.name ?? "Nugenesis Base Gel"}</span>
                <QuantityEditPopover
                    item={{ name: "Nugenesis Base Gel", unit: "Bottle" }}
                    {...props}
                    level={{ ...props.level, onHand, fillLevel }}
                    onSave={(change) => {
                        if (change.onHand !== undefined) setOnHand(change.onHand);
                        if (change.fillLevel) setFillLevel(change.fillLevel);
                        setLast(change);
                    }}
                />
            </div>
            <p className="text-sm text-tertiary">
                {last
                    ? `Saved: ${last.delta > 0 ? "+" : ""}${last.delta}, ${REASON_LABEL[last.reason]}${last.note ? `, "${last.note}"` : ""}`
                    : "Nothing saved yet"}
            </p>
        </div>
    );
};

const meta: Meta<typeof QuantityEditPopover> = {
    title: "Meraki/Quantity edit popover",
    component: QuantityEditPopover,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    render: (args) => <Controlled {...args} />,
};

export default meta;
type Story = StoryObj<typeof QuantityEditPopover>;

/** The quantity is a quiet button. Click it to change it. */
export const Closed: Story = { args: { level: { onHand: 6 } } };

/** Adjust by a number or type the new quantity. A reason is always needed; a note from 3 units up. */
export const Open: Story = { args: { level: { onHand: 6 }, defaultOpen: true } };

/** Items tracked by eye pick a fill level instead of a number. */
export const FillLevel_: Story = {
    name: "Fill level",
    args: { item: { name: "Starpil Hard Wax", unit: "Bag" }, level: { onHand: 0.5, fillLevel: "half" }, defaultOpen: true },
};

/** People who cannot adjust stock see the plain number. */
export const ReadOnly: Story = { args: { level: { onHand: 6 }, isDisabled: true, disabledReason: "Only managers can adjust stock" } };

/** On a phone the editor is a bottom sheet. */
export const BottomSheet: Story = {
    args: { level: { onHand: 6, isSample: true }, defaultOpen: true },
    globals: { viewport: { value: "mobile", isRotated: false } },
};
