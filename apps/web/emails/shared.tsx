/**
 * Shared pieces for Meraki emails: brand tokens and the outer shell (header wordmark, card,
 * footer). Both templates in this folder render inside <EmailShell>.
 *
 * Email clients are not browsers. Everything here is tables and inline styles through the
 * React Email components: no flexbox, no grid, no CSS variables, no external stylesheet
 * beyond the optional web font. Hex values are written out on purpose (the app's Tailwind
 * tokens do not exist in an inbox).
 */
import type { CSSProperties, ReactNode } from "react";
import { Body, Button, Container, Head, Html, Img, Link, Preview, Section, Text } from "@react-email/components";

export const brand = {
    aqua: "#65c5c3", // fills: buttons, header rule. Always paired with ink text.
    ink: "#17262e", // body text and text on aqua
    teal: "#245b59", // links and small headings
    mist: "#f1f7f8", // page background and quiet panels
    white: "#ffffff",
    border: "#dbe7e8",
    muted: "#5b6b72", // secondary text; 5.4:1 on white
    // Status colours, each chosen to pass 4.5:1 as text on its tint.
    bad: "#b42318",
    badTint: "#fef3f2",
    warn: "#93370d",
    warnTint: "#fffaeb",
    good: "#067647",
    goodTint: "#ecfdf3",
} as const;

/** Figtree where the client loads web fonts (Apple Mail, iOS Mail); system sans everywhere else. */
export const fontFamily = "Figtree, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export type Tone = "good" | "bad" | "neutral" | "warning";

export const toneColor = (tone: Tone | undefined): string => (tone === "bad" ? brand.bad : tone === "warning" ? brand.warn : tone === "good" ? brand.good : brand.ink);
export const toneTint = (tone: Tone | undefined): string => (tone === "bad" ? brand.badTint : tone === "warning" ? brand.warnTint : tone === "good" ? brand.goodTint : brand.mist);
export const toneRule = (tone: Tone | undefined): string => (tone === "bad" ? brand.bad : tone === "warning" ? "#dc6803" : tone === "good" ? "#17b26a" : brand.aqua);

/** Turn an in-app path ("/flags") into an absolute link. Absolute URLs pass through. */
export const absoluteUrl = (baseUrl: string, href = "/"): string => (/^https?:\/\//i.test(href) ? href : `${baseUrl.replace(/\/+$/, "")}${href.startsWith("/") ? href : `/${href}`}`);

export const text = {
    base: { margin: 0, fontFamily, fontSize: "15px", lineHeight: "22px", color: brand.ink } satisfies CSSProperties,
    small: { margin: 0, fontFamily, fontSize: "13px", lineHeight: "19px", color: brand.muted } satisfies CSSProperties,
    eyebrow: {
        margin: 0,
        fontFamily,
        fontSize: "12px",
        lineHeight: "16px",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: brand.teal,
    } satisfies CSSProperties,
    h2: { margin: "0 0 12px", fontFamily, fontSize: "17px", lineHeight: "24px", fontWeight: 600, color: brand.ink } satisfies CSSProperties,
    link: { color: brand.teal, textDecoration: "underline", fontWeight: 600 } satisfies CSSProperties,
};

export const sectionGap = { padding: "28px 0 0" } satisfies CSSProperties;

/** Aqua fill, ink text: the same primary button as the app. */
export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Button
            href={href}
            style={{
                backgroundColor: brand.aqua,
                color: brand.ink,
                fontFamily,
                fontSize: "15px",
                lineHeight: "20px",
                fontWeight: 600,
                textDecoration: "none",
                borderRadius: "10px",
                padding: "12px 22px",
            }}
        >
            {children}
        </Button>
    );
}

interface EmailShellProps {
    /** Inbox preview line (shown after the subject in most clients). */
    preview: string;
    /** Public origin of the app, e.g. https://inventory.example.com */
    baseUrl: string;
    /** Absolute URL of a hosted logo. A text wordmark is used when this is missing. */
    logoUrl?: string;
    /** Lines shown in small print under the card. */
    footer: ReactNode;
    children: ReactNode;
}

export function EmailShell({ preview, baseUrl, logoUrl, footer, children }: EmailShellProps) {
    return (
        <Html lang="en">
            <Head>
                <meta name="color-scheme" content="light only" />
                <meta name="supported-color-schemes" content="light only" />
                {/* Ignored by clients that do not load web fonts; they use the fallback stack. */}
                <style>{"@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap');"}</style>
            </Head>
            <Preview>{preview}</Preview>
            <Body style={{ margin: 0, padding: "24px 12px", backgroundColor: brand.mist, fontFamily }}>
                <Container style={{ maxWidth: "600px", margin: "0 auto" }}>
                    {/* Header wordmark */}
                    <Section style={{ padding: "4px 4px 16px" }}>
                        <Link href={absoluteUrl(baseUrl, "/")} style={{ textDecoration: "none" }}>
                            {logoUrl ? (
                                <Img src={logoUrl} alt="Meraki Inventory" height="32" style={{ display: "block", height: "32px", width: "auto", border: 0 }} />
                            ) : (
                                <Text style={{ margin: 0, fontFamily, fontSize: "18px", lineHeight: "24px", color: brand.ink }}>
                                    <span style={{ fontWeight: 700, letterSpacing: "0.22em" }}>MERAKI</span>
                                    <span style={{ color: brand.teal, fontWeight: 500 }}>&nbsp;&nbsp;Inventory</span>
                                </Text>
                            )}
                        </Link>
                    </Section>

                    {/* Card */}
                    <Section style={{ backgroundColor: brand.white, border: `1px solid ${brand.border}`, borderTop: `4px solid ${brand.aqua}`, borderRadius: "14px" }}>
                        <Section style={{ padding: "28px 28px 32px" }}>{children}</Section>
                    </Section>

                    {/* Footer */}
                    <Section style={{ padding: "18px 6px 8px" }}>{footer}</Section>
                </Container>
            </Body>
        </Html>
    );
}
