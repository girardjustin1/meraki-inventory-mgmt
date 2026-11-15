import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DigestScreen } from "./digest-screen";

const meta: Meta<typeof DigestScreen> = { title: "Screens/Digests/Digest", component: DigestScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof DigestScreen>;

export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
export const Monthly: Story = { args: { period: "monthly", location: "lynnfield" } };
export const MonthlyAllLocations: Story = { args: { period: "monthly", location: "all" } };
