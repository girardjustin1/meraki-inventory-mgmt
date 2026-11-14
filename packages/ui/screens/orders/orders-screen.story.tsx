import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { OrdersScreen } from "./orders-screen";

const meta: Meta<typeof OrdersScreen> = { title: "Screens/Orders/Orders", component: OrdersScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof OrdersScreen>;

/** Lynnfield, opening on what needs action: one order awaiting approval and two drafts. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** Orders that were placed and are still waiting on deliveries, from the 2026 backlog. */
export const OpenTab: Story = { args: { tab: "open" } };

export const AllOrders: Story = { args: { tab: "all" } };

/** Newburyport has one order form on file, so the list is short. */
export const Newburyport: Story = { args: { location: "newburyport" } };
