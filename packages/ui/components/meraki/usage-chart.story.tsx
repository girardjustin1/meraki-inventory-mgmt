import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { forecasts, getForecast } from "@/data/inventory";
import type { Forecast } from "@/data/types";
import { UsageChart } from "./usage-chart";

const pick = (confidence: Forecast["confidence"]) => forecasts.find((f) => f.locationId === "lynnfield" && f.confidence === confidence) as Forecast;

const meta: Meta<typeof UsageChart> = {
    title: "Meraki/Usage chart",
    component: UsageChart,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-2xl rounded-xl bg-primary p-5 ring-1 ring-secondary ring-inset">
                <Story />
            </div>
        ),
    ],
    args: { forecast: getForecast("sup-igel-beauty-non-cleansing-gel-top-coat", "lynnfield") ?? pick("high"), unit: "bottles" },
};

export default meta;
type Story = StoryObj<typeof UsageChart>;

export const HighConfidence: Story = {};
export const MediumConfidence: Story = { args: { forecast: pick("medium"), unit: "units" } };
export const LowConfidence: Story = { args: { forecast: pick("low"), unit: "units" } };
export const NoHistory: Story = { args: { forecast: pick("none") } };
