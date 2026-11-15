import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { FillLevel } from "@/data/types";
import { FILL_LABEL } from "@/engine/stock";
import { FillLevelPicker } from "./fill-level-picker";
import type { FillLevelPickerProps } from "./fill-level-picker";

const Controlled = (props: Partial<FillLevelPickerProps>) => {
    const [value, setValue] = useState<FillLevel | null>(props.value ?? null);
    return (
        <div className="flex max-w-sm flex-col gap-2">
            <FillLevelPicker label="Fill level" {...props} value={value} onChange={setValue} />
            <p className="text-sm text-tertiary">{value ? `Recorded as: ${FILL_LABEL[value]}` : "Nothing picked yet"}</p>
        </div>
    );
};

const meta: Meta<typeof FillLevelPicker> = {
    title: "Meraki/Fill level picker",
    component: FillLevelPicker,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    render: (args) => <Controlled {...args} />,
};

export default meta;
type Story = StoryObj<typeof FillLevelPicker>;

export const Medium: Story = { args: { size: "md", value: "half" } };
export const Large: Story = { args: { size: "lg", value: "three-quarter" } };
export const NothingPicked: Story = { args: { size: "lg" } };
export const Disabled: Story = { args: { size: "md", value: "full", isDisabled: true } };
