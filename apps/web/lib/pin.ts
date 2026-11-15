/**
 * PIN hashing and lockout rules. Server only (uses node:crypto).
 *
 * WHAT THE PIN IS, AND IS NOT
 * The PIN is a convenience lock for shared devices. It answers "which signed-in staff member
 * is holding the phone right now, and have they walked away?". It sits on top of the Clerk
 * session and is NOT a second authentication factor:
 *   - it is four digits, so there are only 10,000 possibilities;
 *   - it gates this app's screens and API routes, not the Clerk session itself. Someone who
 *     holds a valid Clerk session token can still call Supabase directly, and row-level
 *     security there decides what they may do, based on who Clerk says they are.
 * Real protection of the account is Google sign-in (with Google's own 2-step verification)
 * and Clerk's session lifetime. Treat the PIN like a screen lock.
 *
 * WHAT MAKES A 4-DIGIT PIN TOLERABLE
 *   1. Lockout: five wrong attempts lock the PIN for 60 seconds, enforced server-side in the
 *      database, so guessing all 10,000 takes over 30 hours of continuous attempts and
 *      shows up in the audit log.
 *   2. The hash never leaves the server: signed-in users have no SELECT privilege on the PIN
 *      columns (see supabase/migrations/0001_init.sql, section 12).
 *   3. A pepper (PIN_PEPPER, optional): a secret held only in the app's environment is mixed
 *      in before hashing. Without it, anyone who obtained the database could brute-force a
 *      4-digit PIN from its hash in well under a second, scrypt or not. With it they would
 *      also need the app's environment. Changing or removing the pepper invalidates every PIN
 *      (staff simply set a new one).
 */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const PIN_LENGTH = 4;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 60;

/** The only PIN accepted in prototype mode (no Supabase), so the lock screen can be demoed. */
export const PROTOTYPE_PIN = "2580";

// scrypt cost parameters. N=2^15 with r=8 needs 32 MB and roughly 50-100 ms per hash on
// Vercel's Node runtime: slow enough to matter, fast enough for a lock screen.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const FORMAT = "scrypt";

export const isValidPin = (pin: unknown): pin is string => typeof pin === "string" && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

/** PINs that are refused when setting one: the same digit four times, or a straight run. */
export const isWeakPin = (pin: string): boolean => /^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin);

const derive = (secret: Buffer, salt: Buffer, n: number, r: number, p: number, length: number) =>
    new Promise<Buffer>((resolve, reject) => {
        // maxmem must exceed 128 * N * r bytes or Node refuses to run the derivation.
        scrypt(secret, salt, length, { N: n, r, p, maxmem: 256 * n * r }, (error, key) => (error ? reject(error) : resolve(key)));
    });

/** Mixes the optional pepper into the PIN. HMAC keeps the input fixed-length and keyed. */
const prepare = (pin: string, pepper: string | undefined) => (pepper ? createHmac("sha256", pepper).update(pin).digest() : Buffer.from(pin, "utf8"));

/**
 * Hash a PIN with a fresh random salt.
 * Stored format: `scrypt$N$r$p$<salt base64url>$<key base64url>`. The parameters travel with
 * the hash so they can be raised later without invalidating existing PINs.
 */
export const hashPin = async (pin: string, pepper?: string): Promise<string> => {
    if (!isValidPin(pin)) throw new Error(`PIN must be exactly ${PIN_LENGTH} digits`);
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(prepare(pin, pepper), salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH);
    return [FORMAT, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64url"), key.toString("base64url")].join("$");
};

/** Constant-time check of a PIN against a stored hash. Never throws on a malformed hash. */
export const verifyPin = async (pin: string, stored: string | null | undefined, pepper?: string): Promise<boolean> => {
    if (!stored || !isValidPin(pin)) return false;
    const [format, n, r, p, saltPart, keyPart] = stored.split("$");
    if (format !== FORMAT || !saltPart || !keyPart) return false;
    const params = [Number(n), Number(r), Number(p)] as const;
    // Refuse absurd parameters so a corrupted row cannot be used to exhaust memory.
    if (!params.every((x) => Number.isInteger(x) && x > 0) || params[0] > 2 ** 20 || params[1] > 32 || params[2] > 16) return false;
    try {
        const expected = Buffer.from(keyPart, "base64url");
        const actual = await derive(prepare(pin, pepper), Buffer.from(saltPart, "base64url"), params[0], params[1], params[2], expected.length);
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch {
        return false;
    }
};

/** Constant-time string comparison for secrets of any length (hashes both sides first). */
export const safeEqual = (a: string, b: string): boolean => {
    const key = randomBytes(32);
    const ha = createHmac("sha256", key).update(a).digest();
    const hb = createHmac("sha256", key).update(b).digest();
    return timingSafeEqual(ha, hb);
};

// ------------------------------------------------------------------------------------ lockout

export interface PinAttemptState {
    failedAttempts: number;
    lockedUntil: Date | null;
}

/** Seconds left on a lockout, or 0 when the PIN can be tried. */
export const lockRemainingSeconds = (state: PinAttemptState, now = new Date()): number =>
    state.lockedUntil && state.lockedUntil > now ? Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000) : 0;

/**
 * State after a wrong PIN. The fifth consecutive failure starts a 60-second lock and resets
 * the counter, so each lock period buys exactly five more guesses.
 */
export const afterFailure = (state: PinAttemptState, now = new Date()): PinAttemptState => {
    const failedAttempts = state.failedAttempts + 1;
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) return { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_SECONDS * 1000) };
    return { failedAttempts, lockedUntil: null };
};

export const afterSuccess = (): PinAttemptState => ({ failedAttempts: 0, lockedUntil: null });

export const attemptsRemaining = (state: PinAttemptState) => Math.max(0, MAX_FAILED_ATTEMPTS - state.failedAttempts);
