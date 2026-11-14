import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StockHealthBar } from "./stock-health-bar";

const meta: Meta<typeof StockHealthBar> = {
    title: "Meraki/Stock health bar",
    component: StockHealthBar,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-xl rounded-xl bg-primary p-5 ring-1 ring-secondary ring-inset">
                <Story />
            </div>
        ),
    ],
    args: { location: "lynnfield" },
};

export default meta;
type Story = StoryObj<typeof StockHealthBar>;

export const Lynnfield: Story = {};
export const Newburyport: Story = { args: { location: "newburyport" } };
export const Compact: Story = { args: { compact: true, size: "sm" } };
