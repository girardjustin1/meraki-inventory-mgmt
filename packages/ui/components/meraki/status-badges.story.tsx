import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
    AbcBadge,
    ConfidenceBadge,
    CountStatusBadge,
    FlagSeverityBadge,
    FlagStatusBadge,
    OrderStatusBadge,
    RealDataBadge,
    RoleBadge,
    SampleBadge,
    StockStatusBadge,
} from "./status-badges";

const meta: Meta = {
    title: "Meraki/Status badges",
    parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-tertiary">{label}</p>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
);

/** Every status vocabulary in the app, in one place. */
export const All: Story = {
    render: () => (
        <div className="flex flex-col gap-6">
            <Row label="Stock status">
                {(["ok", "low", "out", "over", "unknown", "paused"] as const).map((s) => (
                    <StockStatusBadge key={s} status={s} />
                ))}
            </Row>
            <Row label="Flag severity">
                {(["high", "medium", "low"] as const).map((s) => (
                    <FlagSeverityBadge key={s} severity={s} />
                ))}
            </Row>
            <Row label="Flag status">
                {(["open", "reviewing", "resolved", "dismissed"] as const).map((s) => (
                    <FlagStatusBadge key={s} status={s} />
                ))}
            </Row>
            <Row label="Purchase order">
                {(["draft", "awaiting-approval", "approved", "sent", "partially-received", "received", "cancelled"] as const).map((s) => (
                    <OrderStatusBadge key={s} status={s} />
                ))}
            </Row>
            <Row label="Count">
                {(["scheduled", "in-progress", "submitted", "approved"] as const).map((s) => (
                    <CountStatusBadge key={s} status={s} />
                ))}
            </Row>
            <Row label="Forecast confidence">
                {(["high", "medium", "low", "none"] as const).map((s) => (
                    <ConfidenceBadge key={s} confidence={s} />
                ))}
            </Row>
            <Row label="ABC class">
                {(["A", "B", "C"] as const).map((s) => (
                    <AbcBadge key={s} abc={s} showHint />
                ))}
            </Row>
            <Row label="Roles">
                {(["owner", "manager", "front-desk", "technician"] as const).map((s) => (
                    <RoleBadge key={s} role={s} />
                ))}
            </Row>
            <Row label="Data provenance">
                <RealDataBadge />
                <SampleBadge />
            </Row>
        </div>
    ),
};
