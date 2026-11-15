import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { demandFor, items, orderCycles, vendorById } from "@/data/inventory";
import { demandMix } from "@/engine/insights";
import { CycleMixChart, familySwatches } from "./cycle-mix-chart";

const polishCycles = orderCycles("lynnfield", "polish");
const opi = demandFor("lynnfield", "polish").filter((r) => r.line === "opi");
const opiMix = demandMix(opi, polishCycles, (r) => r.family);
// Swatches come from every OPI colour in the catalogue, not only the ones reordered, so each family has enough to average.
const swatches = familySwatches(items.filter((i) => i.line === "opi"));

const supplyCycles = orderCycles("lynnfield", "supply");
const supplies = demandFor("lynnfield", "supply");
const vendorOf = new Map(items.map((i) => [i.id, vendorById(i.vendorId).name]));

const meta: Meta<typeof CycleMixChart> = {
    title: "Meraki/Cycle mix chart",
    component: CycleMixChart,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-2xl rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset lg:p-5">
                <Story />
            </div>
        ),
    ],
    args: { mix: opiMix, cycles: polishCycles, colorOf: (group: string) => swatches[group], unit: "bottles" },
};

export default meta;
type Story = StoryObj<typeof CycleMixChart>;

/** OPI colour families by 2026 order cycle. Family colours are averaged from the catalogue's swatches; code groups with no common hue stay grey. */
export const ColourFamilies: Story = {};

export const Quantity: Story = { args: { defaultMode: "quantity" } };

/** Without a colour function every group is drawn in neutral tones: use this for vendors, categories or product lines. */
export const NeutralGroups: Story = {
    args: { mix: demandMix(supplies, supplyCycles, (r) => vendorOf.get(r.itemId)), cycles: supplyCycles, colorOf: undefined, unit: "units" },
};

export const FewerGroups: Story = { args: { maxGroups: 4 } };

export const OneCycle: Story = { args: { cycles: polishCycles.slice(0, 1), mix: demandMix(opi, polishCycles.slice(0, 1), (r) => r.family) } };

export const NoOrders: Story = { args: { mix: [], cycles: [] } };

export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
