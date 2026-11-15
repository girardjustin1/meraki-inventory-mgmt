# Architecture

Meraki Inventory is an internal app for two salons (Lynnfield, Newburyport). Staff count stock, order, receive and log usage on desktop and on iPhones added to the Home Screen. Owners and managers get a weekly and a monthly digest by email.

## The pieces

```
  iPhone (Home Screen app) / desktop browser
        |
        |  HTTPS
        v
+--------------------------------------------------------------+
|  Vercel                                                      |
|                                                              |
|  proxy.ts            signed in? (Clerk)  PIN entered?        |
|       |                                                      |
|       v                                                      |
|  Next.js 16 app      screens from packages/ui                |
|   apps/web           route handlers, server actions          |
|       |                                                      |
|       |   engine (packages/ui/engine): pure functions        |
|       |   forecast, flags, digest, stock status              |
|       |                                                      |
|  Vercel Cron  --->  /api/cron/flags      daily               |
|                     /api/cron/digest/*   weekly, monthly     |
+-------|-------------------------|--------------------|-------+
        |                         |                    |
        v                         v                    v
  +-----------+            +-------------+       +-----------+
  |   Clerk   |  session   |  Supabase   |       |  Resend   |
  |  Google   |  token --> |  Postgres   |       |  email    |
  |  sign-in  |  verified  |  + RLS      |       |           |
  +-----------+  by        +-------------+       +-----------+
                 Supabase
```

| Piece | Job | Where |
| --- | --- | --- |
| Next.js on Vercel | Renders screens, runs server code and scheduled jobs. | `apps/web` |
| Design system and screens | Components, screens, the domain types. | `packages/ui` |
| Engine | Forecasts, flags, digests, stock status. Pure TypeScript: no I/O, no React. The same code runs in Storybook, in the app and in cron. | `packages/ui/engine` |
| Clerk | Who you are. Google sign-in, and nothing else: Clerk does not decide who may use the app. | `proxy.ts`, `app/providers.tsx`, `lib/auth.ts` |
| Supabase | What is true, and what you may do. Postgres with row-level security. Also who was invited. | `supabase/`, `lib/supabase/`, `lib/invites.ts` |
| Resend | Digest and alert emails, rendered with React Email. | `emails/`, `lib/email.ts` |
| Vercel Cron | Runs the flag scan daily and the digests weekly and monthly. | `vercel.json`, `app/api/cron/` |

Clerk and Supabase are joined by Supabase's third-party auth: the app sends the Clerk session token with each database request, Supabase verifies it against Clerk's keys, and policies read the Clerk user id from `auth.jwt()`. There is no second user table to keep in sync beyond `profiles`, which holds each person's role, access level and locations. A `profiles` row is created in exactly one way: by accepting an invite (see "Invites").

## The ledger principle

**Every change to stock is one append-only row in `stock_movements`**: who, when, which item, where, how much, and why (a reason code). Nothing in the ledger is edited or deleted. A mistake is fixed with a new, correcting row.

Everything else is derived from it:

```
stock_movements  (append-only)
      |
      +--> stock_levels.on_hand     running total, kept by a trigger in the same transaction
      +--> usage per item           -> forecasts, reorder points, suggested orders
      +--> variances, write-offs    -> flags
      +--> all of the above         -> digests
```

Why it matters: an on-hand number that anyone can type over tells you nothing about how it got that way. A ledger shows the receipt, the usage, the count and the write-off, each with a name on it. That is what makes a missing box a question with an answer.

How it is enforced in the database (`supabase/migrations/0001_init.sql`; access levels and invites are in `0002_access_and_invites.sql`):

- Signed-in users have no privilege to update `on_hand`. Inserting a movement is the only way to change stock.
- `stock_movements` and `audit_log` refuse UPDATE, DELETE and TRUNCATE, by privilege and by trigger.
- A reason is required and must fit the movement type. Adjustments of 3 or more units need a note.
- `user_id` and `occurred_at` are stamped from the session token, so nobody writes a movement as someone else or back-dates one.

Changes that are not stock (orders, counts, flags, items, costs, par levels, roles, access levels, invites, settings) are recorded in `audit_log` by trigger.

## Access levels and roles

Two things decide what a person can do. The rules are written once, in `packages/ui/engine/permissions.ts`, and mirrored in the database.

**Access level** is either Admin or User.

| Access | Means |
| --- | --- |
| Admin | Everything, at every location: stock, orders, approvals, costs, flags, the team, invites and settings. An admin's role does not limit them. |
| User | What their role grants, at the locations they are assigned to. |

**Role** is the job: owner, manager, front desk or technician. For a User it decides the permissions:

| Role | A User with this role can | And cannot |
| --- | --- | --- |
| Manager | See and count stock, log usage, adjust and transfer stock, schedule and approve counts, build and place orders, receive deliveries, see and resolve flags, see costs, reports, digests and the activity log. Own locations only. | Approve an order (that takes an admin). Manage the team, invites or settings. See another location. |
| Front desk | See and count stock, log usage, see orders, receive deliveries. | See costs or flags. Adjust stock. Build or approve orders. |
| Technician | See and count stock, log usage. | See orders, costs or flags. Receive. Adjust. |
| Owner | Owners are always admins. | |

Things worth knowing about this model:

- **Approving an order takes an admin.** No role grants it. A manager builds an order and submits it; an admin who did not build it approves it; the manager can then place it. This is stricter than the first version of the schema, where a second manager could approve.
- **Vendors, flag thresholds, notification rules and location names are settings**, so only admins change them. Managers could add vendors in the first version of the schema.
- **An admin does not need location assignments.** `locations.all` is part of being an admin.
- **Any person can be made an admin by an existing admin.** Ownership is different: it is given with one SQL statement by someone with database access, and an owner cannot be invited by link.

How it is enforced (`supabase/migrations/0002_access_and_invites.sql`):

- `profiles.access_level` holds the level. A constraint and a trigger keep owners at admin.
- `app.can('<permission>')` answers "admin, or does their role grant this?" from a copy of `ROLE_GRANTS`. `npm run test:db` reads `permissions.ts` and fails if the database's copy differs from it.
- Each permission maps to a policy or a trigger; the table is in a comment at the top of section 6 of the migration and in `supabase/README.md`.
- Server code asks the same question with `requirePermission()` in `apps/web/lib/permissions.ts`, next to the data, and returns 403 when the answer is no. The screens hide what a person cannot do. The database is the layer that holds if the other two are wrong.

Guard rails on the model itself, all in the database:

| Rule | Why |
| --- | --- |
| Nobody changes their own role or access level, or deactivates themselves. | Nobody quietly re-grants themselves access, and nobody locks themselves out by accident. |
| Only an admin changes anyone's role, access level, active flag or locations. | |
| The last active admin cannot be demoted, deactivated or deleted, by anyone, including the server and the SQL editor. | Without an admin nobody could invite people or change roles again. |
| An owner cannot be made a User while they are an owner. | Owners are always admins. |

Roles, access levels and locations live in `profiles` and `profile_locations`. The rules above are row-level security policies, CHECK constraints and triggers, so they hold for every client, not only for this app's screens.

**Separation of duties** is the control underneath: ordering, approving, receiving and counting the same stock should take more than one person, so a loss needs two people to hide. The database refuses the self-dealing cases outright (approve your own order, receive your own order, approve your own count, close a flag about yourself). **These rules bind admins exactly as they bind everyone else.** Admin means "may do this kind of thing anywhere", not "may check their own work". Two practical consequences: an order built by an admin needs a second admin to approve it, so the business needs at least two admins if admins build orders; and each location needs someone other than the counter who can approve a count.

**The PIN** identifies which signed-in staff member is holding a shared device and locks the app when idle. It is a convenience lock on top of the Clerk session, not a second authentication factor. Details in `apps/web/README.md`.

## Invites

An invite is the only way in. Nobody signs up; an admin invites them.

| Kind | Who can accept | Valid for | How it reaches the person |
| --- | --- | --- | --- |
| By email | Only the Google account with that address | Up to 7 days | The app emails it |
| Open link | Whoever holds the link, once | Up to 48 hours | The admin copies it and sends it themselves |

Each invite carries a role, an access level and locations. Accepting it creates the person's profile with exactly those. An open link can only grant User access; admin access is given to a named Google account.

```
1. CREATE    An admin fills in the invite (Settings > Team).
             POST /api/invites
             The server makes a random token, stores ONLY its SHA-256 hash, and returns
             the link once. An email invite is also emailed.            status: pending
                   |
2. OPEN      The person opens /invite/<token>. No account needed.
             GET /api/invites/preview?token=...
             Shows who invited them, the role, access, locations and note.
                   |
3. SIGN IN   "Continue with Google". Clerk creates their account and returns them to
             /invite/<token>, now signed in.
                   |
4. ACCEPT    POST /api/invites/accept  { token }
             The database function accept_invite() runs as that person, in one transaction:
               - locks the invite row
               - checks it is pending, and for an email invite that the Google account's
                 address matches
               - creates the profile and its locations from what the invite grants
               - marks the invite accepted
               - the audit triggers record all three                    status: accepted
                   |
5. PIN       They are sent to /lock to choose a PIN, then into the app.
```

Other ways an invite ends:

- **Expired.** Nothing happens to the row; its status is worked out from the clock. An admin can resend it.
- **Revoked.** An admin cancels it (`DELETE /api/invites/<id>`). The link stops working at once. Final.
- **Resent.** `POST /api/invites/<id>` gives the same invite a new token and a fresh expiry. The old link stops working, because its hash is no longer on file. This is also how a lost link is replaced: the old one cannot be read back.

What an invite is for and what it grants never change after it is created. To change them, revoke it and send a new one.

Rules the database holds (`invites` table, its trigger and constraints):

- One pending invite per email address.
- An open link cannot outlive 48 hours, an email invite 7 days.
- The owner role cannot be invited.
- An open link cannot grant admin access.
- A User invite needs at least one location.
- Someone who already has access cannot be invited, and cannot accept: an existing member who opens someone else's link keeps exactly the access they had.
- Only admins create, read, revoke and resend invites. A non-admin cannot create an admin invite; that is a separate rule from "only admins invite", so it still holds if inviting is ever opened to managers.
- A former member (deactivated profile) who accepts a new invite is switched back on with what the new invite grants, not what they used to have.

### Clerk and sign-up

Sign-in is Google only, through Clerk. The question was how to make "only invited people may join" true. Two designs were weighed.

**(a) Clerk's own invitations, with Clerk's sign-up set to invite-only.** Clerk emails a link carrying a ticket; only ticket holders can sign up. Rejected as the main design, for three reasons:

1. *It cannot do open links.* A Clerk invitation is for one email address (`emailAddress` is required). An open link has no address until someone uses it. In invite-only mode Clerk refuses a Google sign-up that has no invitation, so there is no moment at which an unknown person could prove their address.
2. *It puts access in two places.* The role and locations would ride in Clerk metadata and be copied into the database at first sign-in. Then Clerk and the database can disagree, and a change in the Clerk dashboard changes who can see stock. The first version of this app worked that way; it is gone.
3. *The ticket is not Google sign-in.* A ticket creates the account from the emailed link. On a Google-only instance the person would be signed in without ever going through Google, and the Google account would be attached the next time they signed in. That is how the published component source reads; it was not run, so treat it as **not confirmed**. Either way it is a second path into an app whose rule is "Google only".

**(b) The app's own invites, with acceptance enforced in the database. This is what is built.**

- Clerk's sign-up mode stays **Open**. Clerk answers one question: which Google account is this?
- Being signed in gets a person nothing. Every policy in the database needs an active `profiles` row, and the only thing that creates one is `accept_invite()`, which needs a valid invite. A stranger who signs in with Google has a Clerk account and no profile: they see no data, the proxy sends them to `/invite/required`, and the API answers `403 no_profile`.
- Email invites and open links take the same path. The only difference is one comparison inside `accept_invite()`: an email invite checks the address of the Google account against the address on the invite.
- The address comes from the Clerk session token, which Supabase has verified. It is never sent by the browser as a value.

What this costs: a stranger with a Google account can create a Clerk account. It is an account that can do nothing, and with `CLERK_DELETE_UNINVITED_USERS=true` it is deleted when they leave the "not invited" page (`removeUninvitedClerkUser()` in `lib/profile.ts`; never anyone who has a profile). The alternative costs more: open links would not exist.

**Clerk dashboard settings this design needs**

| Setting | Value | Why |
| --- | --- | --- |
| Sign-in options | Google only. Email, phone, username and password off. | |
| Sign-up mode (Restrictions) | **Open**. Not Invite-only, not Waitlist. | Invite-only would refuse the Google sign-up of every invited person, because they hold no Clerk invitation. |
| Sessions > Customize session token | `{ "email": "{{user.primary_email_address}}", "email_verified": "{{user.email_verified}}", "name": "{{user.full_name}}" }` | `accept_invite()` reads the address from the token. See below. |
| Supabase integration | On (`dashboard.clerk.com/setup/supabase`) | Adds `role: authenticated` to the token. Unchanged from before. |
| Allowlist | Off | It would block invited people whose address is not on it. |

**The email claim.** A Clerk session token does not carry the user's email address unless it is added as a custom claim. `accept_invite()` needs it for two things: to check an email invite against the right account, and to fill in `profiles.email`. If the claim is missing, acceptance fails closed: `accept_invite()` returns `email_claim_missing` for every invite, open links included, and writes nothing. The API reports that as `503 email_claim_missing` and logs what to fix. It does not fall back to an address supplied by the browser, and it does not fall back to asking Clerk's API with the server's key, because then two different sources could decide who a person is. `email_verified` is optional: when present it must be true. With Google-only sign-in it always is.

**What depends on the Clerk plan** (read on clerk.com on 14 Nov 2026; confirm before go-live):

| Feature | Needed by this design? | Plan |
| --- | --- | --- |
| Google sign-in, Open sign-up | Yes | Free. Production needs your own Google OAuth client. |
| Custom session token claims | Yes | Listed on every plan, including the free one. |
| Up to 50,000 monthly retained users | Yes (the team is about 20) | Free. A stranger who signs up once and never returns is not a retained user. |
| Allowlist | No | Paid for production. Only works in Open mode. |
| Blocklist | No | Paid (Pro and above). |
| Invite-only sign-up mode | No | **Not confirmed.** It is in the docs with no plan stated, and it is not on the pricing page by that name. |
| Custom session lifetime (for example sign out after 12 idle hours) | No, but recommended for shared devices | Paid. The free plan is fixed at 7 days. |

**Not confirmed, because it needs a real Clerk instance:** that `email`, `email_verified` and `name` are accepted as custom claim names (the docs list the default claims, and these are not among them, but they give no list of forbidden names); the whole sign-in round trip from `/invite/<token>` through Google and back; and `removeUninvitedClerkUser()`. The Clerk calls used were checked against the installed package types (`@clerk/nextjs` 7.10, `@clerk/backend` 3.29), not run.

**If open links are dropped later**, design (a) becomes possible as a second lock on top of (b): set Clerk to Invite-only and have `createInvite()` also create a Clerk invitation (`notify: false`, `redirectUrl` set to the app's own invite link) and store its id. `invites.clerk_invitation_id` is reserved for that and is unused today.

### Threat notes

| Risk | What stands in the way |
| --- | --- |
| The database, a backup or the audit log leaks | Tokens are not in it. Only SHA-256 hashes are stored, the hash column is not readable by any signed-in user (admins included), and it is stripped from the audit log. A hash cannot be turned back into a link. A fast hash is enough because the token is 256 random bits; there is nothing to guess, unlike a PIN. |
| Guessing a token | 32 random bytes. No lockout is needed and none is built. |
| A link is used twice | Single use. `accept_invite()` locks the invite row before checking it, so two simultaneous attempts cannot both succeed. The same person retrying gets "already done", not an error. |
| An old link turns up later (a forwarded email, browser history, a server log) | Expiry: 7 days for email invites, 48 hours for open links, enforced by constraints. Used and revoked links are dead. Resending kills the previous link. |
| An email invite is forwarded to someone else | Email binding. It only works for the Google account with the invited address, and that address comes from the verified session token. |
| **An open link is forwarded, or posted where others can see it** | **This is the real exposure, and it is by design.** An open link is a bearer credential: the first person to accept it gets the role on it. What limits the damage: 48 hours, single use, never admin access (a constraint), every acceptance is in the audit log with the Google account that used it, and an admin can revoke it or deactivate whoever got in. Send open links directly to one person. Prefer email invites whenever the address is known. |
| Finding out who works here, or who has been invited | The preview endpoint takes only a token. It never accepts or looks up an email address, never returns a full address (only `n••••@example.com`), and answers an unknown token, a malformed one and a missing one identically, with the same status code and the same work done. Creating an invite does say "already has access" or "already pending", but only to an admin. |
| Probing tokens straight at the database with the publishable key | `invite_preview()` can be run by the server's role only. `anon` and signed-in users are refused, and `anon` has no privilege on the table. The one public door is `GET /api/invites/preview`, which can be rate limited in the Vercel Firewall. No limiter is built into the route: an in-memory one does not hold across serverless instances. |
| A stranger signs in with Google | They get a Clerk account and nothing else. No profile, so every policy refuses them. See "Clerk and sign-up". |
| An existing member opens someone else's link | Refused (`already_member`), and nothing changes. Otherwise an owner tapping a technician's link would become a technician. |
| An admin invites themselves to more access, or demotes the only other admin | Nobody changes their own access level. The last admin cannot be removed. Admin invites, role changes and access changes are in the audit log with who did them. |
| A request forged from another site | The invite routes refuse POST and DELETE with a foreign `Origin`, as `/api/pin` does. |
| The invite link in an email points at the wrong site | In production the link's origin is `NEXT_PUBLIC_APP_URL` (or the Vercel production address), never the request's Host header. |

Tokens travel in URLs (`/invite/<token>`, and `?token=` on the preview call), so they can appear in request logs and browser history. That is why they are single use and short lived. The preview response asks browsers not to send it as a referrer; the invite page should do the same (`<meta name="referrer" content="no-referrer">`) and should not load third-party scripts.

## Data flow: count, review, approve, flags, digest

```
1. SCHEDULE   A manager creates a count session for an area and assigns it.
              count_sessions (scheduled) + count_lines
                    |
2. COUNT      The assignee starts the count and enters what is on each shelf.
              Blind: the screen does not show the expected quantity.
              As each line is saved, a trigger records who counted, when, and what
              the ledger said on_hand was at that moment (expected).
              count_sessions (in_progress)
                    |
3. SUBMIT     The assignee submits. Lines are locked.
              count_sessions (submitted)
                    |
4. REVIEW     A manager sees counted against expected, line by line. They can send the
              count back for a recount, or approve it.
                    |
5. APPROVE    Must be a manager or owner who did not perform the count.
              A trigger posts one `count` movement per line:
                  delta = counted - expected
              The ledger trigger applies each delta to on_hand.
              count_sessions (approved), stock_movements (+n rows), stock_levels updated
                    |
6. FLAGS      Daily cron: loadState() -> detectFlags().
              A line far from expected becomes a count-variance flag
              (high severity when it is well short). New flags are inserted;
              new high-severity ones are emailed to the location's owners and managers.
                    |
7. RESOLVE    A manager or owner assigns the flag, adds notes, and resolves or dismisses
              it with a written reason. Not the person the flag is about.
                    |
8. DIGEST     Monday cron: loadState() -> buildDigest() per location -> email.
              Open flags, low stock, what to order, vendor performance.
              A digest_runs row records what was sent and to whom.
```

Receiving follows the same shape: a `receive` movement naming an order line updates on-hand, the line's received quantity and the order's status in one transaction, and a mismatch with what was ordered becomes a flag.

## Prototype mode and its seams

The app runs with no keys at all, on the sample data in `packages/ui/data/inventory.ts` (the real catalogue and 2026 orders, plus a generated layer of counts, costs and staff). Each integration is switched by `isConfigured` in `apps/web/lib/env.ts`, and each has one seam where real and sample meet:

| Seam | No keys | With keys |
| --- | --- | --- |
| `proxy.ts` | Passes every request through. | Redirects signed-out visitors to sign-in and people who were never invited to `/invite/required`; enforces the PIN lock. |
| `app/providers.tsx` | Renders children unwrapped. | Wraps the app in `ClerkProvider`. |
| `lib/auth.ts` `requireUser()` | Returns a demo user from the sample staff: the Lynnfield manager, or whoever the `x-demo-user` header or `demo_user` cookie names. | Returns the Clerk user, or a 401. The header and cookie are ignored. |
| `lib/permissions.ts` `requirePermission()` | Checks the demo user's sample role and access level. | Checks the caller's `profiles` row. 403 when they have none. |
| `lib/invites.ts` | Works on a copy of the sample invites held in memory. Lost when the server restarts. | Reads and writes `invites` as the signed-in admin; acceptance runs in `accept_invite()`. |
| `lib/state.ts` `loadState()` | Reads `packages/ui/data/inventory.ts`. | Reads Supabase (`lib/state-supabase.ts`) and returns the same shapes. |
| `lib/supabase/server.ts` | Returns `null`; callers use sample data. | A client acting as the signed-in user, under row-level security. |
| `app/api/pin/route.ts` | Stores nothing; the PIN is `2580`. | Hash and lockout state in `profiles`. |
| `lib/email.ts` | Logs "skipped". An invite from the sample data is never emailed unless `EMAIL_REDIRECT_TO` is set. | Sends through Resend. |

The engine sits on the far side of every seam and never knows which source it was given. That is why the numbers in the prototype change as soon as real counts replace sample ones, with no change to the screens.

Still to connect: the screens read the sample data layer directly. Moving a screen to live data means reading through `createServerSupabase()` and the mappers in `lib/supabase/mappers.ts`, and writing movements, orders and counts through the same client so the database applies the rules above.
