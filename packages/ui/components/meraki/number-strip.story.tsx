import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { NumberComparison, NumberStrip } from "./number-strip";

const meta: Meta<typeof NumberStrip> = {
    title: "Meraki/Number strip",
    component: NumberStrip,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    args: {
        "aria-label": "Lynnfield, numbers that need action",
        items: [
            { label: "To reorder", value: 40, note: "4 out", noteTone: "bad", href: "/stock?status=low" },
            { label: "To review", value: 30, note: "10 high", noteTone: "bad", href: "/flags" },
            { label: "To receive", value: 120, note: "114 unconfirmed", noteTone: "warning", href: "/receive" },
        ],
    },
};

export default meta;
type Story = StoryObj<typeof NumberStrip>;

/** Three numbers a manager acts on. Each cell links to the list behind it. */
export const Default: Story = {};

/** On a phone: one row of three compact tiles. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** Front desk sees two: no flags. */
export const TwoNumbers: Story = {
    args: {
        items: [
            { label: "To reorder", value: 40, note: "4 out", noteTone: "bad", href: "/stock?status=low" },
            { label: "To receive", value: 6, href: "/receive" },
        ],
    },
    decorators: [
        (Story) => (
            <div className="max-w-md">
                <Story />
            </div>
        ),
    ],
};

/** Nothing to act on: zeros, no notes, no colour. */
export const AllClear: Story = {
    args: {
        items: [
            { label: "To reorder", value: 0, href: "/stock?status=low" },
            { label: "To review", value: 0, href: "/flags" },
            { label: "To receive", value: 0, href: "/receive" },
        ],
    },
};

/** Admins: the same three numbers for each location, one slim row each. */
export const Comparison: Story = {
    render: () => (
        <NumberComparison
            aria-label="Both locations, numbers that need action"
            rowHeader="Location"
            columns={["To reorder", "To review", "To receive"]}
            rows={[
                {
                    id: "lynnfield",
                    label: "Lynnfield",
                    current: true,
                    cells: [
                        { value: 40, note: "4 out", noteTone: "bad", href: "/stock?status=low" },
                        { value: 30, note: "10 high", noteTone: "bad", href: "/flags" },
                        { value: 120, note: "114 unconfirmed", noteTone: "warning", href: "/receive" },
                    ],
                    action: (
                        <Badge type="pill-color" color="brand" size="sm">
                            Viewing
                        </Badge>
                    ),
                },
                {
                    id: "newburyport",
                    label: "Newburyport",
                    cells: [{ value: 12, note: "2 out", noteTone: "bad" }, { value: 5 }, { value: 0 }],
                    action: (
                        <Button color="link-color" size="sm">
                            Switch
                        </Button>
                    ),
                },
            ]}
        />
    ),
};
