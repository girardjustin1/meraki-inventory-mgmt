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
| Clerk | Who you are. Google sign-in, invite-only. | `proxy.ts`, `app/providers.tsx`, `lib/auth.ts` |
| Supabase | What is true, and what you may do. Postgres with row-level security. | `supabase/`, `lib/supabase/` |
| Resend | Digest and alert emails, rendered with React Email. | `emails/`, `lib/email.ts` |
| Vercel Cron | Runs the flag scan daily and the digests weekly and monthly. | `vercel.json`, `app/api/cron/` |

Clerk and Supabase are joined by Supabase's third-party auth: the app sends the Clerk session token with each database request, Supabase verifies it against Clerk's keys, and policies read the Clerk user id from `auth.jwt()`. There is no second user table to keep in sync beyond `profiles`, which holds each person's role and locations.

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

How it is enforced in the database (`supabase/migrations/0001_init.sql`):

- Signed-in users have no privilege to update `on_hand`. Inserting a movement is the only way to change stock.
- `stock_movements` and `audit_log` refuse UPDATE, DELETE and TRUNCATE, by privilege and by trigger.
- A reason is required and must fit the movement type. Adjustments of 3 or more units need a note.
- `user_id` and `occurred_at` are stamped from the session token, so nobody writes a movement as someone else or back-dates one.

Changes that are not stock (orders, counts, flags, items, costs, par levels, roles, settings) are recorded in `audit_log` by trigger.

## Roles

| Role | Can | Cannot |
| --- | --- | --- |
| Owner | Everything, at both locations. Manage team, roles and settings. | Change their own role. Approve their own orders or counts. |
| Manager | Create orders, schedule counts, adjust and transfer stock, approve orders and counts, work flags, see costs. Own locations only. | Approve an order they created, receive an order they created, approve a count they performed, close a flag about themselves. |
| Front desk | Receive deliveries against orders, log usage, count assigned shelves, request items, attach barcodes. | See costs or flags. Adjust stock. Approve anything. |
| Technician | Log usage, count assigned shelves, request items. | See orders, costs or flags. Receive. Adjust. |

Roles and locations live in `profiles` and `profile_locations`. The rules above are row-level security policies, CHECK constraints and triggers, so they hold for every client, not only for this app's screens.

**Separation of duties** is the control underneath: ordering, approving, receiving and counting the same stock should take more than one person, so a loss needs two people to hide. The database refuses the three self-dealing cases outright (approve your own order, receive your own order, approve your own count). The practical consequence is that each location needs two people who can approve.

**The PIN** identifies which signed-in staff member is holding a shared device and locks the app when idle. It is a convenience lock on top of the Clerk session, not a second authentication factor. Details in `apps/web/README.md`.

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
| `proxy.ts` | Passes every request through. | Redirects signed-out visitors to sign-in; enforces the PIN lock. |
| `app/providers.tsx` | Renders children unwrapped. | Wraps the app in `ClerkProvider`. |
| `lib/auth.ts` `requireUser()` | Returns a fixed demo user. | Returns the Clerk user, or a 401. |
| `lib/state.ts` `loadState()` | Reads `packages/ui/data/inventory.ts`. | Reads Supabase (`lib/state-supabase.ts`) and returns the same shapes. |
| `lib/supabase/server.ts` | Returns `null`; callers use sample data. | A client acting as the signed-in user, under row-level security. |
| `app/api/pin/route.ts` | Stores nothing; the PIN is `2580`. | Hash and lockout state in `profiles`. |
| `lib/email.ts` | Logs "skipped". | Sends through Resend. |

The engine sits on the far side of every seam and never knows which source it was given. That is why the numbers in the prototype change as soon as real counts replace sample ones, with no change to the screens.

Still to connect: the screens read the sample data layer directly. Moving a screen to live data means reading through `createServerSupabase()` and the mappers in `lib/supabase/mappers.ts`, and writing movements, orders and counts through the same client so the database applies the rules above.
