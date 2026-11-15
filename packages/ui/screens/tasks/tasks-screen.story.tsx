import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { TasksScreen } from "./tasks-screen";

const sam = users.find((u) => u.id === "u-tech-1") as User;
const riley = users.find((u) => u.id === "u-mgr-nbp") as User;

const meta: Meta<typeof TasksScreen> = { title: "Screens/Tasks/Tasks", component: TasksScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof TasksScreen>;

/** The Lynnfield manager: their own tasks, what they asked of others, and everything at the location. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
/** Sam Patel sees only what is assigned to them and cannot hand out tasks. */
export const AsTechnician: Story = { args: { user: sam } };
/** Newburyport has no sample tasks, seen by its manager. */
export const Empty: Story = { args: { location: "newburyport", user: riley } };
