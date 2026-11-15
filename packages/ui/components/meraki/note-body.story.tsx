import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NoteBody } from "./note-body";

const meta: Meta<typeof NoteBody> = {
    title: "Meraki/Note body",
    component: NoteBody,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-md">
                <Story />
            </div>
        ),
    ],
    args: { body: "Checked the cart, found one. Still two short. @[u-fd-lyn] did a delivery get shelved without being received?" },
};

export default meta;
type Story = StoryObj<typeof NoteBody>;

export const WithMention: Story = {};

/** Read by Morgan Lee: the mention of the reader stands out. */
export const MentionsTheReader: Story = { args: { viewerId: "u-fd-lyn" } };

export const SeveralPeople: Story = { args: { body: "@[u-tech-1] and @[u-tech-2] please recount shelf 2B before open.\ncc @[u-owner]", viewerId: "u-tech-2" } };

/** The id no longer matches anyone on the team. */
export const SomeoneWhoHasLeft: Story = { args: { body: "Ask @[u-gone] where the spare key is." } };

export const NoMentions: Story = { args: { body: "Packing slip shows one bottle shipped and one back-ordered." } };
