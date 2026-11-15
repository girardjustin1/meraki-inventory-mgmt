import type { FC, ReactNode } from "react";
import { ArrowRight } from "@untitledui/icons";
import { cx } from "@/utils/cx";

export type StatTone = "neutral" | "good" | "warning" | "bad" | "brand";

const toneText: Record<StatTone, string> = {
    neutral: "text-primary",
    good: "text-success-primary",
    warning: "text-warning-primary",
    bad: "text-error-primary",
    brand: "text-brand-secondary",
};

const toneIcon: Record<StatTone, string> = {
    neutral: "bg-secondary text-fg-quaternary",
    good: "bg-success-secondary text-fg-success-primary",
    warning: "bg-warning-secondary text-fg-warning-primary",
    bad: "bg-error-secondary text-fg-error-primary",
    brand: "bg-brand-secondary text-fg-brand-primary",
};

export interface StatCardProps {
    label: string;
    value: ReactNode;
    /** One line under the number saying what it means or what to do. */
    hint?: ReactNode;
    tone?: StatTone;
    icon?: FC<{ className?: string }>;
    /** Makes the whole card a link. */
    href?: string;
    /** Small element in the top-right: a badge or sparkline. */
    aside?: ReactNode;
    className?: string;
}

/** One number a manager acts on: how many, whether that is good, and where to go next. */
export const StatCard = ({ label, value, hint, tone = "neutral", icon: Icon, href, aside, className }: StatCardProps) => {
    const body = (
        <>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    {Icon && (
                        <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg", toneIcon[tone])}>
                            <Icon className="size-4" aria-hidden="true" />
                        </span>
                    )}
                    <h3 className="text-sm font-medium text-tertiary">{label}</h3>
                </div>
                {aside}
            </div>
            <p className={cx("text-display-xs font-semibold tabular-nums lg:text-display-sm", toneText[tone])}>{value}</p>
            {(hint || href) && (
                <div className="flex items-center justify-between gap-2 text-sm text-tertiary">
                    <span className="min-w-0 truncate">{hint}</span>
                    {href && (
                        <ArrowRight
                            className="size-4 shrink-0 text-fg-quaternary transition duration-100 ease-linear group-hover:translate-x-0.5"
                            aria-hidden="true"
                        />
                    )}
                </div>
            )}
        </>
    );
    const classes = cx("group flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset lg:p-5", className);
    return href ? (
        <a href={href} className={cx(classes, "outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2")}>
            {body}
        </a>
    ) : (
        <article className={classes}>{body}</article>
    );
};

/** Responsive grid for stat cards: two across on phones, up to `columns` on desktop. */
export const StatGrid = ({ children, columns = 4, className }: { children: ReactNode; columns?: 3 | 4 | 5; className?: string }) => (
    <div
        className={cx(
            "grid grid-cols-2 gap-3 lg:gap-4",
            columns === 3 && "lg:grid-cols-3",
            columns === 4 && "lg:grid-cols-4",
            columns === 5 && "lg:grid-cols-5",
            className,
        )}
    >
        {children}
    </div>
);
