import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card, CardHeader } from "@/components/meraki/app-shell";
import { notes, users } from "@/data/inventory";
import type { Note, User } from "@/data/types";
import { NoteThread } from "./note-thread";

const flagNote = notes.find((n) => n.subject.type === "flag") as Note;
const sam = users.find((u) => u.id === "u-tech-1") as User;
const morgan = users.find((u) => u.id === "u-fd-lyn") as User;

const meta: Meta<typeof NoteThread> = {
    title: "Meraki/Note thread",
    component: NoteThread,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <Card className="flex max-w-xl flex-col gap-4">
                <CardHeader title="Notes" description="What people checked and found. Notes cannot be edited once added." />
                <Story />
            </Card>
        ),
    ],
    args: { subject: flagNote.subject, subjectTitle: "Count came in short", href: `/flags/${flagNote.subject.id}`, location: "lynnfield" },
};

export default meta;
type Story = StoryObj<typeof NoteThread>;

/** Sample notes on a flag, read by the Lynnfield manager. */
export const WithNotes: Story = {};

/** Read by Morgan Lee, who is mentioned in the second note. */
export const MentionsTheReader: Story = { args: { user: morgan } };

export const AsTechnician: Story = { args: { user: sam } };

export const Empty: Story = {
    args: { subject: { type: "task", id: "none" }, subjectTitle: "Costco run for Lynnfield", href: "/tasks/none", initialNotes: [] },
};

export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
