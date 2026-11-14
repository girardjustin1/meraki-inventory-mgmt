import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { NotificationsScreen } from "./notifications-screen";

const sam = users.find((u) => u.id === "u-tech-1") as User;
const taylor = users.find((u) => u.id === "u-tech-2") as User;

const meta: Meta<typeof NotificationsScreen> = { title: "Screens/Notifications/Inbox", component: NotificationsScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof NotificationsScreen>;

/** The Lynnfield manager's inbox. Sample entries. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
export const UnreadOnly: Story = { args: { initialFilter: "unread" } };
export const Mentions: Story = { args: { initialFilter: "mentions" } };
/** Someone with nothing in their inbox yet. */
export const Empty: Story = { args: { user: taylor } };
/** Sam Patel: a mention on a flag and a pickup run to accept. */
export const AsTechnician: Story = { args: { user: sam } };
