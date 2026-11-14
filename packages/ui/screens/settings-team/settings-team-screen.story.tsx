import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SettingsTeamScreen } from "./settings-team-screen";

const meta: Meta<typeof SettingsTeamScreen> = { title: "Screens/Settings/Team", component: SettingsTeamScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof SettingsTeamScreen>;

export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
export const InviteTeammate: Story = { args: { inviteOpen: true } };
