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
- Invites, as an admin: `curl -H "x-demo-user: u-owner" http://localhost:3000/api/invites`

The demo user is the Lynnfield manager, who has User access. Admin-only routes rightly refuse them. To act as someone else in prototype mode, send the header `x-demo-user` or set a `demo_user` cookie with an id from `users` in `packages/ui/data/inventory.ts` (`u-owner` is the admin). Both are ignored as soon as Clerk keys are set.

## Setup, in order

Do these in order. Each step needs something from the one before.

### 1. Supabase

1. Create a project. Region: `us-east-1` (N. Virginia) is closest to the salons.
2. Apply `supabase/migrations/0001_init.sql` and `0002_access_and_invites.sql`, then `supabase/seed.sql`, then the generated `supabase/seed-catalog.sql`. The commands are in [`supabase/README.md`](../../supabase/README.md).
3. From **Project Settings > API keys**, copy the project URL, the publishable key and a secret key into `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`.
4. Under **Authentication > Sign In / Providers**, turn off email sign-in. Identity comes from Clerk only.

The Clerk connection (step 2.6 below) needs the Clerk application to exist first.

### 2. Clerk

1. Create an application. For sign-in options choose **Google** and nothing else: turn off email address, phone, username and password.
2. **Google credentials.** A development instance uses Clerk's shared Google credentials and works immediately. A production instance needs your own: create an OAuth client in Google Cloud Console, add the redirect URI Clerk shows you, and paste the client id and secret into Clerk's Google connection.
3. **Leave sign-up open.** Open **User & Authentication > Restrictions** (the page may be labelled Access mode) and keep the sign-up mode on **Open**. Do not choose Invite-only and do not switch on the allowlist: either would stop invited people signing in with Google. Who may use the app is decided by the app's own invites, not by Clerk. A stranger who signs in with Google gets a Clerk account and nothing else; the reasoning is in [`docs/architecture.md`](../../docs/architecture.md), "Clerk and sign-up".
4. **Put the email address in the session token.** Open **Sessions > Customize session token**, paste this into the claims editor and save:

   ```json
   {
     "email": "{{user.primary_email_address}}",
     "email_verified": "{{user.email_verified}}",
     "name": "{{user.full_name}}"
   }
   ```

   Accepting an invite reads the address from the token. Without this, every invite fails with `email_claim_missing` (nothing is written, and the server log says what to fix). Do not invite people from the Clerk dashboard: the app does not read Clerk invitations or Clerk metadata. People are invited in the app; see "Inviting people". The first owner is created with one SQL statement: see `supabase/README.md`.
5. **Session lifetime.** On the **Sessions** page the default maximum lifetime is 7 days and the inactivity timeout is off. For shared salon devices a shorter inactivity timeout (for example 12 hours) is better. Clerk charges for custom session lifetimes on production instances. The PIN lock covers the short-term case either way.
6. **Connect Clerk to Supabase.** Open [dashboard.clerk.com/setup/supabase](https://dashboard.clerk.com/setup/supabase), activate the integration and copy the Clerk domain. In Supabase, go to **Authentication > Sign In / Providers > Third-Party Auth > Add provider > Clerk** and paste it. This is the native integration; it does not use a JWT template.
7. Copy the keys from **API keys** into `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Keep `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` if the app has its own sign-in page at that path; remove it to use Clerk's hosted sign-in page.

Development and production are separate Clerk instances with separate keys, users and domains. Repeat steps 3 to 6 on the production instance.

Optional: set `CLERK_DELETE_UNINVITED_USERS=true` to have the Clerk account of someone who was never invited deleted when they leave the "not invited" page. It never touches anyone who has a profile.

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
   - `NEXT_PUBLIC_APP_URL`: the public address, used for links in emails, including invite links. Set it before inviting anyone.
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
| `lib/auth.ts` | `requireUser()`: who is calling. |
| `lib/permissions.ts` | `requirePermission()`: what they may do. The check every route handler and server action that touches data must make. Built on `packages/ui/engine/permissions.ts`. |
| `lib/profile.ts` | A person's role, access level and locations. Profiles are created only by accepting an invite. |
| `lib/invites.ts`, `app/api/invites/*` | Invites: create, list, revoke, resend, preview, accept. |
| `lib/http.ts` | JSON, error and same-origin conventions shared by the app's API routes. |
| `lib/supabase/server.ts` | Supabase client acting as the signed-in user (Clerk token, row-level security applies). |
| `lib/supabase/admin.ts` | Service-role client. Cron routes, the PIN route, reading the caller's own profile and the invite preview only. |
| `lib/supabase/mappers.ts` | Database rows to the domain types in `packages/ui/data/types.ts`, and back. |
| `lib/state.ts` | `loadState()`: the seam between sample data and Supabase. |
| `lib/pin.ts`, `lib/pin-cookie.ts`, `app/api/pin/route.ts` | PIN lock. |
| `emails/*.tsx`, `lib/email.ts` | Email templates and sending. |
| `lib/digest-job.ts`, `app/api/cron/*` | Scheduled jobs. |
| `app/manifest.ts`, `lib/pwa-metadata.ts`, `public/icons/` | Home-screen install. |

### Protecting routes

`proxy.ts` redirects signed-out visitors before a page renders, but it is the early redirect and not the guarantee. Clerk's guidance since v7 is to check auth next to the data (its `createRouteMatcher` helper is deprecated for that reason). So:

- Every route handler and server action that reads or changes data starts with a permission check next to the data:

  ```ts
  const actor = await requirePermission("orders.create", locationId);
  if (actor instanceof Response) return actor; // 401 not_signed_in, 403 no_profile or 403 forbidden
  ```

  `requireUser()` alone only proves that someone is signed in with Google. It does not prove they were invited.
- Data access for a user goes through `createServerSupabase()`, so Postgres applies row-level security as that person. The database is the last line of defence and does not depend on the proxy.
- Paths the proxy treats as public: `/sign-in`, `/invite/*`, `/api/invites/preview`, `/manifest.webmanifest`, `/api/cron/*` (which check `CRON_SECRET` themselves) and static files.
- A signed-in person with no active profile was never invited, or has had their access removed. The proxy sends them to `/invite/required` (API calls get `403 no_profile`). `/api/invites/accept` is the exception: it needs a session but no profile and no PIN, because it is the call that creates the profile. The proxy remembers a "yes" for a minute, so access that has just been removed can linger in the proxy that long; the database does not wait.

Pages the proxy sends people to, which the app needs to provide: `/sign-in` (Clerk's `<SignIn />`, at `app/sign-in/[[...sign-in]]/page.tsx`), `/lock` (the PIN screen) and `/invite/required` ("you need an invite").

## Inviting people

Nobody signs up. An admin invites them, and the invite decides their role, access level and locations. The API routes below are documented at the top of each file in `app/api/invites/`.

**What an admin does**

1. Opens **Settings > Team** and chooses **Invite**.
2. Picks the role (manager, front desk or technician), the access level (User or Admin) and the locations.
3. Either types the person's Google address, or leaves it empty for an open link.
   - **With an address:** the app emails the invite. Only that Google account can accept it. It lasts 7 days.
   - **Open link:** the app shows a link once. The admin copies it and sends it to the person directly (a text message, in person). Whoever opens it first gets in, so it lasts 48 hours and cannot grant admin access.
4. The link is shown **once**. Only a fingerprint of it is stored, so it cannot be shown again. If it is lost, **Resend** makes a new one and the old one stops working.

**What the invited person sees**

1. They open the link. A page shows who invited them, their role, the locations and any note. No account is needed to see it.
2. They choose **Continue with Google** and sign in.
3. They choose **Accept**. Their access is created at that moment.
4. They pick a four-digit PIN and are in.

If they sign in with a different Google account than the one invited, they are told so and nothing happens. If the link has expired, been used or been cancelled, the page says which, and who to ask.

Someone who signs in with Google without an invite sees a page saying they need one. They cannot see anything else.

**How to revoke**

- **An invite that has not been used:** Settings > Team, then **Revoke** on the invite. The link stops working at once. A revoked invite stays on the list.
- **Someone who already has access:** Settings > Team, then deactivate the person. They see nothing from the next request (the database checks on every query; the proxy may take up to a minute to send them to the "not invited" page). Their history stays in the ledger under their name. To bring them back later, invite them again; they keep the same account.
- An admin cannot deactivate themselves, and the last admin cannot be removed.

Before sending real invites, set `NEXT_PUBLIC_APP_URL` (the links in the email use it) and the session-token claims in Clerk (setup step 2.4). To test the email without reaching anyone, set `EMAIL_REDIRECT_TO`.

In prototype mode the same screens work on sample invites held in the dev server's memory: they vanish on restart, and no invite email is sent.

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
- A forgotten PIN: someone with database access clears `pin_hash` for that person (SQL editor for now), and they set a new one at next unlock.

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
