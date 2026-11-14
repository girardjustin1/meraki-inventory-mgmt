"use client";

import { useSyncExternalStore } from "react";
import { Check, Clock, Copy01, Link01, Mail01, MarkerPin01, ShieldTick } from "@untitledui/icons";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { AccessBadge } from "@/components/meraki/access-badge";
import { RoleBadge } from "@/components/meraki/status-badges";
import { QRCode } from "@/components/shared-assets/qr-code";
import { INVITE_TTL_DAYS, TODAY, inviteUrl, locations } from "@/data/inventory";
import type { Invite, InviteStatus, LocationId } from "@/data/types";
import { daysBetween, formatDate } from "@/engine/dates";
import { useClipboard } from "@/hooks/use-clipboard";
import { cx } from "@/utils/cx";

/** "Both locations", or the short names. */
export const locationScope = (ids: LocationId[]) =>
    ids.length === locations.length ? "Both locations" : ids.map((id) => locations.find((l) => l.id === id)?.shortName ?? id).join(", ");

/** A pending invite past its expiry date is expired, whatever the stored status says. */
export const inviteStatus = (invite: Invite, today: string = TODAY): InviteStatus =>
    invite.status === "pending" && daysBetween(today, invite.expiresAt.slice(0, 10)) < 0 ? "expired" : invite.status;

/** Who can use the link. */
export const inviteAudience = (invite: Pick<Invite, "email">) => invite.email ?? "Anyone with this link";

/** "Expires in 5 days", "Expires tomorrow", "Expired 14 days ago". Relative to the prototype's fixed today. */
export const inviteExpiryLabel = (invite: Pick<Invite, "expiresAt">, today: string = TODAY) => {
    const n = daysBetween(today, invite.expiresAt.slice(0, 10));
    if (n === 0) return "Expires today";
    if (n === 1) return "Expires tomorrow";
    if (n > 1) return `Expires in ${n} days`;
    return n === -1 ? "Expired yesterday" : `Expired ${-n} days ago`;
};

const STATUS: Record<InviteStatus, { label: string; color: "blue" | "success" | "gray" | "error" }> = {
    pending: { label: "Pending", color: "blue" },
    accepted: { label: "Accepted", color: "success" },
    expired: { label: "Expired", color: "gray" },
    revoked: { label: "Revoked", color: "error" },
};

export const InviteStatusBadge = ({ status, size = "sm" }: { status: InviteStatus; size?: "sm" | "md" }) =>
    status === "pending" ? (
        <BadgeWithDot type="pill-color" color={STATUS[status].color} size={size}>
            {STATUS[status].label}
        </BadgeWithDot>
    ) : (
        <Badge type="pill-color" color={STATUS[status].color} size={size}>
            {STATUS[status].label}
        </Badge>
    );

const noop = () => () => undefined;

/** The address the app is being served from, so the link and the QR code are complete URLs. Empty on the server. */
export const useOrigin = () =>
    useSyncExternalStore(
        noop,
        () => window.location.origin,
        () => "",
    );

export interface InviteLinkCardProps {
    invite: Invite;
    /** Base of the link. Defaults to wherever the app is being served from. */
    origin?: string;
    /** Show the QR code beside the link. */
    showQr?: boolean;
    className?: string;
}

/**
 * One invite, ready to hand over: the link with a Copy button, a QR code to show on a phone,
 * and a plain statement of who can use it and for how long.
 */
export const InviteLinkCard = ({ invite, origin, showQr = true, className }: InviteLinkCardProps) => {
    const detected = useOrigin();
    const url = inviteUrl(invite.token, origin ?? detected);
    const { copied, copy } = useClipboard();
    const open = !invite.email;
    const status = inviteStatus(invite);
    const live = status === "pending";

    return (
        <section
            aria-label={`Invite for ${inviteAudience(invite)}`}
            className={cx(
                "grid gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-5",
                className,
            )}
        >
            <div className="flex min-w-0 flex-col gap-4">
                <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-fg-brand-primary ring-1 ring-brand_alt ring-inset">
                        {open ? <Link01 className="size-5" aria-hidden="true" /> : <Mail01 className="size-5" aria-hidden="true" />}
                    </span>
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold break-all text-primary">{inviteAudience(invite)}</p>
                            {invite.name && <p className="text-sm text-tertiary">For {invite.name}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <RoleBadge role={invite.role} />
                            <AccessBadge access={invite.access} />
                            {!live && <InviteStatusBadge status={status} />}
                        </div>
                    </div>
                </div>

                <dl className="flex flex-col gap-1.5 text-sm text-tertiary">
                    <div className="flex items-center gap-2">
                        <MarkerPin01 className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                        <dt className="sr-only">Locations</dt>
                        <dd>{invite.access === "admin" ? "Every location" : locationScope(invite.locations)}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                        <Clock className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                        <dt className="sr-only">Expiry</dt>
                        <dd>
                            {live ? (
                                <>
                                    <span className="font-medium text-secondary">{inviteExpiryLabel(invite)}</span>, on {formatDate(invite.expiresAt)}
                                </>
                            ) : status === "accepted" ? (
                                "Already used. The link no longer works."
                            ) : status === "revoked" ? (
                                "Revoked. The link no longer works."
                            ) : (
                                `${inviteExpiryLabel(invite)}. The link no longer works.`
                            )}
                        </dd>
                    </div>
                </dl>
            </div>

            {/* Beside the details on a wide card; after the link on a phone, where the link is the first thing to reach for. */}
            {showQr && live && (
                <figure className="flex shrink-0 flex-col items-center gap-2 max-sm:order-last">
                    {/* Remounted when the link changes: the vendored QRCode appends a new code instead of replacing it. */}
                    <QRCode key={url} value={url} size="lg" className="rounded-lg bg-primary" />
                    <figcaption className="max-w-40 text-center text-xs text-tertiary">Show this to scan with their phone camera</figcaption>
                </figure>
            )}

            {live && (
                <div className="flex min-w-0 flex-col gap-3 sm:col-span-full">
                    <div className="flex items-end gap-2">
                        <Input
                            aria-label="Invite link"
                            value={url}
                            isReadOnly
                            className="min-w-0 flex-1"
                            inputClassName="font-mono text-sm"
                            onFocus={(event) => (event.target as HTMLInputElement).select?.()}
                        />
                        <Button
                            color={copied ? "secondary" : "primary"}
                            size="md"
                            className="min-h-11 shrink-0 lg:min-h-10"
                            iconLeading={copied ? Check : Copy01}
                            onClick={() => copy(url, invite.id)}
                        >
                            {copied ? "Copied" : "Copy"}
                        </Button>
                    </div>

                    <p className="flex items-start gap-2 text-sm text-tertiary">
                        <ShieldTick className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />
                        <span>
                            {open
                                ? `Anyone holding this link can use it, once. Send it straight to the person, not to a group chat. Open links expire after ${INVITE_TTL_DAYS.link * 24} hours.`
                                : `Only the Google account for ${invite.email} can use this link, and only once.`}
                        </span>
                    </p>
                </div>
            )}
        </section>
    );
};
