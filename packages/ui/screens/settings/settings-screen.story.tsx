import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SettingsScreen } from "./settings-screen";

const meta: Meta<typeof SettingsScreen> = { title: "Screens/Settings/Settings", component: SettingsScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof SettingsScreen>;

export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
export const FlagRules: Story = { args: { tab: "flag-rules" } };
export const Vendors: Story = { args: { tab: "vendors" } };
export const LocationsAndShelves: Story = { args: { tab: "locations" } };
export const Security: Story = { args: { tab: "security" } };
export const Integrations: Story = { args: { tab: "integrations" } };
export const Data: Story = { args: { tab: "data" } };
