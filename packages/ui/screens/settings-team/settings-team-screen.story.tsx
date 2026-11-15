import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { SettingsTeamScreen } from "./settings-team-screen";

/** The owner, who is always an admin. Most stories use them because only admins manage the team. */
const owner = users.find((u) => u.role === "owner") as User;

const meta: Meta<typeof SettingsTeamScreen> = {
    title: "Screens/Settings/Team",
    component: SettingsTeamScreen,
    parameters: { layout: "fullscreen" },
    args: { user: owner },
};
export default meta;
type Story = StoryObj<typeof SettingsTeamScreen>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

/** Members, as an admin: every row has actions. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: mobile };

/** Pending invites with their links, and the past ones. */
export const Invites: Story = { args: { initialTab: "invites" } };
export const InvitesMobile: Story = { args: { initialTab: "invites" }, globals: mobile };

/** Step 1 of the invite flow. A dialog on desktop, a full-screen sheet on a phone. */
export const InviteFlow: Story = { args: { inviteOpen: true } };
export const InviteFlowMobile: Story = { args: { inviteOpen: true }, globals: mobile };
/** Step 2: role, access level, locations and the live summary. */
export const InviteFlowAccess: Story = { args: { inviteOpen: true, inviteStep: "what" } };
/** The success state: the link, the QR code and who can use it. */
export const InviteCreated: Story = { args: { inviteOpen: true, inviteStep: "created" } };
export const InviteCreatedMobile: Story = { args: { inviteOpen: true, inviteStep: "created" }, globals: mobile };

export const Permissions: Story = { args: { initialTab: "permissions" } };
export const PermissionsMobile: Story = { args: { initialTab: "permissions" }, globals: mobile };

/** A manager who is not an admin: a read-only list of their own location's teammates. */
export const AsManager: Story = { args: { user: users.find((u) => u.id === "u-mgr-lyn") } };
export const AsManagerMobile: Story = { args: { user: users.find((u) => u.id === "u-mgr-lyn") }, globals: mobile };

/** The confirmation before a user becomes an admin, spelling out what they gain. */
export const MakeAdminConfirm: Story = { args: { confirmAccessFor: "u-mgr-lyn" } };
