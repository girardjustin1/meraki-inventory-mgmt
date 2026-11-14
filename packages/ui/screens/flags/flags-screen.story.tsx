import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { FlagsScreen } from "./flags-screen";

const owner = users.find((u) => u.role === "owner") as User;

const meta: Meta<typeof FlagsScreen> = { title: "Screens/Flags/Review queue", component: FlagsScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof FlagsScreen>;

/** Lynnfield queue as the manager: list on the left, the selected flag on the right. */
export const Desktop: Story = {};

/** Phone: the list alone. Tapping a flag opens it as its own page with a back link. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

export const HighOnly: Story = { args: { severity: ["high"] } };

/** Resolved and dismissed flags, kept with their outcome and notes. */
export const Resolved: Story = { args: { tab: "closed" } };

/** A clean queue. */
export const Empty: Story = { args: { flags: [] } };

/** Newburyport as the owner, who sees both locations. */
export const Newburyport: Story = { args: { location: "newburyport", user: owner } };
