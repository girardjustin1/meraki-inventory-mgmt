"use client";

import { useState } from "react";
import { CheckCircle, Monitor01, Phone01, Send01, XClose } from "@untitledui/icons";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { NativeSelect } from "@/components/base/select/select-native";
import { Toggle } from "@/components/base/toggle/toggle";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { DigestView } from "@/components/meraki/digest-view";
import { SampleBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, ROLE_LABEL, TODAY, getDigest, locationName, users } from "@/data/inventory";
import type { DigestPeriod, LocationId, Role, User } from "@/data/types";
import { addDays, formatDate, toDate } from "@/engine/dates";
import { digestSubject } from "@/engine/digest";
import { useUrlSync } from "@/utils/url-sync";

type Scope = LocationId | "all";

/** The digests the data layer builds today: weekly per location, monthly for Lynnfield and for both. */
const SCOPES: Record<DigestPeriod, Scope[]> = { weekly: ["lynnfield", "newburyport"], monthly: ["lynnfield", "all"] };

const validScope = (period: DigestPeriod, scope: Scope): Scope => (SCOPES[period].includes(scope) ? scope : period === "monthly" ? "all" : "lynnfield");

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Most recent Monday on or before a date. */
const lastMonday = (iso: string) => addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7));

const pastSends = (period: DigestPeriod) =>
    period === "weekly"
        ? [0, 7, 14, 21, 28].map((back) => addDays(lastMonday(TODAY), -back))
        : [0, 1, 2, 3].map((back) => {
              const d = toDate(TODAY);
              return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1)).toISOString().slice(0, 10);
          });

const nextSend = (period: DigestPeriod) => {
    if (period === "weekly") return addDays(lastMonday(TODAY), 7);
    const d = toDate(TODAY);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
};

const joinWords = (words: string[]) => (words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

/** "owners and managers", from whoever is actually on the list. */
const audience = (recipients: User[]) => {
    const order: Role[] = ["owner", "manager", "front-desk", "technician"];
    const roles = order.filter((role) => recipients.some((u) => u.role === role));
    return roles.length ? joinWords(roles.map((role) => (role === "front-desk" ? "front desk" : `${ROLE_LABEL[role].toLowerCase()}s`))) : "nobody yet";
};

export interface DigestScreenProps {
    period?: DigestPeriod;
    /** A location, or "all" for the monthly digest covering both salons. */
    location?: Scope;
}

/**
 * Digests: choose what is sent, when and to whom on the left; see exactly what lands in the
 * inbox on the right. The preview is the same component the email template mirrors.
 */
export const DigestScreen = ({ period: initialPeriod = "weekly", location: initialScope = "lynnfield" }: DigestScreenProps) => {
    const [period, setPeriod] = useState<DigestPeriod>(initialPeriod);
    const [scope, setScope] = useState<Scope>(validScope(initialPeriod, initialScope));
    useUrlSync({ period: period === "weekly" ? undefined : period, scope });
    const [shellLocation, setShellLocation] = useState<LocationId>(initialScope === "all" ? "lynnfield" : initialScope);
    const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
    const [enabled, setEnabled] = useState(true);
    const [testSent, setTestSent] = useState(false);

    const digest = getDigest(period, scope);
    const [recipientEmails, setRecipientEmails] = useState<string[]>(digest.recipients);
    const recipients = recipientEmails.map((email) => users.find((u) => u.email === email)).filter((u): u is User => Boolean(u));
    const addable = users.filter((u) => !recipientEmails.includes(u.email));

    const changePeriod = (next: DigestPeriod) => {
        setPeriod(next);
        setScope((current) => validScope(next, current));
        setTestSent(false);
    };
    const changeScope = (next: Scope) => {
        setScope(next);
        if (next !== "all") setShellLocation(next);
        setTestSent(false);
    };

    const weekly = period === "weekly";
    const schedule = weekly ? "Every Monday at 7:00 AM" : "On the first of each month at 7:00 AM";
    const upcoming = nextSend(period);

    return (
        <AppShell
            activeUrl={ROUTES.digest}
            location={shellLocation}
            onLocationChange={(next) => {
                setShellLocation(next);
                setScope(validScope(period, next));
            }}
        >
            <PageContent>
                <PageHeader title="Digests" description="A short summary by email, so nobody has to open the app to know what needs attention." />

                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-8">
                    <div className="flex flex-col gap-4 lg:sticky lg:top-8">
                        <Card className="flex flex-col gap-5">
                            <ButtonGroup
                                aria-label="Digest"
                                size="md"
                                className="w-full"
                                selectedKeys={[period]}
                                disallowEmptySelection
                                onSelectionChange={(keys) => {
                                    const key = [...keys][0];
                                    if (key) changePeriod(key as DigestPeriod);
                                }}
                            >
                                <ButtonGroupItem id="weekly" className="min-h-11 flex-1 justify-center">
                                    Weekly
                                </ButtonGroupItem>
                                <ButtonGroupItem id="monthly" className="min-h-11 flex-1 justify-center">
                                    Monthly
                                </ButtonGroupItem>
                            </ButtonGroup>

                            <Select
                                label="Location"
                                size="md"
                                items={SCOPES[period].map((id) => ({ id, label: locationName(id) }))}
                                value={scope}
                                onChange={(key) => {
                                    if (key) changeScope(key as Scope);
                                }}
                                hint={weekly ? "Each salon gets its own weekly digest." : "The monthly digest can cover both salons in one email."}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>

                            <div className="flex flex-col gap-2 border-t border-secondary pt-4">
                                <h2 className="text-sm font-semibold text-primary">Schedule</h2>
                                <p className="text-md text-secondary">
                                    {schedule} to {audience(recipients)}.
                                </p>
                                <p className="text-sm text-tertiary">
                                    {enabled
                                        ? `Next one goes out ${WEEKDAYS[toDate(upcoming).getUTCDay()]}, ${formatDate(upcoming)}.`
                                        : "Paused. Nothing will be sent until this is turned back on."}
                                </p>
                                <Toggle
                                    size="md"
                                    className="mt-1 min-h-11 items-center"
                                    isSelected={enabled}
                                    onChange={setEnabled}
                                    label={`Send the ${period} digest`}
                                />
                            </div>

                            <div className="flex flex-col gap-2 border-t border-secondary pt-4">
                                <h2 className="text-sm font-semibold text-primary">Recipients</h2>
                                {recipients.length ? (
                                    <ul className="flex flex-wrap gap-2">
                                        {recipients.map((u) => (
                                            <li
                                                key={u.id}
                                                className="flex items-center gap-1 rounded-full bg-secondary py-1 pr-1 pl-3 text-sm font-medium text-secondary ring-1 ring-secondary ring-inset"
                                            >
                                                <span>{u.name}</span>
                                                <span className="text-tertiary">· {ROLE_LABEL[u.role]}</span>
                                                <button
                                                    type="button"
                                                    aria-label={`Remove ${u.name}`}
                                                    onClick={() => setRecipientEmails((list) => list.filter((email) => email !== u.email))}
                                                    className="flex size-9 items-center justify-center rounded-full text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 lg:size-6"
                                                >
                                                    <XClose className="size-4" aria-hidden="true" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-warning-primary">Nobody is on the list, so this digest will not be sent.</p>
                                )}
                                {addable.length > 0 && (
                                    <NativeSelect
                                        aria-label="Add a recipient"
                                        size="sm"
                                        value=""
                                        onChange={(event) => {
                                            const email = event.target.value;
                                            if (email) setRecipientEmails((list) => [...list, email]);
                                        }}
                                        options={[
                                            { label: "Add a recipient", value: "" },
                                            ...addable.map((u) => ({ label: `${u.name} (${ROLE_LABEL[u.role]})`, value: u.email })),
                                        ]}
                                    />
                                )}
                            </div>

                            <div className="flex flex-col gap-2 border-t border-secondary pt-4">
                                <Button color="secondary" size="md" iconLeading={Send01} className="min-h-11 w-full" onClick={() => setTestSent(true)}>
                                    Send test to me
                                </Button>
                                {testSent && (
                                    <p role="status" className="flex items-start gap-2 text-sm text-secondary">
                                        <CheckCircle className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                                        <span>
                                            In the live app this sends the preview to {CURRENT_USER.email}. Nothing was emailed from the prototype: Resend is
                                            not connected yet.
                                        </span>
                                    </p>
                                )}
                            </div>
                        </Card>

                        <Card className="flex flex-col gap-3">
                            <CardHeader title="Past sends" actions={<SampleBadge />} />
                            <ul className="flex flex-col divide-y divide-border-secondary">
                                {pastSends(period).map((date, i) => (
                                    <li key={date} className="flex items-center justify-between gap-3 py-2.5">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-secondary">{formatDate(date, true)}</p>
                                            <p className="text-xs text-tertiary">
                                                Delivered to {digest.recipients.length} · opened by {Math.max(1, digest.recipients.length - (i % 2))}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-xs font-medium text-tertiary">7:00 AM</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-tertiary">Example history. Real sends are listed here once email is connected.</p>
                        </Card>
                    </div>

                    <section aria-label="Email preview" className="flex min-w-0 flex-col gap-4">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <h2 className="text-md font-semibold text-primary">Preview</h2>
                                <p className="text-sm text-tertiary">
                                    <span className="font-medium text-secondary">Subject: </span>
                                    {digestSubject(digest, locationName(digest.locationId))}
                                </p>
                            </div>
                            <ButtonGroup
                                aria-label="Preview width"
                                size="sm"
                                className="max-lg:hidden"
                                selectedKeys={[width]}
                                disallowEmptySelection
                                onSelectionChange={(keys) => {
                                    const key = [...keys][0];
                                    if (key) setWidth(key as "desktop" | "mobile");
                                }}
                            >
                                <ButtonGroupItem id="desktop" iconLeading={Monitor01}>
                                    Desktop
                                </ButtonGroupItem>
                                <ButtonGroupItem id="mobile" iconLeading={Phone01}>
                                    Mobile
                                </ButtonGroupItem>
                            </ButtonGroup>
                        </div>

                        <div className="rounded-2xl bg-secondary p-3 ring-1 ring-secondary ring-inset lg:p-8">
                            <DigestView digest={{ ...digest, recipients: recipientEmails }} width={width} />
                        </div>

                        <SampleDataNote />
                    </section>
                </div>
            </PageContent>
        </AppShell>
    );
};
