import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TODAY, forecasts, getItem, items, measuredCycleDays, vendors } from "@/data/inventory";
import { reorderCalendar } from "@/engine/insights";
import { ROUTES } from "./app-shell";
import { ReorderTimeline } from "./reorder-timeline";

const lynnfield = forecasts.filter((f) => f.locationId === "lynnfield");
const quoted = reorderCalendar(lynnfield, items, vendors, TODAY, { horizonDays: 90 });
const measured = reorderCalendar(lynnfield, items, vendors, TODAY, { horizonDays: 90, leadTimeOverrideDays: measuredCycleDays });
const unitOf = (id: string) => getItem(id)?.unit;

const meta: Meta<typeof ReorderTimeline> = {
    title: "Meraki/Reorder timeline",
    component: ReorderTimeline,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-5xl rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset lg:p-5">
                <Story />
            </div>
        ),
    ],
    args: { events: quoted, today: TODAY, horizonDays: 90, unitOf, hrefOf: ROUTES.item },
};

export default meta;
type Story = StoryObj<typeof ReorderTimeline>;

/** Lynnfield supplies with the vendors' quoted lead times. On-hand numbers are sample values. */
export const QuotedLeadTimes: Story = {};

/** The same items planned with the measured order-to-shelf time: the delivery wait is longer, so order dates move earlier. */
export const MeasuredCycle: Story = { args: { events: measured } };

export const GroupedByVendor: Story = { args: { groupByVendor: true, maxRows: 20 } };

/** The phone layout: an agenda grouped by the week the order has to go out. */
export const Agenda: Story = { args: { layout: "agenda" }, globals: { viewport: { value: "mobile", isRotated: false } } };

export const FewRows: Story = { args: { maxRows: 5 } };

export const NothingDue: Story = { args: { events: [] } };
