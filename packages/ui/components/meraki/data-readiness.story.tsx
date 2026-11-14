import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TODAY, items, purchaseOrders, stock } from "@/data/inventory";
import type { LocationId } from "@/data/types";
import { dataReadiness } from "@/engine/insights";
import { DataReadiness } from "./data-readiness";

const sourcesFor = (loc: LocationId, hasServiceCounts = false) =>
    dataReadiness({
        purchaseOrders: purchaseOrders.filter((po) => po.locationId === loc),
        stock: stock.filter((s) => s.locationId === loc),
        items,
        today: TODAY,
        hasServiceCounts,
    });

const meta: Meta<typeof DataReadiness> = {
    title: "Meraki/Data readiness",
    component: DataReadiness,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-xl rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset lg:p-5">
                <Story />
            </div>
        ),
    ],
    args: { sources: sourcesFor("lynnfield") },
};

export default meta;
type Story = StoryObj<typeof DataReadiness>;

/** Lynnfield today: order history and one real count are in place; costs, service counts and a full year are not. */
export const Full: Story = {};

/** One line for a card header or a sidebar. */
export const Compact: Story = { args: { variant: "compact" } };

/** Newburyport has one order form on file, so nothing is ready yet. */
export const NothingReady: Story = { args: { sources: sourcesFor("newburyport") } };

/** What the block looks like once every source is connected. Illustrative wording, not Meraki's data. */
const ILLUSTRATIVE_DETAIL: Record<string, string> = {
    counts: "Illustration: every supply has a count from the app.",
    costs: "Illustration: every supply has an invoice cost.",
    "service-counts": "Connected.",
    "twelve-months": "Illustration: twelve months of counts and orders.",
};
export const EverythingReady: Story = {
    args: { sources: sourcesFor("lynnfield", true).map((s) => ({ ...s, ready: true, detail: ILLUSTRATIVE_DETAIL[s.id] ?? s.detail })) },
};

export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
