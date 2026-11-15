import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NotificationBell } from "./notification-bell";

const meta: Meta<typeof NotificationBell> = {
    title: "Meraki/Notification bell",
    component: NotificationBell,
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="flex min-h-[36rem] items-start justify-end rounded-xl bg-primary p-3 ring-1 ring-secondary ring-inset">
                <Story />
            </div>
        ),
    ],
    args: { userId: "u-mgr-lyn" },
};

export default meta;
type Story = StoryObj<typeof NotificationBell>;

/** Desktop: press the bell for the latest notifications. Sample entries with fictional names. */
export const Manager: Story = {};
export const Technician: Story = { args: { userId: "u-tech-1" } };
/** Nothing unread: no count on the bell. */
export const AllRead: Story = { args: { userId: "u-tech-2" } };
/** Phone: the bell is a link to the notifications screen. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
