import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getDigest } from "@/data/inventory";
import { DigestView } from "./digest-view";

const meta: Meta<typeof DigestView> = {
    title: "Meraki/Digest view",
    component: DigestView,
    parameters: { layout: "padded" },
    args: { digest: getDigest("weekly", "lynnfield") },
};

export default meta;
type Story = StoryObj<typeof DigestView>;

export const Weekly: Story = {};
export const WeeklyMobileWidth: Story = { args: { width: "mobile" } };
export const Monthly: Story = { args: { digest: getDigest("monthly", "lynnfield") } };
export const MonthlyBothLocations: Story = { args: { digest: getDigest("monthly", "all") } };
export const Newburyport: Story = { args: { digest: getDigest("weekly", "newburyport") } };
