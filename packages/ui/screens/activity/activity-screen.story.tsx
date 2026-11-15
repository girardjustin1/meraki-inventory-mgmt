import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { ActivityScreen } from "./activity-screen";

const owner = users.find((u) => u.role === "owner") as User;
const technician = users.find((u) => u.role === "technician") as User;
const mobile = { viewport: { value: "mobile", isRotated: false } };

const meta: Meta<typeof ActivityScreen> = { title: "Screens/Activity/Activity log", component: ActivityScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof ActivityScreen>;

/** Everything logged at Lynnfield, newest first, one line per entry under a heading for each day. */
export const Desktop: Story = {};

/** Phone: two-line cards under the same day headings. */
export const Mobile: Story = { globals: mobile };

/** Filtered to one person: everything a technician logged. */
export const OnePerson: Story = { args: { initialPeople: [technician.id] } };

/** A search and filters that match nothing, with the way back. */
export const FilteredToNothing: Story = { args: { type: "adjust", initialRange: "7", initialQuery: "acetone" } };

/** Only stock adjustments: the reason, the before and after, and the signed change. */
export const AdjustmentsOnly: Story = { args: { type: "adjust" } };

/** Adjustments sorted by the size of the change, which drops the day headings. */
export const LargestChange: Story = { args: { type: "adjust", initialSort: "largest" } };

/** Receipts imported from the 2026 backlog. */
export const ReceiptsOnly: Story = { args: { type: "receive" } };

/** The owner looking at both locations at once. */
export const BothLocations: Story = { args: { user: owner, initialAllLocations: true } };

/** A technician's role does not include the log. */
export const AsTechnician: Story = { args: { user: technician } };
