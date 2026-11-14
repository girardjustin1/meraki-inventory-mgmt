"use client";

import type { FC, ReactNode } from "react";
import { useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    Check,
    CheckCircle,
    Copy01,
    InfoCircle,
    Key01,
    Link01,
    Mail01,
    MarkerPin01,
    QrCode02,
    Send01,
    ShieldOff,
    ShieldTick,
    SlashCircle01,
    UserCheck01,
    UserEdit,
    UserPlus01,
    UserX01,
    XClose,
} from "@untitledui/icons";
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Tab, TabList, TabPanel, Tabs } from "@/components/application/tabs/tabs";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { RadioButtonBase } from "@/components/base/radio-buttons/radio-buttons";
import { TextArea } from "@/components/base/textarea/textarea";
import { AccessBadge } from "@/components/meraki/access-badge";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import {
    InviteLinkCard,
    InviteStatusBadge,
    inviteAudience,
    inviteExpiryLabel,
    inviteStatus,
    locationScope,
    useOrigin,
} from "@/components/meraki/invite-link-card";
import { PermissionMatrix, PermissionSummary, SEPARATION_RULES } from "@/components/meraki/permission-matrix";
import { RoleBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, INVITE_TTL_DAYS, ROLE_LABEL, TODAY, inviteUrl, locations, invites as seedInvites, userById, users } from "@/data/inventory";
import type { AccessLevel, Invite, LocationId, Role, User } from "@/data/types";
import { addDays, daysBetween, formatDate, formatTime, relativeDays } from "@/engine/dates";
import { ACCESS_DESCRIPTION, ACCESS_LABEL, PERMISSION_GROUPS, ROLE_GRANTS, can, isAdmin } from "@/engine/permissions";
import { useClipboard } from "@/hooks/use-clipboard";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";

export type TeamTab = "members" | "invites" | "permissions";
export type InviteStep = "who" | "what" | "review" | "created";

type InvitableRole = Exclude<Role, "owner">;

const ROLES: Role[] = ["owner", "manager", "front-desk", "technician"];
/** Owners are set up with the account, never invited. */
const INVITABLE_ROLES: InvitableRole[] = ["manager", "front-desk", "technician"];
const ALL_LOCATIONS = locations.map((l) => l.id);

/** One sentence per role, shown where the role is chosen so nobody needs the matrix to pick correctly. */
const ROLE_DESCRIPTION: Record<Role, string> = {
    owner: "Always an admin. Sees both locations, approves orders and manages the team.",
    manager: "Runs and approves counts, builds orders and reviews flags for their location.",
    "front-desk": "Receives deliveries, counts when assigned and logs usage.",
    technician: "Logs what was used and counts the shelves assigned to them.",
};

interface Member extends User {
    status: "active" | "removed";
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const firstName = (name: string) => name.split(" ")[0] ?? name;
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const sameEmail = (a?: string, b?: string) => Boolean(a && b) && a?.trim().toLowerCase() === b?.trim().toLowerCase();

const lastActive = (member: Member) => {
    if (member.status === "removed") return "Access removed";
    if (!member.lastActiveAt) return "Has not signed in yet";
    const day = member.lastActiveAt.slice(0, 10);
    return daysBetween(day, TODAY) === 0 ? `Today, ${formatTime(member.lastActiveAt)}` : capitalise(relativeDays(day, TODAY));
};

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A random-looking token for the prototype. In production the server creates the token and stores only its hash. */
const generateToken = () => {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else bytes.forEach((_, i) => (bytes[i] = Math.floor(Math.random() * 256)));
    return `mk_${Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("")}`;
};

interface InviteDraft {
    mode: "email" | "link";
    email: string;
    name: string;
    role: InvitableRole;
    access: AccessLevel;
    locations: LocationId[];
    note: string;
}

const emptyDraft = (location: LocationId): InviteDraft => ({
    mode: "email",
    email: "",
    name: "",
    role: "technician",
    access: "user",
    locations: [location],
    note: "",
});

/** The draft behind the "Invite created" story, so the success state can be shown without clicking through. */
const STORY_DRAFT: InviteDraft = {
    mode: "email",
    email: "new.frontdesk@example.com",
    name: "Jamie",
    role: "front-desk",
    access: "user",
    locations: ["lynnfield"],
    note: "Covers the front desk on weekends.",
};

const buildInvite = (draft: InviteDraft, invitedBy: string, sequence: number): Invite => {
    const admin = draft.access === "admin";
    return {
        id: `inv-new-${sequence}`,
        token: generateToken(),
        email: draft.mode === "email" ? draft.email.trim().toLowerCase() : undefined,
        name: draft.name.trim() || undefined,
        role: draft.role,
        access: draft.access,
        locations: admin ? ALL_LOCATIONS : ALL_LOCATIONS.filter((id) => draft.locations.includes(id)),
        invitedBy,
        createdAt: `${TODAY}T12:00:00Z`,
        expiresAt: `${addDays(TODAY, INVITE_TTL_DAYS[draft.mode])}T12:00:00Z`,
        status: "pending",
        note: draft.note.trim() || undefined,
    };
};

// ------------------------------------------------------------------------------------ small pieces

const PinStatus = ({ member }: { member: Member }) =>
    member.hasPin ? (
        <BadgeWithDot type="pill-color" color="success" size="sm">
            PIN set
        </BadgeWithDot>
    ) : (
        <BadgeWithDot type="pill-color" color="warning" size="sm">
            No PIN yet
        </BadgeWithDot>
    );

const NameNotes = ({ member, isViewer }: { member: Member; isViewer: boolean }) => (
    <>
        {isViewer && (
            <Badge type="color" color="gray" size="sm">
                You
            </Badge>
        )}
        {member.status === "removed" && (
            <Badge type="color" color="gray" size="sm">
                Access removed
            </Badge>
        )}
    </>
);

const InviteWho = ({ invite }: { invite: Invite }) => (
    <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-fg-quaternary ring-1 ring-secondary ring-inset">
            {invite.email ? <Mail01 className="size-5" aria-hidden="true" /> : <Link01 className="size-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">{inviteAudience(invite)}</p>
            <p className="truncate text-sm text-tertiary">
                {invite.name ? `${invite.name} · ` : ""}
                {invite.email ? "Email link" : "Open link"}
            </p>
        </div>
    </div>
);

interface RadioCardProps {
    value: string;
    title: ReactNode;
    description: ReactNode;
    icon?: FC<{ className?: string }>;
    isDisabled?: boolean;
}

/** A radio the size of a card: the whole surface is the target, and the description sits where the choice is made. */
const RadioCard = ({ value, title, description, icon: Icon, isDisabled }: RadioCardProps) => (
    <AriaRadio
        value={value}
        isDisabled={isDisabled}
        className={({ isSelected, isFocusVisible, isDisabled: disabled }) =>
            cx(
                "flex min-h-14 cursor-pointer items-start gap-3 rounded-xl bg-primary p-3.5 ring-1 ring-secondary outline-focus-ring transition duration-100 ease-linear ring-inset",
                isSelected && "bg-brand-50 ring-2 ring-brand",
                isFocusVisible && "outline-2 outline-offset-2",
                disabled && "cursor-not-allowed opacity-50",
            )
        }
    >
        {({ isSelected, isDisabled: disabled }) => (
            <>
                <RadioButtonBase size="md" isSelected={isSelected} isDisabled={disabled} className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-sm font-semibold text-primary">
                        {Icon && <Icon className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />}
                        {title}
                    </span>
                    <span className="text-sm text-tertiary">{description}</span>
                </span>
            </>
        )}
    </AriaRadio>
);

const FieldLegend = ({ children, hint }: { children: ReactNode; hint?: ReactNode }) => (
    <div className="mb-2 flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-primary">{children}</span>
        {hint && <span className="text-sm text-tertiary">{hint}</span>}
    </div>
);

const Callout = ({ tone = "info", children }: { tone?: "info" | "warning" | "error"; children: ReactNode }) => {
    const Icon = tone === "info" ? InfoCircle : AlertTriangle;
    return (
        <div
            role={tone === "error" ? "alert" : undefined}
            className={cx(
                "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm text-secondary ring-1 ring-inset",
                tone === "info" && "bg-secondary ring-secondary",
                tone === "warning" && "bg-warning-primary ring-utility-yellow-200",
                tone === "error" && "bg-error-primary ring-error_subtle",
            )}
        >
            <Icon
                className={cx(
                    "mt-0.5 size-4 shrink-0",
                    tone === "info" && "text-fg-quaternary",
                    tone === "warning" && "text-fg-warning-primary",
                    tone === "error" && "text-fg-error-primary",
                )}
                aria-hidden="true"
            />
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
};

/** A small confirm or edit dialog: title, body, and one row of actions. */
const SmallDialog = ({
    label,
    title,
    description,
    children,
    actions,
    onClose,
}: {
    label: string;
    title: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    actions: ReactNode;
    onClose: () => void;
}) => (
    <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
        <Modal className="sm:max-w-lg">
            <Dialog aria-label={label}>
                <div className="flex w-full flex-col gap-5 p-5 sm:p-6">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-lg font-semibold text-primary">{title}</h2>
                        {description && <p className="text-sm text-tertiary">{description}</p>}
                    </div>
                    {children}
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{actions}</div>
                </div>
            </Dialog>
        </Modal>
    </ModalOverlay>
);

/** The permissions an admin has that this role alone does not grant, by group. */
const AdminDifference = ({ role, verb }: { role: Role; verb: "gains" | "loses" }) => {
    const groups = PERMISSION_GROUPS.map((g) => ({
        group: g.group,
        labels: g.items.filter((p) => !ROLE_GRANTS[role].includes(p.id)).map((p) => p.label),
    })).filter((g) => g.labels.length > 0);
    return (
        <dl className="flex flex-col gap-2 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
            {groups.map((g) => (
                <div key={g.group} className="flex items-start gap-2.5 text-sm">
                    {verb === "gains" ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                    ) : (
                        <SlashCircle01 className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                        <dt className="inline font-medium text-secondary">{g.group}: </dt>
                        <dd className="inline text-tertiary">{g.labels.join(", ").toLowerCase()}</dd>
                    </div>
                </div>
            ))}
        </dl>
    );
};

// ------------------------------------------------------------------------------------ invite flow

const FLOW_STEPS: { id: Exclude<InviteStep, "created">; label: string }[] = [
    { id: "who", label: "Who" },
    { id: "what", label: "What they can do" },
    { id: "review", label: "Review" },
];

interface InviteFlowProps {
    viewer: User;
    members: Member[];
    pending: Invite[];
    initialDraft: InviteDraft;
    initialStep?: InviteStep;
    /** The invite to show in the success state when the flow opens on it (stories). */
    initialCreated?: Invite;
    onCreate: (draft: InviteDraft) => Invite;
    onClose: () => void;
}

const InviteFlow = ({ viewer, members, pending, initialDraft, initialStep = "who", initialCreated, onCreate, onClose }: InviteFlowProps) => {
    const [draft, setDraft] = useState<InviteDraft>(initialDraft);
    const [step, setStep] = useState<InviteStep>(initialCreated ? "created" : initialStep === "created" ? "who" : initialStep);
    const [created, setCreated] = useState<Invite | undefined>(initialCreated);
    const [tried, setTried] = useState(false);
    const origin = useOrigin();
    const { copied, copy } = useClipboard();

    const patch = (values: Partial<InviteDraft>) => setDraft((d) => ({ ...d, ...values }));
    const viewerIsAdmin = isAdmin(viewer);

    // Step 1 checks. The member and duplicate checks do not wait for "Continue": they are facts, not typos.
    const emailValid = isEmail(draft.email);
    const existingMember = draft.mode === "email" && emailValid ? members.find((m) => sameEmail(m.email, draft.email)) : undefined;
    const duplicate = draft.mode === "email" && emailValid ? pending.find((i) => sameEmail(i.email, draft.email)) : undefined;
    const whoOk = draft.mode === "link" || (emailValid && !existingMember && !duplicate);

    const admin = draft.access === "admin";
    const whatOk = admin || draft.locations.length > 0;

    const stepIndex = FLOW_STEPS.findIndex((s) => s.id === step);
    const expiresOn = addDays(TODAY, INVITE_TTL_DAYS[draft.mode]);

    const next = () => {
        if (step === "who") {
            setTried(true);
            if (!whoOk) return;
            setTried(false);
            setStep("what");
        } else if (step === "what") {
            setTried(true);
            if (!whatOk) return;
            setTried(false);
            setStep("review");
        } else if (step === "review") {
            setCreated(onCreate(draft));
            setStep("created");
        }
    };

    const back = () => {
        setTried(false);
        setStep(step === "review" ? "what" : "who");
    };

    const restart = () => {
        setDraft({ ...emptyDraft(draft.locations[0] ?? "lynnfield"), mode: draft.mode });
        setCreated(undefined);
        setTried(false);
        setStep("who");
    };

    return (
        <ModalOverlay
            isOpen
            isDismissable={step === "who" || step === "created"}
            onOpenChange={(open) => !open && onClose()}
            className="max-sm:px-0 max-sm:[--modal-pb:0px] max-sm:[--modal-pt:0px]"
        >
            <Modal className="max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none sm:max-w-xl">
                <Dialog aria-label="Invite someone" className="max-sm:h-full sm:rounded-2xl">
                    <div className="flex min-h-full w-full flex-col">
                        <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-secondary bg-primary px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 sm:px-6 sm:pt-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                    <h2 className="text-lg font-semibold text-primary">{step === "created" ? "Invite created" : "Invite someone"}</h2>
                                    <p className="text-sm text-tertiary">
                                        {step === "created"
                                            ? "The link is ready to hand over."
                                            : `Step ${stepIndex + 1} of ${FLOW_STEPS.length}: ${FLOW_STEPS[stepIndex]?.label ?? ""}`}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    aria-label="Close"
                                    onClick={onClose}
                                    className="-mt-1.5 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2"
                                >
                                    <XClose className="size-5" aria-hidden="true" />
                                </button>
                            </div>
                            {step !== "created" && (
                                <ol aria-hidden="true" className="flex gap-1.5">
                                    {FLOW_STEPS.map((s, i) => (
                                        <li key={s.id} className={cx("h-1 flex-1 rounded-full", i <= stepIndex ? "bg-fg-brand-primary" : "bg-quaternary")} />
                                    ))}
                                </ol>
                            )}
                        </header>

                        <div className="flex flex-1 flex-col gap-6 px-5 py-5 sm:px-6">
                            {step === "who" && (
                                <>
                                    <AriaRadioGroup
                                        aria-label="How to invite"
                                        value={draft.mode}
                                        onChange={(value) => patch(value === "link" ? { mode: "link", access: "user" } : { mode: "email" })}
                                        className="flex flex-col gap-2.5"
                                    >
                                        <RadioCard
                                            value="email"
                                            icon={Mail01}
                                            title="Send to an email"
                                            description={`Only that Google account can accept it, so it is safe if the link is forwarded. Lasts ${INVITE_TTL_DAYS.email} days.`}
                                        />
                                        <RadioCard
                                            value="link"
                                            icon={Link01}
                                            title="Create a link to share"
                                            description={`Quick when you do not know their email, but anyone holding the link can use it. Lasts ${INVITE_TTL_DAYS.link * 24} hours.`}
                                        />
                                    </AriaRadioGroup>

                                    {draft.mode === "email" && (
                                        <Input
                                            label="Their email"
                                            type="email"
                                            placeholder="name@example.com"
                                            value={draft.email}
                                            onChange={(email) => patch({ email })}
                                            isRequired
                                            autoFocus
                                            isInvalid={(tried && !emailValid) || Boolean(existingMember)}
                                            hint={
                                                tried && !emailValid
                                                    ? "Enter a full email address, like name@example.com."
                                                    : "Must be the Google account they will sign in with."
                                            }
                                        />
                                    )}

                                    {existingMember && (
                                        <Callout tone="error">
                                            <p>
                                                <span className="font-semibold">{existingMember.name} already has an account with this email.</span>{" "}
                                                {existingMember.status === "removed"
                                                    ? "Their access was removed. Restore it from the Members tab instead of inviting them again."
                                                    : "Change their role, access or locations from the Members tab."}
                                            </p>
                                        </Callout>
                                    )}

                                    {duplicate && !existingMember && (
                                        <Callout tone="warning">
                                            <div className="flex flex-col gap-2">
                                                <p>
                                                    <span className="font-semibold">There is already a pending invite for this email.</span> It{" "}
                                                    {inviteExpiryLabel(duplicate).toLowerCase()}. Send them the same link instead of creating a second one.
                                                </p>
                                                <Button
                                                    color="secondary"
                                                    size="sm"
                                                    className="min-h-11 self-start lg:min-h-9"
                                                    iconLeading={copied ? Check : Copy01}
                                                    onClick={() => copy(inviteUrl(duplicate.token, origin))}
                                                >
                                                    {copied ? "Copied" : "Copy the existing link"}
                                                </Button>
                                            </div>
                                        </Callout>
                                    )}

                                    <Input
                                        label="Their first name (optional)"
                                        placeholder="Devon"
                                        value={draft.name}
                                        onChange={(name) => patch({ name })}
                                        hint="Used as the greeting on their sign-up screen."
                                    />

                                    <Callout>Nothing is emailed from the prototype. You get a link at the end to send yourself, by text or in person.</Callout>
                                </>
                            )}

                            {step === "what" && (
                                <>
                                    <div>
                                        <FieldLegend hint="The job they do. It decides what a user can do.">Role</FieldLegend>
                                        <AriaRadioGroup
                                            aria-label="Role"
                                            value={draft.role}
                                            onChange={(value) => patch({ role: value as InvitableRole })}
                                            className="flex flex-col gap-2.5"
                                        >
                                            {INVITABLE_ROLES.map((role) => (
                                                <RadioCard key={role} value={role} title={ROLE_LABEL[role]} description={ROLE_DESCRIPTION[role]} />
                                            ))}
                                        </AriaRadioGroup>
                                    </div>

                                    <div>
                                        <FieldLegend hint="How far their permissions reach.">Access level</FieldLegend>
                                        <AriaRadioGroup
                                            aria-label="Access level"
                                            value={draft.access}
                                            onChange={(value) => patch({ access: value as AccessLevel })}
                                            className="grid gap-2.5 sm:grid-cols-2"
                                        >
                                            <RadioCard value="user" title={ACCESS_LABEL.user} description={ACCESS_DESCRIPTION.user} />
                                            <RadioCard
                                                value="admin"
                                                icon={ShieldTick}
                                                title={ACCESS_LABEL.admin}
                                                description={ACCESS_DESCRIPTION.admin}
                                                isDisabled={!viewerIsAdmin || draft.mode === "link"}
                                            />
                                        </AriaRadioGroup>
                                        <div className="mt-2.5 flex flex-col gap-2">
                                            {!viewerIsAdmin && <p className="text-sm text-tertiary">Only an admin can invite another admin.</p>}
                                            {viewerIsAdmin && draft.mode === "link" && (
                                                <p className="text-sm text-tertiary">
                                                    Admin invites must go to a named email. An open link could be used by whoever finds it.
                                                </p>
                                            )}
                                            {admin && (
                                                <Callout tone="warning">
                                                    An admin can invite and remove people, change settings and see costs at every location. Give it to the
                                                    people who run the business, not as a shortcut around a missing permission.
                                                </Callout>
                                            )}
                                        </div>
                                    </div>

                                    <fieldset className="flex flex-col">
                                        <legend className="contents">
                                            <FieldLegend hint={admin ? "Admins get every location automatically." : "Where they can see and count stock."}>
                                                Locations
                                            </FieldLegend>
                                        </legend>
                                        <div className="flex flex-col gap-1">
                                            {locations.map((l) => (
                                                <Checkbox
                                                    key={l.id}
                                                    size="md"
                                                    className="min-h-11 items-center lg:min-h-9"
                                                    label={l.name}
                                                    isDisabled={admin}
                                                    isSelected={admin || draft.locations.includes(l.id)}
                                                    onChange={(on) =>
                                                        patch({ locations: on ? [...draft.locations, l.id] : draft.locations.filter((id) => id !== l.id) })
                                                    }
                                                />
                                            ))}
                                        </div>
                                        {tried && !whatOk && (
                                            <p role="alert" className="mt-1 text-sm text-error-primary">
                                                Choose at least one location.
                                            </p>
                                        )}
                                    </fieldset>

                                    <PermissionSummary access={draft.access} role={draft.role} locations={draft.locations} />

                                    <TextArea
                                        label="Note to them (optional)"
                                        rows={2}
                                        placeholder="Starts Monday."
                                        value={draft.note}
                                        onChange={(note) => patch({ note })}
                                        hint="Shown on their sign-up screen."
                                    />
                                </>
                            )}

                            {step === "review" && (
                                <>
                                    <dl className="divide-y divide-border-secondary rounded-xl ring-1 ring-secondary ring-inset">
                                        {[
                                            {
                                                term: "For",
                                                value: (
                                                    <span className="flex flex-col">
                                                        <span className="font-medium break-all text-primary">
                                                            {draft.mode === "email" ? draft.email.trim().toLowerCase() : "Anyone with this link"}
                                                        </span>
                                                        {draft.name.trim() && <span className="text-tertiary">{draft.name.trim()}</span>}
                                                    </span>
                                                ),
                                            },
                                            { term: "Role", value: <RoleBadge role={draft.role} /> },
                                            { term: "Access", value: <AccessBadge access={draft.access} /> },
                                            {
                                                term: "Locations",
                                                value: admin ? "Every location" : locationScope(ALL_LOCATIONS.filter((id) => draft.locations.includes(id))),
                                            },
                                            {
                                                term: "Link expires",
                                                value: `${formatDate(expiresOn)}, ${draft.mode === "email" ? `${INVITE_TTL_DAYS.email} days from now` : `${INVITE_TTL_DAYS.link * 24} hours from now`}`,
                                            },
                                            ...(draft.note.trim() ? [{ term: "Note", value: draft.note.trim() }] : []),
                                        ].map((row) => (
                                            <div key={row.term} className="flex items-start gap-4 px-4 py-3 text-sm">
                                                <dt className="w-24 shrink-0 text-tertiary">{row.term}</dt>
                                                <dd className="min-w-0 flex-1 text-secondary">{row.value}</dd>
                                            </div>
                                        ))}
                                    </dl>

                                    <PermissionSummary access={draft.access} role={draft.role} locations={draft.locations} />

                                    <Callout>
                                        {draft.mode === "email"
                                            ? "Nothing is emailed from the prototype. Creating the invite gives you a link to send to them yourself."
                                            : "Creating the invite gives you a link and a QR code. Send the link straight to the person."}
                                    </Callout>
                                </>
                            )}

                            {step === "created" && created && (
                                <>
                                    <div className="flex items-start gap-3">
                                        <CheckCircle className="size-6 shrink-0 text-fg-success-primary" aria-hidden="true" />
                                        <p className="text-sm text-secondary">
                                            {created.email ? (
                                                <>
                                                    <span className="font-semibold text-primary">Nothing is emailed from the prototype.</span> Copy the link and
                                                    send it to {created.email} yourself. It is now in the Invites tab as pending.
                                                </>
                                            ) : (
                                                <>
                                                    <span className="font-semibold text-primary">Copy the link or show the code.</span> It works once, for
                                                    whoever opens it first, and is now in the Invites tab as pending.
                                                </>
                                            )}
                                        </p>
                                    </div>
                                    <InviteLinkCard invite={created} />
                                </>
                            )}
                        </div>

                        <footer className="sticky bottom-0 z-10 flex flex-col-reverse gap-3 border-t border-secondary bg-primary px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:px-6">
                            {step === "created" ? (
                                <>
                                    <Button color="secondary" size="lg" className="min-h-11" iconLeading={UserPlus01} onClick={restart}>
                                        Invite someone else
                                    </Button>
                                    <Button color="primary" size="lg" className="min-h-11" onClick={onClose}>
                                        Done
                                    </Button>
                                </>
                            ) : (
                                <>
                                    {step === "who" ? (
                                        <Button color="secondary" size="lg" className="min-h-11" onClick={onClose}>
                                            Cancel
                                        </Button>
                                    ) : (
                                        <Button color="secondary" size="lg" className="min-h-11" iconLeading={ArrowLeft} onClick={back}>
                                            Back
                                        </Button>
                                    )}
                                    <Button color="primary" size="lg" className="min-h-11" onClick={next}>
                                        {step === "review" ? "Create invite" : "Continue"}
                                    </Button>
                                </>
                            )}
                        </footer>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};

// ------------------------------------------------------------------------------------ member dialogs

const RoleDialog = ({ member, onClose, onSave }: { member: Member; onClose: () => void; onSave: (role: InvitableRole) => void }) => {
    const [role, setRole] = useState<InvitableRole>(member.role === "owner" ? "manager" : member.role);
    if (member.role === "owner") {
        return (
            <SmallDialog
                label="Change role"
                title="The owner role stays as it is"
                description={`${member.name} is the owner. The owner role is not changed from this screen, and owners are always admins.`}
                onClose={onClose}
                actions={
                    <Button color="secondary" size="lg" className="min-h-11" onClick={onClose}>
                        Close
                    </Button>
                }
            />
        );
    }
    return (
        <SmallDialog
            label="Change role"
            title={`Change ${member.name}'s role`}
            description="The change applies the next time they open the app, and is recorded in Activity."
            onClose={onClose}
            actions={
                <>
                    <Button color="secondary" size="lg" className="min-h-11" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button color="primary" size="lg" className="min-h-11" isDisabled={role === member.role} onClick={() => onSave(role)}>
                        Save role
                    </Button>
                </>
            }
        >
            <AriaRadioGroup aria-label="Role" value={role} onChange={(value) => setRole(value as InvitableRole)} className="flex flex-col gap-2.5">
                {INVITABLE_ROLES.map((r) => (
                    <RadioCard key={r} value={r} title={ROLE_LABEL[r]} description={ROLE_DESCRIPTION[r]} />
                ))}
            </AriaRadioGroup>
            {isAdmin(member) ? (
                <Callout>{firstName(member.name)} is an admin, so the role only describes the job they do. Their permissions do not change.</Callout>
            ) : (
                <PermissionSummary
                    access="user"
                    role={role}
                    locations={member.locations}
                    title={`As a ${ROLE_LABEL[role].toLowerCase()} they will be able to`}
                    expandable={false}
                />
            )}
        </SmallDialog>
    );
};

const AccessDialog = ({ member, blocker, onClose, onConfirm }: { member: Member; blocker?: string; onClose: () => void; onConfirm: () => void }) => {
    const toAdmin = !isAdmin(member);
    if (blocker) {
        return (
            <SmallDialog
                label="Change access"
                title={`${member.name} stays an admin`}
                description={blocker}
                onClose={onClose}
                actions={
                    <Button color="secondary" size="lg" className="min-h-11" onClick={onClose}>
                        Close
                    </Button>
                }
            />
        );
    }
    return (
        <SmallDialog
            label="Change access"
            title={toAdmin ? `Make ${member.name} an admin?` : `Change ${member.name} to a user?`}
            description={
                toAdmin
                    ? `Today ${firstName(member.name)} can do what a ${ROLE_LABEL[member.role].toLowerCase()} can, at ${locationScope(member.locations)}. As an admin they can do everything, at every location.`
                    : `${firstName(member.name)} goes back to what a ${ROLE_LABEL[member.role].toLowerCase()} can do, at ${locationScope(member.locations)} only.`
            }
            onClose={onClose}
            actions={
                <>
                    <Button color="secondary" size="lg" className="min-h-11" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button color="primary" size="lg" className="min-h-11" iconLeading={toAdmin ? ShieldTick : undefined} onClick={onConfirm}>
                        {toAdmin ? "Make admin" : "Make user"}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-primary">{toAdmin ? "What they gain" : "What they lose"}</h3>
                <AdminDifference role={member.role} verb={toAdmin ? "gains" : "loses"} />
            </div>
            <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold text-primary">What stays the same</h3>
                <p className="text-sm text-tertiary">
                    Their role stays {ROLE_LABEL[member.role]}. Separation of duties still applies{toAdmin ? " to admins" : ""}: nobody approves or receives
                    their own order, approves their own count, or closes a flag about themselves.
                </p>
            </div>
            <Callout>The change applies the next time they open the app, and is recorded in Activity.</Callout>
        </SmallDialog>
    );
};

const LocationsDialog = ({ member, onClose, onSave }: { member: Member; onClose: () => void; onSave: (ids: LocationId[]) => void }) => {
    const [scope, setScope] = useState<LocationId[]>(member.locations);
    return (
        <SmallDialog
            label="Change locations"
            title={`Change ${member.name}'s locations`}
            description={
                isAdmin(member)
                    ? "As an admin they can already see and act at every location. These are the locations they work at day to day."
                    : "They can only see and count stock at the locations ticked here."
            }
            onClose={onClose}
            actions={
                <>
                    <Button color="secondary" size="lg" className="min-h-11" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        color="primary"
                        size="lg"
                        className="min-h-11"
                        isDisabled={scope.length === 0}
                        onClick={() => onSave(ALL_LOCATIONS.filter((id) => scope.includes(id)))}
                    >
                        Save locations
                    </Button>
                </>
            }
        >
            <fieldset className="flex flex-col gap-1">
                <legend className="sr-only">Locations</legend>
                {locations.map((l) => (
                    <Checkbox
                        key={l.id}
                        size="md"
                        className="min-h-11 items-center lg:min-h-9"
                        label={l.name}
                        isSelected={scope.includes(l.id)}
                        onChange={(on) => setScope((current) => (on ? [...current, l.id] : current.filter((id) => id !== l.id)))}
                    />
                ))}
                {scope.length === 0 && (
                    <p role="alert" className="text-sm text-error-primary">
                        Choose at least one location.
                    </p>
                )}
            </fieldset>
        </SmallDialog>
    );
};

// ------------------------------------------------------------------------------------ screen

type DialogState = { kind: "role" | "access" | "locations" | "remove"; member: Member } | { kind: "revoke" | "qr"; invite: Invite };

interface FlowState {
    draft: InviteDraft;
    step?: InviteStep;
    created?: Invite;
}

export interface SettingsTeamScreenProps {
    location?: LocationId;
    /** Who is looking. Admins manage the team; everyone else gets a read-only list of their own teammates. */
    user?: User;
    initialTab?: TeamTab;
    /** Open the invite flow on first render (used by stories). */
    inviteOpen?: boolean;
    /** With `inviteOpen`, the step to open on. `created` shows the success state for a sample invite. */
    inviteStep?: InviteStep;
    /** Open the "Make admin / Make user" confirmation for this member id on first render (used by stories). */
    confirmAccessFor?: string;
}

/** Team: who has access, the invites that are out, and what each access level and role can do. */
export const SettingsTeamScreen = ({
    location: initialLocation = "lynnfield",
    user: viewer = CURRENT_USER,
    initialTab = "members",
    inviteOpen = false,
    inviteStep = "who",
    confirmAccessFor,
}: SettingsTeamScreenProps) => {
    const canManage = can(viewer, "team.manage");

    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [members, setMembers] = useState<Member[]>(users.map((u) => ({ ...u, status: "active" })));
    // Stories only: an invite that already exists when the screen opens on the success state.
    const [seeded] = useState<Invite | undefined>(() =>
        canManage && inviteOpen && inviteStep === "created" ? buildInvite(STORY_DRAFT, viewer.id, 1) : undefined,
    );
    const [inviteList, setInviteList] = useState<Invite[]>(seeded ? [seeded, ...seedInvites] : seedInvites);
    const [tab, setTab] = useState<TeamTab>(!canManage && initialTab === "invites" ? "members" : initialTab);
    useUrlSync({ tab: tab === "members" ? undefined : tab });
    const [flow, setFlow] = useState<FlowState | undefined>(
        canManage && inviteOpen ? { draft: seeded ? STORY_DRAFT : emptyDraft(initialLocation), step: inviteStep, created: seeded } : undefined,
    );
    const [dialog, setDialog] = useState<DialogState | undefined>(() => {
        const target = canManage && confirmAccessFor ? users.find((u) => u.id === confirmAccessFor) : undefined;
        return target ? { kind: "access", member: { ...target, status: "active" } } : undefined;
    });
    const [notice, setNotice] = useState<string>();
    const [copiedId, setCopiedId] = useState<string>();
    const origin = useOrigin();
    const { copied, copy } = useClipboard();

    const update = (id: string, patch: Partial<Member>) => setMembers((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    const close = () => setDialog(undefined);

    const activeAdmins = members.filter((m) => m.status === "active" && isAdmin(m));
    const adminNames = activeAdmins.map((m) => m.name);

    /** Why this member cannot be changed from admin to user, if they cannot. */
    const demoteBlocker = (member: Member) => {
        if (!isAdmin(member)) return undefined;
        if (member.role === "owner") return "Owners are always admins. This keeps at least one person able to manage the team and settings.";
        if (member.id === viewer.id)
            return "You cannot remove your own admin access. Ask another admin to change it, so nobody locks themselves out by mistake.";
        if (activeAdmins.length <= 1) return "There must always be at least one admin. Make someone else an admin first.";
        return undefined;
    };

    /** Why this member's access cannot be removed, if it cannot. */
    const removeBlocker = (member: Member) => {
        if (member.id === viewer.id) return "You cannot remove your own access. Ask another admin to do it.";
        if (member.role === "owner") return "The owner's access cannot be removed from this screen.";
        if (isAdmin(member) && activeAdmins.length <= 1) return "There must always be at least one admin. Make someone else an admin first.";
        return undefined;
    };

    const visibleMembers = canManage ? members : members.filter((m) => m.status === "active" && m.locations.some((id) => viewer.locations.includes(id)));
    const withPin = members.filter((m) => m.hasPin).length;

    const pending = inviteList.filter((i) => inviteStatus(i) === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const past = inviteList.filter((i) => inviteStatus(i) !== "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const openFlow = (draft?: Partial<InviteDraft>) => setFlow({ draft: { ...emptyDraft(location), ...draft } });

    const createInvite = (draft: InviteDraft) => {
        const invite = buildInvite(draft, viewer.id, inviteList.length + 1);
        setInviteList((list) => [invite, ...list]);
        setTab("invites");
        return invite;
    };

    const copyLink = (invite: Invite) => {
        setCopiedId(invite.id);
        void copy(inviteUrl(invite.token, origin));
    };

    const inviteAgain = (invite: Invite) =>
        openFlow({
            mode: invite.email ? "email" : "link",
            email: invite.email ?? "",
            name: invite.name ?? "",
            role: invite.role === "owner" ? "manager" : invite.role,
            access: invite.email ? invite.access : "user",
            locations: invite.locations,
            note: invite.note ?? "",
        });

    const memberMenu = (member: Member) => (
        <Dropdown.Root>
            <Dropdown.DotsButton className="flex size-11 items-center justify-center lg:size-9" />
            <Dropdown.Popover className="w-56">
                {member.status === "removed" ? (
                    <Dropdown.Menu aria-label={`Actions for ${member.name}`}>
                        <Dropdown.Item
                            icon={UserCheck01}
                            onAction={() => {
                                update(member.id, { status: "active" });
                                setNotice(`${member.name} can sign in again, with the same role and locations as before.`);
                            }}
                        >
                            Restore access
                        </Dropdown.Item>
                    </Dropdown.Menu>
                ) : (
                    <Dropdown.Menu aria-label={`Actions for ${member.name}`}>
                        <Dropdown.Item icon={UserEdit} onAction={() => setDialog({ kind: "role", member })}>
                            Change role
                        </Dropdown.Item>
                        <Dropdown.Item icon={isAdmin(member) ? ShieldOff : ShieldTick} onAction={() => setDialog({ kind: "access", member })}>
                            {isAdmin(member) ? "Make user" : "Make admin"}
                        </Dropdown.Item>
                        <Dropdown.Item icon={MarkerPin01} onAction={() => setDialog({ kind: "locations", member })}>
                            Change locations
                        </Dropdown.Item>
                        <Dropdown.Item
                            icon={Key01}
                            isDisabled={!member.hasPin}
                            onAction={() => {
                                update(member.id, { hasPin: false });
                                setNotice(
                                    `${member.name}'s PIN was cleared. They choose a new one the next time they sign in with Google. The reset is recorded in Activity.`,
                                );
                            }}
                        >
                            Reset PIN
                        </Dropdown.Item>
                        <Dropdown.Separator />
                        <Dropdown.Item icon={UserX01} onAction={() => setDialog({ kind: "remove", member })}>
                            Remove access
                        </Dropdown.Item>
                    </Dropdown.Menu>
                )}
            </Dropdown.Popover>
        </Dropdown.Root>
    );

    const inviteMenu = (invite: Invite) => (
        <Dropdown.Root>
            <Dropdown.DotsButton className="flex size-11 items-center justify-center lg:size-9" />
            <Dropdown.Popover className="w-56">
                <Dropdown.Menu aria-label={`Actions for the invite for ${inviteAudience(invite)}`}>
                    <Dropdown.Item icon={QrCode02} onAction={() => setDialog({ kind: "qr", invite })}>
                        Show QR
                    </Dropdown.Item>
                    {invite.email && (
                        <Dropdown.Item
                            icon={Send01}
                            onAction={() =>
                                setNotice(`Resend recorded for ${invite.email}. Nothing is emailed from the prototype: copy the link and send it yourself.`)
                            }
                        >
                            Resend email
                        </Dropdown.Item>
                    )}
                    <Dropdown.Separator />
                    <Dropdown.Item icon={SlashCircle01} onAction={() => setDialog({ kind: "revoke", invite })}>
                        Revoke
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown.Root>
    );

    const copyButton = (invite: Invite, className?: string) => {
        const done = Boolean(copied) && copiedId === invite.id;
        return (
            <Button
                color="secondary"
                size="sm"
                className={cx("min-h-11 lg:min-h-9", className)}
                iconLeading={done ? Check : Copy01}
                onClick={() => copyLink(invite)}
            >
                {done ? "Copied" : "Copy link"}
            </Button>
        );
    };

    const invitedBy = (invite: Invite) => userById(invite.invitedBy)?.name ?? "Someone no longer on the team";

    /** What happened to an invite that is no longer pending. */
    const outcome = (invite: Invite) => {
        const status = inviteStatus(invite);
        if (status === "accepted") {
            const who = userById(invite.acceptedBy)?.name;
            return `Accepted ${invite.acceptedAt ? formatDate(invite.acceptedAt) : ""}${who ? ` by ${who}` : ""}`.trim();
        }
        if (status === "revoked") return `Revoked ${invite.revokedAt ? formatDate(invite.revokedAt) : ""}`.trim();
        return `Expired ${formatDate(invite.expiresAt)}`;
    };

    return (
        <AppShell activeUrl={ROUTES.team} location={location} onLocationChange={setLocation} user={viewer}>
            <PageContent>
                <PageHeader
                    eyebrow={
                        <a href={ROUTES.settings} className="rounded-xs outline-focus-ring hover:underline focus-visible:outline-2">
                            Settings
                        </a>
                    }
                    title="Team"
                    description={canManage ? "Who can use the app, what they can do and where." : "The people you work with, and what each role can do."}
                    actions={
                        canManage ? (
                            <Button color="primary" size="md" iconLeading={UserPlus01} className="max-lg:min-h-11 max-lg:w-full" onClick={() => openFlow()}>
                                Invite someone
                            </Button>
                        ) : undefined
                    }
                />

                {!canManage && (
                    <Callout>
                        <span className="font-semibold">Only admins can manage the team.</span> To invite someone or change what a person can do, ask{" "}
                        {adminNames.length > 0 ? adminNames.join(" or ") : "an admin"}.
                    </Callout>
                )}

                {notice && (
                    <p role="status" className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-secondary ring-1 ring-brand_alt ring-inset">
                        {notice}
                    </p>
                )}

                <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as TeamTab)} className="gap-5 lg:gap-6">
                    <div className="-mx-4 scrollbar-hide overflow-x-auto px-4 md:-mx-8 md:px-8 lg:mx-0 lg:px-0">
                        <TabList aria-label="Team sections" type="underline" size="sm" className="min-w-max lg:min-w-0">
                            <Tab id="members" className="min-h-11 lg:min-h-0">
                                Members
                            </Tab>
                            {canManage && (
                                <Tab id="invites" className="min-h-11 lg:min-h-0">
                                    Invites
                                    {pending.length > 0 && (
                                        <Badge type="pill-color" color="gray" size="sm" className="-my-px">
                                            {pending.length}
                                        </Badge>
                                    )}
                                </Tab>
                            )}
                            <Tab id="permissions" className="min-h-11 lg:min-h-0">
                                Roles and permissions
                            </Tab>
                        </TabList>
                    </div>

                    {/* ------------------------------------------------------------ Members */}
                    <TabPanel id="members" className="flex flex-col gap-6">
                        <Card padded={false} className="overflow-hidden">
                            <div className="p-4 lg:p-5">
                                <CardHeader
                                    title={canManage ? "Members" : "Your teammates"}
                                    description={
                                        canManage
                                            ? `${members.length} people, ${activeAdmins.length} ${activeAdmins.length === 1 ? "admin" : "admins"}. ${withPin} have a PIN set, ${members.length - withPin} still need one.`
                                            : `${visibleMembers.length} people at ${locationScope(viewer.locations)}.`
                                    }
                                />
                            </div>

                            {/* Desktop: table */}
                            <table className="hidden w-full border-collapse lg:table">
                                <thead className="border-y border-secondary bg-secondary">
                                    <tr className="text-left text-xs font-semibold text-tertiary">
                                        <th scope="col" className="px-5 py-2.5">
                                            Name
                                        </th>
                                        <th scope="col" className="px-4 py-2.5">
                                            Role
                                        </th>
                                        <th scope="col" className="px-4 py-2.5">
                                            Access
                                        </th>
                                        <th scope="col" className="px-4 py-2.5">
                                            Locations
                                        </th>
                                        {canManage && (
                                            <>
                                                <th scope="col" className="px-4 py-2.5">
                                                    PIN
                                                </th>
                                                <th scope="col" className="px-4 py-2.5">
                                                    Last active
                                                </th>
                                                <th scope="col" className="px-4 py-2.5">
                                                    <span className="sr-only">Actions</span>
                                                </th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-secondary">
                                    {visibleMembers.map((m) => (
                                        <tr key={m.id} className={cx(m.status === "removed" && "opacity-60")}>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-3">
                                                    <Avatar size="md" initials={initials(m.name)} />
                                                    <div className="min-w-0">
                                                        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                                                            {m.name}
                                                            <NameNotes member={m} isViewer={m.id === viewer.id} />
                                                        </p>
                                                        {canManage && <p className="truncate text-sm text-tertiary">{m.email}</p>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <RoleBadge role={m.role} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <AccessBadge access={isAdmin(m) ? "admin" : "user"} />
                                            </td>
                                            <td className="px-4 py-3 text-sm text-secondary">{isAdmin(m) ? "Every location" : locationScope(m.locations)}</td>
                                            {canManage && (
                                                <>
                                                    <td className="px-4 py-3">
                                                        <PinStatus member={m} />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm whitespace-nowrap text-tertiary">{lastActive(m)}</td>
                                                    <td className="px-4 py-3 text-right">{memberMenu(m)}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Mobile: one card row per person */}
                            <ul className="divide-y divide-border-secondary border-t border-secondary lg:hidden">
                                {visibleMembers.map((m) => (
                                    <li
                                        key={m.id}
                                        className={cx("flex items-start gap-3 py-3 pr-1 pl-4", !canManage && "pr-4", m.status === "removed" && "opacity-60")}
                                    >
                                        <Avatar size="md" initials={initials(m.name)} className="mt-0.5" />
                                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                            <div className="min-w-0">
                                                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary">
                                                    {m.name}
                                                    <NameNotes member={m} isViewer={m.id === viewer.id} />
                                                </p>
                                                {canManage && <p className="truncate text-sm text-tertiary">{m.email}</p>}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <RoleBadge role={m.role} />
                                                <AccessBadge access={isAdmin(m) ? "admin" : "user"} />
                                                {canManage && <PinStatus member={m} />}
                                            </div>
                                            <p className="text-xs text-tertiary">
                                                {isAdmin(m) ? "Every location" : locationScope(m.locations)}
                                                {canManage && ` · ${lastActive(m)}`}
                                            </p>
                                        </div>
                                        {canManage && memberMenu(m)}
                                    </li>
                                ))}
                            </ul>
                        </Card>

                        <SampleDataNote>These are fictional staff. Real names are added when an admin invites people.</SampleDataNote>
                    </TabPanel>

                    {/* ------------------------------------------------------------ Invites */}
                    {canManage && (
                        <TabPanel id="invites" className="flex flex-col gap-6">
                            <Card padded={false} className="overflow-hidden">
                                <div className="p-4 lg:p-5">
                                    <CardHeader
                                        title="Pending"
                                        description={`${pending.length} waiting to be accepted. Email links last ${INVITE_TTL_DAYS.email} days, open links ${INVITE_TTL_DAYS.link * 24} hours. Each works once.`}
                                    />
                                </div>

                                {pending.length === 0 ? (
                                    <div className="flex flex-col items-start gap-3 border-t border-secondary p-4 lg:p-5">
                                        <p className="text-sm text-tertiary">
                                            No invites are waiting. Everyone who was invited has joined, or their link has ended.
                                        </p>
                                        <Button
                                            color="secondary"
                                            size="md"
                                            className="min-h-11 lg:min-h-10"
                                            iconLeading={UserPlus01}
                                            onClick={() => openFlow()}
                                        >
                                            Invite someone
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <table className="hidden w-full border-collapse lg:table">
                                            <thead className="border-y border-secondary bg-secondary">
                                                <tr className="text-left text-xs font-semibold text-tertiary">
                                                    <th scope="col" className="px-5 py-2.5">
                                                        For
                                                    </th>
                                                    <th scope="col" className="px-4 py-2.5">
                                                        Role and access
                                                    </th>
                                                    <th scope="col" className="px-4 py-2.5">
                                                        Locations
                                                    </th>
                                                    <th scope="col" className="px-4 py-2.5">
                                                        Invited
                                                    </th>
                                                    <th scope="col" className="px-4 py-2.5">
                                                        Expires
                                                    </th>
                                                    <th scope="col" className="px-4 py-2.5">
                                                        <span className="sr-only">Actions</span>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-secondary">
                                                {pending.map((invite) => (
                                                    <tr key={invite.id}>
                                                        <td className="max-w-72 px-5 py-3">
                                                            <InviteWho invite={invite} />
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <RoleBadge role={invite.role} />
                                                                <AccessBadge access={invite.access} />
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-secondary">
                                                            {invite.access === "admin" ? "Every location" : locationScope(invite.locations)}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-tertiary">
                                                            <span className="block text-secondary">{invitedBy(invite)}</span>
                                                            {formatDate(invite.createdAt)}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm whitespace-nowrap text-tertiary">
                                                            <span className="block text-secondary">{inviteExpiryLabel(invite)}</span>
                                                            {formatDate(invite.expiresAt)}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {copyButton(invite)}
                                                                {inviteMenu(invite)}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        <ul className="divide-y divide-border-secondary border-t border-secondary lg:hidden">
                                            {pending.map((invite) => (
                                                <li key={invite.id} className="flex flex-col gap-3 p-4">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <InviteWho invite={invite} />
                                                        <div className="-mt-1.5 -mr-3 shrink-0">{inviteMenu(invite)}</div>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <RoleBadge role={invite.role} />
                                                        <AccessBadge access={invite.access} />
                                                        <span className="text-sm text-tertiary">
                                                            {invite.access === "admin" ? "Every location" : locationScope(invite.locations)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-tertiary">
                                                        Invited by {invitedBy(invite)} on {formatDate(invite.createdAt)} ·{" "}
                                                        <span className="font-medium text-secondary">{inviteExpiryLabel(invite)}</span>
                                                    </p>
                                                    {copyButton(invite, "w-full")}
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </Card>

                            <Card padded={false} className="overflow-hidden">
                                <div className="p-4 lg:p-5">
                                    <CardHeader title="Past" description="Accepted, expired and revoked invites. Their links no longer work." />
                                </div>
                                {past.length === 0 ? (
                                    <p className="border-t border-secondary p-4 text-sm text-tertiary lg:p-5">Nothing here yet.</p>
                                ) : (
                                    <ul className="divide-y divide-border-secondary border-t border-secondary">
                                        {past.map((invite) => {
                                            const status = inviteStatus(invite);
                                            return (
                                                <li key={invite.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:gap-4 lg:px-5 lg:py-3">
                                                    <div className="min-w-0 lg:w-72 lg:shrink-0">
                                                        <InviteWho invite={invite} />
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5 lg:w-56 lg:shrink-0">
                                                        <InviteStatusBadge status={status} />
                                                        <RoleBadge role={invite.role} />
                                                        <AccessBadge access={invite.access} />
                                                    </div>
                                                    <p className="min-w-0 flex-1 text-sm text-tertiary">
                                                        <span className="text-secondary">{outcome(invite)}.</span> Invited by {invitedBy(invite)} on{" "}
                                                        {formatDate(invite.createdAt)}.{invite.note && status === "revoked" ? ` ${invite.note}` : ""}
                                                    </p>
                                                    {status === "expired" && (
                                                        <Button
                                                            color="secondary"
                                                            size="sm"
                                                            className="min-h-11 shrink-0 max-lg:w-full lg:min-h-9"
                                                            iconLeading={Send01}
                                                            onClick={() => inviteAgain(invite)}
                                                        >
                                                            Send a new invite
                                                        </Button>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </Card>

                            <SampleDataNote>
                                These invites are samples and the addresses are fictional. Nothing is emailed from the prototype: links are copied and sent by
                                hand.
                            </SampleDataNote>
                        </TabPanel>
                    )}

                    {/* ------------------------------------------------------------ Roles and permissions */}
                    <TabPanel id="permissions" className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                        <Card padded={false} className="overflow-hidden">
                            <div className="p-4 lg:p-5">
                                <CardHeader
                                    title="What each access level and role can do"
                                    description="Roles are fixed. To change what someone can do, change their role or their access level."
                                />
                            </div>
                            <div className="px-4 pb-4 lg:p-0">
                                <PermissionMatrix highlight={canManage ? undefined : { access: viewer.access, role: viewer.role }} highlightLabel="You" />
                            </div>
                        </Card>

                        <div className="flex flex-col gap-4">
                            <Card className="flex flex-col gap-4">
                                <CardHeader title="Admin or user" description="Access level decides how far someone's permissions reach." />
                                <dl className="flex flex-col gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <dt>
                                            <AccessBadge access="admin" size="md" />
                                        </dt>
                                        <dd className="text-sm text-tertiary">
                                            {ACCESS_DESCRIPTION.admin} Owners are always admins. An admin can make anyone else an admin.
                                        </dd>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <dt>
                                            <AccessBadge access="user" size="md" />
                                        </dt>
                                        <dd className="text-sm text-tertiary">
                                            {ACCESS_DESCRIPTION.user} Most of the team are users: a manager, front desk or technician.
                                        </dd>
                                    </div>
                                </dl>
                            </Card>

                            <section className="flex flex-col gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand_alt ring-inset lg:p-5">
                                <div className="flex items-center gap-2.5">
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-fg-brand-primary ring-1 ring-secondary ring-inset">
                                        <ShieldTick className="size-5" aria-hidden="true" />
                                    </span>
                                    <h2 className="text-md font-semibold text-primary">Two people on every loop</h2>
                                </div>
                                <ul className="flex flex-col gap-2 text-sm text-secondary">
                                    {SEPARATION_RULES.map((rule) => (
                                        <li key={rule} className="flex gap-2">
                                            <Check className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />
                                            {rule}
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-sm text-tertiary">
                                    The app enforces these for everyone, admins and the owner included. It is not about trust: a second pair of eyes is how
                                    honest mistakes get caught while they are still small.
                                </p>
                            </section>

                            <Card className="flex flex-col gap-3">
                                <CardHeader title="Roles in one line" />
                                <dl className="flex flex-col gap-3">
                                    {ROLES.map((role) => (
                                        <div key={role} className="flex flex-col gap-1">
                                            <dt>
                                                <RoleBadge role={role} />
                                            </dt>
                                            <dd className="text-sm text-tertiary">{ROLE_DESCRIPTION[role]}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </Card>
                        </div>
                    </TabPanel>
                </Tabs>
            </PageContent>

            {flow && (
                <InviteFlow
                    viewer={viewer}
                    members={members}
                    pending={pending}
                    initialDraft={flow.draft}
                    initialStep={flow.step}
                    initialCreated={flow.created}
                    onCreate={createInvite}
                    onClose={() => setFlow(undefined)}
                />
            )}

            {dialog?.kind === "role" && (
                <RoleDialog
                    member={dialog.member}
                    onClose={close}
                    onSave={(role) => {
                        update(dialog.member.id, { role });
                        setNotice(`${dialog.member.name} is now ${ROLE_LABEL[role]}. The change is recorded in Activity.`);
                        close();
                    }}
                />
            )}

            {dialog?.kind === "access" && (
                <AccessDialog
                    member={dialog.member}
                    blocker={demoteBlocker(dialog.member)}
                    onClose={close}
                    onConfirm={() => {
                        const toAdmin = !isAdmin(dialog.member);
                        update(dialog.member.id, { access: toAdmin ? "admin" : "user" });
                        setNotice(
                            toAdmin
                                ? `${dialog.member.name} is now an admin, with everything at every location. The change is recorded in Activity.`
                                : `${dialog.member.name} is now a user, with what a ${ROLE_LABEL[dialog.member.role].toLowerCase()} can do at ${locationScope(dialog.member.locations)}.`,
                        );
                        close();
                    }}
                />
            )}

            {dialog?.kind === "locations" && (
                <LocationsDialog
                    member={dialog.member}
                    onClose={close}
                    onSave={(ids) => {
                        update(dialog.member.id, { locations: ids });
                        setNotice(`${dialog.member.name} now works at ${locationScope(ids)}.`);
                        close();
                    }}
                />
            )}

            {dialog?.kind === "remove" &&
                (removeBlocker(dialog.member) ? (
                    <SmallDialog
                        label="Remove access"
                        title={`${dialog.member.id === viewer.id ? "Your" : `${dialog.member.name}'s`} access stays`}
                        description={removeBlocker(dialog.member)}
                        onClose={close}
                        actions={
                            <Button color="secondary" size="lg" className="min-h-11" onClick={close}>
                                Close
                            </Button>
                        }
                    />
                ) : (
                    <SmallDialog
                        label="Remove access"
                        title={`Remove ${dialog.member.name}'s access?`}
                        description={`${firstName(dialog.member.name)} is signed out and cannot sign in again. Their name stays on past counts, orders and deliveries, and you can restore access later.`}
                        onClose={close}
                        actions={
                            <>
                                <Button color="secondary" size="lg" className="min-h-11" onClick={close}>
                                    Cancel
                                </Button>
                                <Button
                                    color="primary-destructive"
                                    size="lg"
                                    className="min-h-11"
                                    onClick={() => {
                                        update(dialog.member.id, { status: "removed" });
                                        setNotice(`${dialog.member.name} can no longer sign in. Their name stays on past counts and orders.`);
                                        close();
                                    }}
                                >
                                    Remove access
                                </Button>
                            </>
                        }
                    />
                ))}

            {dialog?.kind === "revoke" && (
                <SmallDialog
                    label="Revoke invite"
                    title="Revoke this invite?"
                    description={`The link for ${inviteAudience(dialog.invite).replace("Anyone", "anyone")} stops working straight away. If they still need access, send a new invite.`}
                    onClose={close}
                    actions={
                        <>
                            <Button color="secondary" size="lg" className="min-h-11" onClick={close}>
                                Keep it
                            </Button>
                            <Button
                                color="primary-destructive"
                                size="lg"
                                className="min-h-11"
                                onClick={() => {
                                    const id = dialog.invite.id;
                                    setInviteList((list) => list.map((i) => (i.id === id ? { ...i, status: "revoked", revokedAt: `${TODAY}T12:00:00Z` } : i)));
                                    setNotice(
                                        `The invite for ${inviteAudience(dialog.invite).replace("Anyone", "anyone")} was revoked. Its link no longer works.`,
                                    );
                                    close();
                                }}
                            >
                                Revoke invite
                            </Button>
                        </>
                    }
                />
            )}

            {dialog?.kind === "qr" && (
                <SmallDialog
                    label="Invite link and QR code"
                    title="Show this to the person"
                    description="They scan the code with their phone camera, or you copy the link and send it."
                    onClose={close}
                    actions={
                        <Button color="primary" size="lg" className="min-h-11" onClick={close}>
                            Done
                        </Button>
                    }
                >
                    <InviteLinkCard invite={dialog.invite} className="shadow-none" />
                </SmallDialog>
            )}
        </AppShell>
    );
};
