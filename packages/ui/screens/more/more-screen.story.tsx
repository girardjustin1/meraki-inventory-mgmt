import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import { MoreScreen } from "./more-screen";

const meta: Meta<typeof MoreScreen> = { title: "Screens/Overview/More", component: MoreScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof MoreScreen>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

export const Mobile: Story = { globals: mobile };
export const Desktop: Story = {};
export const OwnerNewburyport: Story = { args: { location: "newburyport", user: users[0] }, globals: mobile };
/** An admin on desktop: the access badge on the card, and both Team and Settings. */
export const Admin: Story = { args: { user: users[0] } };
/** A user who is not an admin: Team is there to read, Settings is not offered. */
export const Technician: Story = { args: { user: users.find((u) => u.role === "technician") }, globals: mobile };
