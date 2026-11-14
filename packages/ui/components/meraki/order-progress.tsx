import type { PurchaseOrder } from "@/data/types";
import { cx } from "@/utils/cx";

/**
 * Lines that count towards receiving: a line with no quantity was a note on the order form, not an order.
 * A line counts as received once any quantity has been logged against it, which is the same rule the
 * order status uses.
 */
export const receivedLineCount = (po: Pick<PurchaseOrder, "lines">) => {
    const ordered = po.lines.filter((l) => l.qtyOrdered > 0);
    return { received: ordered.filter((l) => l.qtyReceived > 0).length, total: ordered.length };
};

interface OrderProgressProps {
    /** Lines with a receipt logged. */
    received: number;
    /** Lines ordered. */
    total: number;
    /** `sm` puts the count beside the bar for table cells; `md` stacks a full sentence above it. */
    size?: "sm" | "md";
    /** Shown instead of the bar when the order has not been sent yet. */
    notSent?: boolean;
    className?: string;
}

/** "Received 12 of 15 lines" as a bar and a count. */
export const OrderProgress = ({ received, total, size = "sm", notSent, className }: OrderProgressProps) => {
    if (notSent) return <span className={cx("text-sm text-quaternary", className)}>Not sent yet</span>;
    if (total === 0) return <span className={cx("text-sm text-quaternary", className)}>No lines</span>;

    const pct = Math.min(100, Math.round((received / total) * 100));
    const done = received >= total;
    const bar = (
        <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={received}
            aria-label={`Received ${received} of ${total} lines`}
            className={cx("block overflow-hidden rounded-full bg-quaternary", size === "sm" ? "h-1.5 w-16 shrink-0" : "h-2 w-full")}
        >
            <span className={cx("block h-full rounded-full", done ? "bg-fg-success-secondary" : "bg-fg-brand-primary")} style={{ width: `${pct}%` }} />
        </span>
    );

    if (size === "md") {
        return (
            <div className={cx("flex flex-col gap-2", className)}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-secondary">
                        Received {received} of {total} lines
                    </span>
                    <span className="text-tertiary tabular-nums">{pct}%</span>
                </div>
                {bar}
            </div>
        );
    }

    return (
        <span className={cx("inline-flex items-center gap-2 text-sm whitespace-nowrap text-tertiary tabular-nums", className)}>
            {bar}
            <span>
                <span className={cx("font-medium", done ? "text-success-primary" : "text-secondary")}>{received}</span> of {total}
            </span>
        </span>
    );
};
