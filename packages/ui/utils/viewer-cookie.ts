/**
 * Cookie holding the sample person the prototype is being viewed as. Shared by client and server,
 * so no "use client". The API routes read the same cookie (apps/web/lib/auth.ts), so the screens
 * and the API always agree on who is asking.
 */
export const VIEWER_COOKIE = "demo_user";
