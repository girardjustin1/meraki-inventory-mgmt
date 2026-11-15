import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

interface DetailRailProps {
    /** Names the rail for screen readers: "Item status and settings". */
    label: string;
    children: ReactNode;
    className?: string;
}

/**
 * The plain right rail of a detail page: unboxed sections separated by hairlines, about 20rem
 * wide beside the main column. Below `lg` the same sections stack under the main column.
 */
export const DetailRail = ({ label, children, className }: DetailRailProps) => (
    <aside aria-label={label} className={cx("flex min-w-0 flex-col divide-y divide-secondary", className)}>
        {children}
    </aside>
);

interface RailSectionProps {
    title: string;
    /** A small control beside the title: an edit button, a link. */
    action?: ReactNode;
    /** Anchor for deep links. */
    id?: string;
    children: ReactNode;
    className?: string;
}

export const RailSection = ({ title, action, id, children, className }: RailSectionProps) => (
    <section id={id} className={cx("flex scroll-mt-20 flex-col gap-3 py-5 first:pt-0 last:pb-0", className)}>
        <div className="flex min-h-5 items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            {action}
        </div>
        {children}
    </section>
);

interface RailFieldProps {
    label: string;
    children: ReactNode;
    /** A quiet line under the value. */
    hint?: ReactNode;
    className?: string;
}

/** A read-only fact in the rail: small label, value, optional hint. */
export const RailField = ({ label, children, hint, className }: RailFieldProps) => (
    <div className={cx("flex min-w-0 flex-col gap-0.5", className)}>
        <p className="text-sm text-tertiary">{label}</p>
        <div className="text-sm font-medium text-primary">{children}</div>
        {hint && <p className="text-xs text-tertiary">{hint}</p>}
    </div>
);
