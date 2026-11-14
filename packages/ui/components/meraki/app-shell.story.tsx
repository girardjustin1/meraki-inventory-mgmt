import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/base/buttons/button";
import { AppShell, Card, CardHeader, PageContent, PageHeader, SampleDataNote } from "./app-shell";

const meta: Meta<typeof AppShell> = {
    title: "Meraki/App shell",
    component: AppShell,
    parameters: { layout: "fullscreen" },
    args: { activeUrl: "/stock", location: "lynnfield", children: null },
    render: (args) => (
        <AppShell {...args}>
            <PageContent>
                <PageHeader
                    title="Page title"
                    description="Sidebar on desktop, top bar and bottom tabs on a phone."
                    actions={<Button size="md">Primary action</Button>}
                />
                <SampleDataNote />
                <Card>
                    <CardHeader title="Card" description="Content goes here." />
                </Card>
            </PageContent>
        </AppShell>
    ),
};

export default meta;
type Story = StoryObj<typeof AppShell>;

export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
export const Newburyport: Story = { args: { location: "newburyport", activeUrl: "/" } };
