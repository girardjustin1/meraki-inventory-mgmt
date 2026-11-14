"use client";

import { useState } from "react";
import { Check, ChevronDown, Minus, ShieldTick } from "@untitledui/icons";
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { AccessBadge } from "@/components/meraki/access-badge";
import { ROLE_LABEL, locationName } from "@/data/inventory";
import type { AccessLevel, LocationId, Role } from "@/data/types";
import { ACCESS_DESCRIPTION, ALL_PERMISSIONS, PERMISSION_GROUPS, ROLE_GRANTS, grantsFor } from "@/engine/permissions";
import type { Permission } from "@/engine/permissions";
import { cx } from "@/utils/cx";

/** The four columns: Admin, then a User with each role. Owners are always admins, so they have no column. */
export type MatrixColumn = "admin" | "manager" | "front-desk" | "technician";

const COLUMNS: MatrixColumn[] = ["admin", "manager", "front-desk", "technician"];
const USER_ROLES: Exclude<MatrixColumn, "admin">[] = ["manager", "front-desk", "technician"];

const COLUMN_LABEL: Record<MatrixColumn, string> = {
    admin: "Admin",
    manager: ROLE_LABEL.manager,
    "front-desk": ROLE_LABEL["front-desk"],
    technician: ROLE_LABEL.technician,
};

const columnFor = (access: AccessLevel, role: Role): MatrixColumn => (access === "admin" || role === "owner" ? "admin" : role);

const granted = (column: MatrixColumn, permission: Permission) => column === "admin" || ROLE_GRANTS[column].includes(permission);

const grantCount = (column: MatrixColumn) => (column === "admin" ? ALL_PERMISSIONS.length : ROLE_GRANTS[column].length);

/** The rules that hold whatever the access level. Mirrors the header of engine/permissions.ts. */
export const SEPARATION_RULES = [
    "Nobody approves an order they created.",
    "Nobody receives an order they created.",
    "Nobody approves a count they performed.",
    "Nobody closes a flag about themselves.",
];

const Tick = ({ on, className }: { on: boolean; className?: string }) =>
    on ? (
        <>
            <Check className={cx("size-5 text-fg-success-primary", className)} aria-hidden="true" />
            <span className="sr-only">Yes</span>
        </>
    ) : (
        <>
            <Minus className={cx("size-4 text-fg-quaternary", className)} aria-hidden="true" />
            <span className="sr-only">No</span>
        </>
    );

const Footnote = ({ className }: { className?: string }) => (
    <p className={cx("flex items-start gap-2 text-sm text-tertiary", className)}>
        <ShieldTick className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />
        <span>
            <span className="font-medium text-secondary">Separation of duties applies to everyone, admins included.</span> Nobody approves or receives an order
            they created, approves a count they performed, or closes a flag about themselves.
        </span>
    </p>
);

export interface PermissionMatrixProps {
    /** Emphasise one column, e.g. the access and role an invite gives. */
    highlight?: { access: AccessLevel; role: Role };
    /** Label on the highlighted column. */
    highlightLabel?: string;
    /**
     * `auto`: table from the `lg` breakpoint, role picker and list below it.
     * `list`: always the picker and list, for narrow containers such as a dialog or the sign-up screen.
     */
    layout?: "auto" | "list";
    className?: string;
}

/**
 * Who can do what. Rows are the permissions from engine/permissions.ts; columns are Admin and
 * a User with each role. On a phone it becomes a role picker and one list, because a five-column
 * table cannot be read at that width.
 */
export const PermissionMatrix = ({ highlight, highlightLabel = "This person", layout = "auto", className }: PermissionMatrixProps) => {
    const highlighted = highlight ? columnFor(highlight.access, highlight.role) : undefined;
    const [picked, setPicked] = useState<MatrixColumn>(highlighted ?? "manager");

    return (
        <div className={cx("flex flex-col", className)}>
            {/* Desktop: the full table */}
            {layout === "auto" && (
                <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-176 border-collapse">
                        <caption className="sr-only">What an admin, and a user with each role, can do</caption>
                        <thead className="bg-secondary text-xs font-semibold text-tertiary">
                            <tr className="border-t border-secondary">
                                <th scope="col" rowSpan={2} className="sticky left-0 z-10 bg-secondary py-2.5 pr-3 pl-5 text-left align-bottom">
                                    Permission
                                </th>
                                <th
                                    scope="col"
                                    rowSpan={2}
                                    className={cx("w-28 px-2 py-2.5 text-center align-bottom", highlighted === "admin" && "bg-brand-100 text-brand-secondary")}
                                >
                                    <span className="flex flex-col items-center gap-1">
                                        {highlighted === "admin" && <span className="text-xs font-semibold">{highlightLabel}</span>}
                                        <AccessBadge access="admin" />
                                    </span>
                                </th>
                                <th scope="colgroup" colSpan={3} className="border-l border-secondary px-2 pt-2.5 pb-1 text-center">
                                    <span className="inline-flex items-center gap-1.5">
                                        <AccessBadge access="user" /> with this role
                                    </span>
                                </th>
                            </tr>
                            <tr className="border-b border-secondary">
                                {USER_ROLES.map((role, i) => (
                                    <th
                                        key={role}
                                        scope="col"
                                        className={cx(
                                            "w-28 px-2 pt-1 pb-2.5 text-center",
                                            i === 0 && "border-l border-secondary",
                                            highlighted === role && "bg-brand-100 text-brand-secondary",
                                        )}
                                    >
                                        {highlighted === role && <span className="block text-xs font-semibold">{highlightLabel}</span>}
                                        {ROLE_LABEL[role]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        {PERMISSION_GROUPS.map((group) => (
                            <tbody key={group.group} className="divide-y divide-border-secondary border-b border-secondary">
                                <tr>
                                    <th
                                        scope="rowgroup"
                                        colSpan={5}
                                        className="sticky left-0 bg-primary pt-4 pr-3 pb-1.5 pl-5 text-left text-xs font-semibold tracking-wide text-quaternary uppercase"
                                    >
                                        {group.group}
                                    </th>
                                </tr>
                                {group.items.map((p) => (
                                    <tr key={p.id}>
                                        <th scope="row" className="sticky left-0 z-10 bg-primary py-3 pr-3 pl-5 text-left font-normal">
                                            <span className="block text-sm font-medium text-secondary">{p.label}</span>
                                            <span className="block text-sm text-tertiary">{p.description}</span>
                                        </th>
                                        {COLUMNS.map((column) => (
                                            <td
                                                key={column}
                                                className={cx(
                                                    "px-2 py-3 text-center",
                                                    column === "manager" && "border-l border-secondary",
                                                    highlighted === column && "bg-brand-50",
                                                )}
                                            >
                                                <Tick on={granted(column, p.id)} className="mx-auto" />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        ))}
                    </table>
                </div>
            )}

            {/* Phone, or a narrow container: pick a column, read one list */}
            <div className={cx("flex flex-col gap-4", layout === "auto" && "lg:hidden")}>
                <AriaRadioGroup
                    aria-label="Show permissions for"
                    orientation="horizontal"
                    value={picked}
                    onChange={(value) => setPicked(value as MatrixColumn)}
                    className="grid grid-cols-4 gap-1 rounded-xl bg-secondary_alt p-1 ring-1 ring-secondary ring-inset"
                >
                    {COLUMNS.map((column) => (
                        <AriaRadio
                            key={column}
                            value={column}
                            className={({ isSelected, isFocusVisible }) =>
                                cx(
                                    "flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-1 text-center text-sm font-semibold text-quaternary outline-focus-ring transition duration-100 ease-linear",
                                    isSelected && "bg-primary text-secondary shadow-xs ring-1 ring-secondary ring-inset",
                                    isFocusVisible && "outline-2 outline-offset-2",
                                )
                            }
                        >
                            {COLUMN_LABEL[column]}
                        </AriaRadio>
                    ))}
                </AriaRadioGroup>

                <div className="flex flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-primary">
                        {picked === "admin" ? (
                            <AccessBadge access="admin" />
                        ) : (
                            <>
                                <AccessBadge access="user" />
                                <span>{ROLE_LABEL[picked]}</span>
                            </>
                        )}
                        {highlighted === picked && (
                            <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-xs font-semibold text-brand-secondary">{highlightLabel}</span>
                        )}
                    </p>
                    <p className="text-sm text-tertiary">
                        {picked === "admin" ? ACCESS_DESCRIPTION.admin : ACCESS_DESCRIPTION.user} {grantCount(picked)} of {ALL_PERMISSIONS.length} permissions.
                    </p>
                </div>

                <div className="flex flex-col gap-4">
                    {PERMISSION_GROUPS.map((group) => (
                        <section key={group.group} className="flex flex-col gap-1">
                            <h3 className="text-xs font-semibold tracking-wide text-quaternary uppercase">{group.group}</h3>
                            <ul className="divide-y divide-border-secondary">
                                {group.items.map((p) => {
                                    const on = granted(picked, p.id);
                                    return (
                                        <li key={p.id} className="flex items-start gap-3 py-2.5">
                                            <span className="flex size-5 shrink-0 items-center justify-center pt-0.5">
                                                <Tick on={on} />
                                            </span>
                                            <span className="flex min-w-0 flex-col">
                                                <span className={cx("text-sm font-medium", on ? "text-secondary" : "text-quaternary")}>{p.label}</span>
                                                <span className={cx("text-sm", on ? "text-tertiary" : "text-quaternary")}>{p.description}</span>
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            </div>

            <Footnote className={cx("pt-4", layout === "auto" && "lg:px-5 lg:pb-5")} />
        </div>
    );
};

const scopeLabel = (access: AccessLevel, role: Role, locations?: LocationId[]) => {
    if (access === "admin" || role === "owner") return "at every location";
    if (!locations || locations.length === 0) return "at their own locations";
    return `at ${locations.map((id) => locationName(id)).join(" and ")}`;
};

export interface PermissionSummaryProps {
    access: AccessLevel;
    role: Role;
    /** Where the grants apply. Ignored for admins, who act everywhere. */
    locations?: LocationId[];
    /** Heading above the list. */
    title?: string;
    /** Let the reader open the full list, including what is not included. */
    expandable?: boolean;
    /** Label on this person's column in the full list. */
    highlightLabel?: string;
    className?: string;
}

/**
 * The short answer to "what will this person be able to do": granted permissions by group, from
 * `grantsFor`. Used live in the invite form and on the sign-up screen.
 */
export const PermissionSummary = ({
    access,
    role,
    locations,
    title = "This person will be able to",
    expandable = true,
    highlightLabel,
    className,
}: PermissionSummaryProps) => {
    const [open, setOpen] = useState(false);
    const grants = grantsFor(access, role);
    const column = columnFor(access, role);
    const missing = ALL_PERMISSIONS.length - grants.length;

    return (
        <section className={cx("flex flex-col gap-3 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset", className)}>
            <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-semibold text-primary">{title}</h3>
                <p className="text-sm text-tertiary">
                    {grants.length} of {ALL_PERMISSIONS.length} permissions, {scopeLabel(access, role, locations)}.
                </p>
            </div>

            {open ? (
                <PermissionMatrix key={column} layout="list" highlight={{ access, role }} highlightLabel={highlightLabel} />
            ) : (
                <>
                    <dl className="flex flex-col gap-2">
                        {PERMISSION_GROUPS.map((group) => {
                            const labels = group.items.filter((p) => grants.includes(p.id)).map((p) => p.label);
                            if (labels.length === 0) return null;
                            return (
                                <div key={group.group} className="flex items-start gap-2.5">
                                    <Check className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                                    <div className="min-w-0 text-sm">
                                        <dt className="inline font-medium text-secondary">{group.group}: </dt>
                                        <dd className="inline text-tertiary">{labels.join(", ").toLowerCase()}</dd>
                                    </div>
                                </div>
                            );
                        })}
                    </dl>
                    {missing > 0 && (
                        <p className="flex items-start gap-2.5 text-sm text-tertiary">
                            <Minus className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                            <span>
                                Not included: {missing} other {missing === 1 ? "permission" : "permissions"}, such as{" "}
                                {PERMISSION_GROUPS.flatMap((g) => g.items)
                                    .filter((p) => !grants.includes(p.id))
                                    .slice(-3)
                                    .map((p) => p.label.toLowerCase())
                                    .join(", ")}
                                .
                            </span>
                        </p>
                    )}
                </>
            )}

            {expandable && (
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                    className="flex min-h-11 items-center gap-1 self-start rounded-md text-sm font-semibold text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-0"
                >
                    {open ? "Show the short list" : "See the full list"}
                    <ChevronDown className={cx("size-4 transition duration-100 ease-linear", open && "rotate-180")} aria-hidden="true" />
                </button>
            )}
        </section>
    );
};
