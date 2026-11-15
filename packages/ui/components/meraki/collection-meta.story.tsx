import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { collections } from "@/data/inventory";
import { CollectionPurposeChip, ColumnHint, InlineNotice, KIND_HINT, KIND_LABEL, PURPOSE_HINT, PURPOSE_ORDER, summariseRules } from "./collection-meta";

const meta: Meta<typeof CollectionPurposeChip> = {
    title: "Meraki/Collection meta",
    component: CollectionPurposeChip,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    args: { purpose: "service-kit" },
};

export default meta;
type Story = StoryObj<typeof CollectionPurposeChip>;

export const PurposeChip: Story = {};

/** The four purposes with the one-line explanation used in the "New collection" dialog. */
export const Purposes: Story = {
    render: () => (
        <ul className="flex max-w-md flex-col gap-3">
            {PURPOSE_ORDER.map((purpose) => (
                <li key={purpose} className="flex items-start gap-3">
                    <span className="w-24 shrink-0">
                        <CollectionPurposeChip purpose={purpose} />
                    </span>
                    <span className="text-sm text-tertiary">{PURPOSE_HINT[purpose]}</span>
                </li>
            ))}
        </ul>
    ),
};

/** How each sample collection reads in the list: its kind, and its rules in a few words. */
export const RuleSummaries: Story = {
    render: () => (
        <ul className="flex max-w-lg flex-col divide-y divide-secondary">
            {collections.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                    <span className="font-medium text-primary">{c.name}</span>
                    <span className="text-right text-tertiary">
                        {KIND_LABEL[c.kind]}
                        {c.kind === "smart" ? ` · ${summariseRules(c)}` : ` · ${KIND_HINT.manual}`}
                    </span>
                </li>
            ))}
        </ul>
    ),
};

/** A column header with its definition on hover or focus. */
export const HeaderWithHint: Story = {
    render: () => (
        <div className="p-10 text-xs font-semibold text-tertiary">
            <ColumnHint label="Days of cover" hint="How long what is on hand lasts at the usual rate of use." />
        </div>
    ),
};

/** The line shown after an action: what happened, and a way to dismiss it. */
export const Notice: Story = {
    render: () => (
        <div className="max-w-xl">
            <InlineNotice onDismiss={() => undefined}>Exported 5 items as a spreadsheet file.</InlineNotice>
        </div>
    ),
};
