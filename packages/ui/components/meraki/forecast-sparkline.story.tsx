import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { forecasts, getItem, polishForecasts } from "@/data/inventory";
import type { Forecast } from "@/data/types";
import { ForecastSparkline } from "./forecast-sparkline";
import { ConfidenceBadge } from "./status-badges";

const withUsage = forecasts.filter((f) => f.locationId === "lynnfield" && f.monthlyUsage > 0);
const pick = (confidence: Forecast["confidence"]) => withUsage.find((f) => f.confidence === confidence);
const none = forecasts.find((f) => f.confidence === "none");

const meta: Meta<typeof ForecastSparkline> = {
    title: "Meraki/Forecast sparkline",
    component: ForecastSparkline,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    args: { forecast: pick("high") },
};

export default meta;
type Story = StoryObj<typeof ForecastSparkline>;

/** Three or more order cycles: solid bars for history, outlined bars for the three months ahead. */
export const ThreeCycles: Story = {};

export const TwoCycles: Story = { args: { forecast: pick("medium") } };

export const OneCycle: Story = { args: { forecast: pick("low") } };

/** No order history: a dash, with the reason read out to screen readers. */
export const NoHistory: Story = { args: { forecast: none } };

/** A colour reordered in 2026. */
export const PolishColour: Story = { args: { forecast: polishForecasts[0] } };

export const Larger: Story = { args: { width: 160, height: 44 } };

/** How it sits in a table: the sparkline carries the shape, the columns beside it carry the numbers. */
export const InATable: Story = {
    render: () => (
        <table className="w-full max-w-xl text-left text-sm">
            <thead>
                <tr className="text-xs text-quaternary">
                    <th className="py-2 pr-4 font-semibold">Item</th>
                    <th className="py-2 pr-4 font-semibold">A month</th>
                    <th className="py-2 pr-4 font-semibold">History and projection</th>
                    <th className="py-2 font-semibold">Confidence</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-border-secondary">
                {[...withUsage.slice(0, 5), ...(none ? [none] : [])].map((f) => (
                    <tr key={f.itemId}>
                        <td className="py-2 pr-4 font-medium text-primary">{getItem(f.itemId)?.name}</td>
                        <td className="py-2 pr-4 text-secondary tabular-nums">{f.monthlyUsage || "–"}</td>
                        <td className="py-2 pr-4">
                            <ForecastSparkline forecast={f} />
                        </td>
                        <td className="py-2">
                            <ConfidenceBadge confidence={f.confidence} />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    ),
};
