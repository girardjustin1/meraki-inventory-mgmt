import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CountsScreen } from "./counts-screen";

const meta: Meta<typeof CountsScreen> = { title: "Screens/Counts/Counts", component: CountsScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof CountsScreen>;

export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
/** Newburyport has one count that is nine days overdue. */
export const Newburyport: Story = { args: { location: "newburyport" } };
