import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ReportsScreen } from "./reports-screen";

const meta: Meta<typeof ReportsScreen> = { title: "Screens/Reports/Reports", component: ReportsScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof ReportsScreen>;

export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
/** Newburyport has one order form on file and no receipts, so most real cards explain what is missing. */
export const Newburyport: Story = { args: { location: "newburyport" } };
