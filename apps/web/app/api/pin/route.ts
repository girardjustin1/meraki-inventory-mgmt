/**
 * PIN lock API.
 *
 *   GET    /api/pin                                  -> { hasPin, unlocked, lockedForSeconds, idleMinutes, prototype }
 *   POST   /api/pin  { action: "verify", pin }        -> unlocks: sets the `pin_ok` cookie
 *   POST   /api/pin  { action: "set", pin, currentPin? } -> sets or changes the PIN, then unlocks
 *   DELETE /api/pin                                  -> "Lock now": clears the cookie
 *
 * The PIN is a convenience lock on top of the Clerk session, not a second authentication
 * factor. See lib/pin.ts for what it does and does not protect.
 *
 * Storage: the hash and lockout counters live in `profiles` and are read and written with
 * the service-role client, because signed-in users have no privilege on those columns. The
 * caller is always identified by Clerk first; the service role is only ever pointed at the
 * caller's own row.
 *
 * Prototype mode (no Supabase): nothing is stored and the only PIN accepted is 2580, so the
 * lock screen can be demoed end to end.
 */
import type { NextRequest, NextResponse } from "next/server";
import { type RequestUser, requireUser } from "~/lib/auth";
import { env, isConfigured } from "~/lib/env";
import { isSameOrigin, json } from "~/lib/http";
import {
    LOCKOUT_SECONDS,
    type PinAttemptState,
    PROTOTYPE_PIN,
    afterFailure,
    afterSuccess,
    attemptsRemaining,
    hashPin,
    isValidPin,
    isWeakPin,
    lockRemainingSeconds,
    safeEqual,
    verifyPin,
} from "~/lib/pin";
import { PIN_COOKIE_NAME, pinCookieOptions, pinCookieSecret, signPinCookie, verifyPinCookie } from "~/lib/pin-cookie";
import { getProfile } from "~/lib/profile";
import { getAdminSupabase } from "~/lib/supabase/admin";

export const runtime = "nodejs"; // lib/pin.ts uses node:crypto scrypt
export const dynamic = "force-dynamic";

// ------------------------------------------------------------------------------------ storage

interface PinRecord extends PinAttemptState {
    hash: string | null;
}

interface PinStore {
    prototype: boolean;
    load(): Promise<PinRecord | null>;
    /**
     * Record the outcome of an attempt. `expectedFailedAttempts` makes the write conditional
     * on nobody else having changed the counter since it was read (compare-and-swap), so
     * firing many guesses in parallel cannot slip past the lockout. Returns false when the
     * write lost that race.
     */
    saveAttempt(next: PinAttemptState, expectedFailedAttempts: number): Promise<boolean>;
    saveHash(hash: string): Promise<void>;
}

/** Prototype mode: attempts are counted in memory so the lockout can be demoed too. */
const prototypeAttempts = new Map<string, PinAttemptState>();

const prototypeStore = (userId: string): PinStore => ({
    prototype: true,
    load: async () => ({ hash: "prototype", ...(prototypeAttempts.get(userId) ?? afterSuccess()) }),
    saveAttempt: async (next) => {
        prototypeAttempts.set(userId, next);
        return true;
    },
    saveHash: async () => undefined,
});

const supabaseStore = (userId: string): PinStore => {
    const admin = getAdminSupabase();
    if (!admin) throw new Error("Supabase is not configured");
    return {
        prototype: false,
        load: async () => {
            // No profile, or access removed: there is no PIN to check. Profiles are created
            // only by accepting an invite (lib/invites.ts).
            if (!(await getProfile(userId))?.active) return null;
            const { data, error } = await admin
                .from("profiles")
                .select("pin_hash, failed_pin_attempts, pin_locked_until")
                .eq("id", userId)
                .maybeSingle<{ pin_hash: string | null; failed_pin_attempts: number; pin_locked_until: string | null }>();
            if (error) throw new Error(`Could not read PIN state: ${error.message}`);
            if (!data) return null;
            return { hash: data.pin_hash, failedAttempts: data.failed_pin_attempts, lockedUntil: data.pin_locked_until ? new Date(data.pin_locked_until) : null };
        },
        saveAttempt: async (next, expectedFailedAttempts) => {
            const { data, error } = await admin
                .from("profiles")
                .update({ failed_pin_attempts: next.failedAttempts, pin_locked_until: next.lockedUntil?.toISOString() ?? null })
                .eq("id", userId)
                .eq("failed_pin_attempts", expectedFailedAttempts)
                .select("id");
            if (error) throw new Error(`Could not record PIN attempt: ${error.message}`);
            return (data?.length ?? 0) === 1;
        },
        saveHash: async (hash) => {
            const { error } = await admin
                .from("profiles")
                .update({ pin_hash: hash, pin_updated_at: new Date().toISOString(), failed_pin_attempts: 0, pin_locked_until: null })
                .eq("id", userId);
            if (error) throw new Error(`Could not save PIN: ${error.message}`);
        },
    };
};

const storeFor = (user: RequestUser): PinStore => (isConfigured.supabase && !user.isPrototype ? supabaseStore(user.userId) : prototypeStore(user.userId));

const subjectOf = (user: RequestUser) => ({ userId: user.userId, sessionId: user.sessionId ?? "prototype" });

// ------------------------------------------------------------------------------------ checks

type AttemptResult = { ok: true } | { ok: false; response: NextResponse };

/**
 * One guarded PIN attempt:
 *   1. refuse while locked out
 *   2. record the attempt as a failure BEFORE checking it (conditional write)
 *   3. check the PIN; on success, clear the counter
 * Counting first means a crash or a parallel request can only ever make the lockout
 * stricter, never looser.
 */
const attempt = async (store: PinStore, record: PinRecord, pin: string): Promise<AttemptResult> => {
    const remaining = lockRemainingSeconds(record);
    if (remaining > 0) {
        return { ok: false, response: json({ ok: false, error: "locked_out", retryAfterSeconds: remaining }, 429, { "Retry-After": String(remaining) }) };
    }

    const failed = afterFailure(record);
    if (!(await store.saveAttempt(failed, record.failedAttempts))) {
        return { ok: false, response: json({ ok: false, error: "try_again", retryAfterSeconds: 1 }, 429, { "Retry-After": "1" }) };
    }

    const correct = store.prototype ? safeEqual(pin, PROTOTYPE_PIN) : await verifyPin(pin, record.hash, env.pinPepper);
    if (!correct) {
        if (failed.lockedUntil) {
            return {
                ok: false,
                response: json({ ok: false, error: "locked_out", retryAfterSeconds: LOCKOUT_SECONDS }, 429, { "Retry-After": String(LOCKOUT_SECONDS) }),
            };
        }
        return { ok: false, response: json({ ok: false, error: "wrong_pin", attemptsRemaining: attemptsRemaining(failed) }, 401) };
    }

    // The conditional write above moved the counter to `failed.failedAttempts`; clear it from there.
    await store.saveAttempt(afterSuccess(), failed.failedAttempts);
    return { ok: true };
};

const unlocked = async (user: RequestUser, body: Record<string, unknown>) => {
    const secret = pinCookieSecret();
    if (!secret) return json({ ok: false, error: "pin_lock_not_configured" }, 503);
    const response = json({ ok: true, ...body });
    response.cookies.set(PIN_COOKIE_NAME, await signPinCookie(subjectOf(user), secret), pinCookieOptions());
    return response;
};

// ------------------------------------------------------------------------------------ handlers

export async function GET(request: NextRequest) {
    const user = await requireUser();
    if (user instanceof Response) return user;

    const store = storeFor(user);
    const record = await store.load();
    const secret = pinCookieSecret();
    const isUnlocked = secret ? await verifyPinCookie(request.cookies.get(PIN_COOKIE_NAME)?.value, subjectOf(user), secret) : false;

    return json({
        hasPin: Boolean(record?.hash),
        unlocked: isUnlocked,
        lockedForSeconds: record ? lockRemainingSeconds(record) : 0,
        idleMinutes: env.pinIdleMinutes,
        prototype: store.prototype,
    });
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ ok: false, error: "bad_origin" }, 403);

    const user = await requireUser();
    if (user instanceof Response) return user;

    let body: { action?: unknown; pin?: unknown; currentPin?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return json({ ok: false, error: "invalid_json" }, 400);
    }
    if (body.action !== "verify" && body.action !== "set") return json({ ok: false, error: "unknown_action" }, 400);
    if (!isValidPin(body.pin)) return json({ ok: false, error: "invalid_pin", message: "The PIN is four digits." }, 400);

    const store = storeFor(user);
    const record = await store.load();
    if (!record) return json({ ok: false, error: "no_profile", message: "You have not been invited yet, or your access was removed. Ask an admin for an invite." }, 403);

    // ---- verify -----------------------------------------------------------------------
    if (body.action === "verify") {
        if (!record.hash) return json({ ok: false, error: "no_pin_set" }, 409);
        const result = await attempt(store, record, body.pin);
        return result.ok ? unlocked(user, { prototype: store.prototype }) : result.response;
    }

    // ---- set --------------------------------------------------------------------------
    if (isWeakPin(body.pin)) {
        return json({ ok: false, error: "weak_pin", message: "Choose a PIN that is not a repeated digit or a straight run like 1234." }, 400);
    }

    // Changing an existing PIN needs proof the caller knows the current one: either the
    // current PIN in the body, or a still-valid unlock cookie. Otherwise anyone who picks up
    // an unlocked-but-idle device could replace the owner's PIN.
    if (record.hash && !store.prototype) {
        const secret = pinCookieSecret();
        const hasValidCookie = secret ? await verifyPinCookie(request.cookies.get(PIN_COOKIE_NAME)?.value, subjectOf(user), secret) : false;
        if (!hasValidCookie) {
            if (!isValidPin(body.currentPin)) return json({ ok: false, error: "current_pin_required" }, 401);
            const result = await attempt(store, record, body.currentPin);
            if (!result.ok) return result.response;
        }
    }

    if (!store.prototype) await store.saveHash(await hashPin(body.pin, env.pinPepper));
    // In prototype mode nothing is stored: the PIN stays 2580 whatever was "set".
    return unlocked(user, { prototype: store.prototype, ...(store.prototype ? { message: `Prototype mode: the PIN is not saved. Use ${PROTOTYPE_PIN}.` } : {}) });
}

export async function DELETE(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ ok: false, error: "bad_origin" }, 403);

    const user = await requireUser();
    if (user instanceof Response) return user;

    const response = json({ ok: true, locked: true });
    response.cookies.set(PIN_COOKIE_NAME, "", { ...pinCookieOptions(), maxAge: 0 });
    return response;
}
