import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { invites } from "@/data/inventory";
import type { Invite } from "@/data/types";
import { InviteLinkCard } from "./invite-link-card";

const byId = (id: string) => invites.find((i) => i.id === id) as Invite;

const meta: Meta<typeof InviteLinkCard> = {
    title: "Meraki/Invite link card",
    component: InviteLinkCard,
    parameters: { layout: "padded" },
    args: { invite: byId("inv-1") },
    decorators: [
        (Story) => (
            <div className="mx-auto max-w-xl">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof InviteLinkCard>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

/** Bound to one email: only that Google account can accept it. */
export const EmailBound: Story = {};

/** No email: whoever holds the link can use it, so it expires in 48 hours. */
export const OpenLink: Story = { args: { invite: byId("inv-2") } };

export const AdminInvite: Story = { args: { invite: byId("inv-3") } };

export const WithoutQr: Story = { args: { showQr: false } };

export const Mobile: Story = { args: { invite: byId("inv-2") }, globals: mobile };

/** Past states never show the link or the code. */
export const Expired: Story = { args: { invite: byId("inv-5") } };

export const Revoked: Story = { args: { invite: byId("inv-6") } };
