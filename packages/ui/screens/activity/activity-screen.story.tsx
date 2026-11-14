import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ActivityScreen } from "./activity-screen";

const meta: Meta<typeof ActivityScreen> = { title: "Screens/Activity/Activity log", component: ActivityScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof ActivityScreen>;

/** Everything logged at Lynnfield, newest first, grouped by day. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** Only stock adjustments, each with its before and after quantity and the reason given. */
export const AdjustmentsOnly: Story = { args: { type: "adjust" } };

/** Receipts imported from the 2026 backlog. */
export const ReceiptsOnly: Story = { args: { type: "receive" } };
