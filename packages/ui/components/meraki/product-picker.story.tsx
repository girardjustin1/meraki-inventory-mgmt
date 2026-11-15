import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/base/buttons/button";
import { ProductPicker, resolveSelection } from "./product-picker";
import type { PickerSelection, ProductPickerProps } from "./product-picker";

/** The picker with the button that opens it and a readout of what came back. */
const Demo = (props: Partial<ProductPickerProps>) => {
    const [isOpen, setIsOpen] = useState(props.isOpen ?? true);
    const [added, setAdded] = useState<PickerSelection[]>([]);
    const location = props.location ?? "lynnfield";
    return (
        <div className="flex flex-col items-start gap-3 p-4">
            <Button color="secondary" size="md" onClick={() => setIsOpen(true)}>
                Add items
            </Button>
            {added.length > 0 && (
                <ul data-testid="picker-result" className="text-sm text-secondary">
                    {added.map((pick) => {
                        const resolved = resolveSelection(pick, location);
                        return (
                            <li key={`${pick.itemId}:${pick.variant ?? ""}`}>
                                {resolved?.item.name ?? pick.itemId}
                                {resolved?.variantLabel ? `, ${resolved.variantLabel}` : ""}
                            </li>
                        );
                    })}
                </ul>
            )}
            <ProductPicker {...props} location={location} isOpen={isOpen} onOpenChange={setIsOpen} onAdd={setAdded} />
        </div>
    );
};

const meta: Meta<typeof ProductPicker> = {
    title: "Meraki/Product picker",
    component: ProductPicker,
    parameters: { layout: "fullscreen" },
    render: (args) => <Demo {...args} />,
};
export default meta;
type Story = StoryObj<typeof ProductPicker>;

/** Nothing typed: what most needs ordering comes first, 30 at a time. */
export const Default: Story = {};

/** A colour found by name, opened to its finishes with Gel ticked: the colour's own tick shows the dash. */
export const Searching: Story = {
    args: { initialQuery: "funny", initialExpanded: ["pol-opi-wh02"], initialSelection: [{ itemId: "pol-opi-wh02", variant: "gel" }] },
};

/** Opened from an Amazon order: only Amazon's items, with the three already on the order marked. The chip shows every vendor again. */
export const VendorFiltered: Story = {
    args: {
        vendorId: "amazon",
        excludeIds: ["sup-clear-trash-bag-rolls-5-gallon", "sup-100-pc-small-wax-sticks", "sup-100-pc-large-wax-sticks"],
        confirmLabel: "Add to order",
    },
};

/** On a purchase order the vendor cannot be changed: no chip to switch it off, no vendor filter, and a search that only matches elsewhere says why. */
export const VendorLocked: Story = {
    args: { vendorId: "amazon", lockVendor: true, initialQuery: "funny bunny", confirmLabel: "Add to order" },
};

/** A full-screen sheet on a phone. */
export const Mobile: Story = {
    args: { initialQuery: "bubble" },
    globals: { viewport: { value: "mobile", isRotated: false } },
};
