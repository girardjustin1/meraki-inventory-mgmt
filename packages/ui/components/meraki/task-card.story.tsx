import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { tasks } from "@/data/inventory";
import type { Task } from "@/data/types";
import { TaskCard } from "./task-card";

const byId = (id: string) => tasks.find((t) => t.id === id) ?? (tasks[0] as Task);
const inProgress = byId("task-pickup-supply");
const assigned = byId("task-pickup-costco");
const review = byId("task-review-closet");
const done = byId("task-done-run");
const overdue: Task = { ...assigned, id: "task-overdue", title: "Costco run for Lynnfield", dueAt: "2026-11-12T13:00:00Z" };

const meta: Meta<typeof TaskCard> = {
    title: "Meraki/Task card",
    component: TaskCard,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-xl">
                <Story />
            </div>
        ),
    ],
    args: { task: inProgress },
};

export default meta;
type Story = StoryObj<typeof TaskCard>;

/** A pickup run under way: 3 of 8 lines picked, one short. Sample task with fictional names. */
export const Compact: Story = {};
export const Full: Story = { args: { variant: "full" } };
export const NotStarted: Story = { args: { task: assigned, variant: "full" } };
/** Seen by the person it is assigned to. */
export const AssignedToYou: Story = { args: { task: assigned, variant: "full", viewerId: assigned.assigneeId } };
export const Overdue: Story = { args: { task: overdue, variant: "full" } };
export const Done: Story = { args: { task: done, variant: "full" } };
export const ReviewTask: Story = { args: { task: review } };

export const List: Story = {
    render: () => (
        <div className="flex flex-col gap-2">
            {[overdue, ...tasks].map((t) => (
                <TaskCard key={t.id} task={t} />
            ))}
        </div>
    ),
};

export const Mobile: Story = { args: { variant: "full" }, globals: { viewport: { value: "mobile", isRotated: false } } };
