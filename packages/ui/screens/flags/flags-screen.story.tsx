import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { flags, users } from "@/data/inventory";
import type { User } from "@/data/types";
import { FlagsScreen } from "./flags-screen";

const owner = users.find((u) => u.role === "owner") as User;
const technician = users.find((u) => u.role === "technician") as User;
const mobile = { viewport: { value: "mobile", isRotated: false } };

const open = flags.filter((f) => f.locationId === "lynnfield" && f.status === "open");
/** Three high-severity flags and two low ones, the mix a careless "select all, dismiss" would catch. */
const MIXED = [...open.filter((f) => f.severity === "high").slice(0, 3), ...open.filter((f) => f.severity === "low").slice(0, 2)].map((f) => f.id);

const meta: Meta<typeof FlagsScreen> = { title: "Screens/Flags/Review queue", component: FlagsScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof FlagsScreen>;

/** Lynnfield queue as the manager: one line per flag, the most serious first. A row opens the flag beside the list. */
export const Desktop: Story = {};

/** Phone: two-line cards. Tapping one opens the flag as its own page with a back link. */
export const Mobile: Story = { globals: mobile };

/** Rows ticked: the bulk bar lies over the column headers with what can be done to them. */
export const Selected: Story = { args: { initialSelected: MIXED } };

/** Phone, selecting: the bar docks above the tab bar. */
export const MobileSelected: Story = { args: { initialSelected: MIXED.slice(0, 2) }, globals: mobile };

/** Dismissing a selection that holds high-severity flags: they are named, and stay in the queue unless the box is ticked. */
export const DismissHighSeverity: Story = { args: { initialSelected: MIXED, initialDialog: "dismiss" } };

/** Resolving several flags with one outcome and one note. */
export const ResolveSelected: Story = { args: { initialSelected: MIXED.slice(0, 2), initialDialog: "resolve" } };

/** Choosing who reviews the selected flags. */
export const AssignSelected: Story = { args: { initialSelected: MIXED.slice(0, 2), initialDialog: "assign" } };

/** A search and filter that match nothing in this view, with the way back. */
export const FilteredToNothing: Story = { args: { severity: ["high"], initialQuery: "acetone", initialTypes: ["over-par"] } };

/** A deep link with filters set: high and medium count variances. */
export const Filtered: Story = { args: { severity: ["high", "medium"], initialTypes: ["count-variance"] } };

/** Resolved and dismissed flags, kept with their outcome. */
export const Closed: Story = { args: { tab: "closed" } };

/** A clean queue. */
export const Empty: Story = { args: { flags: [] } };

/** A technician's role does not include the review queue. */
export const AsTechnician: Story = { args: { user: technician } };

/** Newburyport as the owner, who sees both locations. */
export const Newburyport: Story = { args: { location: "newburyport", user: owner } };
