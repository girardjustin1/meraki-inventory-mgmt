import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { OrderProgress } from "./order-progress";

const meta: Meta<typeof OrderProgress> = {
    title: "Meraki/Order progress",
    component: OrderProgress,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    args: { received: 9, total: 15 },
};

export default meta;
type Story = StoryObj<typeof OrderProgress>;

export const Partial: Story = {};
export const Complete: Story = { args: { received: 18, total: 18 } };
export const NothingReceived: Story = { args: { received: 0, total: 6 } };
export const NotSent: Story = { args: { notSent: true } };
export const Detailed: Story = {
    args: { size: "md" },
    decorators: [
        (Story) => (
            <div className="max-w-xs">
                <Story />
            </div>
        ),
    ],
};
