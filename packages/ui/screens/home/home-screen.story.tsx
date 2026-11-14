import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { HomeScreen } from "./home-screen";

const byId = (id: string) => users.find((u) => u.id === id) as User;

const meta: Meta<typeof HomeScreen> = { title: "Screens/Overview/Home", component: HomeScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof HomeScreen>;

/** Lynnfield manager: stats, flags and reorder suggestions, with today's tasks beside them. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** Owner: both locations compared at the top, and approvals first. */
export const Owner: Story = { args: { user: byId("u-owner") } };

/** Front desk on a phone: Scan and their own tasks first, no costs and no flags. */
export const FrontDesk: Story = { args: { user: byId("u-fd-lyn") }, globals: { viewport: { value: "mobile", isRotated: false } } };

/** Newburyport has one order form on file, so most of its numbers are estimates. */
export const Newburyport: Story = { args: { location: "newburyport", user: byId("u-mgr-nbp") } };
