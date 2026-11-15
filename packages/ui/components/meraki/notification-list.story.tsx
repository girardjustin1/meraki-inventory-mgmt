import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card } from "@/components/meraki/app-shell";
import { notifications, notificationsForUser } from "@/data/inventory";
import type { AppNotification } from "@/data/types";
import { NotificationList, useNotificationState } from "./notification-list";
import type { NotificationListProps } from "./notification-list";

/** Holds read state so the dots work in the story. */
const Stateful = ({ notifications: initial, ...props }: NotificationListProps) => {
    const inbox = useNotificationState(initial);
    return <NotificationList {...props} notifications={inbox.items} onToggleRead={inbox.toggleRead} onOpen={inbox.markRead} />;
};

/** One of each type, for checking icons and tones. */
const everyType: AppNotification[] = [
    ...notifications,
    {
        id: "ntf-x",
        userId: "u-mgr-lyn",
        type: "order-approved",
        actorId: "u-owner",
        title: "Avery Chen approved your order",
        body: "PO-LYN-2611-S1 to Nail Supply Store.",
        href: "/orders",
        createdAt: "2026-11-10T15:00:00Z",
        emailed: false,
    },
];

const meta: Meta<typeof NotificationList> = {
    title: "Meraki/Notification list",
    component: NotificationList,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    render: (args) => (
        <Card padded={false} className={args.variant === "compact" ? "max-w-sm overflow-hidden" : "max-w-2xl overflow-hidden"}>
            <Stateful {...args} />
        </Card>
    ),
    args: { notifications: notificationsForUser("u-mgr-lyn") },
};

export default meta;
type Story = StoryObj<typeof NotificationList>;

/** The Lynnfield manager's inbox. Sample entries with fictional names. */
export const Full: Story = {};
export const Compact: Story = { args: { variant: "compact", notifications: notificationsForUser("u-mgr-lyn").slice(0, 6) } };
export const EveryType: Story = { args: { notifications: everyType } };
export const Empty: Story = { args: { notifications: [] } };
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
