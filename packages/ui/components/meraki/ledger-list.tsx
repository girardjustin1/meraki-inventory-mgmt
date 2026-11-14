"use client";

import type { FC } from "react";
import { useState } from "react";
import { ClipboardCheck, Edit05, MinusCircle, PackagePlus, ReceiptCheck, SwitchHorizontal01 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { TODAY, userById } from "@/data/inventory";
import type { FillLevel, MovementType, ReasonCode, StockMovement } from "@/data/types";
import { formatDate, formatTime, relativeDays } from "@/engine/dates";
import { REASON_CODES, REASON_LABEL } from "@/engine/reasons";
import { FILL_FRACTION, FILL_LABEL, formatCount } from "@/engine/stock";
import { cx } from "@/utils/cx";
import { ROUTES } from "./app-shell";
import { SampleBadge } from "./status-badges";

/** Plain-language reason labels, in the order they are offered when adjusting stock. */
// Reason wording lives in the engine so every screen uses the same labels. Re-exported for existing imports.
export { REASON_CODES, REASON_LABEL };

const TYPE: Record<MovementType, { label: string; icon: FC<{ className?: string }>; tone: string }> = {
    receive: { label: "Received", icon: PackagePlus, tone: "bg-success-secondary text-fg-success-primary" },
    use: { label: "Used", icon: MinusCircle, tone: "bg-secondary text-fg-quaternary" },
    count: { label: "Counted", icon: ClipboardCheck, tone: "bg-brand-secondary text-fg-brand-primary" },
    adjust: { label: "Adjusted", icon: Edit05, tone: "bg-warning-secondary text-fg-warning-primary" },
    "transfer-in": { label: "Transferred in", icon: SwitchHorizontal01, tone: "bg-utility-blue-50 text-utility-blue-600" },
    "transfer-out": { label: "Transferred out", icon: SwitchHorizontal01, tone: "bg-utility-blue-50 text-utility-blue-600" },
};

/** Reasons that add nothing beyond the movement type, so the row does not repeat them. */
const IMPLIED: Partial<Record<MovementType, ReasonCode>> = {
    receive: "received-order",
    use: "used-in-service",
    count: "cycle-count",
    "transfer-in": "transfer",
    "transfer-out": "transfer",
};

const QUARTERS = ["0", "¼", "½", "¾", "1"];
const fillLabel = (fraction: number) => {
    const nearest = (Object.keys(FILL_FRACTION) as FillLevel[]).reduce(
        (best, key) => (Math.abs(FILL_FRACTION[key] - fraction) < Math.abs(FILL_FRACTION[best] - fraction) ? key : best),
        "empty" as FillLevel,
    );
    return FILL_LABEL[nearest];
};

interface LedgerListProps {
    movements: StockMovement[];
    /** Counting unit for the running balance ("Bottle"). */
    unit?: string;
    /** The item is tracked by fill level: balances read "Half full" and changes read in quarters. */
    fillLevel?: boolean;
    /** Rows shown before "Show more". */
    pageSize?: number;
    emptyMessage?: string;
    className?: string;
}

/**
 * Stock history for one item, newest first. Every row says what happened, by how much, what the
 * shelf held afterwards, who did it and why. Rows are never edited: a mistake shows up as a
 * second row that reverses the first.
 */
export const LedgerList = ({ movements, unit, fillLevel, pageSize = 12, emptyMessage = "No stock movements recorded yet.", className }: LedgerListProps) => {
    const [visible, setVisible] = useState(pageSize);

    if (!movements.length) {
        return (
            <div className={cx("flex flex-col items-center gap-2 rounded-lg bg-secondary px-6 py-8 text-center ring-1 ring-secondary ring-inset", className)}>
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-fg-quaternary shadow-xs ring-1 ring-secondary ring-inset">
                    <ReceiptCheck className="size-5" aria-hidden="true" />
                </span>
                <p className="text-sm text-tertiary">{emptyMessage}</p>
            </div>
        );
    }

    const rows = movements.slice(0, visible);
    const remaining = movements.length - rows.length;

    const delta = (m: StockMovement) => {
        if (m.delta === 0) return "No change";
        const sign = m.delta > 0 ? "+" : "−";
        const size = Math.abs(m.delta);
        if (fillLevel) return `${sign}${QUARTERS[Math.round(size * 4)] ?? size}`;
        return `${sign}${Number.isInteger(size) ? size : size.toFixed(1)}`;
    };
    const balance = (m: StockMovement) => (fillLevel ? fillLabel(m.balance) : formatCount(m.balance, unit));

    return (
        <div className={cx("flex flex-col gap-4", className)}>
            <ol className="flex flex-col">
                {rows.map((m, i) => {
                    const type = TYPE[m.type];
                    const who = userById(m.userId);
                    const day = m.at.slice(0, 10);
                    const showReason = IMPLIED[m.type] !== m.reason;
                    return (
                        <li key={m.id} className="relative flex gap-3 pb-5 last:pb-0">
                            {i < rows.length - 1 && (
                                <span aria-hidden="true" className="absolute top-9 bottom-1 left-4 w-px -translate-x-1/2 bg-border-secondary" />
                            )}
                            <span className={cx("relative flex size-8 shrink-0 items-center justify-center rounded-full", type.tone)}>
                                <type.icon className="size-4" aria-hidden="true" />
                            </span>

                            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <p className="text-sm font-semibold text-primary">{type.label}</p>
                                    {showReason && (
                                        <Badge type="modern" color="gray" size="sm">
                                            {REASON_LABEL[m.reason]}
                                        </Badge>
                                    )}
                                    {m.isSample && <SampleBadge />}
                                </div>
                                <p className="text-sm text-tertiary">
                                    {who?.name ?? "Unknown user"} ·{" "}
                                    <time dateTime={m.at}>
                                        {formatDate(day, day.slice(0, 4) !== TODAY.slice(0, 4))}, {formatTime(m.at)}
                                    </time>
                                    <span className="text-quaternary"> · {relativeDays(day, TODAY)}</span>
                                </p>
                                {m.note && <p className="mt-0.5 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary">{m.note}</p>}
                                {m.purchaseOrderId && (
                                    <Button href={ROUTES.order(m.purchaseOrderId)} color="link-color" size="sm" className="self-start">
                                        View order
                                    </Button>
                                )}
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-right">
                                <p
                                    className={cx(
                                        "text-sm font-semibold tabular-nums",
                                        m.delta > 0
                                            ? "text-success-primary"
                                            : m.delta < 0
                                              ? m.type === "use"
                                                  ? "text-primary"
                                                  : "text-error-primary"
                                              : "text-tertiary",
                                    )}
                                >
                                    {delta(m)}
                                </p>
                                <p className="text-xs text-tertiary tabular-nums">
                                    <span className="sr-only">Balance </span>
                                    {balance(m)}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>

            {remaining > 0 && (
                <Button color="secondary" size="md" className="self-center max-lg:w-full" onClick={() => setVisible((v) => v + pageSize)}>
                    Show {Math.min(pageSize, remaining)} more
                </Button>
            )}
        </div>
    );
};
