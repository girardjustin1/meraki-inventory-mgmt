"use client";

import type { MouseEvent } from "react";
import { ArrowNarrowRight, MarkerPin01 } from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { TODAY, locationName, userById } from "@/data/inventory";
import type { Flag } from "@/data/types";
import { formatDate, relativeDays } from "@/engine/dates";
import { FLAG_TYPE_LABEL } from "@/engine/flags";
import { cx } from "@/utils/cx";
import { initials } from "./app-shell";
import { EvidenceList } from "./evidence-list";
import { FlagSeverityBadge, FlagStatusBadge, RealDataBadge, SampleBadge } from "./status-badges";

/** "Nov 13" this year, "Dec 15, 2025" otherwise, with "yesterday" style help for the last week. */
export const formatDetected = (detectedAt: string) => {
    const day = detectedAt.slice(0, 10);
    const date = formatDate(day, day.slice(0, 4) !== TODAY.slice(0, 4));
    const rel = relativeDays(day, TODAY);
    return rel === "today" || rel === "yesterday" || /^[2-7] days ago$/.test(rel) ? `${date} (${rel})` : date;
};

const severityEdge: Record<Flag["severity"], string> = {
    high: "before:bg-fg-error-secondary",
    medium: "before:bg-fg-warning-secondary",
    low: "before:bg-fg-quaternary",
};

export interface FlagCardProps {
    flag: Flag;
    /** `compact` is a list row; `full` shows the whole summary, all evidence and the next step in a callout. */
    variant?: "compact" | "full";
    /** Makes the title a link that covers the card. */
    href?: string;
    /** Called instead of following `href` (e.g. to open the flag in a side panel). */
    onPress?: () => void;
    /** Highlights the card as the one currently open. */
    isActive?: boolean;
    /** Adds a checkbox for bulk actions. */
    selection?: { isSelected: boolean; onChange: (isSelected: boolean) => void };
    showLocation?: boolean;
    className?: string;
}

/**
 * One flag: how serious, which rule raised it, what was observed and the numbers behind it,
 * where and when, who is looking at it, and what to do next. The wording describes what the
 * records show; it never says why.
 */
export const FlagCard = ({ flag, variant = "compact", href, onPress, isActive, selection, showLocation = true, className }: FlagCardProps) => {
    const compact = variant === "compact";
    const assignee = userById(flag.assignedTo);
    const interactive = Boolean(href || onPress);

    const handleClick = (e: MouseEvent) => {
        if (!onPress) return;
        e.preventDefault();
        onPress();
    };
    const stretch = "outline-focus-ring after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2";

    return (
        <article
            className={cx(
                "relative flex gap-3 overflow-hidden rounded-xl bg-primary shadow-xs ring-1 transition duration-100 ease-linear ring-inset",
                "before:absolute before:inset-y-0 before:left-0 before:w-1",
                severityEdge[flag.severity],
                compact ? "p-3.5 pl-4.5" : "p-4 pl-5 lg:p-5 lg:pl-6",
                isActive ? "bg-brand-primary_alt ring-2 ring-brand" : "ring-secondary",
                interactive && !isActive && "hover:bg-primary_hover",
                className,
            )}
        >
            {selection && (
                <div className="relative z-10 -m-2 flex size-9 shrink-0 items-center justify-center self-start lg:m-0 lg:size-5 lg:pt-0.5">
                    <Checkbox aria-label={`Select: ${flag.title}`} isSelected={selection.isSelected} onChange={selection.onChange} />
                </div>
            )}

            <div className={cx("flex min-w-0 flex-1 flex-col", compact ? "gap-2" : "gap-3")}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <FlagSeverityBadge severity={flag.severity} />
                    <span className="text-xs font-semibold text-tertiary">{FLAG_TYPE_LABEL[flag.type]}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                        {flag.fromRealData ? <RealDataBadge /> : <SampleBadge />}
                        <FlagStatusBadge status={flag.status} />
                    </span>
                </div>

                <div className="flex flex-col gap-1">
                    <h3 className={cx("font-semibold text-primary", compact ? "text-sm" : "text-md")}>
                        {href ? (
                            <a href={href} onClick={handleClick} aria-current={isActive ? "true" : undefined} className={stretch}>
                                {flag.title}
                            </a>
                        ) : onPress ? (
                            <button type="button" onClick={onPress} aria-pressed={isActive} className={cx(stretch, "cursor-pointer text-left")}>
                                {flag.title}
                            </button>
                        ) : (
                            flag.title
                        )}
                    </h3>
                    <p className={cx("text-sm text-tertiary", compact && "line-clamp-2")}>{flag.summary}</p>
                </div>

                <EvidenceList evidence={flag.evidence} variant="chips" max={compact ? 3 : undefined} />

                {compact ? (
                    <p className="flex items-start gap-1.5 text-xs text-secondary">
                        <ArrowNarrowRight className="mt-px size-3.5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                        <span className="line-clamp-1">
                            <span className="font-semibold">Next step: </span>
                            {flag.suggestedAction}
                        </span>
                    </p>
                ) : (
                    <div className="rounded-lg bg-secondary px-3 py-2.5 ring-1 ring-secondary ring-inset">
                        <p className="text-xs font-semibold text-tertiary">Suggested next step</p>
                        <p className="mt-0.5 text-sm text-secondary">{flag.suggestedAction}</p>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-tertiary">
                    {showLocation && (
                        <span className="inline-flex items-center gap-1">
                            <MarkerPin01 className="size-3.5 text-fg-quaternary" aria-hidden="true" />
                            {locationName(flag.locationId)}
                        </span>
                    )}
                    <span>Detected {formatDetected(flag.detectedAt)}</span>
                    <span className="ml-auto inline-flex items-center gap-1.5">
                        {assignee ? (
                            <>
                                <Avatar size="xs" initials={initials(assignee.name)} />
                                <span className="font-medium text-secondary">{assignee.name}</span>
                            </>
                        ) : (
                            <span className="text-quaternary">Unassigned</span>
                        )}
                    </span>
                </div>
            </div>
        </article>
    );
};
