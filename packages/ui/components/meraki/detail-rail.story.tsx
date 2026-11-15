import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/base/buttons/button";
import { DetailRail, RailField, RailSection } from "./detail-rail";

const meta: Meta<typeof DetailRail> = {
    title: "Meraki/Detail rail",
    component: DetailRail,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="w-80 max-w-full">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof DetailRail>;

/** Unboxed sections with hairlines between them, as on the right of a detail page. */
export const Default: Story = {
    render: () => (
        <DetailRail label="Item status and settings">
            <RailSection title="Status">
                <RailField label="At Lynnfield">6 bottles, in stock</RailField>
                <RailField label="Days of cover" hint="Runs out around Jan 5, 2027 at this rate.">
                    52 days
                </RailField>
                <RailField label="Last counted">Oct 10 by Morgan Lee</RailField>
            </RailSection>
            <RailSection
                title="Organisation"
                action={
                    <Button color="link-color" size="sm">
                        Edit
                    </Button>
                }
            >
                <RailField label="Category">Natural Nail Care</RailField>
                <RailField label="Vendor" hint="Bought in person, about 14 days to arrive (estimate).">
                    Nail Supply Store
                </RailField>
                <RailField label="Area and shelf">Nail Area, shelf 1A</RailField>
            </RailSection>
            <RailSection title="Usage">
                <RailField label="Monthly usage">About 3.4 bottles</RailField>
            </RailSection>
        </DetailRail>
    ),
};

/** A single section has no hairline. */
export const OneSection: Story = {
    render: () => (
        <DetailRail label="Order summary">
            <RailSection title="Status">
                <RailField label="Order">Sent Nov 2</RailField>
            </RailSection>
        </DetailRail>
    ),
};
