/**
 * Outgoing email, through Resend.
 *
 *   sendDigest()      the weekly / monthly digest for one location
 *   sendFlagAlert()   one high-severity flag
 *   render*Html()     the same templates as HTML, for previews (?dryRun=1)
 *
 * When Resend is not configured (no RESEND_API_KEY or no RESEND_FROM) nothing is sent: the
 * function logs one line saying what it would have sent and returns `{ status: "skipped" }`.
 * Callers do not need to check `isConfigured.resend` themselves.
 *
 * EMAIL_REDIRECT_TO, when set, replaces the recipients of every email. Use it on preview
 * deployments so a test run cannot reach staff.
 *
 * Server only.
 */
import { createElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import type { Digest, Flag } from "@/data/types";
import { digestSubject } from "@/engine/digest";
import { DigestEmail } from "~/emails/digest-email";
import { FlagAlertEmail, flagAlertSubject } from "~/emails/flag-alert-email";
import { appUrl, env, isConfigured } from "~/lib/env";

export type SendResult =
    | { status: "sent"; id: string; to: string[] }
    | { status: "skipped"; reason: "not_configured" | "no_recipients"; to: string[] }
    | { status: "failed"; error: string; to: string[] };

let client: Resend | null = null;
const resend = () => (client ??= new Resend(env.resendApiKey));

const baseUrl = () => appUrl("/").replace(/\/$/, "");

const uniqueEmails = (to: string[]) => [...new Set(to.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];

interface OutgoingEmail {
    to: string[];
    subject: string;
    react: React.ReactElement;
    /** Resend tag values: ASCII letters, numbers, underscores and dashes only. */
    tags: { name: string; value: string }[];
    /** Makes a retried or duplicated request a no-op at Resend for 24 hours. */
    idempotencyKey?: string;
}

const tagValue = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);

const send = async ({ to, subject, react, tags, idempotencyKey }: OutgoingEmail): Promise<SendResult> => {
    const intended = uniqueEmails(to);
    const recipients = env.emailRedirectTo ? uniqueEmails([env.emailRedirectTo]) : intended;

    if (!recipients.length) return { status: "skipped", reason: "no_recipients", to: [] };

    if (!isConfigured.resend) {
        console.info(`[email] Resend is not configured. Skipped "${subject}" to ${recipients.length} recipient(s).`);
        return { status: "skipped", reason: "not_configured", to: recipients };
    }

    try {
        // Resend renders the React element to HTML and derives the plain-text part itself.
        const { data, error } = await resend().emails.send(
            {
                from: env.resendFrom as string,
                to: recipients,
                subject: env.emailRedirectTo ? `[redirected] ${subject}` : subject,
                react,
                ...(env.resendReplyTo ? { replyTo: env.resendReplyTo } : {}),
                tags: tags.map((t) => ({ name: t.name, value: tagValue(t.value) })),
            },
            idempotencyKey ? { idempotencyKey } : undefined,
        );
        if (error || !data) return { status: "failed", error: error?.message ?? "Resend returned no id", to: recipients };
        return { status: "sent", id: data.id, to: recipients };
    } catch (error) {
        return { status: "failed", error: error instanceof Error ? error.message : String(error), to: recipients };
    }
};

// ------------------------------------------------------------------------------------ digest

export interface DigestEmailInput {
    digest: Digest;
    locationName: string;
    /** True when the digest was built from the sample data layer. */
    sampleData?: boolean;
}

const digestElement = ({ digest, locationName, sampleData }: DigestEmailInput) =>
    createElement(DigestEmail, { digest, locationName, baseUrl: baseUrl(), logoUrl: env.emailLogoUrl, sampleData });

export const renderDigestHtml = (input: DigestEmailInput): Promise<string> => render(digestElement(input));

export const sendDigest = (input: DigestEmailInput & { to: string[] }): Promise<SendResult> =>
    send({
        to: input.to,
        subject: digestSubject(input.digest, input.locationName),
        react: digestElement(input),
        tags: [
            { name: "type", value: `digest_${input.digest.period}` },
            { name: "location", value: input.digest.locationId },
        ],
        // digest.id is "<period>-<location>-<date>": one send per period, location and day.
        idempotencyKey: `digest/${input.digest.id}`,
    });

// ------------------------------------------------------------------------------------ flag alert

export interface FlagAlertInput {
    flag: Flag;
    locationName: string;
    sampleData?: boolean;
}

const flagElement = ({ flag, locationName, sampleData }: FlagAlertInput) =>
    createElement(FlagAlertEmail, { flag, locationName, baseUrl: baseUrl(), logoUrl: env.emailLogoUrl, sampleData });

export const renderFlagAlertHtml = (input: FlagAlertInput): Promise<string> => render(flagElement(input));

export const sendFlagAlert = (input: FlagAlertInput & { to: string[] }): Promise<SendResult> =>
    send({
        to: input.to,
        subject: flagAlertSubject(input.flag, input.locationName),
        react: flagElement(input),
        tags: [
            { name: "type", value: "flag_alert" },
            { name: "location", value: input.flag.locationId },
        ],
        idempotencyKey: `flag/${input.flag.id}`.slice(0, 256),
    });
