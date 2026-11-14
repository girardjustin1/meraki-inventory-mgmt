/**
 * Typed access to environment variables, and the single switch that decides which
 * integrations are live.
 *
 * The app must run with NO keys set (prototype mode, on the sample data in
 * packages/ui/data/inventory.ts). Every integration checks `isConfigured` and steps aside
 * when its keys are missing: the request proxy passes everything through, the providers
 * render children unwrapped, emails are logged and not sent, and cron routes read sample data.
 *
 * Rules for this file:
 *   - NEXT_PUBLIC_* variables are read with a literal `process.env.NEXT_PUBLIC_X` so Next.js
 *     can inline them into client bundles. Never read them through a dynamic key.
 *   - Server-only secrets are getters, so importing this module from a client component
 *     never evaluates them (they are undefined in the browser anyway).
 *   - Nothing here throws at import time. A missing key means "not configured", not a crash.
 */

const clean = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
};

const publicEnv = {
    clerkPublishableKey: clean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    /** Path of the app's own sign-in page. When unset, Clerk redirects to its hosted Account Portal. */
    clerkSignInUrl: clean(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL),
    supabaseUrl: clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    /** New-style publishable key (sb_publishable_...). The legacy anon key is accepted as a fallback. */
    supabasePublishableKey: clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    /** Public origin of the app, used for links in emails. No trailing slash. */
    appUrl: (clean(process.env.NEXT_PUBLIC_APP_URL) ?? "").replace(/\/+$/, ""),
};

export const env = {
    ...publicEnv,

    // ---- server only -------------------------------------------------------------------
    get clerkSecretKey() {
        return clean(process.env.CLERK_SECRET_KEY);
    },
    /** New-style secret key (sb_secret_...). The legacy service-role key is accepted as a fallback. */
    get supabaseSecretKey() {
        return clean(process.env.SUPABASE_SECRET_KEY) ?? clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    },
    get resendApiKey() {
        return clean(process.env.RESEND_API_KEY);
    },
    /** `Meraki Inventory <inventory@your-verified-domain>` */
    get resendFrom() {
        return clean(process.env.RESEND_FROM);
    },
    get resendReplyTo() {
        return clean(process.env.RESEND_REPLY_TO);
    },
    /** Vercel sends this as `Authorization: Bearer <CRON_SECRET>` on every cron request. */
    get cronSecret() {
        return clean(process.env.CRON_SECRET);
    },
    /** Signs the `pin_ok` cookie. */
    get pinCookieSecret() {
        return clean(process.env.PIN_COOKIE_SECRET);
    },
    /** Optional server-side secret mixed into PIN hashes. See lib/pin.ts. */
    get pinPepper() {
        return clean(process.env.PIN_PEPPER);
    },
    /** Minutes of inactivity before the PIN is asked for again. */
    get pinIdleMinutes() {
        const n = Number(clean(process.env.PIN_IDLE_MINUTES));
        return Number.isFinite(n) && n >= 1 && n <= 24 * 60 ? n : 15;
    },
    /** Absolute URL of a hosted logo for emails. When unset, emails use a text wordmark. */
    get emailLogoUrl() {
        return clean(process.env.EMAIL_LOGO_URL);
    },
    /** Send every email here instead of to the real recipients. For staging and previews. */
    get emailRedirectTo() {
        return clean(process.env.EMAIL_REDIRECT_TO);
    },
    get isProduction() {
        return process.env.NODE_ENV === "production";
    },
};

/**
 * Which integrations have everything they need.
 *
 *   clerk     publishable key + secret key
 *   supabase  project URL + publishable key + secret key. All three: user requests use the
 *             publishable key with the Clerk session token, cron and PIN routes use the secret
 *             key, and half a configuration would fail in confusing ways.
 *   resend    API key + from address
 *
 * `clerk` and `supabase` are computed from literal NEXT_PUBLIC_* reads plus server secrets,
 * so on the client only the public half is visible. Client components should therefore use
 * `isClerkEnabledOnClient` below and not `isConfigured`.
 */
export const isConfigured = {
    get clerk(): boolean {
        return Boolean(publicEnv.clerkPublishableKey && env.clerkSecretKey);
    },
    get supabase(): boolean {
        return Boolean(publicEnv.supabaseUrl && publicEnv.supabasePublishableKey && env.supabaseSecretKey);
    },
    get resend(): boolean {
        return Boolean(env.resendApiKey && env.resendFrom);
    },
};

/** Safe in client components: true when the Clerk publishable key was present at build time. */
export const isClerkEnabledOnClient = Boolean(publicEnv.clerkPublishableKey);

/** True when the app is running on sample data with no backing services. */
export const isPrototypeMode = () => !isConfigured.supabase;

/** Absolute URL for a path in the app. Falls back to the Vercel deployment URL, then localhost. */
export const appUrl = (path = "/"): string => {
    const vercel = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? clean(process.env.VERCEL_URL);
    const origin = publicEnv.appUrl || (vercel ? `https://${vercel}` : "http://localhost:3000");
    return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
};
