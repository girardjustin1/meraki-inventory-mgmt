import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { flags, users } from "@/data/inventory";
import type { User } from "@/data/types";
import { FlagDetailScreen } from "./flag-detail-screen";

const owner = users.find((u) => u.role === "owner") as User;
const countVariance = flags.find((f) => f.type === "count-variance" && f.severity === "high") ?? flags.find((f) => f.type === "count-variance");
const reviewing = flags.find((f) => f.status === "reviewing");

const meta: Meta<typeof FlagDetailScreen> = { title: "Screens/Flags/Flag detail", component: FlagDetailScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof FlagDetailScreen>;

/** A receiving mismatch from the imported 2026 orders, seen by the Lynnfield manager. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** A count that came in well short. Sample data, viewed by the owner. */
export const CountVariance: Story = { args: { flagId: countVariance?.id, user: owner } };

/** Mid-review. The signed-in manager made the adjustment, so they can add notes but not close it. */
export const Reviewing: Story = { args: { flagId: reviewing?.id } };

/** The same flag as the owner, who is assigned and can close it (PIN required: high severity). */
export const ReviewingAsOwner: Story = { args: { flagId: reviewing?.id, user: owner } };

export const Resolved: Story = {
    args: {
        user: owner,
        status: "resolved",
        assignedTo: owner.id,
        outcome: "corrected",
        resolutionNote: "Packing slip shows one bottle shipped and one back-ordered. Receipt was right; the order line was reduced to 1 and no credit is due.",
    },
};
