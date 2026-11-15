import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PermissionMatrix, PermissionSummary } from "./permission-matrix";

const meta: Meta<typeof PermissionMatrix> = {
    title: "Meraki/Permission matrix",
    component: PermissionMatrix,
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="mx-auto max-w-4xl rounded-xl bg-primary ring-1 ring-secondary ring-inset max-lg:p-4">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof PermissionMatrix>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

export const Default: Story = {};

/** One column emphasised, as on the invite review step. */
export const HighlightFrontDesk: Story = { args: { highlight: { access: "user", role: "front-desk" }, highlightLabel: "This invite" } };

export const HighlightAdmin: Story = { args: { highlight: { access: "admin", role: "manager" }, highlightLabel: "This invite" } };

/** Below `lg` the table becomes a role picker and one list. */
export const Mobile: Story = { globals: mobile };

export const MobileHighlight: Story = { args: { highlight: { access: "user", role: "technician" }, highlightLabel: "You" }, globals: mobile };

/** Forced list layout for a narrow container on a wide screen. */
export const ListLayout: Story = {
    args: { layout: "list" },
    decorators: [
        (Story) => (
            <div className="max-w-md p-4">
                <Story />
            </div>
        ),
    ],
};

/** The compact answer used in the invite form and on the sign-up screen. */
export const Summary: Story = {
    render: () => (
        <div className="grid gap-4 p-4 md:grid-cols-2 lg:p-5">
            <PermissionSummary access="user" role="technician" locations={["lynnfield"]} />
            <PermissionSummary access="user" role="front-desk" locations={["newburyport"]} />
            <PermissionSummary access="user" role="manager" locations={["lynnfield", "newburyport"]} />
            <PermissionSummary access="admin" role="manager" />
        </div>
    ),
};
