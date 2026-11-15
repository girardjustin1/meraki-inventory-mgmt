import type { ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import { MerakiLogo } from "@/components/foundations/logo/meraki-logo";
import { locationName } from "@/data/inventory";
import type { Digest, DigestInsight, DigestStat } from "@/data/types";
import { formatDate } from "@/engine/dates";
import { FLAG_TYPE_LABEL } from "@/engine/flags";
import { formatCount } from "@/engine/stock";
import { cx } from "@/utils/cx";
import { ROUTES, SampleDataNote } from "./app-shell";
import { FlagSeverityBadge, RealDataBadge, SampleBadge } from "./status-badges";

export interface DigestViewProps {
    digest: Digest;
    /** Email client width being previewed. The layout is a single column either way. */
    width?: "desktop" | "mobile";
    /** Where "Open in app" goes. */
    appHref?: string;
    /** Keep the prototype note in the footer until real counts and costs are loaded. */
    showSampleNote?: boolean;
    className?: string;
}

const insightBar: Record<DigestInsight["tone"], string> = {
    bad: "bg-fg-error-secondary",
    warning: "bg-fg-warning-secondary",
    good: "bg-fg-success-secondary",
    neutral: "bg-fg-quaternary",
};

const insightLabel: Record<DigestInsight["tone"], string> = { bad: "Needs attention", warning: "Worth a look", good: "Good news", neutral: "For context" };

const statTone: Record<NonNullable<DigestStat["tone"]>, string> = { bad: "text-error-primary", good: "text-success-primary", neutral: "text-primary" };

/** Puts the website's serif accent on the location at the end of the headline. */
const headlineWithAccent = (digest: Digest): ReactNode => {
    const place = locationName(digest.locationId);
    const marker = ` at ${place}`;
    if (!digest.headline.endsWith(marker)) {
        const fully = ` is fully stocked`;
        if (digest.headline.startsWith(place) && digest.headline.endsWith(fully)) {
            return (
                <>
                    <em>{digest.locationId === "all" ? "Both locations" : place}</em>
                    {digest.locationId === "all" ? " are fully stocked" : fully}
                </>
            );
        }
        return digest.headline;
    }
    const lead = digest.headline.slice(0, -marker.length);
    return digest.locationId === "all" ? (
        <>
            {lead} across <em>both locations</em>
        </>
    ) : (
        <>
            {lead} at <em>{place}</em>
        </>
    );
};

const SectionTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
    <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-md font-semibold text-primary">{children}</h3>
        {aside && <span className="shrink-0 text-xs text-tertiary">{aside}</span>}
    </div>
);

const th = "px-3 py-2 text-left text-xs font-semibold text-tertiary first:pl-4 last:pr-4";
const td = "px-3 py-2.5 align-top text-sm text-secondary first:pl-4 last:pr-4";

/**
 * The weekly or monthly digest, laid out like the email it is sent as: one column, simple
 * tables, no hover-only content. The Resend template mirrors this structure block for block.
 */
export const DigestView = ({ digest, width = "desktop", appHref = ROUTES.home, showSampleNote = true, className }: DigestViewProps) => {
    const weekly = digest.period === "weekly";
    const place = locationName(digest.locationId);
    const both = digest.locationId === "all";

    return (
        <article
            aria-label={`${weekly ? "Weekly" : "Monthly"} digest for ${place}`}
            className={cx(
                "mx-auto w-full overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary",
                width === "mobile" ? "max-w-[375px]" : "max-w-[640px]",
                className,
            )}
        >
            <header className="flex items-center justify-between gap-3 border-b border-secondary bg-brand-50 px-5 py-4">
                <MerakiLogo className="h-6" />
                <p className="text-xs font-semibold text-brand-secondary">{weekly ? "Weekly inventory digest" : "Monthly inventory digest"}</p>
            </header>

            <div className="flex flex-col gap-7 px-5 py-6">
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-tertiary">
                        {place} · {formatDate(digest.rangeStart)} to {formatDate(digest.rangeEnd, true)}
                    </p>
                    <h2 className="text-display-xs font-semibold text-primary">{headlineWithAccent(digest)}</h2>
                </div>

                <div className="-m-2">
                    <table className="w-full border-separate border-spacing-2" role="presentation">
                        <tbody>
                            {Array.from({ length: Math.ceil(digest.stats.length / 2) }, (_, row) => {
                                const pair = digest.stats.slice(row * 2, row * 2 + 2);
                                return (
                                    <tr key={row}>
                                        {pair.map((stat) => (
                                            <td
                                                key={stat.label}
                                                colSpan={pair.length === 1 ? 2 : 1}
                                                className="w-1/2 rounded-lg bg-secondary p-3 align-top ring-1 ring-secondary ring-inset"
                                            >
                                                <p className="text-xs font-medium text-tertiary">{stat.label}</p>
                                                <p className={cx("mt-1 text-xl font-semibold tabular-nums", statTone[stat.tone ?? "neutral"])}>
                                                    {stat.value}
                                                    {stat.change && <span className="ml-1.5 text-sm font-medium text-tertiary">{stat.change}</span>}
                                                </p>
                                                {stat.hint && <p className="mt-0.5 text-xs text-tertiary">{stat.hint}</p>}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <section className="flex flex-col gap-3">
                    <SectionTitle>What stood out</SectionTitle>
                    <ul className="flex flex-col gap-3">
                        {digest.insights.map((insight) => (
                            <li key={insight.id} className="flex gap-3">
                                <span aria-hidden="true" className={cx("w-1 shrink-0 rounded-full", insightBar[insight.tone])} />
                                <div className="flex min-w-0 flex-col gap-0.5 py-0.5">
                                    <p className="text-xs font-medium text-tertiary">{insightLabel[insight.tone]}</p>
                                    <p className="text-sm font-semibold text-primary">{insight.title}</p>
                                    <p className="text-sm text-tertiary">{insight.body}</p>
                                    {insight.href && (
                                        <a
                                            href={insight.href}
                                            className="mt-1 w-max rounded-xs text-sm font-semibold text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                                        >
                                            View in app
                                        </a>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                {digest.reorder.length > 0 && (
                    <section className="flex flex-col gap-3">
                        <SectionTitle aside={`${digest.reorder.length} items, soonest to run out first`}>
                            {weekly ? "Order this week" : "Order this month"}
                        </SectionTitle>
                        <div className="overflow-hidden rounded-lg ring-1 ring-secondary ring-inset">
                            <table className="w-full border-collapse">
                                <thead className="bg-secondary">
                                    <tr>
                                        <th scope="col" className={th}>
                                            Item
                                        </th>
                                        <th scope="col" className={cx(th, "text-right")}>
                                            On hand
                                        </th>
                                        <th scope="col" className={cx(th, "text-right")}>
                                            Order
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-secondary">
                                    {digest.reorder.map((line, i) => (
                                        <tr key={`${line.itemId}-${i}`}>
                                            <td className={td}>
                                                <a
                                                    href={ROUTES.item(line.itemId)}
                                                    className="rounded-xs font-medium text-primary outline-focus-ring hover:underline focus-visible:outline-2"
                                                >
                                                    {line.name}
                                                </a>
                                                <p className="text-xs text-tertiary">{line.vendor}</p>
                                            </td>
                                            <td className={cx(td, "text-right whitespace-nowrap tabular-nums")}>
                                                {formatCount(line.onHand)}
                                                {line.daysOfCover !== undefined && (
                                                    <p className={cx("text-xs", line.daysOfCover <= 7 ? "text-error-primary" : "text-tertiary")}>
                                                        {line.daysOfCover <= 0 ? "none left" : `${line.daysOfCover} days left`}
                                                    </p>
                                                )}
                                            </td>
                                            <td className={cx(td, "text-right font-semibold whitespace-nowrap text-primary tabular-nums")}>
                                                {formatCount(line.suggested, line.unit)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {digest.flags.length > 0 && (
                    <section className="flex flex-col gap-3">
                        <SectionTitle aside={`Showing ${digest.flags.length}, highest severity first`}>Flags to review</SectionTitle>
                        <ul className="flex flex-col divide-y divide-border-secondary rounded-lg ring-1 ring-secondary ring-inset">
                            {digest.flags.map((flag) => (
                                <li key={flag.id} className="flex flex-col gap-1.5 px-4 py-3">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <FlagSeverityBadge severity={flag.severity} />
                                        {flag.fromRealData ? <RealDataBadge /> : <SampleBadge />}
                                        <span className="text-xs text-tertiary">
                                            {FLAG_TYPE_LABEL[flag.type]}
                                            {both ? ` · ${locationName(flag.locationId)}` : ""}
                                        </span>
                                    </div>
                                    <a
                                        href={ROUTES.flag(flag.id)}
                                        className="w-fit rounded-xs text-sm font-semibold text-primary outline-focus-ring hover:underline focus-visible:outline-2"
                                    >
                                        {flag.title}
                                    </a>
                                    <p className="text-sm text-tertiary">{flag.summary}</p>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {digest.vendorPerformance.length > 0 && (
                    <section className="flex flex-col gap-3">
                        <SectionTitle aside="2026 orders where receiving started">Vendor performance</SectionTitle>
                        <div className="overflow-hidden rounded-lg ring-1 ring-secondary ring-inset">
                            <table className="w-full border-collapse">
                                <thead className="bg-secondary">
                                    <tr>
                                        <th scope="col" className={th}>
                                            Vendor
                                        </th>
                                        <th scope="col" className={cx(th, "text-right")}>
                                            Lines
                                        </th>
                                        <th scope="col" className={cx(th, "text-right")}>
                                            Filled
                                        </th>
                                        <th scope="col" className={cx(th, "text-right")}>
                                            Days to shelf
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-secondary">
                                    {digest.vendorPerformance.map((v) => (
                                        <tr key={v.vendor}>
                                            <td className={cx(td, "font-medium text-primary")}>{v.vendor}</td>
                                            <td className={cx(td, "text-right tabular-nums")}>{v.lines}</td>
                                            <td
                                                className={cx(
                                                    td,
                                                    "text-right font-medium tabular-nums",
                                                    v.fillRate < 0.75
                                                        ? "text-error-primary"
                                                        : v.fillRate < 0.9
                                                          ? "text-warning-primary"
                                                          : "text-success-primary",
                                                )}
                                            >
                                                {Math.round(v.fillRate * 100)}%
                                            </td>
                                            <td className={cx(td, "text-right tabular-nums")}>{v.avgLeadDays ?? "No dates"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs text-tertiary">
                            Filled is the share of ordered units logged as received. Days to shelf runs from the order form date to the receipt date.
                        </p>
                    </section>
                )}

                <div className="flex justify-center">
                    <Button href={appHref} size="lg" color="primary">
                        Open in app
                    </Button>
                </div>

                {showSampleNote && <SampleDataNote />}
            </div>

            <footer className="flex flex-col gap-1 border-t border-secondary bg-secondary px-5 py-4 text-xs text-tertiary">
                <p>
                    <span className="font-semibold text-secondary">Sent to </span>
                    {digest.recipients.join(", ")}
                </p>
                <p>
                    {weekly ? "Sent every Monday at 7:00 AM." : "Sent on the first of each month at 7:00 AM."} Change who receives it in{" "}
                    <a
                        href={ROUTES.settings}
                        className="rounded-xs font-medium text-brand-secondary underline underline-offset-2 outline-focus-ring focus-visible:outline-2"
                    >
                        Settings
                    </a>
                    .
                </p>
            </footer>
        </article>
    );
};
