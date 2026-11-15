import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StockMeter } from "./stock-meter";

const meta: Meta<typeof StockMeter> = {
    title: "Meraki/Stock meter",
    component: StockMeter,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-xs">
                <Story />
            </div>
        ),
    ],
    args: { level: { onHand: 6, par: 15, parRule: "quantity" }, status: "ok", reorderPoint: 5, showValue: true },
};

export default meta;
type Story = StoryObj<typeof StockMeter>;

export const InStock: Story = {};
export const Low: Story = { args: { level: { onHand: 3, par: 15, parRule: "quantity" }, status: "low" } };
export const Out: Story = { args: { level: { onHand: 0, par: 4, parRule: "quantity" }, status: "out", reorderPoint: 2 } };
export const Overstocked: Story = { args: { level: { onHand: 9, par: 4, parRule: "quantity" }, status: "over", reorderPoint: 2 } };
export const FillLevel: Story = { args: { level: { onHand: 0.5, fillLevel: "half", parRule: "level" }, status: "low", reorderPoint: undefined } };
export const NoPar: Story = { args: { level: { onHand: 2, parRule: "unset" }, status: "unknown", reorderPoint: undefined } };

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-4">
        <p className="text-sm text-tertiary">{label}</p>
        {children}
    </div>
);

export const AllStates: Story = {
    decorators: [(Story) => <Story />],
    render: () => (
        <div className="flex max-w-md flex-col gap-4">
            <Row label="In stock">
                <StockMeter level={{ onHand: 12, par: 15, parRule: "quantity" }} status="ok" reorderPoint={5} showValue />
            </Row>
            <Row label="Low">
                <StockMeter level={{ onHand: 4, par: 15, parRule: "quantity" }} status="low" reorderPoint={5} showValue />
            </Row>
            <Row label="Out">
                <StockMeter level={{ onHand: 0, par: 4, parRule: "quantity" }} status="out" reorderPoint={2} showValue />
            </Row>
            <Row label="Overstocked">
                <StockMeter level={{ onHand: 9, par: 4, parRule: "quantity" }} status="over" reorderPoint={2} showValue />
            </Row>
            <Row label="Fill level, full">
                <StockMeter level={{ onHand: 1, fillLevel: "full", parRule: "level" }} status="ok" showValue />
            </Row>
            <Row label="Fill level, ¾">
                <StockMeter level={{ onHand: 0.75, fillLevel: "three-quarter", parRule: "level" }} status="ok" showValue />
            </Row>
            <Row label="Fill level, half">
                <StockMeter level={{ onHand: 0.5, fillLevel: "half", parRule: "level" }} status="low" showValue />
            </Row>
            <Row label="Fill level, ¼">
                <StockMeter level={{ onHand: 0.25, fillLevel: "quarter", parRule: "level" }} status="low" showValue />
            </Row>
            <Row label="No par">
                <StockMeter level={{ onHand: 2, parRule: "unset" }} status="unknown" showValue />
            </Row>
            <Row label="Paused">
                <StockMeter level={{ onHand: 1, parRule: "paused" }} status="paused" showValue />
            </Row>
            <Row label="Larger">
                <StockMeter level={{ onHand: 6, par: 15, parRule: "quantity" }} status="ok" reorderPoint={5} size="md" />
            </Row>
        </div>
    ),
};
