import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/base/buttons/button";
import { stockRows } from "@/data/inventory";
import { BulkQuantityEditor } from "./bulk-quantity-editor";
import type { BulkEditResult, BulkEditRow, BulkQuantityEditorProps } from "./bulk-quantity-editor";

const ROWS: BulkEditRow[] = stockRows("lynnfield", "supply")
    .slice(0, 12)
    .map((r) => ({
        id: r.item.id,
        item: r.item,
        shelf: r.level.shelf || r.level.area,
        onHand: r.level.onHand,
        fillLevel: r.level.fillLevel,
        par: r.level.par,
        paused: r.level.parRule === "paused",
    }));

const Demo = (props: Partial<BulkQuantityEditorProps>) => {
    const [isOpen, setOpen] = useState(props.isOpen ?? true);
    const [saved, setSaved] = useState<BulkEditResult | null>(null);
    return (
        <div className="flex flex-col items-start gap-3 p-6">
            <Button color="secondary" size="md" onClick={() => setOpen(true)}>
                Edit quantities
            </Button>
            <p className="text-sm text-tertiary">
                {saved
                    ? `Saved ${saved.changes.length} ${saved.changes.length === 1 ? "row" : "rows"}${saved.reason ? `, reason: ${saved.reason}` : ""}.`
                    : "Nothing saved yet."}
            </p>
            <BulkQuantityEditor
                rows={props.rows ?? ROWS}
                isOpen={isOpen}
                onOpenChange={setOpen}
                onSave={(result) => {
                    setSaved(result);
                    setOpen(false);
                }}
            />
        </div>
    );
};

const meta: Meta<typeof BulkQuantityEditor> = {
    title: "Meraki/Bulk quantity editor",
    component: BulkQuantityEditor,
    parameters: { layout: "fullscreen" },
    render: (args) => <Demo {...args} />,
};

export default meta;
type Story = StoryObj<typeof BulkQuantityEditor>;

/** A grid of on hand, par and reorder paused. Arrow keys, Tab and Enter move between cells. */
export const Desktop: Story = {};

/** Two items, the smallest useful selection. */
export const TwoItems: Story = { args: { rows: ROWS.slice(4, 6) } };

/** On a phone the save bar sits at the bottom. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
