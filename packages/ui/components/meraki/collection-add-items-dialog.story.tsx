import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/base/buttons/button";
import { stockRows } from "@/data/inventory";
import { CollectionAddItemsDialog } from "./collection-add-items-dialog";
import type { CollectionAddItemsDialogProps } from "./collection-add-items-dialog";

const rows = stockRows("lynnfield");

const Stateful = (props: CollectionAddItemsDialogProps) => {
    const [open, setOpen] = useState(props.isOpen);
    const [added, setAdded] = useState<string[]>([]);
    return (
        <div className="flex flex-col items-start gap-3">
            <Button color="secondary" onClick={() => setOpen(true)}>
                Add items
            </Button>
            <p className="text-sm text-tertiary">{added.length ? `Added: ${added.join(", ")}` : "Nothing added yet."}</p>
            <CollectionAddItemsDialog {...props} isOpen={open} onOpenChange={setOpen} onAdd={setAdded} />
        </div>
    );
};

const meta: Meta<typeof CollectionAddItemsDialog> = {
    title: "Meraki/Collection add items dialog",
    component: CollectionAddItemsDialog,
    parameters: { layout: "padded" },
    args: { isOpen: true, rows, collectionName: "Pedicure station" },
    render: (args) => <Stateful {...args} />,
};

export default meta;
type Story = StoryObj<typeof CollectionAddItemsDialog>;

/** Every item at Lynnfield: 60 rows at a time, with "Show more". */
export const Open: Story = {};

/** A full-screen sheet on a phone. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** Only supplies on offer, so the type filter is hidden. */
export const SuppliesOnly: Story = { args: { rows: rows.filter((r) => r.item.kind === "supply") } };

export const NothingLeftToAdd: Story = { args: { rows: [] } };
