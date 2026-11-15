import { CheckCircle, Hourglass01 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import type { DataReadiness as DataReadinessRow } from "@/engine/insights";
import { cx } from "@/utils/cx";

/** The next step that would turn each source on. Shown only while the source is missing. */
const HOW_TO: Record<DataReadinessRow["id"], string> = {
    "order-history": "Save each order in the app as it is placed. Two cycles are enough to start.",
    counts: "Run one full count of the supply room in the app. Every count after that adds a usage reading.",
    costs: "Type the unit price when a delivery is received, or load the vendor invoices once.",
    "service-counts": "Connect Meevo, or import its monthly report of services performed.",
    "twelve-months": "Nothing to set up. It fills in as orders and counts are logged each month.",
};

export interface DataReadinessProps {
    /** The checklist from `dataReadiness(...)`. */
    sources: DataReadinessRow[];
    /** `full` lists every source with what it unlocks; `compact` is a one-line summary for a card header or sidebar. */
    variant?: "full" | "compact";
    /** Replaces the default "how to get it" line for a source. */
    howTo?: Partial<Record<DataReadinessRow["id"], string>>;
    className?: string;
}

/**
 * What the insights rest on: which data sources are in place, and what each missing one would
 * unlock. It exists so a gap is read as a gap and never as a finding.
 */
export const DataReadiness = ({ sources, variant = "full", howTo, className }: DataReadinessProps) => {
    const ready = sources.filter((s) => s.ready).length;
    const summary = `${ready} of ${sources.length} data sources in place`;

    if (variant === "compact") {
        return (
            <div className={cx("flex min-w-0 flex-col gap-2", className)}>
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-primary">{summary}</p>
                    <div className="flex shrink-0 gap-1" role="img" aria-label={summary}>
                        {sources.map((s) => (
                            <span key={s.id} className={cx("h-1.5 w-5 rounded-full", s.ready ? "bg-fg-brand-primary" : "bg-quaternary")} />
                        ))}
                    </div>
                </div>
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                    {sources.map((s) => (
                        <li key={s.id} className={cx("flex items-center gap-1 text-xs", s.ready ? "font-medium text-secondary" : "text-tertiary")}>
                            {s.ready ? (
                                <CheckCircle className="size-3.5 shrink-0 text-fg-brand-primary" aria-hidden="true" />
                            ) : (
                                <Hourglass01 className="size-3.5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                            )}
                            {s.label}
                            <span className="sr-only">{s.ready ? ": ready" : ": not yet"}</span>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    return (
        <div className={cx("flex min-w-0 flex-col gap-3", className)}>
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-tertiary">{summary}</p>
                <div className="flex shrink-0 gap-1" aria-hidden="true">
                    {sources.map((s) => (
                        <span key={s.id} className={cx("h-1.5 w-6 rounded-full", s.ready ? "bg-fg-brand-primary" : "bg-quaternary")} />
                    ))}
                </div>
            </div>
            <ul className="flex flex-col divide-y divide-border-secondary">
                {sources.map((s) => (
                    <li key={s.id} className="flex gap-3 py-3.5 first:pt-1 last:pb-0">
                        <span
                            className={cx(
                                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                                s.ready ? "bg-brand-secondary text-fg-brand-primary" : "bg-secondary text-fg-quaternary",
                            )}
                        >
                            {s.ready ? <CheckCircle className="size-4" aria-hidden="true" /> : <Hourglass01 className="size-4" aria-hidden="true" />}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h3 className="text-sm font-semibold text-primary">{s.label}</h3>
                                <Badge type="pill-color" size="sm" color={s.ready ? "brand" : "gray"}>
                                    {s.ready ? "Ready" : "Not yet"}
                                </Badge>
                            </div>
                            <p className="text-sm text-pretty text-tertiary">{s.detail}</p>
                            <p className="text-sm text-pretty text-secondary">
                                <span className="font-medium">{s.ready ? "Gives you: " : "Would unlock: "}</span>
                                {s.unlocks}
                            </p>
                            {!s.ready && (
                                <p className="text-sm text-pretty text-tertiary">
                                    <span className="font-medium text-secondary">How to get it: </span>
                                    {howTo?.[s.id] ?? HOW_TO[s.id]}
                                </p>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};
