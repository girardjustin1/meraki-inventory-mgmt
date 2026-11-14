import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { flags } from "@/data/inventory";
import type { Flag } from "@/data/types";
import { FlagCard } from "./flag-card";

const pick = (match: (f: Flag) => boolean) => flags.find(match) ?? (flags[0] as Flag);

const receivedMismatch = pick((f) => f.type === "received-mismatch" && f.severity === "high" && f.fromRealData);
const countVariance = pick((f) => f.type === "count-variance");
const reviewing = pick((f) => f.status === "reviewing");
const low = pick((f) => f.severity === "low" && f.status === "open");

const meta: Meta<typeof FlagCard> = {
    title: "Meraki/Flag card",
    component: FlagCard,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-xl">
                <Story />
            </div>
        ),
    ],
    args: { flag: receivedMismatch, href: "/flags/example" },
};

export default meta;
type Story = StoryObj<typeof FlagCard>;

export const Compact: Story = {};
export const Full: Story = { args: { variant: "full" } };
export const SampleData: Story = { args: { flag: countVariance } };
export const ReviewingAndAssigned: Story = { args: { flag: reviewing } };
export const LowSeverity: Story = { args: { flag: low } };
export const Active: Story = { args: { isActive: true } };
export const Selectable: Story = { args: { selection: { isSelected: true, onChange: () => undefined } } };
export const Static: Story = { args: { href: undefined, variant: "full", flag: countVariance } };

export const List: Story = {
    render: () => (
        <ul className="flex flex-col gap-3">
            {[receivedMismatch, countVariance, reviewing, low].map((f) => (
                <li key={f.id}>
                    <FlagCard flag={f} href={`/flags/${f.id}`} />
                </li>
            ))}
        </ul>
    ),
};
