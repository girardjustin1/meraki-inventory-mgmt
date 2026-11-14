# Meraki Inventory: web app

Next.js 16 app that renders the screens from `packages/ui` and connects them to Clerk (sign-in), Supabase (database), Resend (email) and Vercel (hosting and cron).

## Prototype mode: it runs with no keys

```bash
npm install          # once, at the repo root
npm run dev          # http://localhost:3000
```

With no environment variables the app runs on the sample data in `packages/ui/data/inventory.ts`. There is no sign-in, nothing is stored and no email is sent. Each integration switches on by itself when its variables are present (`lib/env.ts`):

| Integration | Needs | Without it |
| --- | --- | --- |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | No sign-in. The request proxy passes everything through. |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Sample data. The PIN is `2580`. |
| Resend | `RESEND_API_KEY`, `RESEND_FROM` | Emails are logged as skipped, not sent. |

Every variable is listed with a one-line description in `.env.example`. Copy it to `.env.local` for local work.

Useful previews, no keys needed:

- Digest email: <http://localhost:3000/api/cron/digest?period=weekly&dryRun=1>
- Flag scan: <http://localhost:3000/api/cron/flags?dryRun=1>

## Setup, in order

Do these in order. Each step needs something from the one before.

### 1. Supabase

1. Create a project. Region: `us-east-1` (N. Virginia) is closest to the salons.
2. Apply `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`, then the generated `supabase/seed-catalog.sql`. The commands are in [`supabase/README.md`](../../supabase/README.md).
3. From **Project Settings > API keys**, copy the project URL, the publishable key and a secret key into `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`.
4. Under **Authentication > Sign In / Providers**, turn off email sign-in. Identity comes from Clerk only.

The Clerk connection (step 2.6 below) needs the Clerk application to exist first.

### 2. Clerk

1. Create an application. For sign-in options choose **Google** and nothing else: turn off email address, phone, username and password.
2. **Google credentials.** A development instance uses Clerk's shared Google credentials and works immediately. A production instance needs your own: create an OAuth client in Google Cloud Console, add the redirect URI Clerk shows you, and paste the client id and secret into Clerk's Google connection.
3. **Restrict who can sign up.** Open **User & Authentication > Access mode** (the page may be labelled Restrictions) and choose **Invite-only**. Only people you invite can create an account; a stranger with a Google account gets nowhere. The alternative is an allowlist of your email domain, which Clerk charges for on production instances.
4. **Invite staff with their role.** On **Users > Invitations**, invite each person by the Google address they will sign in with, and set the invitation's public metadata:

   ```json
   { "role": "front_desk", "locations": ["lynnfield"] }
   ```

   Roles: `owner`, `manager`, `front_desk`, `technician`. Locations: `lynnfield`, `newburyport`. Owners need no locations. On first sign-in the app creates the person's profile from this (`lib/profile.ts`). After that, roles and locations are changed in the app, and Clerk's metadata is not read again. Someone who signs in without metadata is created inactive and sees nothing until an owner activates them. The first owner is created with one SQL statement: see `supabase/README.md`.
5. **Session lifetime.** On the **Sessions** page the default maximum lifetime is 7 days and the inactivity timeout is off. For shared salon devices a shorter inactivity timeout (for example 12 hours) is better. Clerk charges for custom session lifetimes on production instances. The PIN lock covers the short-term case either way.
6. **Connect Clerk to Supabase.** Open [dashboard.clerk.com/setup/supabase](https://dashboard.clerk.com/setup/supabase), activate the integration and copy the Clerk domain. In Supabase, go to **Authentication > Sign In / Providers > Third-Party Auth > Add provider > Clerk** and paste it. This is the native integration; it does not use a JWT template.
7. Copy the keys from **API keys** into `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Keep `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` if the app has its own sign-in page at that path; remove it to use Clerk's hosted sign-in page.

Development and production are separate Clerk instances with separate keys, users and domains. Repeat steps 3 to 6 on the production instance.

### 3. Resend

1. Add a sending domain under **Domains** (a subdomain such as `mail.yourdomain.com` keeps it apart from normal mail) and add the DNS records Resend lists. Wait until it shows as verified.
2. Create an API key with sending access. Set `RESEND_API_KEY`.
3. Set `RESEND_FROM` to an address on the verified domain, for example `Meraki Inventory <inventory@mail.yourdomain.com>`. Optionally set `RESEND_REPLY_TO` to a real inbox.

Before go-live, set `EMAIL_REDIRECT_TO` to your own address. Every email then goes to you instead of to staff, with `[redirected]` in the subject. Remove it when you are happy.

### 4. Vercel

1. Import the repository. Set **Root Directory** to `apps/web`. Leave "Include files outside the Root Directory" on (the app imports `packages/ui`). Framework preset: Next.js. Install and build commands: defaults.
2. Add every variable from `.env.example` under **Settings > Environment Variables**. Generate the two secrets with `openssl rand -base64 32`:
   - `CRON_SECRET`: Vercel sends it to the cron routes as `Authorization: Bearer ...`.
   - `PIN_COOKIE_SECRET`: signs the PIN cookie. If it is missing in production the PIN lock is off.
   - `PIN_PEPPER` (recommended): see "PIN lock" below.
   - `NEXT_PUBLIC_APP_URL`: the public address, used for links in emails.
3. Deploy. The cron jobs in `vercel.json` are registered on the production deployment only; preview deployments do not run them.

| Job | Path | Schedule (UTC) | Eastern time |
| --- | --- | --- | --- |
| Flag scan | `/api/cron/flags` | `0 10 * * *` daily | 5:00 AM winter, 6:00 AM summer |
| Weekly digest | `/api/cron/digest/weekly` | `0 12 * * 1` Mondays | 7:00 AM winter, 8:00 AM summer |
| Monthly digest | `/api/cron/digest/monthly` | `0 12 1 * *` the 1st | 7:00 AM winter, 8:00 AM summer |

Things to know about Vercel cron:

- **Schedules are in UTC and do not follow daylight saving.** 12:00 UTC is 7:00 AM Eastern from November to March and 8:00 AM from March to November. To hold 7:00 AM in summer, change the hour to `11` in March and back to `12` in November, or accept the one-hour drift.
- On the Hobby plan a job can run at most once a day and may start any time within its hour. All three jobs fit, but "7:00" means "between 7:00 and 7:59".
- The flag scan runs two hours before the digest so the digest includes that morning's flags.
- Vercel can deliver the same cron event twice. The digest route checks `digest_runs` and uses a Resend idempotency key, so a second delivery sends nothing.
- Vercel now describes `crons` as a legacy feature that will move to Schedules. `crons` works today. When migrating, move each entry to `schedules` with `"requestMethod": "GET"` and delete the `crons` entry in the same change, or the job runs twice.

## Files to know

| File | Purpose |
| --- | --- |
| `lib/env.ts` | Typed environment access and `isConfigured.{clerk,supabase,resend}`. |
| `proxy.ts` | Next.js 16 request proxy (formerly `middleware.ts`). Sign-in redirect and PIN lock. A pass-through with no Clerk keys. |
| `app/providers.tsx` | Wraps the app in `ClerkProvider` only when Clerk is configured. |
| `lib/auth.ts` | `requireUser()`: the auth check every route handler and server action must make. |
| `lib/supabase/server.ts` | Supabase client acting as the signed-in user (Clerk token, row-level security applies). |
| `lib/supabase/admin.ts` | Service-role client. Cron routes, the PIN route and profile creation only. |
| `lib/supabase/mappers.ts` | Database rows to the domain types in `packages/ui/data/types.ts`, and back. |
| `lib/state.ts` | `loadState()`: the seam between sample data and Supabase. |
| `lib/pin.ts`, `lib/pin-cookie.ts`, `app/api/pin/route.ts` | PIN lock. |
| `emails/*.tsx`, `lib/email.ts` | Email templates and sending. |
| `lib/digest-job.ts`, `app/api/cron/*` | Scheduled jobs. |
| `app/manifest.ts`, `lib/pwa-metadata.ts`, `public/icons/` | Home-screen install. |

### Protecting routes

`proxy.ts` redirects signed-out visitors before a page renders, but it is the early redirect and not the guarantee. Clerk's guidance since v7 is to check auth next to the data (its `createRouteMatcher` helper is deprecated for that reason). So:

- Every route handler and server action that reads or changes data starts with `const user = await requireUser(); if (user instanceof Response) return user;`.
- Data access for a user goes through `createServerSupabase()`, so Postgres applies row-level security as that person. The database is the last line of defence and does not depend on the proxy.
- Paths the proxy treats as public: `/sign-in`, `/manifest.webmanifest`, `/api/cron/*` (which check `CRON_SECRET` themselves) and static files.

Pages the proxy sends people to, which the app needs to provide: `/sign-in` (Clerk's `<SignIn />`, at `app/sign-in/[[...sign-in]]/page.tsx`) and `/lock` (the PIN screen).

## PIN lock

Staff share devices. The PIN lets one person hand the phone to another without signing out of Google, and locks the app when it is left idle.

**What it is not.** The PIN is a convenience lock on top of the Clerk session. It is not a second authentication factor. It is four digits, and it gates this app's screens and API routes, not the Clerk session itself: someone holding a valid Clerk session can still talk to Supabase directly, where row-level security decides what that signed-in person may do. Account security is Google sign-in (with Google's 2-step verification) plus Clerk's session lifetime. Treat the PIN like a phone's screen lock.

How it works:

1. After Google sign-in, the proxy looks for a `pin_ok` cookie. Without a valid one, pages redirect to `/lock?next=<path>` and API calls get `423`. The lock screen should send the person on to `next` after unlocking, and only if it is a relative path starting with a single `/`.
2. `/lock` posts the PIN to `POST /api/pin` with `{ "action": "verify", "pin": "1234" }`. If the person has no PIN yet (`GET /api/pin` returns `hasPin: false`), it posts `{ "action": "set", "pin": "..." }` instead.
3. On success the server sets `pin_ok`: httpOnly, signed with `PIN_COOKIE_SECRET` (HMAC-SHA256), bound to the Clerk user and session, valid for 15 minutes.
4. Every request that passes the check gets a fresh cookie, so the 15 minutes count from the last activity. `PIN_IDLE_MINUTES` changes the window.
5. "Lock now" calls `DELETE /api/pin`. Signing out of Clerk also invalidates the cookie, because it is bound to the session.

Protections:

- The PIN is stored only as a salted scrypt hash in `profiles.pin_hash`. Signed-in users cannot read that column; only the server can.
- Five wrong attempts lock the PIN for 60 seconds. The count is kept in the database and written before the PIN is checked, so parallel guesses cannot get around it.
- `PIN_PEPPER` mixes a server-side secret into the hash. Without it, a copy of the database is enough to recover any 4-digit PIN in under a second. With it, the attacker also needs the app's environment. Changing the pepper invalidates all PINs; staff set new ones.
- Changing a PIN requires the current PIN or a still-valid unlock.
- A forgotten PIN: an owner clears `pin_hash` for that person (SQL editor for now), and they set a new one at next unlock.

In prototype mode nothing is stored and the only PIN accepted is `2580`.

## Digests and alerts

- **Weekly digest**, Mondays: low and out-of-stock supplies, open flags, order lines not received, what to order this week, vendor performance. Sent to the roles in the `weekly-digest` notification rule (owners and managers) for each location.
- **Monthly digest**, the 1st: the same over 30 days. Rule `monthly-digest` (owners).
- **Flag alert**, from the daily scan: one email per new high-severity flag, to the `high-flag` rule (owners and managers of that location). The first scan on an empty database stores what it finds and sends nothing, and a run sends at most 10 alerts, so importing a backlog cannot flood anyone.

The numbers come from `buildDigest()` and `detectFlags()` in `packages/ui/engine`. The email template only lays them out, so the email and the in-app digest cannot disagree.

Preview and test:

```bash
# render only: no email, no database write
curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/digest?period=weekly&dryRun=1" > digest.html
curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/digest?period=weekly&dryRun=1&location=newburyport&format=json"
curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/flags?dryRun=1"

# real run, by hand
curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/digest/weekly"
```

Locally with no `CRON_SECRET` set, `dryRun=1` requests are allowed without the header. Anything else is refused.

Sample data is never emailed: in prototype mode a real run reports `skipped` unless `EMAIL_REDIRECT_TO` is set.

`lib/state-supabase.ts`, which reads the live data for these jobs, is type-checked but has not run against a real project. Make the first live call a `dryRun=1` and read the result before trusting the schedule.

## Install on an iPhone

1. Open the app's address in **Safari** (not Chrome; only Safari can add to the Home Screen on older iOS versions, and it is the reliable path on all of them).
2. Tap **Share**, then **Add to Home Screen**, then **Add**. The icon is the Meraki swan and the label is "Inventory".
3. Open it from the Home Screen. It runs full screen, without Safari's toolbars.
4. Sign in with Google inside the installed app. A Home Screen app keeps its own cookies, separate from Safari, so being signed in in Safari does not carry over.

Camera and the barcode scanner:

- **HTTPS is required.** Browsers only allow camera access on secure pages. The Vercel address works. `http://192.168.x.x:3000` from a phone on the same Wi-Fi does not; to test on a phone during development use a Vercel preview deployment or an HTTPS tunnel. (`http://localhost` counts as secure, but only on the computer itself.)
- The first scan asks "Allow Inventory to use the camera?". Tap **Allow**. iOS can ask again after the app has been closed for a while; that is iOS behaviour for Home Screen apps and not a fault.
- If someone tapped Don't Allow and the prompt does not come back, remove the Home Screen icon and add it again. That clears the installed app's saved permissions (and its sign-in).
- iOS Safari has no built-in barcode reader, so the scanner uses the `barcode-detector` polyfill from `packages/ui`. It needs decent light and takes a moment longer than a dedicated scanner.

Layout note for screen authors: the viewport uses `viewport-fit=cover`, so pages draw under the notch and the home indicator. Pad fixed headers and bottom bars with `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.

**No service worker, on purpose.** This version is online-only. Counts and receipts are written straight to the ledger, and replaying them later from an offline queue needs rules for conflicts (the same shelf counted twice while offline, a receipt against an order that was cancelled meanwhile). That is its own piece of design. Offline counting is a later milestone. iOS does not need a service worker for Add to Home Screen.

Regenerate the icons after a logo change with `node tools/icons/build-icons.mjs`.

## Checks

```bash
npm run type-check -w @meraki/inventory-web
npm run build -w @meraki/inventory-web
```
