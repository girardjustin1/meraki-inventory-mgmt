import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card } from "@/components/meraki/app-shell";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { OrderTimeline } from "./order-timeline";

const owner = users.find((u) => u.role === "owner") as User;
const orderId = "lynnfield-2026-11-supply-nail-supply-store";

const meta: Meta<typeof OrderTimeline> = {
    title: "Meraki/Order timeline",
    component: OrderTimeline,
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <Card className="flex max-w-2xl flex-col gap-4">
                <h2 className="text-md font-semibold text-primary">Timeline</h2>
                <Story />
            </Card>
        ),
    ],
    args: {
        subject: { type: "order", id: orderId },
        subjectTitle: "PO-LYN-2611-S1",
        href: `/orders/${orderId}`,
        location: "lynnfield",
        events: [
            { id: "created", at: "2026-11-12", text: "Jordan Blake created this order." },
            { id: "submitted", at: "2026-11-12", text: "Jordan Blake submitted it for approval." },
        ],
    },
};
export default meta;
type Story = StoryObj<typeof OrderTimeline>;

/** An order waiting for approval: two status events and the manager's note, newest first. */
export const Default: Story = {};

/** The owner reading: the note mentions them, and later events carry a tone. */
export const Approved: Story = {
    args: {
        user: owner,
        events: [
            { id: "created", at: "2026-11-12", text: "Jordan Blake created this order." },
            { id: "submitted", at: "2026-11-12", text: "Jordan Blake submitted it for approval." },
            {
                id: "sent-back",
                at: "2026-11-13T09:10:00Z",
                text: "Avery Chen sent it back.",
                detail: "“Halve the paper towels, we still have a case.”",
                tone: "warning",
            },
            { id: "approved", at: "2026-11-14T08:30:00Z", text: "Avery Chen approved it.", tone: "good" },
            { id: "sent", text: "Sent to Nail Supply Store." },
        ],
    },
};

/** Nothing written yet: only the status events. */
export const NoNotes: Story = { args: { initialNotes: [] } };

export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
