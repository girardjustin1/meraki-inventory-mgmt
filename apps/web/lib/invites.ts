/**
 * Invites: the only way a person gets access.
 *
 *   createInvite()   an admin invites someone, by email or as an open link
 *   listInvites()    what the Team screen shows
 *   revokeInvite()   cancel one that has not been used
 *   resendInvite()   issue a new link for the same invite; the old link dies
 *   previewInvite()  what the accept screen may show someone holding a link, before sign-in
 *   acceptInvite()   turn a link plus a signed-in Google account into a profile
 *
 * THE TOKEN. An invite link is `/invite/<token>`. The token is `mk_` followed by 32 random
 * bytes in URL-safe base64. It is generated here, handed back ONCE in the result of
 * createInvite() or resendInvite(), and then forgotten: only its SHA-256 hash is stored.
 * Nobody, admins included, can read a working link back out of the database. A lost link
 * is replaced with resendInvite(), not recovered.
 *
 * WHERE THE RULES ARE ENFORCED. This file checks permissions so callers get a clear answer,
 * but with Supabase configured the database is what decides, and it decides again:
 * create, revoke and resend run as the signed-in admin under row-level security, and
 * acceptance runs inside the database function accept_invite(), in one transaction. See
 * supabase/migrations/0002_access_and_invites.sql.
 *
 * PROTOTYPE MODE (Supabase or Clerk not configured). Everything works, on a copy of the
 * sample invites from packages/ui/data/inventory.ts held IN MEMORY in this server process:
 *   - invites you create exist until the dev server restarts, and only on this machine
 *   - the same rules apply (single use, expiry, email binding, one pending per email), so
 *     the screens can be demoed and wired against real behaviour, including every refusal
 *   - nothing is written anywhere and no invite email reaches a real inbox
 *   - the sample tokens in inventory.ts work as demo links
 * Each result carries `prototype: true` there, so a screen can say so.
 *
 * Server only.
 */
import { createHash, randomBytes } from "node:crypto";
import type { AccessLevel, InviteStatus, LocationId, Role, User } from "@/data/types";
import { can, isAdmin } from "@/engine/permissions";
import { type SendResult, sendInvite } from "~/lib/email";
import { appUrl, env, isConfigured } from "~/lib/env";
import { getAdminSupabase } from "~/lib/supabase/admin";
import { type InviteRow, kebab, snake, toAccess, toInvite } from "~/lib/supabase/mappers";
import { createServerSupabase } from "~/lib/supabase/server";

// ------------------------------------------------------------------------------------ shapes

/**
 * An invite as the app hands it out: the domain `Invite` from packages/ui/data/types.ts
 * without its `token`. The token is returned separately, once, by create and resend.
 */
export interface InviteView {
    id: string;
    email?: string;
    name?: string;
    role: Role;
    access: AccessLevel;
    locations: LocationId[];
    invitedBy: string;
    createdAt: string;
    expiresAt: string;
    status: InviteStatus;
    acceptedAt?: string;
    acceptedBy?: string;
    revokedAt?: string;
    note?: string;
}

/** What an admin fills in. `email` absent means an open link, which cannot grant admin access. */
export interface InviteInput {
    email?: string;
    name?: string;
    role: Exclude<Role, "owner">;
    access: AccessLevel;
    locations: LocationId[];
    note?: string;
}

/** What happened to the invitation email. "not_applicable" is an open link: there is nobody to email. */
export interface EmailOutcome {
    status: "sent" | "skipped" | "failed" | "not_applicable";
    reason?: string;
}

/** The result of creating or resending. The only place the token ever appears. */
export interface IssuedInvite {
    invite: InviteView;
    /** Show it now; it cannot be shown again. */
    token: string;
    /** The full link: `<app origin>/invite/<token>`. */
    url: string;
    email: EmailOutcome;
    prototype: boolean;
}

/**
 * What the accept screen may show before sign-in. `status: "invalid"` covers a token that
 * is unknown, malformed or missing, with no way to tell which. For an invite that is no
 * longer pending only the status, the inviter's name, the expiry and `emailBound` are set.
 */
export interface InvitePreview {
    status: InviteStatus | "invalid";
    inviterName?: string;
    role?: Role;
    access?: AccessLevel;
    locationNames?: string[];
    note?: string;
    expiresAt?: string;
    emailBound?: boolean;
    /** "n••••@example.com". The full address is never returned. */
    maskedEmail?: string;
    /** First name typed by the inviter, for a greeting. */
    name?: string;
}

/** Who is accepting. Comes from the Clerk session, never from the request body. */
export interface AcceptIdentity {
    userId: string;
    email?: string;
    emailVerified?: boolean;
    name?: string;
}

export interface AcceptOptions {
    /**
     * PROTOTYPE MODE ONLY, ignored when live. There is no Google account to read an address
     * from, so when `identity.email` is absent, act as the person the invite was sent to
     * (or as a made-up new person, for an open link). Lets the happy path be demoed.
     */
    presentInvitedEmail?: boolean;
}

export type AcceptError =
    | "not_signed_in"
    | "invalid"
    | "already_accepted"
    | "revoked"
    | "expired"
    | "email_claim_missing"
    | "email_not_verified"
    | "email_mismatch"
    | "already_member"
    | "email_in_use";

export type AcceptResult =
    | { ok: true; alreadyAccepted: boolean; role: Role; access: AccessLevel; locations: LocationId[]; prototype: boolean }
    | { ok: false; error: AcceptError; prototype: boolean };

export type InviteErrorCode = "invalid_input" | "forbidden" | "not_found" | "not_pending" | "already_pending" | "already_member" | "unknown_location" | "store_error";

/** A refusal with an HTTP status and a sentence that is safe to show. Route handlers turn it into JSON. */
export class InviteError extends Error {
    constructor(
        readonly code: InviteErrorCode,
        readonly status: number,
        message: string,
        readonly field?: string,
    ) {
        super(message);
        this.name = "InviteError";
    }
}

// ------------------------------------------------------------------------------------ constants

/**
 * These mirror INVITE_PATH and INVITE_TTL_DAYS in packages/ui/data/inventory.ts. They are
 * repeated because that module loads the whole sample catalogue, which live mode must not
 * pay for. The database enforces the same limits (constraints on `invites`), in hours.
 */
export const INVITE_PATH = "/invite";
export const INVITE_TTL_HOURS = { email: 7 * 24, link: 2 * 24 } as const;

const TOKEN_PREFIX = "mk_";
const MAX_TOKEN_LENGTH = 200;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INVITABLE_ROLES: readonly Exclude<Role, "owner">[] = ["manager", "front-desk", "technician"];

// ------------------------------------------------------------------------------------ token

/** `mk_` + 32 random bytes as URL-safe base64 (43 characters). 256 bits: not guessable. */
export const generateInviteToken = (): string => `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

/**
 * Lower-case hex SHA-256 of the token's UTF-8 bytes. The same recipe as
 * app.hash_invite_token() in the migration; the two must agree or no link will ever match.
 * A plain fast hash is right here (unlike for the PIN): the input is 256 random bits.
 */
export const hashInviteToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");

/**
 * The full link for a token. The origin is NEXT_PUBLIC_APP_URL (or the Vercel production
 * address). `requestOrigin` is used only outside production and only when neither is set,
 * so a link made on a local dev server points back at that server and its port. In
 * production the origin never comes from the request: a link that goes out by email must
 * not be steerable by a Host header.
 */
export const inviteLink = (token: string, requestOrigin?: string): string => {
    const path = `${INVITE_PATH}/${encodeURIComponent(token)}`;
    const local = !env.isProduction && !env.appUrl && !process.env.VERCEL_URL && requestOrigin;
    return local ? `${requestOrigin.replace(/\/+$/, "")}${path}` : appUrl(path);
};

const usableToken = (token: unknown): token is string => typeof token === "string" && token.length > 0 && token.length <= MAX_TOKEN_LENGTH;

// ------------------------------------------------------------------------------------ input

const trimmed = (value: unknown, max: number): string | undefined => {
    if (typeof value !== "string") return undefined;
    const text = value.trim();
    return text ? text.slice(0, max) : undefined;
};

/** Checks and tidies what the form sent. Throws InviteError("invalid_input") naming the field. */
export const parseInviteInput = (raw: unknown): InviteInput => {
    const body = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const invalid = (field: string, message: string) => new InviteError("invalid_input", 400, message, field);

    const email = trimmed(body.email, 254)?.toLowerCase();
    if (email && !EMAIL_PATTERN.test(email)) throw invalid("email", "That does not look like an email address.");

    const role = kebab<Role>(typeof body.role === "string" ? body.role.trim().toLowerCase() : "");
    if (role === "owner") throw invalid("role", "An owner cannot be invited. Invite them as an admin, or set the owner up directly.");
    if (!(INVITABLE_ROLES as readonly string[]).includes(role)) throw invalid("role", "Choose a role: manager, front desk or technician.");

    const access = body.access === undefined || body.access === null || body.access === "" ? "user" : body.access;
    if (access !== "admin" && access !== "user") throw invalid("access", "Access is either admin or user.");

    if (body.locations !== undefined && !Array.isArray(body.locations)) throw invalid("locations", "Locations must be a list.");
    const locations = [...new Set(((body.locations as unknown[] | undefined) ?? []).filter((l): l is string => typeof l === "string" && l.trim() !== "").map((l) => l.trim()))];
    if (locations.length > 20) throw invalid("locations", "Too many locations.");
    if (access === "user" && locations.length === 0) throw invalid("locations", "Choose at least one location. Without one, a user would sign in and see nothing.");
    // An open link works for whoever holds it, so it never carries admin access. Also a constraint on `invites`.
    if (access === "admin" && !email) throw invalid("email", "An admin invite needs an email address. An open link works for whoever holds it, so it cannot grant admin access.");

    return {
        ...(email ? { email } : {}),
        ...(trimmed(body.name, 80) ? { name: trimmed(body.name, 80) } : {}),
        role: role as Exclude<Role, "owner">,
        access,
        locations: locations as LocationId[],
        ...(trimmed(body.note, 500) ? { note: trimmed(body.note, 500) } : {}),
    };
};

// ------------------------------------------------------------------------------------ storage

interface InviteStore {
    prototype: boolean;
    list(): Promise<InviteView[]>;
    create(input: InviteInput, tokenHash: string, actor: User): Promise<InviteView>;
    revoke(id: string, actor: User): Promise<InviteView>;
    /** Swap in a new token hash and restart the expiry clock. */
    reissue(id: string, tokenHash: string): Promise<InviteView>;
    preview(token: string): Promise<InvitePreview>;
    accept(token: string, identity: AcceptIdentity, options: AcceptOptions): Promise<AcceptResult>;
    /** Display names for location ids, for the email. */
    locationNames(ids: LocationId[]): Promise<string[]>;
}

/** Live needs both: Supabase to hold invites, Clerk to say who is asking. */
const isLive = () => isConfigured.supabase && isConfigured.clerk;

// ---------------------------------------------------------------- live: Supabase

const INVITE_COLUMNS = "id, email, name, role, access_level, location_ids, invited_by, note, created_at, expires_at, accepted_at, accepted_by, revoked_at";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TableRow = Omit<InviteRow, "status">;

interface DbError {
    code?: string;
    message: string;
}

/** Postgres error -> a refusal people can act on. Anything unexpected is logged and reported plainly. */
const fromDbError = (error: DbError, doing: string): InviteError => {
    const { code, message } = error;
    if (code === "23505" && /already pending/i.test(message)) return new InviteError("already_pending", 409, "There is already a pending invite for this email. Resend it or revoke it first.", "email");
    if (code === "23505" && /already has access/i.test(message)) return new InviteError("already_member", 409, "This person already has access.", "email");
    if (code === "23503" && /unknown location/i.test(message)) return new InviteError("unknown_location", 400, "One of the locations does not exist.", "locations");
    if (code === "42501") return new InviteError("forbidden", 403, "Only an admin can manage invites.");
    if (code === "23514" && /(accepted|revoked) and can no longer be changed/i.test(message)) {
        return new InviteError("not_pending", 409, "This invite has already been accepted or revoked.");
    }
    if (code === "23514") return new InviteError("invalid_input", 400, "The database refused this invite. Check the email, the role and the locations.");
    console.error(`[invites] could not ${doing}: ${code ?? "?"} ${message}`);
    return new InviteError("store_error", 500, `Could not ${doing}. Try again.`);
};

const supabaseStore = (): InviteStore => {
    /** Acts as the signed-in admin: row-level security and the invite trigger apply. */
    const asCaller = async () => {
        const db = await createServerSupabase();
        if (!db) throw new InviteError("store_error", 500, "Supabase is not configured.");
        return db;
    };

    /** Tells "there is no such invite" apart from "it is no longer pending" after an update matched nothing. */
    const missingOrSettled = async (id: string): Promise<InviteError> => {
        const db = await asCaller();
        const { data } = await db.from("invites_with_status").select("status").eq("id", id).maybeSingle<{ status: InviteStatus }>();
        if (!data) return new InviteError("not_found", 404, "That invite does not exist.");
        return new InviteError("not_pending", 409, `This invite is ${data.status} and can no longer be changed.`);
    };

    return {
        prototype: false,

        list: async () => {
            const db = await asCaller();
            const { data, error } = await db.from("invites_with_status").select(`${INVITE_COLUMNS}, status`).order("created_at", { ascending: false }).limit(500);
            if (error) throw fromDbError(error, "load the invites");
            return ((data ?? []) as InviteRow[]).map(toInvite);
        },

        create: async (input, tokenHash) => {
            const db = await asCaller();
            // invited_by, created_at and the expiry are set by the database from the caller's
            // token and its own clock; anything sent for them would be ignored or refused.
            const { data, error } = await db
                .from("invites")
                .insert({
                    token_hash: tokenHash,
                    email: input.email ?? null,
                    name: input.name ?? null,
                    role: snake(input.role),
                    access_level: input.access,
                    location_ids: input.locations,
                    note: input.note ?? null,
                })
                .select(INVITE_COLUMNS)
                .single<TableRow>();
            if (error || !data) throw fromDbError(error ?? { message: "no row returned" }, "create the invite");
            return toInvite({ ...data, status: "pending" });
        },

        revoke: async (id) => {
            if (!UUID_PATTERN.test(id)) throw new InviteError("not_found", 404, "That invite does not exist.");
            const db = await asCaller();
            // The trigger replaces the timestamp with the database's clock and stamps revoked_by.
            const { data, error } = await db.from("invites").update({ revoked_at: new Date().toISOString() }).eq("id", id).select(INVITE_COLUMNS).maybeSingle<TableRow>();
            if (error) throw fromDbError(error, "revoke the invite");
            if (!data) throw await missingOrSettled(id);
            return toInvite({ ...data, status: "revoked" });
        },

        reissue: async (id, tokenHash) => {
            if (!UUID_PATTERN.test(id)) throw new InviteError("not_found", 404, "That invite does not exist.");
            const db = await asCaller();
            const { data, error } = await db.from("invites").update({ token_hash: tokenHash }).eq("id", id).select(INVITE_COLUMNS).maybeSingle<TableRow>();
            if (error) throw fromDbError(error, "resend the invite");
            if (!data) throw await missingOrSettled(id);
            return toInvite({ ...data, status: "pending" });
        },

        preview: async (token) => {
            // The service role, because invite_preview() is granted to nobody else: the
            // browser can only reach it through GET /api/invites/preview.
            const admin = getAdminSupabase();
            if (!admin) throw new InviteError("store_error", 500, "Supabase is not configured.");
            const { data, error } = await admin.rpc("invite_preview", { token });
            if (error) throw fromDbError(error, "look up the invite");
            const row = ((data ?? []) as PreviewRow[])[0];
            if (!row) return { status: "invalid" };
            return {
                status: row.status,
                ...(row.inviter_name ? { inviterName: row.inviter_name } : {}),
                ...(row.role ? { role: kebab<Role>(row.role) } : {}),
                ...(row.access_level ? { access: row.access_level } : {}),
                ...(row.location_names ? { locationNames: row.location_names } : {}),
                ...(row.note ? { note: row.note } : {}),
                expiresAt: new Date(row.expires_at).toISOString(),
                emailBound: row.email_bound,
                ...(row.masked_email ? { maskedEmail: row.masked_email } : {}),
                ...(row.invitee_name ? { name: row.invitee_name } : {}),
            };
        },

        accept: async (token) => {
            // As the caller: accept_invite() reads who they are, and their email, from the
            // Clerk session token that this client sends. Nothing is passed in but the token.
            const db = await asCaller();
            const { data, error } = await db.rpc("accept_invite", { token });
            if (error) throw fromDbError(error, "accept the invite");
            const result = (data ?? {}) as AcceptRow;
            if (!result.ok) return { ok: false, error: result.error ?? "invalid", prototype: false };
            return {
                ok: true,
                alreadyAccepted: Boolean(result.already_accepted),
                role: kebab<Role>(result.role ?? "technician"),
                access: toAccess(result.access_level, result.role ?? ""),
                locations: (result.location_ids ?? []) as LocationId[],
                prototype: false,
            };
        },

        locationNames: async (ids) => {
            if (!ids.length) return [];
            const db = await asCaller();
            const { data } = await db.from("locations").select("id, short_name").in("id", ids).order("short_name");
            return ((data ?? []) as { short_name: string }[]).map((l) => l.short_name);
        },
    };
};

interface PreviewRow {
    status: InviteStatus;
    inviter_name: string | null;
    role: string | null;
    access_level: AccessLevel | null;
    location_names: string[] | null;
    note: string | null;
    expires_at: string;
    email_bound: boolean;
    masked_email: string | null;
    invitee_name: string | null;
}

interface AcceptRow {
    ok?: boolean;
    error?: AcceptError;
    already_accepted?: boolean;
    role?: string;
    access_level?: string;
    location_ids?: string[];
}

// ---------------------------------------------------------------- prototype: in memory

interface MemoryInvite extends Omit<InviteView, "status"> {
    tokenHash: string;
}

interface MemoryState {
    invites: MemoryInvite[];
    nextId: number;
}

// On globalThis so the list survives the dev server reloading this module after an edit.
const memory = globalThis as typeof globalThis & { __merakiPrototypeInvites?: MemoryState };

const statusAt = (invite: Pick<MemoryInvite, "acceptedAt" | "revokedAt" | "expiresAt">, now: number): InviteStatus =>
    invite.acceptedAt ? "accepted" : invite.revokedAt ? "revoked" : Date.parse(invite.expiresAt) <= now ? "expired" : "pending";

const maskEmail = (email: string): string => `${email.slice(0, 1)}••••@${email.split("@")[1] ?? ""}`;

const prototypeStore = async (): Promise<InviteStore> => {
    // Imported lazily: the sample data layer is large and live mode should never load it.
    const data = await import("@/data/inventory");

    if (!memory.__merakiPrototypeInvites) {
        // The sample invites are dated relative to the prototype's fixed "today". Shift them
        // onto the real clock so the pending ones are still pending whenever the demo runs.
        const shift = Date.now() - Date.parse(`${data.TODAY}T12:00:00Z`);
        const move = (iso: string | undefined) => (iso ? new Date(Date.parse(iso) + shift).toISOString() : undefined);
        memory.__merakiPrototypeInvites = {
            nextId: data.invites.length + 1,
            invites: data.invites.map(({ token, status: _status, ...invite }) => ({
                ...invite,
                tokenHash: hashInviteToken(token),
                createdAt: move(invite.createdAt) as string,
                expiresAt: move(invite.expiresAt) as string,
                acceptedAt: move(invite.acceptedAt),
                revokedAt: move(invite.revokedAt),
            })),
        };
    }
    const state = memory.__merakiPrototypeInvites;

    const view = ({ tokenHash: _hash, ...invite }: MemoryInvite): InviteView => ({ ...invite, status: statusAt(invite, Date.now()) });
    const find = (id: string): MemoryInvite => {
        const invite = state.invites.find((i) => i.id === id);
        if (!invite) throw new InviteError("not_found", 404, "That invite does not exist.");
        return invite;
    };
    const assertOpen = (invite: MemoryInvite) => {
        if (invite.acceptedAt || invite.revokedAt) {
            throw new InviteError("not_pending", 409, `This invite is ${statusAt(invite, Date.now())} and can no longer be changed.`);
        }
    };
    const assertNoPending = (email: string, exceptId?: string) => {
        if (state.invites.some((i) => i.id !== exceptId && i.email === email && statusAt(i, Date.now()) === "pending")) {
            throw new InviteError("already_pending", 409, "There is already a pending invite for this email. Resend it or revoke it first.", "email");
        }
    };
    const expiry = (email: string | undefined) => new Date(Date.now() + (email ? INVITE_TTL_HOURS.email : INVITE_TTL_HOURS.link) * 3_600_000).toISOString();

    return {
        prototype: true,

        list: async () => [...state.invites].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(view),

        create: async (input, tokenHash, actor) => {
            const known = new Set<string>(data.locations.map((l) => l.id));
            if (input.locations.some((l) => !known.has(l))) throw new InviteError("unknown_location", 400, "One of the locations does not exist.", "locations");
            if (input.email) {
                if (data.users.some((u) => u.email.toLowerCase() === input.email)) throw new InviteError("already_member", 409, "This person already has access.", "email");
                assertNoPending(input.email);
            }
            const invite: MemoryInvite = {
                id: `inv-${state.nextId++}`,
                tokenHash,
                ...(input.email ? { email: input.email } : {}),
                ...(input.name ? { name: input.name } : {}),
                role: input.role,
                access: input.access,
                locations: [...input.locations].sort(),
                invitedBy: actor.id,
                createdAt: new Date().toISOString(),
                expiresAt: expiry(input.email),
                ...(input.note ? { note: input.note } : {}),
            };
            state.invites.push(invite);
            return view(invite);
        },

        revoke: async (id) => {
            const invite = find(id);
            assertOpen(invite);
            invite.revokedAt = new Date().toISOString();
            return view(invite);
        },

        reissue: async (id, tokenHash) => {
            const invite = find(id);
            assertOpen(invite);
            if (invite.email) assertNoPending(invite.email, invite.id);
            invite.tokenHash = tokenHash;
            invite.expiresAt = expiry(invite.email);
            return view(invite);
        },

        preview: async (token) => {
            const hash = hashInviteToken(token);
            const invite = state.invites.find((i) => i.tokenHash === hash);
            if (!invite) return { status: "invalid" };
            const status = statusAt(invite, Date.now());
            const inviterName = data.userById(invite.invitedBy)?.name;
            const base = { status, ...(inviterName ? { inviterName } : {}), expiresAt: invite.expiresAt, emailBound: Boolean(invite.email) };
            if (status !== "pending") return base;
            return {
                ...base,
                role: invite.role,
                access: invite.access,
                locationNames: data.locations.filter((l) => invite.locations.includes(l.id)).map((l) => l.shortName).sort(),
                ...(invite.note ? { note: invite.note } : {}),
                ...(invite.email ? { maskedEmail: maskEmail(invite.email) } : {}),
                ...(invite.name ? { name: invite.name } : {}),
            };
        },

        // The same checks, in the same order, as accept_invite() in the migration.
        accept: async (token, identity, options) => {
            const refuse = (error: AcceptError): AcceptResult => ({ ok: false, error, prototype: true });
            const hash = hashInviteToken(token);
            const invite = state.invites.find((i) => i.tokenHash === hash);
            if (!invite) return refuse("invalid");
            const granted = (alreadyAccepted: boolean): AcceptResult => ({ ok: true, alreadyAccepted, role: invite.role, access: invite.access, locations: invite.locations, prototype: true });

            if (invite.acceptedAt) return invite.acceptedBy === identity.userId ? granted(true) : refuse("already_accepted");
            if (invite.revokedAt) return refuse("revoked");
            if (Date.parse(invite.expiresAt) <= Date.now()) return refuse("expired");
            const email = identity.email?.trim().toLowerCase() ?? (options.presentInvitedEmail ? (invite.email ?? "new.person@example.com") : undefined);
            if (!email) return refuse("email_claim_missing");
            if (identity.emailVerified === false) return refuse("email_not_verified");
            if (invite.email && invite.email !== email) return refuse("email_mismatch");
            if (data.users.some((u) => u.id === identity.userId)) return refuse("already_member");
            if (data.users.some((u) => u.email.toLowerCase() === email)) return refuse("email_in_use");

            // No profile is created: the sample staff list is read-only. The invite is marked used.
            invite.acceptedAt = new Date().toISOString();
            invite.acceptedBy = identity.userId;
            return granted(false);
        },

        locationNames: async (ids) => data.locations.filter((l) => ids.includes(l.id)).map((l) => l.shortName).sort(),
    };
};

const store = async (): Promise<InviteStore> => (isLive() ? supabaseStore() : prototypeStore());

// ------------------------------------------------------------------------------------ operations

const assertCanManage = (actor: User) => {
    if (!can(actor, "team.manage")) throw new InviteError("forbidden", 403, "Only an admin can manage invites.");
};

const emailOutcome = (result: SendResult): EmailOutcome =>
    result.status === "sent" ? { status: "sent" } : result.status === "skipped" ? { status: "skipped", reason: result.reason } : { status: "failed", reason: result.error };

/** Sends the invitation email for an email-bound invite. Never throws: the invite exists either way. */
const deliver = async (invites: InviteStore, invite: InviteView, url: string, token: string, actor: User): Promise<EmailOutcome> => {
    if (!invite.email) return { status: "not_applicable", reason: "open_link" };
    try {
        return emailOutcome(
            await sendInvite({
                email: invite.email,
                inviteUrl: url,
                inviterName: actor.name || "A Meraki admin",
                inviteeName: invite.name,
                role: invite.role,
                access: invite.access,
                locationNames: await invites.locationNames(invite.locations),
                note: invite.note,
                expiresAt: invite.expiresAt,
                sampleData: invites.prototype,
                // Per token, so a resend (new token) goes out and a retried request does not.
                idempotencyKey: hashInviteToken(token).slice(0, 32),
            }),
        );
    } catch (error) {
        console.error("[invites] the invite was saved but its email could not be sent", error);
        return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
};

export interface IssueOptions {
    /** `request.nextUrl.origin`. See inviteLink() for the narrow case in which it is used. */
    requestOrigin?: string;
}

/** Every invite, newest first. Admins only. */
export const listInvites = async (actor: User): Promise<{ invites: InviteView[]; prototype: boolean }> => {
    assertCanManage(actor);
    const invites = await store();
    return { invites: await invites.list(), prototype: invites.prototype };
};

/**
 * Creates an invite and returns its token, once. With an email it is also sent to that
 * address; without one the caller gets a link to pass on themselves.
 * `raw` is the untrusted request body; it is validated here.
 */
export const createInvite = async (actor: User, raw: unknown, options: IssueOptions = {}): Promise<IssuedInvite> => {
    assertCanManage(actor);
    const input = parseInviteInput(raw);
    // Its own rule, also enforced by the invite trigger: if inviting is ever opened beyond
    // admins, admin access still cannot be handed out by someone who does not hold it.
    if (input.access === "admin" && !isAdmin(actor)) throw new InviteError("forbidden", 403, "Only an admin can invite an admin.", "access");

    const invites = await store();
    const token = generateInviteToken();
    const invite = await invites.create(input, hashInviteToken(token), actor);
    const url = inviteLink(token, options.requestOrigin);
    return { invite, token, url, email: await deliver(invites, invite, url, token, actor), prototype: invites.prototype };
};

/** Cancels an invite that has not been accepted. Its link stops working at once. */
export const revokeInvite = async (actor: User, id: string): Promise<{ invite: InviteView; prototype: boolean }> => {
    assertCanManage(actor);
    const invites = await store();
    return { invite: await invites.revoke(id, actor), prototype: invites.prototype };
};

/**
 * Issues a new link for an invite that is pending or has expired. The old link stops
 * working, the expiry clock restarts, and an email-bound invite is emailed again.
 * This is also how a lost link is replaced, since the old token cannot be read back.
 */
export const resendInvite = async (actor: User, id: string, options: IssueOptions = {}): Promise<IssuedInvite> => {
    assertCanManage(actor);
    const invites = await store();
    const token = generateInviteToken();
    const invite = await invites.reissue(id, hashInviteToken(token));
    const url = inviteLink(token, options.requestOrigin);
    return { invite, token, url, email: await deliver(invites, invite, url, token, actor), prototype: invites.prototype };
};

/**
 * What the accept screen may show for a link. Public: no sign-in needed.
 *
 * Does the same work whatever it is given: any string up to the length limit is hashed and
 * looked up by that hash, so a well-formed unknown token, a malformed one and a real one
 * cost the same single indexed lookup, and the first two return the same `invalid`. It
 * never takes or looks up an email address, so it cannot be used to find out whether an
 * address has an invite or an account.
 */
export const previewInvite = async (token: unknown): Promise<InvitePreview & { prototype: boolean }> => {
    const invites = await store();
    const preview = await invites.preview(usableToken(token) ? token : "");
    return { ...preview, prototype: invites.prototype };
};

/** Accepts an invite for `identity`, which the caller must have taken from the Clerk session. */
export const acceptInvite = async (token: unknown, identity: AcceptIdentity, options: AcceptOptions = {}): Promise<AcceptResult> => {
    const invites = await store();
    if (!usableToken(token)) return { ok: false, error: "invalid", prototype: invites.prototype };
    return invites.accept(token, identity, options);
};
