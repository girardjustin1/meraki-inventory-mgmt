import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QuantityStepper } from "./quantity-stepper";
import type { QuantityStepperProps } from "./quantity-stepper";

const Controlled = (props: Partial<QuantityStepperProps>) => {
    const [value, setValue] = useState(props.value ?? 3);
    return <QuantityStepper label="Counted quantity" {...props} value={value} onChange={setValue} />;
};

const meta: Meta<typeof QuantityStepper> = {
    title: "Meraki/Quantity stepper",
    component: QuantityStepper,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    render: (args) => <Controlled {...args} />,
};

export default meta;
type Story = StoryObj<typeof QuantityStepper>;

export const Medium: Story = { args: { size: "md", value: 3 } };
export const Large: Story = { args: { size: "lg", value: 12, unit: "bottles" } };
export const WithLimits: Story = { args: { size: "md", value: 0, min: 0, max: 6, unit: "of 6" } };
export const Disabled: Story = { args: { size: "md", value: 4, isDisabled: true } };

export const FullWidthOnPhone: Story = {
    globals: { viewport: { value: "mobile", isRotated: false } },
    render: () => (
        <div className="flex max-w-sm flex-col gap-4">
            <Controlled size="lg" unit="boxes" value={2} className="flex w-full" />
            <Controlled size="md" unit="gallons" value={1} className="flex w-full" />
        </div>
    ),
};
