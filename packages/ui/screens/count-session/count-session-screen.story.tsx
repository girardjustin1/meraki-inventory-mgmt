import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CountSessionScreen } from "./count-session-screen";

const meta: Meta<typeof CountSessionScreen> = { title: "Screens/Counts/Count session", component: CountSessionScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof CountSessionScreen>;

/** The primary view: Cleaning Closet, 5 of 12 lines already counted. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
export const Desktop: Story = {};
/** Wax Room: nothing counted yet, with several items tracked by fill level. */
export const NotStarted: Story = { args: { sessionId: "cs-lyn-wax" }, globals: { viewport: { value: "mobile", isRotated: false } } };
/** The submit step, with seven lines still uncounted. */
export const ReviewStep: Story = { args: { initialStep: "review" }, globals: { viewport: { value: "mobile", isRotated: false } } };
