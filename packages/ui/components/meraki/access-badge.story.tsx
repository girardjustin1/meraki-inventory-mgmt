import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RoleBadge } from "@/components/meraki/status-badges";
import { users } from "@/data/inventory";
import { ACCESS_DESCRIPTION } from "@/engine/permissions";
import { AccessBadge } from "./access-badge";

const meta: Meta<typeof AccessBadge> = {
    title: "Meraki/Access badge",
    component: AccessBadge,
    parameters: { layout: "padded" },
    args: { access: "admin" },
};

export default meta;
type Story = StoryObj<typeof AccessBadge>;

export const Admin: Story = {};
export const User: Story = { args: { access: "user" } };

/** Both levels at both sizes, with the sentence that explains each. */
export const All: Story = {
    render: () => (
        <div className="flex max-w-md flex-col gap-5">
            {(["admin", "user"] as const).map((access) => (
                <div key={access} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <AccessBadge access={access} size="sm" />
                        <AccessBadge access={access} size="md" />
                    </div>
                    <p className="text-sm text-tertiary">{ACCESS_DESCRIPTION[access]}</p>
                </div>
            ))}
        </div>
    ),
};

/** Next to a role pill, the way the Team table and the More tab show it. */
export const WithRole: Story = {
    render: () => (
        <ul className="flex max-w-md flex-col gap-3">
            {users.slice(0, 4).map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-primary">{u.name}</span>
                    <span className="flex items-center gap-1.5">
                        <RoleBadge role={u.role} />
                        <AccessBadge access={u.access} />
                    </span>
                </li>
            ))}
        </ul>
    ),
};
