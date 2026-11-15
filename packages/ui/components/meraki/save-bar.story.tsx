import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "@/components/base/input/input";
import { SaveBar } from "./save-bar";
import type { SaveBarProps } from "./save-bar";

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** A small form wired to the bar: change either field, then discard or save. */
const Demo = ({ startWith, ...props }: Partial<SaveBarProps> & { startWith?: { par: string; shelf: string } }) => {
    const [saved, setSaved] = useState({ par: "15", shelf: "1A" });
    const [draft, setDraft] = useState(startWith ?? saved);
    const changes = (draft.par !== saved.par ? 1 : 0) + (draft.shelf !== saved.shelf ? 1 : 0);
    return (
        <div className="flex max-w-xl flex-col gap-4">
            <SaveBar
                {...props}
                isDirty={props.isDirty ?? changes > 0}
                changeCount={props.changeCount ?? changes}
                onDiscard={() => setDraft(saved)}
                onSave={async () => {
                    await wait(900);
                    setSaved(draft);
                }}
            />
            <div className="grid gap-4 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset sm:grid-cols-2">
                <Input label="Par level" size="sm" inputMode="numeric" value={draft.par} onChange={(par) => setDraft((d) => ({ ...d, par }))} />
                <Input label="Shelf" size="sm" value={draft.shelf} onChange={(shelf) => setDraft((d) => ({ ...d, shelf }))} />
            </div>
            <p className="text-sm text-tertiary">
                Saved: par {saved.par}, shelf {saved.shelf}.{" "}
                <a href="/stock" className="font-medium text-brand-secondary underline">
                    A link away from this page
                </a>{" "}
                is held back once while there are unsaved changes.
            </p>
        </div>
    );
};

const meta: Meta<typeof SaveBar> = {
    title: "Meraki/Save bar",
    component: SaveBar,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    render: (args) => <Demo {...args} />,
};

export default meta;
type Story = StoryObj<typeof SaveBar>;

/** Nothing changed yet: the bar is not on the page. Edit a field to bring it in. */
export const Clean: Story = {};

/** Two fields differ from what is saved. */
export const Unsaved: Story = { render: (args) => <Demo {...args} startWith={{ par: "18", shelf: "2B" }} /> };

/** One change, without a count. */
export const WithoutCount: Story = { render: (args) => <Demo {...args} startWith={{ par: "18", shelf: "1A" }} changeCount={0} /> };

/** On a phone the bar docks above the tab bar. */
export const Mobile: Story = {
    render: (args) => <Demo {...args} startWith={{ par: "18", shelf: "2B" }} />,
    globals: { viewport: { value: "mobile", isRotated: false } },
};
