import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { TaskDetailScreen } from "./task-detail-screen";

const jordan = users.find((u) => u.id === "u-mgr-lyn") as User;

const meta: Meta<typeof TaskDetailScreen> = { title: "Screens/Tasks/Pickup run", component: TaskDetailScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof TaskDetailScreen>;

/** Morgan Lee in the store, part way through the nail supply store pickup: 3 of 8 picked, one short. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
export const Desktop: Story = {};

/** Sam Patel has been asked to do the Costco run and has not answered yet. */
export const Assigned: Story = { args: { taskId: "task-pickup-costco" }, globals: { viewport: { value: "mobile", isRotated: false } } };

/** The last step in the store: what was short, what it cost, then done. */
export const FinishStep: Story = { args: { initialStep: "finish" }, globals: { viewport: { value: "mobile", isRotated: false } } };

/** A finished run, with what was paid. */
export const Done: Story = { args: { taskId: "task-done-run" } };

/** Jordan Blake, who asked for the run, watching it: read-only progress, remind, reassign, cancel. */
export const AskerView: Story = { args: { user: jordan } };

/** A task that is not a pickup run: a count to review, with a link to the count. */
export const ReviewTask: Story = { args: { taskId: "task-review-closet" } };
