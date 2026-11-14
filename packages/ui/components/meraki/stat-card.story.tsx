import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AlertTriangle, Flag01, Package, Truck01 } from "@untitledui/icons";
import { StatCard, StatGrid } from "./stat-card";

const meta: Meta<typeof StatCard> = {
    title: "Meraki/Stat card",
    component: StatCard,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-xs">
                <Story />
            </div>
        ),
    ],
    args: { label: "Low or out", value: "40", hint: "4 out, 36 low", tone: "warning", icon: AlertTriangle },
};

export default meta;
type Story = StoryObj<typeof StatCard>;

export const Warning: Story = {};
export const Bad: Story = { args: { label: "Open flags", value: "12", hint: "3 high severity", tone: "bad", icon: Flag01, href: "/flags" } };
export const Good: Story = { args: { label: "Counted this week", value: "92%", hint: "On schedule", tone: "good", icon: Package } };
export const Neutral: Story = { args: { label: "Stock on hand", value: "$17,184", hint: "At sample unit costs", tone: "neutral", icon: undefined } };

export const Grid: Story = {
    decorators: [(Story) => <Story />],
    render: () => (
        <StatGrid>
            <StatCard label="Low or out" value="40" hint="4 out, 36 low" tone="warning" icon={AlertTriangle} href="/stock" />
            <StatCard label="Open flags" value="12" hint="3 high severity" tone="bad" icon={Flag01} href="/flags" />
            <StatCard label="Deliveries due" value="2" hint="Nail Supply Store, Amazon" icon={Truck01} href="/receive" />
            <StatCard label="Stock on hand" value="$17,184" hint="At sample unit costs" icon={Package} />
        </StatGrid>
    ),
};
