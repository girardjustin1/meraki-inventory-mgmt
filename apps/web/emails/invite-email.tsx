/**
 * Invitation to join Meraki Inventory, sent when an admin invites someone by email
 * (lib/invites.ts). Open links are not emailed: the admin copies and sends those directly.
 *
 * The email says who invited the person, what they will be able to do and where, and
 * carries one button: the invite link. It states plainly that the link works once, expires,
 * and only works with the Google account for the address it was sent to, so a forwarded
 * copy is of no use to anyone else.
 *
 * The link contains the invite token. This template is the only place the token is written
 * down outside the admin's screen; the database keeps only its hash.
 */
import { Heading, Hr, Link, Section, Text } from "@react-email/components";
import type { AccessLevel, Role } from "@/data/types";
import { ACCESS_LABEL } from "@/engine/permissions";
import { EmailShell, PrimaryButton, brand, fontFamily, text } from "./shared";

export interface InviteEmailProps {
    /** The full invite link, token included. */
    inviteUrl: string;
    /** Who sent the invite, as the recipient would know them. */
    inviterName: string;
    /** First name typed by the inviter, for the greeting. */
    inviteeName?: string;
    /** The address the invite is bound to. */
    email: string;
    role: Role;
    access: AccessLevel;
    /** "Lynnfield", "Newburyport". Empty for an admin with no home location. */
    locationNames: string[];
    /** A line from the inviter, shown as written. */
    note?: string;
    /** ISO timestamp. */
    expiresAt: string;
    /** Public origin of the app, used for the header link. */
    baseUrl: string;
    logoUrl?: string;
    /** Adds a line saying this invite is from the prototype and will not work on the real app. */
    sampleData?: boolean;
}

// Kept here, not imported from packages/ui/data/inventory.ts: that module loads the whole
// sample catalogue, which an email template has no business pulling in.
const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", "front-desk": "Front desk", technician: "Technician" };

/** What the access level means for this person, in one sentence. */
const accessLine = (access: AccessLevel, role: Role, locationNames: string[]): string => {
    if (access === "admin") return "Everything, at every location: stock, orders, approvals, costs, the team and settings.";
    const where = locationNames.length ? `at ${listOf(locationNames)}` : "at your location";
    if (role === "manager") return `Stock, counts, orders, flags, costs and reports ${where}.`;
    if (role === "front-desk") return `See stock, count, log usage and receive deliveries ${where}.`;
    return `See stock, count and log usage ${where}.`;
};

const listOf = (names: string[]): string => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** "Saturday, November 21 at 3:20 PM ET". The salons are in Massachusetts. */
export const formatInviteExpiry = (iso: string): string => {
    const date = new Date(iso);
    const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(date);
    const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(date);
    return `${day} at ${time} ET`;
};

export const inviteSubject = (inviterName: string) => `${inviterName} invited you to Meraki Inventory`;

const rowLabel = { fontFamily, fontSize: "14px", lineHeight: "20px", color: brand.muted, padding: "8px 12px 8px 0", verticalAlign: "top", whiteSpace: "nowrap" } as const;
const rowValue = { fontFamily, fontSize: "14px", lineHeight: "20px", fontWeight: 600, color: brand.ink, padding: "8px 0", textAlign: "right", verticalAlign: "top" } as const;

export function InviteEmail({ inviteUrl, inviterName, inviteeName, email, role, access, locationNames, note, expiresAt, baseUrl, logoUrl, sampleData = false }: InviteEmailProps) {
    const expires = formatInviteExpiry(expiresAt);
    const rows: [string, string][] = [
        ["Invited by", inviterName],
        ["Role", ROLE_LABEL[role]],
        ["Access", ACCESS_LABEL[access]],
        ["Locations", access === "admin" ? "All locations" : listOf(locationNames) || "To be assigned"],
        ["Expires", expires],
    ];

    return (
        <EmailShell
            preview={`${inviterName} invited you to Meraki Inventory as ${ROLE_LABEL[role].toLowerCase()}. The link expires ${expires}.`}
            baseUrl={baseUrl}
            logoUrl={logoUrl}
            footer={
                <>
                    <Text style={text.small}>
                        Sent to {email} because {inviterName} invited you to Meraki Inventory. If you were not expecting this, you can ignore it: nothing happens unless the
                        link is opened and accepted.
                    </Text>
                    <Text style={{ ...text.small, marginTop: "6px" }}>Meraki Spa &middot; Lynnfield and Newburyport, Massachusetts</Text>
                </>
            }
        >
            <Text style={text.eyebrow}>Invitation</Text>
            <Heading as="h1" style={{ margin: "8px 0 10px", fontFamily, fontSize: "24px", lineHeight: "30px", fontWeight: 700, color: brand.ink }}>
                {inviteeName ? `${inviteeName}, you are invited to Meraki Inventory` : "You are invited to Meraki Inventory"}
            </Heading>
            <Text style={text.base}>
                {inviterName} has set you up as <strong>{ROLE_LABEL[role].toLowerCase()}</strong>
                {access === "admin" ? " with admin access" : locationNames.length ? ` at ${listOf(locationNames)}` : ""}. Meraki Inventory is where the team counts stock, logs
                what it uses, and orders and receives supplies.
            </Text>

            {sampleData ? (
                <Section style={{ marginTop: "16px", backgroundColor: brand.warnTint, borderRadius: "10px", padding: "10px 14px" }}>
                    <Text style={{ ...text.small, color: brand.warn }}>Preview from the prototype. This invite is sample data and its link only works on the demo.</Text>
                </Section>
            ) : null}

            {note ? (
                <Section style={{ marginTop: "20px", borderLeft: `3px solid ${brand.aqua}`, padding: "2px 0 2px 14px" }}>
                    <Text style={text.eyebrow}>A note from {inviterName}</Text>
                    <Text style={{ ...text.base, marginTop: "4px" }}>{note}</Text>
                </Section>
            ) : null}

            <Section style={{ marginTop: "20px", backgroundColor: brand.mist, borderRadius: "10px", padding: "6px 16px" }}>
                <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse" }}>
                    <tbody>
                        {rows.map(([label, value], i) => (
                            <tr key={label}>
                                <td style={{ ...rowLabel, borderTop: i === 0 ? "none" : `1px solid ${brand.border}` }}>{label}</td>
                                <td style={{ ...rowValue, borderTop: i === 0 ? "none" : `1px solid ${brand.border}` }}>{value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>

            <Section style={{ marginTop: "20px" }}>
                <Text style={text.eyebrow}>What you will be able to do</Text>
                <Text style={{ ...text.base, marginTop: "4px" }}>{accessLine(access, role, locationNames)}</Text>
            </Section>

            <Hr style={{ borderColor: brand.border, margin: "26px 0 22px" }} />

            <Section style={{ textAlign: "center" }}>
                <PrimaryButton href={inviteUrl}>Accept invitation</PrimaryButton>
            </Section>

            <Section style={{ marginTop: "22px" }}>
                <Text style={text.small}>
                    You will be asked to sign in with Google. Use the Google account for <strong style={{ color: brand.ink }}>{email}</strong>: the invitation only works with
                    that one. The link works once and expires {expires}.
                </Text>
                <Text style={{ ...text.small, marginTop: "10px" }}>
                    If the button does not work, copy this address into your browser:
                    <br />
                    <Link href={inviteUrl} style={{ ...text.link, fontWeight: 400, wordBreak: "break-all" }}>
                        {inviteUrl}
                    </Link>
                </Text>
            </Section>
        </EmailShell>
    );
}

export default InviteEmail;
