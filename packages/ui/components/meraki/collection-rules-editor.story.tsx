import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { stockRows } from "@/data/inventory";
import type { CollectionRule } from "@/data/types";
import { CollectionRulesEditor } from "./collection-rules-editor";
import type { CollectionRulesEditorProps } from "./collection-rules-editor";

const rows = stockRows("lynnfield");
const OPI_PINKS: CollectionRule[] = [
    { field: "line", op: "is", value: "opi" },
    { field: "family", op: "is", value: "Pinks" },
];

const Stateful = (props: CollectionRulesEditorProps) => {
    const [state, setState] = useState({ rules: props.rules, match: props.match ?? "all" });
    return <CollectionRulesEditor {...props} {...state} onChange={setState} />;
};

const meta: Meta<typeof CollectionRulesEditor> = {
    title: "Meraki/Collection rules editor",
    component: CollectionRulesEditor,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-xs">
                <Story />
            </div>
        ),
    ],
    args: { rules: OPI_PINKS, match: "all", rows, locationLabel: "Lynnfield" },
    render: (args) => <Stateful {...args} />,
};

export default meta;
type Story = StoryObj<typeof CollectionRulesEditor>;

/** Two rules that must both match: every OPI lacquer in the Pinks family. */
export const TwoRules: Story = {};

/** The form to add a rule: field, condition, and a value picked from what is in stock. */
export const AddingRule: Story = { args: { defaultAdding: true } };

/** Either rule is enough. */
export const MatchAny: Story = { args: { match: "any" } };

export const NoRules: Story = { args: { rules: [] } };

/** For people who can see the collection but not change it. */
export const ReadOnly: Story = { args: { readOnly: true } };
