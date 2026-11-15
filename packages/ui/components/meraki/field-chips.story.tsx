import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { FieldChips } from "./field-chips";

const meta: Meta<typeof FieldChips> = {
    title: "Meraki/Field chips",
    component: FieldChips,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-2xl rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset">
                <p className="border-b border-secondary px-5 py-4 text-sm text-tertiary">
                    The card's main content sits here. Optional fields wait in the footer.
                </p>
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof FieldChips>;

const Editable = ({ defaultOpen }: { defaultOpen?: string[] }) => {
    const [sku, setSku] = useState("IG-TOP-NOCLNS-05OZ");
    const [description, setDescription] = useState("");
    const [unit, setUnit] = useState("Bottle");
    return (
        <FieldChips
            label="More details"
            defaultOpen={defaultOpen}
            fields={[
                {
                    id: "description",
                    label: "Description",
                    value: description ? "Added" : undefined,
                    wide: true,
                    field: <TextArea label="Description" rows={3} value={description} onChange={setDescription} />,
                },
                { id: "sku", label: "SKU", value: sku, field: <Input label="SKU" size="sm" value={sku} onChange={setSku} /> },
                { id: "barcodes", label: "Barcodes", value: "Scan to link", href: "/scan" },
                { id: "unit", label: "Unit", value: unit, field: <Input label="Counting unit" size="sm" value={unit} onChange={setUnit} /> },
            ]}
        />
    );
};

/** Empty fields show their name, filled ones their value. Click a chip to open its field. */
export const Default: Story = { render: () => <Editable /> };

/** Two fields opened. The chevron opens or closes them all. */
export const Opened: Story = { render: () => <Editable defaultOpen={["description", "sku"]} /> };

/** For someone who cannot edit: the chips only state the values. */
export const ReadOnly: Story = {
    render: () => (
        <FieldChips
            label="More details"
            fields={[
                { id: "sku", label: "SKU", value: "IG-TOP-NOCLNS-05OZ" },
                { id: "barcodes", label: "Barcodes", value: "766150110173" },
                { id: "unit", label: "Unit", value: "Bottle" },
            ]}
        />
    ),
};
