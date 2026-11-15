import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userById } from "@/data/inventory";
import { CountsScreen } from "./counts-screen";

const meta: Meta<typeof CountsScreen> = { title: "Screens/Counts/Counts", component: CountsScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof CountsScreen>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

/** One scheduled, one under way and one already handed in. */
const SOME = ["cs-lyn-cleaning", "cs-lyn-wax", "cs-lyn-closet"];

/** Every count at Lynnfield, work still to do first. One line per count; the whole row opens it. */
export const Desktop: Story = {};

/** Compact cards, with filters behind one button and "Select" to start picking counts. */
export const Mobile: Story = { globals: mobile };

/** Rows selected: the bulk bar takes the place of the column headers. */
export const Selected: Story = { args: { initialSelected: SOME } };

/** Selection on a phone: the bulk bar docks above the tab bar. */
export const MobileSelected: Story = { args: { initialSelected: SOME.slice(0, 2) }, globals: mobile };

/** Picking who takes the selected counts. The one already handed in is left alone. */
export const Assigning: Story = { args: { initialSelected: SOME, initialDialog: "assign" } };

/** A view and filter that match nothing: the empty state offers the way back. */
export const NoMatches: Story = { args: { initialView: "review", initialFilters: { assignee: ["u-fd-lyn"] } } };

/** Counts waiting for a manager, most variance first. */
export const ToReview: Story = { args: { initialView: "review", initialSort: "variance" } };

/** Newburyport, as its manager: one count, nine days overdue. "Overdue" is said in words, not only in colour. */
export const Newburyport: Story = { args: { location: "newburyport", user: userById("u-mgr-nbp") } };

/** A technician can open and export counts, but not schedule, reassign, move or cancel them. */
export const AsTechnician: Story = { args: { user: userById("u-tech-1"), initialSelected: SOME.slice(0, 2) } };
