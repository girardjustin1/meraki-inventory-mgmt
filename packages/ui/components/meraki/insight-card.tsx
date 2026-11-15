import type { ReactNode } from "react";
import { ArrowRight } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { RealDataBadge, SampleBadge } from "./status-badges";

/**
 * Where the numbers in a card come from.
 * - real: Meraki's own spreadsheets (catalogue, par levels, 2026 orders and receipts).
 * - sample: generated placeholder values (costs, counts, most on-hand numbers).
 * - mixed: a real series combined with a sample one; both badges are shown.
 */
export type InsightProvenance = "real" | "sample" | "mixed";

export type InsightTone = "neutral" | "good" | "warning" | "bad";

const toneDot: Record<InsightTone, string> = {
    neutral: "bg-fg-quaternary",
    good: "bg-fg-success-secondary",
    warning: "bg-fg-warning-secondary",
    bad: "bg-fg-error-secondary",
};

export interface InsightCardProps {
    /** Small label naming the metric, e.g. "Order cycle time". */
    metric: string;
    /** The finding, written as one plain sentence. This is the card's heading. */
    title: ReactNode;
    /** One line on why the finding matters or what to do about it. */
    why?: ReactNode;
    /** States whether the numbers are real, sample or a mix. Always shown. */
    provenance: InsightProvenance;
    /** Overrides the sample badge text, e.g. "Sample costs". */
    sampleLabel?: string;
    /** Colours the dot beside the metric label. */
    tone?: InsightTone;
    /** The chart or table that backs the finding. */
    children?: ReactNode;
    /** Small print under the chart: method, caveats, what is excluded. */
    footnote?: ReactNode;
    /** Link to the evidence. */
    action?: { label: string; href: string };
    className?: string;
}

/**
 * A chart card whose title is the finding, not the metric name, so a reader who only skims the
 * headings still leaves with the conclusions. Every card states where its numbers come from.
 */
export const InsightCard = ({ metric, title, why, provenance, sampleLabel, tone = "neutral", children, footnote, action, className }: InsightCardProps) => (
    <article className={cx("flex min-w-0 flex-col gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset lg:p-5", className)}>
        <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <p className="flex items-center gap-2 text-xs font-semibold text-tertiary">
                    <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", toneDot[tone])} />
                    {metric}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                    {provenance !== "sample" && <RealDataBadge />}
                    {provenance !== "real" && <SampleBadge label={sampleLabel} />}
                </div>
            </div>
            <h3 className="text-md font-semibold text-pretty text-primary lg:text-lg">{title}</h3>
            {why && <p className="text-sm text-pretty text-tertiary">{why}</p>}
        </header>

        {children && <div className="min-w-0">{children}</div>}

        {(footnote || action) && (
            <footer className="mt-auto flex flex-col gap-3 border-t border-secondary pt-3 sm:flex-row sm:items-center sm:justify-between">
                {footnote ? <p className="text-xs text-pretty text-tertiary">{footnote}</p> : <span />}
                {action && (
                    <a
                        href={action.href}
                        className="group inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md text-sm font-semibold text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-0"
                    >
                        {action.label}
                        <ArrowRight className="size-4 transition duration-100 ease-linear group-hover:translate-x-0.5" aria-hidden="true" />
                    </a>
                )}
            </footer>
        )}
    </article>
);
