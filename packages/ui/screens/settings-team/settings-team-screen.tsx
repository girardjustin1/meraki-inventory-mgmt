"use client";

import { useState } from "react";
import { Check, Key01, Minus, ShieldTick, SlashCircle01, UserEdit, UserPlus01 } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import { RoleBadge } from "@/components/meraki/status-badges";
import { ROLE_LABEL, ROLE_PERMISSIONS, TODAY, locations, users } from "@/data/inventory";
import type { LocationId, Role, User } from "@/data/types";
import { daysBetween, formatTime, relativeDays } from "@/engine/dates";
import { cx } from "@/utils/cx";

const ROLES: Role[] = ["owner", "manager", "front-desk", "technician"];

/** One sentence per role, shown where the role is chosen so nobody needs the matrix to pick correctly. */
const ROLE_DESCRIPTION: Record<Role, string> = {
    owner: "Sees both locations, approves orders, receives the digests and manages the team.",
    manager: "Runs and approves counts, builds orders and reviews flags for their location.",
    "front-desk": "Receives deliveries, counts when assigned and requests items.",
    technician: "Logs what was used, requests items and counts assigned shelves.",
};

/** Every permission once, in the order the roles list them. */
const PERMISSIONS = [...new Set(ROLES.flatMap((role) => ROLE_PERMISSIONS[role]))];

interface Member extends User {
    status: "active" | "invited" | "deactivated";
}

const locationScope = (ids: LocationId[]) =>
    ids.length === locations.length ? "Both locations" : ids.map((id) => locations.find((l) => l.id === id)?.shortName ?? id).join(", ");

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const lastActive = (member: Member) => {
    if (member.status === "invited") return "Invitation sent";
    if (!member.lastActiveAt) return "Has not signed in yet";
    const day = member.lastActiveAt.slice(0, 10);
    return daysBetween(day, TODAY) === 0 ? `Today, ${formatTime(member.lastActiveAt)}` : capitalise(relativeDays(day, TODAY));
};

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

const StatusNote = ({ member }: { member: Member }) =>
    member.status === "invited" ? (
        <Badge type="color" color="blue" size="sm">
            Invited
        </Badge>
    ) : member.status === "deactivated" ? (
        <Badge type="color" color="gray" size="sm">
            Deactivated
        </Badge>
    ) : null;

interface MemberActions {
    onEdit: (member: Member) => void;
    onResetPin: (member: Member) => void;
    onToggleActive: (member: Member) => void;
}

const MemberMenu = ({ member, onEdit, onResetPin, onToggleActive }: { member: Member } & MemberActions) => (
    <Dropdown.Root>
        <Dropdown.DotsButton className="flex size-11 items-center justify-center lg:size-9" />
        <Dropdown.Popover className="w-56">
            <Dropdown.Menu aria-label={`Actions for ${member.name}`}>
                <Dropdown.Item icon={UserEdit} onAction={() => onEdit(member)}>
                    Change role or locations
                </Dropdown.Item>
                <Dropdown.Item icon={Key01} isDisabled={!member.hasPin} onAction={() => onResetPin(member)}>
                    Reset PIN
                </Dropdown.Item>
                <Dropdown.Separator />
                <Dropdown.Item icon={SlashCircle01} onAction={() => onToggleActive(member)}>
                    {member.status === "deactivated" ? "Reactivate" : member.status === "invited" ? "Cancel invitation" : "Deactivate"}
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown.Popover>
    </Dropdown.Root>
);

interface MemberFormProps {
    /** The member being edited, or undefined to invite someone new. */
    member?: Member;
    onClose: () => void;
    onSave: (values: { email: string; role: Role; locations: LocationId[] }) => void;
}

const MemberForm = ({ member, onClose, onSave }: MemberFormProps) => {
    const [email, setEmail] = useState(member?.email ?? "");
    const [role, setRole] = useState<Role>(member?.role ?? "front-desk");
    const [scope, setScope] = useState<LocationId[]>(member?.locations ?? ["lynnfield"]);
    const [touched, setTouched] = useState(false);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const valid = emailOk && scope.length > 0;

    return (
        <div className="flex flex-col gap-5 p-5 sm:p-6">
            <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-primary">{member ? `Edit ${member.name}` : "Invite a teammate"}</h2>
                <p className="text-sm text-tertiary">
                    {member
                        ? "Changes apply the next time they open the app."
                        : "They get an email with a link. Access is limited to the role and locations you choose here."}
                </p>
            </div>

            <Input
                label="Work email"
                type="email"
                placeholder="name@merakispainc.com"
                value={email}
                onChange={setEmail}
                onBlur={() => setTouched(true)}
                isDisabled={Boolean(member)}
                isRequired
                isInvalid={touched && !emailOk}
                hint={touched && !emailOk ? "Enter a full email address." : "Must be the Google account they will sign in with."}
            />

            <Select
                label="Role"
                items={ROLES.map((id) => ({ id, label: ROLE_LABEL[id] }))}
                value={role}
                onChange={(key) => {
                    if (key) setRole(key as Role);
                }}
                hint={ROLE_DESCRIPTION[role]}
            >
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
            </Select>

            <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-sm font-medium text-secondary">Locations</legend>
                {locations.map((l) => (
                    <Checkbox
                        key={l.id}
                        size="md"
                        className="min-h-9 items-center"
                        label={l.name}
                        isSelected={scope.includes(l.id)}
                        onChange={(on) => setScope((current) => (on ? [...current, l.id] : current.filter((id) => id !== l.id)))}
                    />
                ))}
                {scope.length === 0 && <p className="text-sm text-error-primary">Choose at least one location.</p>}
            </fieldset>

            {!member && (
                <p className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2.5 text-sm text-tertiary ring-1 ring-secondary ring-inset">
                    <ShieldTick className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />
                    <span>
                        Sign-in is with Google, through Clerk. There is no password to set or forget. On first sign-in they choose a 4-digit PIN for the shared
                        devices.
                    </span>
                </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button color="secondary" size="lg" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    color="primary"
                    size="lg"
                    isDisabled={!valid}
                    onClick={() => {
                        onSave({ email: email.trim(), role, locations: locations.map((l) => l.id).filter((id) => scope.includes(id)) });
                    }}
                >
                    {member ? "Save changes" : "Send invitation"}
                </Button>
            </div>
        </div>
    );
};

export interface SettingsTeamScreenProps {
    location?: LocationId;
    /** Open the invite dialog on first render (used by stories). */
    inviteOpen?: boolean;
}

/** Team: who has access, what each role can do, and why two people sit on every loop. */
export const SettingsTeamScreen = ({ location: initialLocation = "lynnfield", inviteOpen = false }: SettingsTeamScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [members, setMembers] = useState<Member[]>(users.map((u) => ({ ...u, status: "active" })));
    const [dialog, setDialog] = useState<{ member?: Member } | undefined>(inviteOpen ? {} : undefined);
    const [notice, setNotice] = useState<string>();

    const update = (id: string, patch: Partial<Member>) => setMembers((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));

    const actions: MemberActions = {
        onEdit: (member) => setDialog({ member }),
        onResetPin: (member) => {
            update(member.id, { hasPin: false });
            setNotice(`${member.name}'s PIN was cleared. They choose a new one the next time they sign in with Google. The reset is recorded in Activity.`);
        },
        onToggleActive: (member) => {
            if (member.status === "invited") {
                setMembers((list) => list.filter((m) => m.id !== member.id));
                setNotice(`The invitation to ${member.email} was cancelled.`);
                return;
            }
            const next = member.status === "deactivated" ? "active" : "deactivated";
            update(member.id, { status: next });
            setNotice(
                next === "deactivated"
                    ? `${member.name} can no longer sign in. Their name stays on past counts and orders.`
                    : `${member.name} can sign in again.`,
            );
        },
    };

    const save: MemberFormProps["onSave"] = (values) => {
        const editing = dialog?.member;
        if (editing) {
            update(editing.id, { role: values.role, locations: values.locations });
            setNotice(`${editing.name} is now ${ROLE_LABEL[values.role]} for ${locationScope(values.locations)}.`);
        } else {
            const name = values.email.split("@")[0] ?? values.email;
            setMembers((list) => [
                ...list,
                { id: `invite-${list.length}`, name, email: values.email, role: values.role, locations: values.locations, hasPin: false, status: "invited" },
            ]);
            setNotice(`Invitation recorded for ${values.email}. Nothing was emailed from the prototype: Clerk is not connected yet.`);
        }
        setDialog(undefined);
    };

    const withPin = members.filter((m) => m.hasPin).length;

    return (
        <AppShell activeUrl={ROUTES.team} location={location} onLocationChange={setLocation}>
            <PageContent>
                <PageHeader
                    eyebrow={
                        <a href={ROUTES.settings} className="rounded-xs outline-focus-ring hover:underline focus-visible:outline-2">
                            Settings
                        </a>
                    }
                    title="Team"
                    description="Who can use the app, what they can do and where."
                    actions={
                        <Button color="primary" size="md" iconLeading={UserPlus01} className="max-lg:min-h-11 max-lg:w-full" onClick={() => setDialog({})}>
                            Invite teammate
                        </Button>
                    }
                />

                {notice && (
                    <p role="status" className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-secondary ring-1 ring-brand_alt ring-inset">
                        {notice}
                    </p>
                )}

                <Card padded={false} className="overflow-hidden">
                    <div className="p-4 lg:p-5">
                        <CardHeader
                            title="Members"
                            description={`${members.length} people. ${withPin} have a PIN set, ${members.length - withPin} still need one.`}
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
                                    Locations
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    PIN
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    Last active
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-secondary">
                            {members.map((m) => (
                                <tr key={m.id} className={cx(m.status === "deactivated" && "opacity-60")}>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <Avatar size="md" initials={initials(m.name)} />
                                            <div className="min-w-0">
                                                <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                                                    {m.name}
                                                    <StatusNote member={m} />
                                                </p>
                                                <p className="truncate text-sm text-tertiary">{m.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <RoleBadge role={m.role} />
                                    </td>
                                    <td className="px-4 py-3 text-sm text-secondary">{locationScope(m.locations)}</td>
                                    <td className="px-4 py-3">
                                        <PinStatus member={m} />
                                    </td>
                                    <td className="px-4 py-3 text-sm whitespace-nowrap text-tertiary">{lastActive(m)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <MemberMenu member={m} {...actions} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Mobile: one card row per person */}
                    <ul className="divide-y divide-border-secondary border-t border-secondary lg:hidden">
                        {members.map((m) => (
                            <li key={m.id} className={cx("flex items-start gap-3 py-3 pr-1 pl-4", m.status === "deactivated" && "opacity-60")}>
                                <Avatar size="md" initials={initials(m.name)} className="mt-0.5" />
                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                    <div className="min-w-0">
                                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary">
                                            {m.name}
                                            <StatusNote member={m} />
                                        </p>
                                        <p className="truncate text-sm text-tertiary">{m.email}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <RoleBadge role={m.role} />
                                        <PinStatus member={m} />
                                    </div>
                                    <p className="text-xs text-tertiary">
                                        {locationScope(m.locations)} · {lastActive(m)}
                                    </p>
                                </div>
                                <MemberMenu member={m} {...actions} />
                            </li>
                        ))}
                    </ul>
                </Card>

                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <Card padded={false} className="overflow-hidden">
                        <div className="p-4 lg:p-5">
                            <CardHeader title="What each role can do" description="Roles are fixed. To change what someone can do, change their role." />
                        </div>
                        <table className="w-full border-collapse">
                            <thead className="border-y border-secondary bg-secondary">
                                <tr className="text-xs font-semibold text-tertiary">
                                    <th scope="col" className="py-2.5 pr-2 pl-4 text-left lg:pl-5">
                                        Permission
                                    </th>
                                    {ROLES.map((role) => (
                                        <th key={role} scope="col" className="w-14 px-1 py-2.5 text-center sm:w-24 lg:w-28">
                                            <span className="sm:hidden">
                                                {role === "technician" ? "Tech" : role === "front-desk" ? "Desk" : ROLE_LABEL[role]}
                                            </span>
                                            <span className="max-sm:hidden">{ROLE_LABEL[role]}</span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-secondary">
                                {PERMISSIONS.map((permission) => (
                                    <tr key={permission}>
                                        <th scope="row" className="py-3 pr-2 pl-4 text-left text-sm font-medium text-secondary lg:pl-5">
                                            {permission}
                                        </th>
                                        {ROLES.map((role) => {
                                            const allowed = ROLE_PERMISSIONS[role].includes(permission);
                                            return (
                                                <td key={role} className="px-1 py-3 text-center">
                                                    {allowed ? (
                                                        <>
                                                            <Check className="mx-auto size-5 text-fg-success-primary" aria-hidden="true" />
                                                            <span className="sr-only">Yes</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Minus className="mx-auto size-4 text-fg-quaternary" aria-hidden="true" />
                                                            <span className="sr-only">No</span>
                                                        </>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Card>

                    <div className="flex flex-col gap-4">
                        <section className="flex flex-col gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand_alt ring-inset lg:p-5">
                            <div className="flex items-center gap-2.5">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-fg-brand-primary ring-1 ring-secondary ring-inset">
                                    <ShieldTick className="size-5" aria-hidden="true" />
                                </span>
                                <h2 className="text-md font-semibold text-primary">Two people on every loop</h2>
                            </div>
                            <ul className="flex flex-col gap-2 text-sm text-secondary">
                                <li className="flex gap-2">
                                    <Check className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />
                                    The person who places an order cannot be the one who receives it.
                                </li>
                                <li className="flex gap-2">
                                    <Check className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />
                                    The person who counts a shelf cannot approve their own count.
                                </li>
                            </ul>
                            <p className="text-sm text-tertiary">
                                The app enforces both, whatever the role. It is not about trust: a second pair of eyes is how honest mistakes get caught while
                                they are still small.
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
                </div>

                <SampleDataNote>These are fictional staff. Real names are added when the owner invites people through Clerk.</SampleDataNote>
            </PageContent>

            <ModalOverlay isOpen={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(undefined)} isDismissable>
                <Modal className="max-w-lg">
                    <Dialog aria-label={dialog?.member ? "Edit member" : "Invite a teammate"}>
                        <MemberForm key={dialog?.member?.id ?? "new"} member={dialog?.member} onClose={() => setDialog(undefined)} onSave={save} />
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </AppShell>
    );
};
