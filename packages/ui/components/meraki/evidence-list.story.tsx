import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EvidenceList } from "./evidence-list";

const meta: Meta<typeof EvidenceList> = {
    title: "Meraki/Evidence list",
    component: EvidenceList,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-xl">
                <Story />
            </div>
        ),
    ],
    args: {
        evidence: [
            { label: "Expected", value: "4" },
            { label: "Counted", value: "1" },
            { label: "Variance", value: "-3 (-75%)" },
            { label: "Value", value: "$55" },
        ],
    },
};

export default meta;
type Story = StoryObj<typeof EvidenceList>;

export const Grid: Story = {};
export const Chips: Story = { args: { variant: "chips" } };
export const ChipsTruncated: Story = { args: { variant: "chips", max: 2 } };
export const LongValues: Story = {
    args: {
        evidence: [
            { label: "Placed", value: "May 21, 2026" },
            { label: "Days open", value: "177" },
            { label: "Open lines", value: "15 of 15" },
            { label: "Examples", value: "CnC Acetone; Nugenesis Base Gel (2) Pink - Bottle; RED Sterilization Pouches" },
        ],
    },
};
