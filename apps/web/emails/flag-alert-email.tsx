/**
 * Alert for one high-severity flag, sent by the daily scan (app/api/cron/flags) the first
 * time the flag is detected.
 *
 * A flag states what was observed and what to check. It never accuses anyone: the wording
 * comes from packages/ui/engine/flags.ts and is passed through unchanged.
 */
import { Heading, Hr, Section, Text } from "@react-email/components";
import type { Flag } from "@/data/types";
import { formatDate } from "@/engine/dates";
import { EmailShell, PrimaryButton, absoluteUrl, brand, fontFamily, text } from "./shared";

export interface FlagAlertEmailProps {
    flag: Flag;
    locationName: string;
    /** Public origin of the app, used for every link. */
    baseUrl: string;
    logoUrl?: string;
    sampleData?: boolean;
}

export const flagAlertSubject = (flag: Flag, locationName: string) => `Needs review at ${locationName}: ${flag.title}`;

export function FlagAlertEmail({ flag, locationName, baseUrl, logoUrl, sampleData = false }: FlagAlertEmailProps) {
    const flagUrl = absoluteUrl(baseUrl, `/flags/${encodeURIComponent(flag.id)}`);

    return (
        <EmailShell
            preview={flag.summary}
            baseUrl={baseUrl}
            logoUrl={logoUrl}
            footer={
                <>
                    <Text style={text.small}>Sent to owners and managers of {locationName} because this flag is high severity. Lower-severity flags wait for the weekly digest.</Text>
                    <Text style={{ ...text.small, marginTop: "6px" }}>Meraki Spa &middot; Lynnfield and Newburyport, Massachusetts</Text>
                </>
            }
        >
            <Text style={{ ...text.eyebrow, color: brand.bad }}>High-severity flag &middot; {locationName}</Text>
            <Heading as="h1" style={{ margin: "8px 0 10px", fontFamily, fontSize: "24px", lineHeight: "30px", fontWeight: 700, color: brand.ink }}>
                {flag.title}
            </Heading>
            <Text style={text.base}>{flag.summary}</Text>
            <Text style={{ ...text.small, marginTop: "8px" }}>Detected {formatDate(flag.detectedAt.slice(0, 10), true)}</Text>

            {sampleData ? (
                <Section style={{ marginTop: "16px", backgroundColor: brand.warnTint, borderRadius: "10px", padding: "10px 14px" }}>
                    <Text style={{ ...text.small, color: brand.warn }}>Preview on sample data. This did not happen.</Text>
                </Section>
            ) : null}

            {flag.evidence.length ? (
                <Section style={{ marginTop: "20px", backgroundColor: brand.mist, borderRadius: "10px", padding: "6px 16px" }}>
                    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse" }}>
                        <tbody>
                            {flag.evidence.map((row, i) => (
                                <tr key={`${row.label}-${i}`}>
                                    <td style={{ fontFamily, fontSize: "14px", lineHeight: "20px", color: brand.muted, padding: "8px 12px 8px 0", borderTop: i === 0 ? "none" : `1px solid ${brand.border}`, verticalAlign: "top" }}>
                                        {row.label}
                                    </td>
                                    <td
                                        style={{
                                            fontFamily,
                                            fontSize: "14px",
                                            lineHeight: "20px",
                                            fontWeight: 600,
                                            color: brand.ink,
                                            padding: "8px 0",
                                            borderTop: i === 0 ? "none" : `1px solid ${brand.border}`,
                                            textAlign: "right",
                                            verticalAlign: "top",
                                        }}
                                    >
                                        {row.value}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Section>
            ) : null}

            {flag.suggestedAction ? (
                <Section style={{ marginTop: "20px" }}>
                    <Text style={text.eyebrow}>Suggested next step</Text>
                    <Text style={{ ...text.base, marginTop: "4px" }}>{flag.suggestedAction}</Text>
                </Section>
            ) : null}

            <Hr style={{ borderColor: brand.border, margin: "26px 0 22px" }} />

            <Section style={{ textAlign: "center" }}>
                <PrimaryButton href={flagUrl}>Review this flag</PrimaryButton>
            </Section>
        </EmailShell>
    );
}

export default FlagAlertEmail;
