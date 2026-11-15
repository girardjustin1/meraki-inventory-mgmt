import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InsightCard } from "./insight-card";

const Bars = ({ values }: { values: [string, number][] }) => {
    const max = Math.max(...values.map(([, v]) => v));
    return (
        <ul className="flex flex-col gap-2.5">
            {values.map(([label, value]) => (
                <li key={label} className="flex flex-col gap-1">
                    <div className="flex justify-between gap-3 text-sm">
                        <span className="text-secondary">{label}</span>
                        <span className="font-medium text-primary tabular-nums">{value} days</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary">
                        <div className="h-2 rounded-full bg-fg-brand-primary" style={{ width: `${(value / max) * 100}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
};

const meta: Meta<typeof InsightCard> = {
    title: "Meraki/Insight card",
    component: InsightCard,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-lg">
                <Story />
            </div>
        ),
    ],
    args: {
        metric: "Order cycle time",
        title: "Orders take about 48 days from the order form to the shelf",
        why: "Par levels have to cover that wait, or orders need to go out sooner after the count.",
        provenance: "real",
        tone: "warning",
        footnote: "Days from the date the order form was started to the date each line was received.",
        action: { label: "See orders", href: "/orders" },
        children: (
            <Bars
                values={[
                    ["January", 45],
                    ["March", 32],
                    ["April", 43],
                ]}
            />
        ),
    },
};

export default meta;
type Story = StoryObj<typeof InsightCard>;

export const RealData: Story = {};

export const SampleData: Story = {
    args: {
        metric: "Count variance",
        title: "Recent counts came up 9 units short",
        why: "These counts are generated examples. Real variance appears here after the first count in the app.",
        provenance: "sample",
        tone: "neutral",
        footnote: undefined,
        action: { label: "See counts", href: "/counts" },
    },
};

export const Mixed: Story = {
    args: {
        metric: "Stock value",
        title: "About $17,184 of stock is on the shelves",
        why: "Quantities for polish come from your sheets. Unit costs are placeholders until invoices are loaded.",
        provenance: "mixed",
        sampleLabel: "Sample costs",
        tone: "neutral",
        action: undefined,
    },
};

export const TextOnly: Story = {
    args: { children: undefined, footnote: undefined, tone: "good", title: "Costco / BJ's delivered every line that was ordered" },
};
