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
