import type { FlagEvidence } from "@/data/types";
import { cx } from "@/utils/cx";

interface EvidenceListProps {
    evidence: FlagEvidence[];
    /** `grid` lays facts out as tiles (flag detail). `chips` is a single wrapping row for list cards. */
    variant?: "grid" | "chips";
    /** Chips only: show at most this many, then "+n more". */
    max?: number;
    className?: string;
}

/** Short values ("4", "-3 (-75%)") read as figures; longer ones ("PO-LYN-2607-P1") as text; lists get a full row. */
const isFigure = (value: string) => value.length <= 10;
const isLong = (value: string) => value.length > 24;

/**
 * The numbers behind a flag, as label and value pairs.
 * A flag never asks to be taken on trust: what was ordered, counted or changed is always shown.
 */
export const EvidenceList = ({ evidence, variant = "grid", max, className }: EvidenceListProps) => {
    if (!evidence.length) return null;

    if (variant === "chips") {
        const shown = max ? evidence.slice(0, max) : evidence;
        const hidden = evidence.length - shown.length;
        return (
            <dl className={cx("flex flex-wrap gap-1.5", className)}>
                {shown.map((e, i) => (
                    <div
                        key={`${e.label}-${i}`}
                        className="flex max-w-full items-baseline gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs ring-1 ring-secondary ring-inset"
                    >
                        <dt className="shrink-0 text-tertiary">{e.label}</dt>
                        <dd className="truncate font-semibold text-secondary tabular-nums">{e.value}</dd>
                    </div>
                ))}
                {hidden > 0 && <div className="self-center text-xs text-quaternary">+{hidden} more</div>}
            </dl>
        );
    }

    const short = evidence.filter((e) => !isLong(e.value));
    const columns = ["sm:grid-cols-1", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"][Math.min(short.length, 4)];
    const lastShort = short[short.length - 1];

    return (
        <div className={cx("overflow-hidden rounded-lg bg-primary ring-1 ring-secondary ring-inset", className)}>
            <dl className={cx("-mr-px -mb-px grid grid-cols-2", columns)}>
                {evidence.map((e, i) => (
                    <div
                        key={`${e.label}-${i}`}
                        className={cx(
                            "flex min-w-0 flex-col gap-1 border-r border-b border-secondary px-3.5 py-3",
                            isLong(e.value) && "col-span-full",
                            // An odd number of short facts would leave a hole in the two-column phone layout.
                            e === lastShort && short.length % 2 === 1 && "max-sm:col-span-2",
                        )}
                    >
                        <dt className="text-xs font-medium text-tertiary">{e.label}</dt>
                        <dd
                            className={cx(
                                "break-words text-primary tabular-nums",
                                isFigure(e.value) ? "text-lg font-semibold" : "text-sm font-semibold",
                                isLong(e.value) && "font-medium",
                            )}
                        >
                            {e.value}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
};
