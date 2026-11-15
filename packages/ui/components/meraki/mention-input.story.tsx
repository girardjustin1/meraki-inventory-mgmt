import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NoteBody } from "@/components/meraki/note-body";
import { users } from "@/data/inventory";
import { mentionedIds } from "@/engine/mentions";
import { MentionInput } from "./mention-input";
import type { MentionInputProps } from "./mention-input";

/** Holds the stored value and shows it, so the token form is visible next to what the person typed. */
const Controlled = ({ hideSubmit, ...props }: Partial<MentionInputProps> & { hideSubmit?: boolean }) => {
    const [value, setValue] = useState(props.value ?? "");
    const [submitted, setSubmitted] = useState<string[]>([]);
    return (
        <div className="flex max-w-xl flex-col gap-4">
            <MentionInput
                users={users}
                authorId="u-mgr-lyn"
                location="lynnfield"
                {...props}
                value={value}
                onChange={setValue}
                onSubmit={
                    hideSubmit
                        ? undefined
                        : (v) => {
                              setSubmitted((prev) => [...prev, v]);
                              setValue("");
                          }
                }
            />
            <div className="flex flex-col gap-1 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset">
                <p className="text-xs font-semibold text-tertiary">Stored as</p>
                <pre data-testid="stored-value" className="text-xs break-words whitespace-pre-wrap text-secondary">
                    {value || " "}
                </pre>
            </div>
            {submitted.map((body, i) => (
                <div key={i} data-testid="submitted" data-body={body} data-notified={mentionedIds(body).join(",")} className="flex flex-col gap-1">
                    <p className="text-xs font-semibold text-tertiary">Submitted</p>
                    <NoteBody body={body} />
                </div>
            ))}
        </div>
    );
};

const meta: Meta<typeof MentionInput> = {
    title: "Meraki/Mention input",
    component: MentionInput,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    render: (args) => <Controlled {...args} />,
};

export default meta;
type Story = StoryObj<typeof MentionInput>;

/** Type "@" and a letter or two. Arrow keys and Enter pick; Escape closes; Ctrl or Cmd with Enter submits. */
export const Empty: Story = {};

export const WithMentions: Story = {
    args: { value: "@[u-tech-1] you counted this last night. @[u-fd-lyn] did a delivery get shelved without being received?" },
};

/** Newburyport record: Lynnfield-only staff are not offered. The owner, an admin, still is. */
export const OtherLocation: Story = { args: { location: "newburyport", authorId: "u-mgr-nbp" } };

/** Inside a form: labelled, required, no submit button of its own. */
export const AsFormField: Story = {
    args: { label: "Note for the person going", isRequired: true, placeholder: "Anything they should know", rows: 3 },
    render: (args) => <Controlled {...args} hideSubmit />,
};

export const Disabled: Story = { args: { isDisabled: true, value: "Ready for approval @[u-owner]" } };

/** A note that mentions someone whose account has since been removed. */
export const SomeoneWhoHasLeft: Story = { args: { value: "Ask @[u-gone] where the spare key is." } };

export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
