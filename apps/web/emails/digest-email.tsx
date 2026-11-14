/**
 * Weekly and monthly inventory digest.
 *
 * Renders a `Digest` produced by buildDigest() in packages/ui/engine/digest.ts. The template
 * holds no business logic: every number, headline and insight arrives already computed, so
 * the email and the in-app digest screen can never disagree.
 *
 * Preview without sending:  GET /api/cron/digest?period=weekly&dryRun=1
 */
import type { CSSProperties } from "react";
import { Column, Heading, Hr, Link, Row, Section, Text } from "@react-email/components";
import type { Digest, DigestStat, Flag } from "@/data/types";
import { formatDate } from "@/engine/dates";
import { formatCount } from "@/engine/stock";
import { EmailShell, PrimaryButton, absoluteUrl, brand, fontFamily, sectionGap, text, toneColor, toneRule, toneTint } from "./shared";

export interface DigestEmailProps {
    digest: Digest;
    /** "Lynnfield", "Newburyport" or "Both locations". */
    locationName: string;
    /** Public origin of the app, used for every link. */
    baseUrl: string;
    logoUrl?: string;
    /** Adds a line saying the figures come from sample data (prototype mode). */
    sampleData?: boolean;
}

const cell: CSSProperties = { fontFamily, fontSize: "14px", lineHeight: "20px", color: brand.ink, padding: "10px 8px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "top" };
const headCell: CSSProperties = {
    fontFamily,
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 600,
    color: brand.muted,
    textAlign: "left",
    padding: "0 8px 8px",
    borderBottom: `1px solid ${brand.border}`,
};
const numeric: CSSProperties = { textAlign: "right", whiteSpace: "nowrap" };

const SEVERITY: Record<Flag["severity"], { label: string; color: string; tint: string }> = {
    high: { label: "High", color: brand.bad, tint: brand.badTint },
    medium: { label: "Medium", color: brand.warn, tint: brand.warnTint },
    low: { label: "Low", color: brand.muted, tint: brand.mist },
};

const pairs = <T,>(items: T[]): [T, T | undefined][] => {
    const out: [T, T | undefined][] = [];
    for (let i = 0; i < items.length; i += 2) out.push([items[i] as T, items[i + 1]]);
    return out;
};

function StatTile({ stat }: { stat: DigestStat }) {
    return (
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "separate" }}>
            <tbody>
                <tr>
                    <td style={{ backgroundColor: brand.mist, borderRadius: "10px", padding: "14px 16px" }}>
                        <Text style={{ ...text.small, fontWeight: 500 }}>{stat.label}</Text>
                        <Text style={{ margin: "2px 0 0", fontFamily, fontSize: "26px", lineHeight: "32px", fontWeight: 700, color: toneColor(stat.tone) }}>
                            {stat.value}
                            {stat.change ? <span style={{ fontSize: "13px", fontWeight: 600, color: toneColor(stat.tone) }}>&nbsp;&nbsp;{stat.change}</span> : null}
                        </Text>
                        {stat.hint ? <Text style={{ ...text.small, marginTop: "2px" }}>{stat.hint}</Text> : null}
                    </td>
                </tr>
            </tbody>
        </table>
    );
}

export function DigestEmail({ digest, locationName, baseUrl, logoUrl, sampleData = false }: DigestEmailProps) {
    const periodLabel = digest.period === "weekly" ? "Weekly digest" : "Monthly digest";
    const range = `${formatDate(digest.rangeStart)} to ${formatDate(digest.rangeEnd, true)}`;
    const reorderHeading = digest.period === "weekly" ? "Order this week" : "Order this month";

    return (
        <EmailShell
            preview={`${digest.headline}. ${range}.`}
            baseUrl={baseUrl}
            logoUrl={logoUrl}
            footer={
                <>
                    <Text style={text.small}>
                        You receive the {digest.period} digest for {locationName}. Change who receives it in{" "}
                        <Link href={absoluteUrl(baseUrl, "/settings")} style={{ ...text.link, fontWeight: 500 }}>
                            Settings
                        </Link>
                        .
                    </Text>
                    <Text style={{ ...text.small, marginTop: "6px" }}>Meraki Spa &middot; Lynnfield and Newburyport, Massachusetts</Text>
                </>
            }
        >
            {/* Headline */}
            <Text style={text.eyebrow}>
                {periodLabel} &middot; {locationName}
            </Text>
            <Heading as="h1" style={{ margin: "8px 0 6px", fontFamily, fontSize: "26px", lineHeight: "32px", fontWeight: 700, color: brand.ink }}>
                {digest.headline}
            </Heading>
            <Text style={text.small}>{range}</Text>

            {sampleData ? (
                <Section style={{ marginTop: "16px", backgroundColor: brand.warnTint, borderRadius: "10px", padding: "10px 14px" }}>
                    <Text style={{ ...text.small, color: brand.warn }}>
                        Preview on sample data. Stock counts, costs and staff are placeholders until real counts and invoices are loaded.
                    </Text>
                </Section>
            ) : null}

            {/* Stat tiles, two per row */}
            <Section style={{ padding: "20px 0 0" }}>
                {pairs(digest.stats).map(([left, right], i) => (
                    <Row key={left.label} style={{ marginTop: i === 0 ? 0 : "10px" }}>
                        <Column style={{ width: "50%", paddingRight: "5px", verticalAlign: "top" }}>
                            <StatTile stat={left} />
                        </Column>
                        <Column style={{ width: "50%", paddingLeft: "5px", verticalAlign: "top" }}>{right ? <StatTile stat={right} /> : null}</Column>
                    </Row>
                ))}
            </Section>

            {/* Insights */}
            {digest.insights.length ? (
                <Section style={sectionGap}>
                    <Heading as="h2" style={text.h2}>
                        What needs attention
                    </Heading>
                    {digest.insights.map((insight, i) => (
                        <table key={insight.id} role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginTop: i === 0 ? 0 : "10px" }}>
                            <tbody>
                                <tr>
                                    <td style={{ borderLeft: `4px solid ${toneRule(insight.tone)}`, backgroundColor: toneTint(insight.tone), borderRadius: "6px", padding: "12px 14px" }}>
                                        <Text style={{ ...text.base, fontWeight: 600 }}>{insight.title}</Text>
                                        <Text style={{ ...text.base, fontSize: "14px", lineHeight: "21px", marginTop: "2px" }}>{insight.body}</Text>
                                        {insight.href ? (
                                            <Text style={{ ...text.small, marginTop: "6px" }}>
                                                <Link href={absoluteUrl(baseUrl, insight.href)} style={text.link}>
                                                    View in the app
                                                </Link>
                                            </Text>
                                        ) : null}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    ))}
                </Section>
            ) : null}

            {/* Reorder table */}
            <Section style={sectionGap}>
                <Heading as="h2" style={text.h2}>
                    {reorderHeading}
                </Heading>
                {digest.reorder.length ? (
                    <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th style={headCell}>Item</th>
                                <th style={{ ...headCell, ...numeric }}>On hand</th>
                                <th style={{ ...headCell, ...numeric }}>Order</th>
                                <th style={{ ...headCell, ...numeric }}>Days left</th>
                            </tr>
                        </thead>
                        <tbody>
                            {digest.reorder.map((row) => (
                                <tr key={row.itemId}>
                                    <td style={cell}>
                                        <Link href={absoluteUrl(baseUrl, `/items/${encodeURIComponent(row.itemId)}`)} style={{ color: brand.ink, textDecoration: "none", fontWeight: 600 }}>
                                            {row.name}
                                        </Link>
                                        <div style={{ fontSize: "12px", lineHeight: "17px", color: brand.muted }}>{row.vendor}</div>
                                    </td>
                                    <td style={{ ...cell, ...numeric }}>{formatCount(row.onHand)}</td>
                                    <td style={{ ...cell, ...numeric, fontWeight: 700 }}>{formatCount(row.suggested, row.unit)}</td>
                                    <td style={{ ...cell, ...numeric, color: row.daysOfCover !== undefined && row.daysOfCover <= 7 ? brand.bad : brand.ink }}>
                                        {row.daysOfCover === undefined ? "n/a" : row.daysOfCover}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <Text style={text.base}>Nothing needs ordering right now.</Text>
                )}
                <Text style={{ ...text.small, marginTop: "10px" }}>
                    <Link href={absoluteUrl(baseUrl, "/orders")} style={text.link}>
                        Start an order
                    </Link>
                </Text>
            </Section>

            {/* Flags */}
            <Section style={sectionGap}>
                <Heading as="h2" style={{ ...text.h2, marginBottom: digest.flags.length ? "4px" : "12px" }}>
                    Flags to review
                </Heading>
                {digest.flags.length ? <Text style={text.small}>The {digest.flags.length === 1 ? "one open flag" : `${digest.flags.length} most severe open flags`}. The full list is in the app.</Text> : null}
                {digest.flags.length ? (
                    digest.flags.map((flag) => {
                        const severity = SEVERITY[flag.severity];
                        return (
                            <table key={flag.id} role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderBottom: `1px solid ${brand.border}` }}>
                                <tbody>
                                    <tr>
                                        <td style={{ padding: "10px 0" }}>
                                            <span
                                                style={{
                                                    display: "inline-block",
                                                    fontFamily,
                                                    fontSize: "11px",
                                                    lineHeight: "16px",
                                                    fontWeight: 700,
                                                    color: severity.color,
                                                    backgroundColor: severity.tint,
                                                    borderRadius: "999px",
                                                    padding: "1px 8px",
                                                }}
                                            >
                                                {severity.label}
                                            </span>
                                            <Text style={{ ...text.base, fontWeight: 600, marginTop: "4px" }}>
                                                <Link href={absoluteUrl(baseUrl, `/flags/${encodeURIComponent(flag.id)}`)} style={{ color: brand.ink, textDecoration: "none" }}>
                                                    {flag.title}
                                                </Link>
                                            </Text>
                                            <Text style={{ ...text.base, fontSize: "14px", lineHeight: "21px", color: brand.muted, marginTop: "2px" }}>{flag.summary}</Text>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        );
                    })
                ) : (
                    <Text style={text.base}>No open flags.</Text>
                )}
                <Text style={{ ...text.small, marginTop: "10px" }}>
                    <Link href={absoluteUrl(baseUrl, "/flags")} style={text.link}>
                        Review all flags
                    </Link>
                </Text>
            </Section>

            {/* Vendor performance */}
            {digest.vendorPerformance.length ? (
                <Section style={sectionGap}>
                    <Heading as="h2" style={text.h2}>
                        Vendor performance
                    </Heading>
                    <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th style={headCell}>Vendor</th>
                                <th style={{ ...headCell, ...numeric }}>Lines</th>
                                <th style={{ ...headCell, ...numeric }}>Filled</th>
                                <th style={{ ...headCell, ...numeric }}>Avg days</th>
                            </tr>
                        </thead>
                        <tbody>
                            {digest.vendorPerformance.map((vendor) => (
                                <tr key={vendor.vendor}>
                                    <td style={{ ...cell, fontWeight: 600 }}>{vendor.vendor}</td>
                                    <td style={{ ...cell, ...numeric }}>{vendor.lines}</td>
                                    <td style={{ ...cell, ...numeric, color: vendor.fillRate < 0.9 ? brand.warn : brand.ink }}>{Math.round(vendor.fillRate * 100)}%</td>
                                    <td style={{ ...cell, ...numeric }}>{vendor.avgLeadDays ?? "n/a"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <Text style={{ ...text.small, marginTop: "8px" }}>Filled is units received as a share of units ordered. Avg days runs from the order date to the receipt.</Text>
                </Section>
            ) : null}

            <Hr style={{ borderColor: brand.border, margin: "28px 0 24px" }} />

            <Section style={{ textAlign: "center" }}>
                <PrimaryButton href={absoluteUrl(baseUrl, "/")}>Open the app</PrimaryButton>
            </Section>
        </EmailShell>
    );
}

export default DigestEmail;
