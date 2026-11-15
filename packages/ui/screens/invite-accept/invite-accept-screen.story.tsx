import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InviteAcceptScreen } from "./invite-accept-screen";

const meta: Meta<typeof InviteAcceptScreen> = {
    title: "Screens/Auth/Accept invite",
    component: InviteAcceptScreen,
    parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof InviteAcceptScreen>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

/** Landing from an email-bound invite link: a technician invited by their manager. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: mobile };

/** An invite that makes the person an admin at every location. */
export const AdminInvite: Story = { args: { token: "mk_Rt5NcA2pXg8LfV1b" } };
/** An open link: no email, no name, whoever holds it can use it once. */
export const OpenLink: Story = { args: { token: "mk_Hs81KdZe3YwUq0Jm" } };
export const OpenLinkMobile: Story = { args: { token: "mk_Hs81KdZe3YwUq0Jm" }, globals: mobile };

export const ProfileStep: Story = { args: { step: "profile" } };
export const PinStep: Story = { args: { step: "pin" } };
export const PinStepMobile: Story = { args: { step: "pin" }, globals: mobile };
export const Done: Story = { args: { step: "done" } };
export const DoneMobile: Story = { args: { step: "done" }, globals: mobile };
/** A new admin is also pointed at the Team screen. */
export const DoneAdmin: Story = { args: { step: "done", token: "mk_Rt5NcA2pXg8LfV1b" } };

/** The link ran out. The next step is to ask the inviter for a new one. */
export const Expired: Story = { args: { token: "mk_Yn3GvP6oCx1TrL8w" } };
export const ExpiredMobile: Story = { args: { token: "mk_Yn3GvP6oCx1TrL8w" }, globals: mobile };
/** An admin switched the link off. */
export const Revoked: Story = { args: { token: "mk_Uf9JhD5sAe0MkQ2z" } };
/** Already accepted: sign in instead. */
export const AlreadyUsed: Story = { args: { token: "mk_Bz4WqE7uMi2SdK9h" } };
/** A token that matches nothing. */
export const NotFound: Story = { args: { token: "mk_notARealToken0000" } };
/** Signed in to Google as someone other than the address the invite was sent to. */
export const WrongAccount: Story = { args: { signedInEmail: "devon.personal@example.com" } };
export const WrongAccountMobile: Story = { args: { signedInEmail: "devon.personal@example.com" }, globals: mobile };
/** Signed in as someone who is already on the team, opening an open link. */
export const AlreadyMember: Story = { args: { token: "mk_Hs81KdZe3YwUq0Jm", signedInEmail: "tech1@example.com" } };
