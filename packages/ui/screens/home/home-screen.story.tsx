import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { HomeScreen } from "./home-screen";

const byId = (id: string) => users.find((u) => u.id === id) as User;

const meta: Meta<typeof HomeScreen> = { title: "Screens/Overview/Home", component: HomeScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof HomeScreen>;

/** Lynnfield manager: one sentence, three numbers, then today's list with flags and low stock beside it. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** Owner (admin): the same three numbers for both locations in two slim rows, and approvals in today's list. */
export const Owner: Story = { args: { user: byId("u-owner") } };

/** Front desk on a phone: a large Scan button and their own list first. No flags, no costs. */
export const FrontDesk: Story = { args: { user: byId("u-fd-lyn") }, globals: { viewport: { value: "mobile", isRotated: false } } };

/** Technician: Scan, their count and pickup run, and what is running low. Nothing else. */
export const Technician: Story = { args: { user: byId("u-tech-1") } };

/** Newburyport has one order form on file, so most of its numbers are estimates. */
export const Newburyport: Story = { args: { location: "newburyport", user: byId("u-mgr-nbp") } };

/** All clear: zeros in the strip and one quiet line in each list. */
export const NothingToDo: Story = {
    args: {
        data: {
            numbers: { out: 0, low: 0, openFlags: 0, highFlags: 0, toReceive: 0, unconfirmed: 0 },
            today: [],
            flags: [],
            runningLow: [],
        },
    },
};
