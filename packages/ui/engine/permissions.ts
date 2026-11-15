/**
 * Permissions.
 *
 * Two layers decide what someone can do:
 *   1. Access level. An ADMIN can do everything, at every location, including managing the team,
 *      invites and settings. A USER gets what their role grants, at their own locations.
 *   2. Role (for users): the job they do. Manager, front desk or technician.
 *
 * Owners are always admins. Any other person can be made an admin by an existing admin.
 *
 * Separation of duties sits on top of this and applies to admins too: nobody approves an order
 * they created, receives an order they created, approves a count they performed, or closes a flag
 * about themselves. Those rules are enforced in the database (supabase/migrations).
 *
 * This file is the single source for the UI. The same grants are mirrored in the row-level
 * security policies; change both together.
 */
import type { AccessLevel, LocationId, Role, User } from "@/data/types";

export type Permission =
    | "stock.view"
    | "stock.count"
    | "stock.adjust"
    | "usage.log"
    | "counts.schedule"
    | "counts.approve"
    | "orders.view"
    | "orders.create"
    | "orders.approve"
    | "orders.receive"
    | "flags.view"
    | "flags.resolve"
    | "costs.view"
    | "reports.view"
    | "digests.view"
    | "activity.view"
    | "team.manage"
    | "settings.manage"
    | "locations.all";

export interface PermissionInfo {
    id: Permission;
    label: string;
    description: string;
}

export const PERMISSION_GROUPS: { group: string; items: PermissionInfo[] }[] = [
    {
        group: "Stock",
        items: [
            { id: "stock.view", label: "See stock", description: "Items, shelves and quantities at their locations." },
            { id: "stock.count", label: "Count stock", description: "Take part in counts assigned to them." },
            { id: "usage.log", label: "Log usage", description: "Record what they use, by scan or by hand." },
            { id: "stock.adjust", label: "Adjust stock", description: "Write off or correct a quantity, with a reason." },
        ],
    },
    {
        group: "Counts",
        items: [
            { id: "counts.schedule", label: "Schedule counts", description: "Create counts and assign them." },
            { id: "counts.approve", label: "Approve counts", description: "Review variances and post them. Never their own count." },
        ],
    },
    {
        group: "Orders",
        items: [
            { id: "orders.view", label: "See orders", description: "Purchase orders and their status." },
            { id: "orders.create", label: "Build orders", description: "Create and edit draft orders." },
            { id: "orders.receive", label: "Receive deliveries", description: "Log what arrived. Never an order they created." },
            { id: "orders.approve", label: "Approve orders", description: "Release an order to the vendor. Never an order they created." },
        ],
    },
    {
        group: "Oversight",
        items: [
            { id: "flags.view", label: "See flags", description: "The review queue and its evidence." },
            { id: "flags.resolve", label: "Resolve flags", description: "Close or dismiss a flag with an outcome. Never one about themselves." },
            { id: "costs.view", label: "See costs", description: "Unit costs, order totals and stock value." },
            { id: "reports.view", label: "See reports", description: "Usage, forecasts and vendor performance." },
            { id: "digests.view", label: "Get digests", description: "The weekly and monthly email." },
            { id: "activity.view", label: "See the activity log", description: "Who changed what, and when." },
        ],
    },
    {
        group: "Administration",
        items: [
            { id: "locations.all", label: "All locations", description: "See and act at every location, not only their own." },
            { id: "team.manage", label: "Manage the team", description: "Invite people, change roles and access, remove access." },
            { id: "settings.manage", label: "Manage settings", description: "Flag rules, vendors, notifications and integrations." },
        ],
    },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.id));

/** What each role grants a USER. Admins get everything regardless of role. */
export const ROLE_GRANTS: Record<Role, Permission[]> = {
    // Owners are always admins, so this list only matters as documentation.
    owner: ALL_PERMISSIONS,
    manager: [
        "stock.view",
        "stock.count",
        "usage.log",
        "stock.adjust",
        "counts.schedule",
        "counts.approve",
        "orders.view",
        "orders.create",
        "orders.receive",
        "flags.view",
        "flags.resolve",
        "costs.view",
        "reports.view",
        "digests.view",
        "activity.view",
    ],
    "front-desk": ["stock.view", "stock.count", "usage.log", "orders.view", "orders.receive"],
    technician: ["stock.view", "stock.count", "usage.log"],
};

export const ACCESS_LABEL: Record<AccessLevel, string> = { admin: "Admin", user: "User" };

export const ACCESS_DESCRIPTION: Record<AccessLevel, string> = {
    admin: "Everything, at every location: team, invites, settings, approvals and costs.",
    user: "What their role allows, at their own locations.",
};

type Who = Pick<User, "access" | "role" | "locations">;

export const isAdmin = (user: Pick<User, "access" | "role">) => user.access === "admin" || user.role === "owner";

/** Whether a role grants a permission to a user who is not an admin. */
export const roleGrants = (role: Role, permission: Permission) => ROLE_GRANTS[role].includes(permission);

/** Can this person do this? Pass a location to also check they belong to it. */
export const can = (user: Who, permission: Permission, location?: LocationId) => {
    if (isAdmin(user)) return true;
    if (!roleGrants(user.role, permission)) return false;
    return location === undefined || user.locations.includes(location);
};

/** Locations this person may see. */
export const visibleLocations = (user: Who, all: LocationId[]) => (isAdmin(user) ? all : all.filter((l) => user.locations.includes(l)));

/** The permissions a person holds, for showing "what this invite gives them". */
export const grantsFor = (access: AccessLevel, role: Role): Permission[] => (access === "admin" || role === "owner" ? ALL_PERMISSIONS : ROLE_GRANTS[role]);
