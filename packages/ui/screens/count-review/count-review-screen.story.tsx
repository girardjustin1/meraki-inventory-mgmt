import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { CountReviewScreen } from "./count-review-screen";

const meta: Meta<typeof CountReviewScreen> = { title: "Screens/Counts/Count review", component: CountReviewScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof CountReviewScreen>;

/** Supply Closet: submitted yesterday with two lines well short. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
/** A count that was approved last week: read only, with the adjustments it posted. */
export const Approved: Story = { args: { sessionId: "cs-lyn-nail" } };

const counter = users.find((u) => u.id === "u-tech-1") as User;
/**
 * The reviewer is the person who counted. Shown here as if Sam Patel held the manager role,
 * to demonstrate that even someone allowed to approve counts cannot approve their own.
 */
export const OwnCount: Story = { args: { user: { ...counter, role: "manager" } } };
