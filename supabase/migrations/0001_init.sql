-- =====================================================================================
-- Meraki Inventory: initial schema
-- =====================================================================================
--
-- The whole app is a ledger. Every change to stock is one row in `stock_movements`, written
-- by a named user with a reason code. On-hand quantities, usage, forecasts and flags are all
-- derived from that ledger plus the purchase orders. Nothing in the ledger is edited in place.
--
-- This file mirrors packages/ui/data/types.ts:
--   * tables and columns are snake_case here, camelCase there
--   * enum values are snake_case here ("front_desk", "transfer_in"), kebab-case there
--     ("front-desk", "transfer-in"); apps/web/lib/supabase/mappers.ts converts both ways
--   * ids that are data (locations, vendors, items, orders, flags) are text and keep the
--     exact value the prototype uses, so seed data and deep links carry over unchanged
--
-- Auth model: staff sign in with Clerk. Supabase is configured with Clerk as a third-party
-- auth provider, so PostgREST verifies the Clerk session token and exposes its claims through
-- auth.jwt(). The Clerk user id is the `sub` claim ("user_2abc..."), which is why user ids
-- are text and not uuid, and why auth.uid() (which casts to uuid) is never used here.
--
-- Sections:
--    1. Private schema and enums
--    2. Reference tables: locations, vendors
--    3. People: profiles, profile_locations
--    4. Auth helper functions (auth_user_id, auth_role, has_location)
--    5. Catalogue: items, item_costs, item_barcodes, shelves, stock_levels
--    6. Purchasing: purchase_orders, purchase_order_lines, purchase_order_line_costs
--    7. Counting: count_sessions, count_lines
--    8. The ledger: stock_movements
--    9. Flags, notifications, digests, settings, audit_log
--   10. Triggers: updated_at, ledger, workflow guards (separation of duties), audit
--   11. Views
--   12. Grants
--   13. Row-level security policies
--   14. Default configuration rows
--
-- Safe to run once on an empty project. It is not written to be re-run.

-- =====================================================================================
-- 1. Private schema and enums
-- =====================================================================================

-- `app` holds helper and trigger functions. It is NOT in the list of schemas exposed by the
-- Data API, so nothing in it can be called over HTTP as an RPC. Policies and triggers in
-- `public` call into it.
create schema if not exists app;

create type public.user_role as enum ('owner', 'manager', 'front_desk', 'technician');

-- How an order physically reaches the vendor.
create type public.order_channel as enum ('email_po', 'api', 'portal', 'in_store', 'internal');

create type public.item_kind as enum ('supply', 'polish', 'tips');

create type public.polish_line as enum ('opi', 'opi_dip', 'dnd', 'dazzle_dry', 'chisel', 'apres_gel_x');

-- How the reorder threshold is expressed. Many bulk items are tracked by eye, not by count.
create type public.par_rule as enum ('quantity', 'level', 'paused', 'unset');

-- For containers tracked by fill level instead of a count.
create type public.fill_level as enum ('full', 'three_quarter', 'half', 'quarter', 'empty');

-- A = high value or high risk, counted weekly. C = low value, counted quarterly.
create type public.abc_class as enum ('A', 'B', 'C');

create type public.movement_type as enum ('count', 'receive', 'use', 'adjust', 'transfer_in', 'transfer_out');

-- A fixed list, so adjustments can be reported by reason. Add a reason with
-- `alter type public.reason_code add value '...'`; never remove one that the ledger uses.
create type public.reason_code as enum (
  'cycle_count',
  'received_order',
  'used_in_service',
  'damaged',
  'expired',
  'lost',
  'suspected_theft',
  'sample_or_gift',
  'returned_to_vendor',
  'transfer',
  'correction'
);

create type public.purchase_order_status as enum (
  'draft', 'awaiting_approval', 'approved', 'sent', 'partially_received', 'received', 'cancelled'
);

create type public.purchase_order_kind as enum ('supply', 'polish');

create type public.count_status as enum ('scheduled', 'in_progress', 'submitted', 'approved');

create type public.flag_type as enum (
  'received_mismatch',
  'variant_mismatch',
  'order_spike',
  'overdue_receipt',
  'count_variance',
  'over_par',
  'stockout_risk',
  'repeat_out_of_stock',
  'missed_count',
  'unexplained_adjustment',
  'data_quality'
);

create type public.flag_severity as enum ('high', 'medium', 'low');

create type public.flag_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create type public.flag_event_type as enum ('created', 'assigned', 'note', 'status_changed');

create type public.barcode_source as enum ('manufacturer', 'internal_label');

create type public.notification_channel as enum ('email', 'in_app');

create type public.digest_period as enum ('weekly', 'monthly');

create type public.digest_run_status as enum ('sent', 'skipped', 'failed');

-- =====================================================================================
-- 2. Reference tables
-- =====================================================================================

create table public.locations (
  id          text primary key,                       -- 'lynnfield', 'newburyport'
  name        text not null,
  short_name  text not null,
  -- Used to judge "after hours" adjustments and to label digest dates.
  timezone    text not null default 'America/New_York',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.vendors (
  id                     text primary key,            -- 'nail-supply-store', 'amazon', ...
  name                   text not null,
  channel                public.order_channel not null,
  -- Typical days from order to delivery.
  lead_time_days         integer not null default 7 check (lead_time_days >= 0),
  -- True while lead_time_days is an assumption and not measured from receipts.
  lead_time_is_estimate  boolean not null default true,
  contact                text,
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- =====================================================================================
-- 3. People
-- =====================================================================================

-- One row per Clerk user. Rows are created by server code (service role) the first time a
-- user signs in; see apps/web/lib/profile.ts. A user without a profile row, or with
-- active = false, passes no policy and therefore sees nothing.
create table public.profiles (
  id                   text primary key,              -- Clerk user id, the JWT `sub` claim
  email                text not null,
  name                 text not null default '',
  role                 public.user_role not null,
  active               boolean not null default true,

  -- PIN lock. The PIN is a convenience lock for shared devices on top of the Clerk session;
  -- it is not a second authentication factor. Only a salted scrypt hash is stored.
  -- The hash and the two lockout columns are not readable or writable by signed-in users at
  -- all (see the column-level grants in section 12). Only the server, using the service-role
  -- key in apps/web/app/api/pin/route.ts, reads and writes them. pin_updated_at is readable.
  pin_hash             text,
  pin_updated_at       timestamptz,
  failed_pin_attempts  integer not null default 0 check (failed_pin_attempts >= 0),
  pin_locked_until     timestamptz,
  -- Safe to expose: lets the app show "PIN set" without revealing the hash.
  has_pin              boolean generated always as (pin_hash is not null) stored,

  last_active_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role) where active;

-- Which locations a person works at. Owners see every location without needing rows here.
create table public.profile_locations (
  profile_id   text not null references public.profiles (id) on delete cascade,
  location_id  text not null references public.locations (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (profile_id, location_id)
);

create index profile_locations_location_idx on public.profile_locations (location_id);

-- =====================================================================================
-- 4. Auth helper functions
-- =====================================================================================
--
-- Every policy is written in terms of these three questions:
--   who is calling?            app.auth_user_id()
--   what is their role?        app.auth_role()
--   do they work at location?  app.has_location(location_id)
--
-- auth_role() and has_location() are SECURITY DEFINER so they can read profiles and
-- profile_locations without tripping those tables' own policies (which would recurse).
-- They take no user-supplied identity: the caller is always taken from the verified JWT.
-- search_path is pinned to '' and every name is schema-qualified, which is the standard
-- hardening for SECURITY DEFINER functions.

-- The Clerk user id of the caller, or null for the service role and for anonymous requests.
create or replace function app.auth_user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- The caller's role, or null when they have no active profile.
create or replace function app.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = app.auth_user_id()
    and p.active
$$;

-- True for owners and managers. Shorthand used by most write policies.
create or replace function app.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.auth_role() in ('owner', 'manager'), false)
$$;

-- True when the caller may act at this location: owners everywhere, everyone else only
-- where they have a profile_locations row.
create or replace function app.has_location(p_location_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = app.auth_user_id()
      and p.active
      and (
        p.role = 'owner'
        or exists (
          select 1
          from public.profile_locations pl
          where pl.profile_id = p.id
            and pl.location_id = p_location_id
        )
      )
  )
$$;

-- =====================================================================================
-- 5. Catalogue and stock
-- =====================================================================================

-- The catalogue is shared by both locations. Items are never deleted (the ledger refers to
-- them); they are marked discontinued instead.
create table public.items (
  id            text primary key default gen_random_uuid()::text,
  kind          public.item_kind not null,
  name          text not null,
  brand         text,
  category      text not null,
  vendor_id     text not null references public.vendors (id) on delete restrict,
  unit          text not null default 'Each',         -- counting unit: Bottle, Box, Gallon...
  -- Polish and tips only.
  polish_line   public.polish_line,
  color_code    text,
  color_family  text,
  swatch        text,                                 -- approximate hex colour for polish
  sku           text,
  abc_class     public.abc_class not null default 'C',
  discontinued  boolean not null default false,
  image_url     text,
  description   text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index items_kind_idx on public.items (kind);
create index items_vendor_idx on public.items (vendor_id);
create index items_category_idx on public.items (category);
create index items_polish_idx on public.items (polish_line, color_code) where polish_line is not null;
create index items_sku_idx on public.items (sku) where sku is not null;

-- WHY unit_cost IS NOT A COLUMN ON `items`
-- Only owners and managers may see costs. Row-level security filters rows, not columns, and
-- column-level GRANTs are per database role: every signed-in user arrives as the same
-- `authenticated` role, so a GRANT cannot tell a manager from a technician. A cost column
-- on `items` would therefore be readable by everyone or by no one.
-- The cost lives in its own narrow table whose policies admit owners and managers only, and
-- the view `items_with_cost` (section 11) joins it back. The view runs with the caller's
-- rights, so a technician reading it gets the item with unit_cost = null.
-- Purchase order lines follow the same pattern (purchase_order_line_costs).
create table public.item_costs (
  item_id         text primary key references public.items (id) on delete cascade,
  unit_cost       numeric(10, 2) not null check (unit_cost >= 0),   -- dollars per unit
  -- True while the cost is a placeholder and not taken from an invoice.
  cost_is_sample  boolean not null default false,
  updated_by      text references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Anything a scanner can read for an item: the manufacturer's UPC/EAN, or a label printed by
-- Meraki for items with no barcode (refill jugs, decanted bottles). A code maps to one item.
create table public.item_barcodes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (btrim(code) <> ''),
  format      text,                                   -- 'ean_13', 'upc_a', 'code_128', 'qr_code'...
  item_id     text not null references public.items (id) on delete cascade,
  source      public.barcode_source not null default 'manufacturer',
  created_by  text references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint item_barcodes_code_key unique (code)
);

create index item_barcodes_item_idx on public.item_barcodes (item_id);

-- Named shelves per location and area, used to order count sheets and to print shelf labels.
-- stock_levels.area/shelf carry the same text values; there is deliberately no foreign key,
-- because the polish wall uses the colour code as the "shelf" and has ~1,600 positions that
-- do not need a row here.
create table public.shelves (
  id           uuid primary key default gen_random_uuid(),
  location_id  text not null references public.locations (id) on delete cascade,
  area         text not null,                         -- 'Nail Area', 'Back Room', ...
  code         text not null,                         -- '1A'
  label        text,                                  -- 'Nugen Prep Refill'
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint shelves_location_area_code_key unique (location_id, area, code)
);

-- Current state of one item at one location. `on_hand`, `fill_level` and the last-counted
-- fields are a running total maintained by the ledger trigger (section 10): signed-in users
-- have no UPDATE privilege on them, so the only way to change stock is to write a movement.
create table public.stock_levels (
  item_id            text not null references public.items (id) on delete restrict,
  location_id        text not null references public.locations (id) on delete restrict,
  area               text not null default '',
  shelf              text not null default '',
  on_hand            numeric(12, 2) not null default 0,
  fill_level         public.fill_level,               -- set when the item is tracked by eye
  par                numeric(12, 2) check (par is null or par >= 0),
  par_rule           public.par_rule not null default 'unset',
  par_note           text,
  reorder_requested  boolean not null default false,  -- staff ticked "Order?"
  reorder_qty        numeric(12, 2) check (reorder_qty is null or reorder_qty >= 0),
  last_counted_at    timestamptz,
  last_counted_by    text references public.profiles (id) on delete set null,
  -- True while on_hand came from the sample generator and not from a real count.
  is_sample          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (item_id, location_id)
);

create index stock_levels_location_idx on public.stock_levels (location_id, area, shelf);
create index stock_levels_reorder_idx on public.stock_levels (location_id) where reorder_requested;

-- =====================================================================================
-- 6. Purchasing
-- =====================================================================================

create table public.purchase_orders (
  id            text primary key default gen_random_uuid()::text,
  number        text not null,                        -- 'PO-LYN-2611-S1'
  location_id   text not null references public.locations (id) on delete restrict,
  vendor_id     text not null references public.vendors (id) on delete restrict,
  kind          public.purchase_order_kind not null default 'supply',
  status        public.purchase_order_status not null default 'draft',
  cycle         text not null check (cycle ~ '^[0-9]{4}-[0-9]{2}$'),   -- yyyy-mm
  note          text,
  -- Null only for orders imported from the 2026 workbook, which predate the app.
  created_by    text references public.profiles (id) on delete restrict,
  submitted_at  timestamptz,
  approved_by   text references public.profiles (id) on delete restrict,
  approved_at   timestamptz,
  sent_at       timestamptz,
  closed_at     timestamptz,
  imported      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint purchase_orders_number_key unique (number),
  -- Separation of duties, as a constraint so it holds for every writer including the
  -- service role: nobody approves an order they created.
  constraint purchase_orders_approver_is_not_creator
    check (approved_by is null or created_by is null or approved_by <> created_by),
  -- An order cannot move past approval without an approver (imports excepted).
  constraint purchase_orders_approved_has_approver
    check (imported or status in ('draft', 'awaiting_approval', 'cancelled') or approved_by is not null),
  constraint purchase_orders_created_by_required
    check (imported or created_by is not null)
);

create index purchase_orders_location_idx on public.purchase_orders (location_id, status);
create index purchase_orders_vendor_idx on public.purchase_orders (vendor_id);
create index purchase_orders_cycle_idx on public.purchase_orders (cycle);
create index purchase_orders_created_by_idx on public.purchase_orders (created_by);

create table public.purchase_order_lines (
  id                 text primary key default gen_random_uuid()::text,
  purchase_order_id  text not null references public.purchase_orders (id) on delete cascade,
  line_no            integer not null default 1,
  -- Null when a sheet row or free-text request could not be matched to a catalogue item.
  -- A line must be matched before it can be received.
  item_id            text references public.items (id) on delete restrict,
  name               text not null,
  sku                text,
  color_code         text,
  variant            text,                            -- Regular / Gel / Dip for polish
  qty_ordered        numeric(12, 2) not null default 0 check (qty_ordered >= 0),
  -- Maintained by the ledger trigger when a `receive` movement names this line.
  qty_received       numeric(12, 2) not null default 0 check (qty_received >= 0),
  received_at        timestamptz,
  received_by        text references public.profiles (id) on delete restrict,
  -- Variant actually delivered, when it differs from what was ordered.
  variant_received   text,
  note               text,
  discontinued       boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index purchase_order_lines_order_idx on public.purchase_order_lines (purchase_order_id, line_no);
create index purchase_order_lines_item_idx on public.purchase_order_lines (item_id);

-- Price paid per unit on this order. Separate table for the same reason as item_costs.
create table public.purchase_order_line_costs (
  purchase_order_line_id  text primary key references public.purchase_order_lines (id) on delete cascade,
  unit_cost               numeric(10, 2) not null check (unit_cost >= 0),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- =====================================================================================
-- 7. Counting
-- =====================================================================================

create table public.count_sessions (
  id            text primary key default gen_random_uuid()::text,
  location_id   text not null references public.locations (id) on delete restrict,
  area          text not null,
  name          text not null,
  status        public.count_status not null default 'scheduled',
  assigned_to   text not null references public.profiles (id) on delete restrict,
  due_at        date not null,
  started_at    timestamptz,
  submitted_at  timestamptz,
  submitted_by  text references public.profiles (id) on delete restrict,
  approved_by   text references public.profiles (id) on delete restrict,
  approved_at   timestamptz,
  -- Blind count: the counter is not shown the expected quantity. This is a screen-level
  -- control: staff can read on-hand elsewhere in the app, so the database cannot hide it.
  blind         boolean not null default true,
  is_sample     boolean not null default false,
  created_by    text references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Separation of duties, as a constraint: the approver is neither the person the count
  -- was assigned to nor the person who submitted it. The guard trigger additionally checks
  -- every line's counted_by.
  constraint count_sessions_approver_did_not_count
    check (
      approved_by is null
      or (approved_by <> assigned_to and (submitted_by is null or approved_by <> submitted_by))
    ),
  constraint count_sessions_approved_has_approver
    check (status <> 'approved' or approved_by is not null)
);

create index count_sessions_location_idx on public.count_sessions (location_id, status);
create index count_sessions_assigned_idx on public.count_sessions (assigned_to, status);
create index count_sessions_due_idx on public.count_sessions (due_at);

create table public.count_lines (
  id                   uuid primary key default gen_random_uuid(),
  count_session_id     text not null references public.count_sessions (id) on delete cascade,
  item_id              text not null references public.items (id) on delete restrict,
  -- System quantity at the moment this line was counted. Filled in by the trigger, never by
  -- the client, so the variance is measured against what the ledger said at that instant.
  expected             numeric(12, 2),
  counted              numeric(12, 2) check (counted is null or counted >= 0),
  -- For items tracked by eye. When set, `counted` is derived from it (half = 0.5).
  counted_fill_level   public.fill_level,
  counted_by           text references public.profiles (id) on delete restrict,
  counted_at           timestamptz,
  note                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint count_lines_session_item_key unique (count_session_id, item_id)
);

create index count_lines_item_idx on public.count_lines (item_id);

-- =====================================================================================
-- 8. The ledger
-- =====================================================================================

-- Append-only. One row per change to stock. Corrections are new rows with reason
-- 'correction'; nothing here is ever updated or deleted (enforced three ways: no UPDATE or
-- DELETE privilege, no UPDATE or DELETE policy, and a trigger that raises).
create table public.stock_movements (
  id                      uuid primary key default gen_random_uuid(),
  item_id                 text not null references public.items (id) on delete restrict,
  location_id             text not null references public.locations (id) on delete restrict,
  type                    public.movement_type not null,
  delta                   numeric(12, 2) not null,    -- signed change to on-hand
  -- On-hand after this movement. Written by the trigger; a client value is ignored.
  balance_after           numeric(12, 2),
  -- "reason required": not null, no default, so the form cannot fall back to one silently.
  reason                  public.reason_code not null,
  user_id                 text not null references public.profiles (id) on delete restrict,
  occurred_at             timestamptz not null default now(),
  note                    text,
  purchase_order_id       text references public.purchase_orders (id) on delete restrict,
  purchase_order_line_id  text references public.purchase_order_lines (id) on delete restrict,
  count_session_id        text references public.count_sessions (id) on delete restrict,
  -- For items tracked by eye: the fill level after this movement.
  fill_level_after        public.fill_level,
  is_sample               boolean not null default false,
  created_at              timestamptz not null default now(),

  -- The sign of delta must agree with the movement type.
  constraint stock_movements_delta_sign check (
    case type
      when 'receive'      then delta > 0
      when 'use'          then delta < 0
      when 'transfer_in'  then delta > 0
      when 'transfer_out' then delta < 0
      when 'adjust'       then delta <> 0
      else true                                       -- count: zero means "counted, no variance"
    end
  ),
  -- The reason must belong to the movement type, so reports by reason stay meaningful.
  constraint stock_movements_reason_matches_type check (
    case type
      when 'count'        then reason = 'cycle_count'
      when 'receive'      then reason = 'received_order'
      when 'use'          then reason = 'used_in_service'
      when 'transfer_in'  then reason = 'transfer'
      when 'transfer_out' then reason = 'transfer'
      when 'adjust'       then reason in (
        'damaged', 'expired', 'lost', 'suspected_theft', 'sample_or_gift', 'returned_to_vendor', 'correction'
      )
    end
  ),
  -- Adjustments of 3 or more units need a written explanation.
  constraint stock_movements_large_adjustment_needs_note check (
    type <> 'adjust' or abs(delta) < 3 or btrim(coalesce(note, '')) <> ''
  ),
  -- Count movements only exist as the result of an approved count session.
  constraint stock_movements_count_has_session check (type <> 'count' or count_session_id is not null),
  constraint stock_movements_line_has_order check (purchase_order_line_id is null or purchase_order_id is not null),
  constraint stock_movements_order_only_on_receive check (purchase_order_id is null or type = 'receive')
);

create index stock_movements_item_idx on public.stock_movements (item_id, location_id, occurred_at desc);
create index stock_movements_location_idx on public.stock_movements (location_id, occurred_at desc);
create index stock_movements_user_idx on public.stock_movements (user_id, occurred_at desc);
create index stock_movements_type_idx on public.stock_movements (type, occurred_at desc);
create index stock_movements_order_idx on public.stock_movements (purchase_order_id) where purchase_order_id is not null;
create index stock_movements_order_line_idx on public.stock_movements (purchase_order_line_id) where purchase_order_line_id is not null;
create index stock_movements_count_idx on public.stock_movements (count_session_id) where count_session_id is not null;

-- =====================================================================================
-- 9. Flags, notifications, digests, settings, audit log
-- =====================================================================================

-- Things a manager should look at, produced by packages/ui/engine/flags.ts on a schedule.
-- Ids are deterministic ("cv-<session>-<item>") so the daily scan can insert new findings
-- without duplicating or resetting ones already being worked.
create table public.flags (
  id                 text primary key,
  type               public.flag_type not null,
  severity           public.flag_severity not null,
  status             public.flag_status not null default 'open',
  title              text not null,
  summary            text not null,                   -- one plain sentence: what was seen and why it matters
  location_id        text not null references public.locations (id) on delete restrict,
  item_id            text references public.items (id) on delete set null,
  item_name          text,
  purchase_order_id  text references public.purchase_orders (id) on delete set null,
  count_session_id   text references public.count_sessions (id) on delete set null,
  -- The person the finding is about (who counted, who adjusted), when there is one.
  user_id            text references public.profiles (id) on delete set null,
  detected_at        timestamptz not null default now(),
  evidence           jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  suggested_action   text not null default '',
  assigned_to        text references public.profiles (id) on delete set null,
  resolution_note    text,
  resolved_by        text references public.profiles (id) on delete set null,
  resolved_at        timestamptz,
  -- Built from imported or live data (true) or from generated sample activity (false).
  from_real_data     boolean not null default true,
  -- Set when the high-severity alert email went out, so it is sent once.
  alerted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Closing a flag always records why.
  constraint flags_closed_needs_note
    check (status not in ('resolved', 'dismissed') or btrim(coalesce(resolution_note, '')) <> ''),
  -- Separation of duties: nobody closes a flag that is about them.
  constraint flags_subject_cannot_resolve
    check (resolved_by is null or user_id is null or resolved_by <> user_id)
);

create index flags_location_idx on public.flags (location_id, status, severity);
create index flags_item_idx on public.flags (item_id);
create index flags_assigned_idx on public.flags (assigned_to) where assigned_to is not null;
create index flags_detected_idx on public.flags (detected_at desc);

-- Assignment, note and status history for a flag. Status and assignment rows are written by
-- a trigger on `flags`; managers add notes directly.
create table public.flag_events (
  id           uuid primary key default gen_random_uuid(),
  flag_id      text not null references public.flags (id) on delete cascade,
  type         public.flag_event_type not null,
  user_id      text references public.profiles (id) on delete set null,   -- null = system
  from_status  public.flag_status,
  to_status    public.flag_status,
  assigned_to  text references public.profiles (id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  constraint flag_events_note_has_text check (type <> 'note' or btrim(coalesce(note, '')) <> '')
);

create index flag_events_flag_idx on public.flag_events (flag_id, created_at);

create table public.notification_rules (
  id           text primary key,                      -- 'weekly-digest', 'high-flag', ...
  label        text not null,
  description  text not null default '',
  channel      public.notification_channel not null,
  roles        public.user_role[] not null default '{}',
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per digest the cron job attempted. Also what makes the job idempotent: Vercel can
-- deliver the same cron event more than once, and the unique index below lets the second
-- delivery see that the digest for that period already went out.
create table public.digest_runs (
  id            uuid primary key default gen_random_uuid(),
  period        public.digest_period not null,
  location_id   text references public.locations (id) on delete cascade,   -- null = all locations
  range_start   date not null,
  range_end     date not null,
  status        public.digest_run_status not null,
  subject       text,
  headline      text,
  recipients    text[] not null default '{}',
  -- Stat tiles and counts as sent, so past digests can be shown without recomputing.
  summary       jsonb not null default '{}'::jsonb,
  provider_ids  text[] not null default '{}',         -- Resend email ids
  error         text,
  created_at    timestamptz not null default now()
);

create unique index digest_runs_sent_once
  on public.digest_runs (period, coalesce(location_id, '*'), range_end)
  where status = 'sent';
create index digest_runs_created_idx on public.digest_runs (created_at desc);

-- Tunable thresholds for the flag engine. The row with location_id = null holds the
-- defaults; a row for a location overrides individual keys for that location.
create table public.settings (
  id               uuid primary key default gen_random_uuid(),
  location_id      text references public.locations (id) on delete cascade,
  flag_thresholds  jsonb not null default '{}'::jsonb check (jsonb_typeof(flag_thresholds) = 'object'),
  updated_by       text references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index settings_location_key on public.settings (coalesce(location_id, '*'));

-- Append-only record of who changed what outside the ledger: orders, counts, flags, items,
-- costs, par levels, roles, settings. Written only by the audit trigger.
create table public.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  -- Clerk user id from the JWT. Null when the change came from the server (service role)
  -- or from the SQL editor. Deliberately not a foreign key: the log must outlive profiles.
  actor_id     text,
  actor_role   public.user_role,
  action       text not null check (action in ('insert', 'update', 'delete')),
  table_name   text not null,
  row_id       text not null,
  location_id  text,                                  -- for scoping what managers can read
  old_row      jsonb,
  new_row      jsonb
);

create index audit_log_row_idx on public.audit_log (table_name, row_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index audit_log_location_idx on public.audit_log (location_id, at desc);

-- =====================================================================================
-- 10. Triggers
-- =====================================================================================
--
-- Conventions used by every trigger function below:
--   * SECURITY DEFINER with search_path = '' and schema-qualified names.
--   * app.auth_user_id() is null  -> the writer is the server (service role), the seed
--     loader or the SQL editor. Workflow guards step aside; table CHECK constraints (which
--     hold the separation-of-duties rules) still apply.
--   * pg_trigger_depth() > 1      -> the write was made by another trigger in this file
--     (for example the ledger marking an order as received). Guards step aside for those
--     too. API clients cannot influence the trigger depth.

-- ---------------------------------------------------------------- updated_at

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_updated_at before update on public.locations                 for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.vendors                   for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.profiles                  for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.items                     for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.item_costs                for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.item_barcodes             for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.shelves                   for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.stock_levels              for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.purchase_orders           for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.purchase_order_lines      for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.purchase_order_line_costs for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.count_sessions            for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.count_lines               for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.flags                     for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.notification_rules        for each row execute function app.touch_updated_at();
create trigger touch_updated_at before update on public.settings                  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------- append-only tables

create or replace function app.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only: % is not allowed. Record a correcting entry instead.', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

create trigger stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function app.forbid_change();
create trigger stock_movements_no_truncate
  before truncate on public.stock_movements
  for each statement execute function app.forbid_change();

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function app.forbid_change();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function app.forbid_change();

-- ---------------------------------------------------------------- the ledger

-- Runs before every insert into stock_movements. In order:
--   1. stamps who and when from the JWT, so a client cannot write a movement as someone
--      else or back-date it
--   2. for receipts against an order: checks the order is at this location and has been
--      sent, and enforces separation of duties (the creator of an order cannot receive it)
--   3. applies delta to stock_levels.on_hand and writes the new total to balance_after
--   4. for receipts: adds to the order line's qty_received and moves the order to
--      partially_received or received
-- Because this is one trigger in the inserting transaction, the movement, the running
-- total and the order progress either all happen or none do.
create or replace function app.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      text := app.auth_user_id();
  v_line     public.purchase_order_lines%rowtype;
  v_order    public.purchase_orders%rowtype;
  v_balance  numeric(12, 2);
begin
  -- 1. Identity and time are server-controlled for signed-in users. (Count movements are
  --    posted by app.post_count_movements at trigger depth 2, on behalf of the counter.)
  if v_uid is not null and pg_trigger_depth() = 1 then
    new.user_id := v_uid;
    new.occurred_at := now();
  end if;
  new.created_at := now();

  -- 2. Receiving against a purchase order.
  if new.type = 'receive' and new.purchase_order_line_id is not null then
    select * into v_line
    from public.purchase_order_lines
    where id = new.purchase_order_line_id
    for update;

    if not found then
      raise exception 'Order line % does not exist', new.purchase_order_line_id using errcode = '23503';
    end if;
    if new.purchase_order_id is null then
      new.purchase_order_id := v_line.purchase_order_id;
    elsif new.purchase_order_id <> v_line.purchase_order_id then
      raise exception 'Order line % does not belong to order %', new.purchase_order_line_id, new.purchase_order_id
        using errcode = '23514';
    end if;
    if v_line.item_id is null then
      raise exception 'Match this order line to a catalogue item before receiving it' using errcode = '23514';
    end if;
    if v_line.item_id <> new.item_id then
      raise exception 'Order line % is for a different item', new.purchase_order_line_id using errcode = '23514';
    end if;
  end if;

  if new.type = 'receive' and new.purchase_order_id is not null then
    select * into v_order
    from public.purchase_orders
    where id = new.purchase_order_id
    for update;

    if not found then
      raise exception 'Order % does not exist', new.purchase_order_id using errcode = '23503';
    end if;
    if v_order.location_id <> new.location_id then
      raise exception 'Order % belongs to a different location', v_order.number using errcode = '23514';
    end if;
    if v_order.status not in ('sent', 'partially_received') then
      raise exception 'Order % is %; only sent orders can be received', v_order.number, v_order.status
        using errcode = '23514';
    end if;
    -- Separation of duties: ordering and receiving are different people.
    if v_order.created_by is not null and v_order.created_by = new.user_id then
      raise exception 'Separation of duties: the person who created order % cannot receive it', v_order.number
        using errcode = '42501';
    end if;
  end if;

  -- 3. Apply to the running total. The row is created on first movement for an item that
  --    has never been stocked at this location. A negative balance is allowed on purpose:
  --    it means usage was logged against stock that was never received or counted, and the
  --    flag engine reports it. Blocking it would stop staff logging real usage.
  insert into public.stock_levels (item_id, location_id)
  values (new.item_id, new.location_id)
  on conflict (item_id, location_id) do nothing;

  update public.stock_levels s
  set on_hand         = s.on_hand + new.delta,
      fill_level      = coalesce(new.fill_level_after, s.fill_level),
      last_counted_at = case when new.type = 'count' then new.occurred_at else s.last_counted_at end,
      last_counted_by = case when new.type = 'count' then new.user_id else s.last_counted_by end,
      is_sample       = case when new.type = 'count' then false else s.is_sample end
  where s.item_id = new.item_id
    and s.location_id = new.location_id
  returning s.on_hand into v_balance;

  new.balance_after := v_balance;

  -- 4. Order progress.
  if new.type = 'receive' and new.purchase_order_line_id is not null then
    update public.purchase_order_lines l
    set qty_received = l.qty_received + new.delta,
        received_at  = new.occurred_at,
        received_by  = new.user_id
    where l.id = new.purchase_order_line_id;

    -- Received when every ordered line has arrived in full. A short delivery leaves the
    -- order partially received until a manager closes it (see app.guard_purchase_order).
    update public.purchase_orders o
    set status = case
          when exists (
            select 1 from public.purchase_order_lines l
            where l.purchase_order_id = o.id and l.qty_ordered > 0 and l.qty_received < l.qty_ordered
          ) then 'partially_received'::public.purchase_order_status
          else 'received'::public.purchase_order_status
        end,
        closed_at = case
          when exists (
            select 1 from public.purchase_order_lines l
            where l.purchase_order_id = o.id and l.qty_ordered > 0 and l.qty_received < l.qty_ordered
          ) then null
          else now()
        end
    where o.id = new.purchase_order_id;
  end if;

  return new;
end;
$$;

create trigger stock_movements_apply
  before insert on public.stock_movements
  for each row execute function app.apply_stock_movement();

-- ---------------------------------------------------------------- stock level guard

-- Signed-in users have UPDATE privilege only on the descriptive columns of stock_levels
-- (see grants). Within those, staff who are not managers may only raise a reorder request.
create or replace function app.guard_stock_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.auth_user_id() is null or pg_trigger_depth() > 1 or app.is_manager() then
    return new;
  end if;
  if (new.area, new.shelf, new.fill_level, new.par, new.par_rule, new.par_note)
     is distinct from (old.area, old.shelf, old.fill_level, old.par, old.par_rule, old.par_note) then
    raise exception 'Only a manager or owner can change par levels and shelf locations' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger stock_levels_guard
  before update on public.stock_levels
  for each row execute function app.guard_stock_level();

-- ---------------------------------------------------------------- profile guard

-- Owners manage roles, but nobody changes their own role or deactivates themselves, so an
-- owner cannot lock the business out or quietly re-grant themselves access.
create or replace function app.guard_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := app.auth_user_id();
begin
  if v_uid is null then
    return new;
  end if;
  if new.id <> old.id or new.email <> old.email then
    raise exception 'Profile id and email come from Clerk and cannot be edited here' using errcode = '42501';
  end if;
  if v_uid = old.id and (new.role <> old.role or new.active <> old.active) then
    raise exception 'You cannot change your own role or deactivate yourself' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function app.guard_profile();

-- ---------------------------------------------------------------- purchase order workflow

-- Allowed status changes for signed-in users:
--   draft              -> awaiting_approval   submit for approval
--   awaiting_approval  -> draft               sent back for changes
--   awaiting_approval  -> approved            owner or manager who did NOT create the order
--   approved           -> sent                order placed with the vendor
--   partially_received -> received            manager closes a short delivery
--   any open status    -> cancelled
-- sent -> partially_received -> received happens only through the ledger (receiving).
create or replace function app.guard_purchase_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := app.auth_user_id();
begin
  if v_uid is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A new order always starts as the caller's own draft.
    new.created_by   := v_uid;
    new.status       := 'draft';
    new.submitted_at := null;
    new.approved_by  := null;
    new.approved_at  := null;
    new.sent_at      := null;
    new.closed_at    := null;
    new.imported     := false;
    return new;
  end if;

  if not app.is_manager() then
    raise exception 'Only a manager or owner can change an order' using errcode = '42501';
  end if;
  if new.location_id <> old.location_id or new.created_by is distinct from old.created_by or new.imported <> old.imported then
    raise exception 'The location and creator of an order cannot be changed' using errcode = '42501';
  end if;

  if new.status = old.status then
    if old.status not in ('draft', 'awaiting_approval')
       and (new.vendor_id, new.kind, new.cycle, new.number) is distinct from (old.vendor_id, old.kind, old.cycle, old.number) then
      raise exception 'Order % has been approved and can no longer be edited', old.number using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'awaiting_approval' then
    new.submitted_at := now();
  elsif old.status = 'awaiting_approval' and new.status = 'draft' then
    new.submitted_at := null;
  elsif old.status = 'awaiting_approval' and new.status = 'approved' then
    -- Separation of duties: ordering and approving are different people.
    if old.created_by = v_uid then
      raise exception 'Separation of duties: you cannot approve an order you created' using errcode = '42501';
    end if;
    new.approved_by := v_uid;
    new.approved_at := now();
  elsif old.status = 'approved' and new.status = 'sent' then
    new.sent_at := now();
  elsif old.status = 'partially_received' and new.status = 'received' then
    new.closed_at := now();
  elsif new.status = 'cancelled' and old.status not in ('received', 'cancelled') then
    new.closed_at := now();
  else
    raise exception 'An order cannot go from % to %', old.status, new.status using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger purchase_orders_guard
  before insert or update on public.purchase_orders
  for each row execute function app.guard_purchase_order();

-- Lines can be edited freely while the order is a draft or awaiting approval. After that
-- the quantities are frozen; the only thing staff may still record is what actually turned
-- up (variant_received) and a note. qty_received is never client-writable.
create or replace function app.guard_purchase_order_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     text := app.auth_user_id();
  v_status  public.purchase_order_status;
begin
  if v_uid is null or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  select o.status into v_status
  from public.purchase_orders o
  where o.id = coalesce(new.purchase_order_id, old.purchase_order_id);

  if tg_op = 'DELETE' then
    if v_status not in ('draft', 'awaiting_approval') then
      raise exception 'Lines cannot be removed once an order is approved' using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_status not in ('draft', 'awaiting_approval') then
      raise exception 'Lines cannot be added once an order is approved' using errcode = '23514';
    end if;
    new.qty_received := 0;
    new.received_at  := null;
    new.received_by  := null;
    return new;
  end if;

  if new.purchase_order_id <> old.purchase_order_id then
    raise exception 'A line cannot be moved to another order' using errcode = '23514';
  end if;
  if (v_status not in ('draft', 'awaiting_approval') or not app.is_manager())
     and (new.item_id, new.name, new.sku, new.color_code, new.variant, new.qty_ordered, new.discontinued, new.line_no)
         is distinct from
         (old.item_id, old.name, old.sku, old.color_code, old.variant, old.qty_ordered, old.discontinued, old.line_no) then
    -- One exception: a manager may match an unmatched line to an item so it can be received.
    if app.is_manager() and old.item_id is null
       and (new.name, new.sku, new.color_code, new.variant, new.qty_ordered, new.discontinued, new.line_no)
           is not distinct from
           (old.name, old.sku, old.color_code, old.variant, old.qty_ordered, old.discontinued, old.line_no) then
      return new;
    end if;
    raise exception 'Only the delivered variant and note can be changed on this line' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger purchase_order_lines_guard
  before insert or update or delete on public.purchase_order_lines
  for each row execute function app.guard_purchase_order_line();

-- ---------------------------------------------------------------- count workflow

-- Allowed status changes for signed-in users:
--   scheduled   -> in_progress   the assigned counter (or a manager) starts
--   in_progress -> submitted     the assigned counter (or a manager) submits
--   submitted   -> in_progress   a manager asks for a recount
--   submitted   -> approved      owner or manager who did NOT perform the count
-- Approval is what posts the count to the ledger (app.post_count_movements).
create or replace function app.guard_count_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      text := app.auth_user_id();
  v_manager  boolean;
begin
  if v_uid is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by   := v_uid;
    new.status       := 'scheduled';
    new.started_at   := null;
    new.submitted_at := null;
    new.submitted_by := null;
    new.approved_by  := null;
    new.approved_at  := null;
    return new;
  end if;

  v_manager := app.is_manager();

  if new.location_id <> old.location_id then
    raise exception 'A count cannot be moved to another location' using errcode = '23514';
  end if;

  if new.status = old.status then
    if (new.area, new.name, new.assigned_to, new.due_at, new.blind)
       is distinct from (old.area, old.name, old.assigned_to, old.due_at, old.blind) then
      if not v_manager then
        raise exception 'Only a manager or owner can reschedule or reassign a count' using errcode = '42501';
      end if;
      if old.status = 'approved' then
        raise exception 'An approved count cannot be changed' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  if old.status = 'scheduled' and new.status = 'in_progress' then
    if not (v_uid = old.assigned_to or v_manager) then
      raise exception 'This count is assigned to someone else' using errcode = '42501';
    end if;
    new.started_at := now();
  elsif old.status = 'in_progress' and new.status = 'submitted' then
    if not (v_uid = old.assigned_to or v_manager) then
      raise exception 'This count is assigned to someone else' using errcode = '42501';
    end if;
    new.submitted_at := now();
    new.submitted_by := v_uid;
  elsif old.status = 'submitted' and new.status = 'in_progress' then
    if not v_manager then
      raise exception 'Only a manager or owner can send a count back for a recount' using errcode = '42501';
    end if;
    new.submitted_at := null;
    new.submitted_by := null;
  elsif old.status = 'submitted' and new.status = 'approved' then
    if not v_manager then
      raise exception 'Only a manager or owner can approve a count' using errcode = '42501';
    end if;
    -- Separation of duties: the person who counted does not approve the result.
    if v_uid = old.assigned_to
       or v_uid = old.submitted_by
       or exists (
         select 1 from public.count_lines l
         where l.count_session_id = old.id and l.counted_by = v_uid
       ) then
      raise exception 'Separation of duties: you cannot approve a count you performed' using errcode = '42501';
    end if;
    new.approved_by := v_uid;
    new.approved_at := now();
  else
    raise exception 'A count cannot go from % to %', old.status, new.status using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger count_sessions_guard
  before insert or update on public.count_sessions
  for each row execute function app.guard_count_session();

-- Stamps each line as it is counted: who, when, and what the ledger said at that moment.
create or replace function app.guard_count_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       text := app.auth_user_id();
  v_status    public.count_status;
  v_location  text;
begin
  select s.status, s.location_id into v_status, v_location
  from public.count_sessions s
  where s.id = new.count_session_id;

  if v_uid is not null and pg_trigger_depth() = 1 then
    if v_status not in ('scheduled', 'in_progress') then
      raise exception 'This count has been submitted and can no longer be edited' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and (new.item_id <> old.item_id or new.count_session_id <> old.count_session_id) then
      raise exception 'A count line cannot be moved to another item or count' using errcode = '23514';
    end if;
  end if;

  -- Items tracked by eye: the quantity is the fill fraction.
  if new.counted_fill_level is not null then
    new.counted := case new.counted_fill_level
      when 'full' then 1
      when 'three_quarter' then 0.75
      when 'half' then 0.5
      when 'quarter' then 0.25
      else 0
    end;
  end if;

  if new.counted is null then
    new.expected   := null;
    new.counted_at := null;
    new.counted_by := null;
  elsif tg_op = 'INSERT' or old.counted is distinct from new.counted or new.expected is null then
    -- Snapshot the system quantity. A signed-in client can never supply its own value;
    -- the server (imports) may.
    if v_uid is not null or new.expected is null then
      select coalesce(
        (select s.on_hand from public.stock_levels s where s.item_id = new.item_id and s.location_id = v_location),
        0
      ) into new.expected;
    end if;
    new.counted_at := now();
    new.counted_by := coalesce(v_uid, new.counted_by);
  end if;

  return new;
end;
$$;

create trigger count_lines_guard
  before insert or update on public.count_lines
  for each row execute function app.guard_count_line();

-- When a count is approved, post one `count` movement per counted line. delta is
-- counted - expected, so anything received or used between the count and its approval is
-- preserved. A line with no variance still gets a zero movement: it is the evidence that
-- the item was counted, and it updates last_counted_at.
create or replace function app.post_count_movements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_movements
    (item_id, location_id, type, delta, reason, user_id, occurred_at, note, count_session_id, fill_level_after, is_sample)
  select
    l.item_id,
    new.location_id,
    'count',
    l.counted - coalesce(l.expected, 0),
    'cycle_count',
    coalesce(l.counted_by, new.submitted_by, new.assigned_to),
    now(),
    l.note,
    new.id,
    l.counted_fill_level,
    new.is_sample
  from public.count_lines l
  where l.count_session_id = new.id
    and l.counted is not null;
  return null;
end;
$$;

create trigger count_sessions_post_movements
  after update on public.count_sessions
  for each row
  when (old.status is distinct from new.status and new.status = 'approved')
  execute function app.post_count_movements();

-- ---------------------------------------------------------------- flag workflow

create or replace function app.guard_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := app.auth_user_id();
begin
  if v_uid is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if not app.is_manager() then
    raise exception 'Only a manager or owner can work a flag' using errcode = '42501';
  end if;

  if new.status in ('resolved', 'dismissed') and old.status not in ('resolved', 'dismissed') then
    -- Separation of duties: the person a finding is about does not close it.
    if old.user_id = v_uid then
      raise exception 'Separation of duties: you cannot close a flag about your own activity' using errcode = '42501';
    end if;
    new.resolved_by := v_uid;
    new.resolved_at := now();
  elsif new.status in ('open', 'reviewing') and old.status in ('resolved', 'dismissed') then
    new.resolved_by := null;
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

create trigger flags_guard
  before update on public.flags
  for each row execute function app.guard_flag();

-- Keeps the flag's history without relying on the client to write it.
create or replace function app.log_flag_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := app.auth_user_id();
begin
  if tg_op = 'INSERT' then
    insert into public.flag_events (flag_id, type, user_id, to_status)
    values (new.id, 'created', v_uid, new.status);
    return null;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.flag_events (flag_id, type, user_id, assigned_to)
    values (new.id, 'assigned', v_uid, new.assigned_to);
  end if;
  if new.status is distinct from old.status then
    insert into public.flag_events (flag_id, type, user_id, from_status, to_status, note)
    values (
      new.id, 'status_changed', v_uid, old.status, new.status,
      case when new.status in ('resolved', 'dismissed') then new.resolution_note end
    );
  end if;
  return null;
end;
$$;

create trigger flags_log_event
  after insert or update on public.flags
  for each row execute function app.log_flag_event();

-- Notes are always written as the caller.
create or replace function app.stamp_flag_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.auth_user_id() is not null and pg_trigger_depth() = 1 then
    new.user_id    := app.auth_user_id();
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger flag_events_stamp
  before insert on public.flag_events
  for each row execute function app.stamp_flag_event();

-- ---------------------------------------------------------------- audit log

-- Generic row audit. Trigger arguments are the primary-key column names, used to build
-- row_id ("item_id:location_id" for composite keys).
create or replace function app.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old       jsonb;
  v_new       jsonb;
  v_row       jsonb;
  v_row_id    text := '';
  v_location  text;
  v_key       text;
  -- Never copied into the log: secrets, and counters that change on every request.
  v_hidden    text[] := array['pin_hash'];
  v_noise     text[] := array['updated_at', 'last_active_at'];
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old) - v_hidden;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new) - v_hidden;
  end if;

  -- Skip updates that changed nothing worth recording.
  if tg_op = 'UPDATE' and (v_old - v_noise) = (v_new - v_noise) then
    return null;
  end if;

  v_row := coalesce(v_new, v_old);

  foreach v_key in array tg_argv loop
    v_row_id := v_row_id || case when v_row_id = '' then '' else ':' end || coalesce(v_row ->> v_key, '');
  end loop;

  -- Work out the location so managers can be limited to their own.
  v_location := v_row ->> 'location_id';
  if v_location is null and v_row ? 'purchase_order_id' then
    select o.location_id into v_location from public.purchase_orders o where o.id = v_row ->> 'purchase_order_id';
  end if;
  if v_location is null and v_row ? 'count_session_id' then
    select s.location_id into v_location from public.count_sessions s where s.id = v_row ->> 'count_session_id';
  end if;

  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, location_id, old_row, new_row)
  values (app.auth_user_id(), app.auth_role(), lower(tg_op), tg_table_name, v_row_id, v_location, v_old, v_new);

  return null;
end;
$$;

-- Orders, counts, flags and items (the four the controls depend on)...
create trigger audit after insert or update or delete on public.purchase_orders
  for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.purchase_order_lines
  for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.count_sessions
  for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.count_lines
  for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.flags
  for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.items
  for each row execute function app.audit('id');

-- ...plus configuration that changes what the controls mean: costs, roles, location access,
-- vendors, thresholds, notification rules.
create trigger audit after insert or update or delete on public.item_costs
  for each row execute function app.audit('item_id');
create trigger audit after insert or update or delete on public.purchase_order_line_costs
  for each row execute function app.audit('purchase_order_line_id');
create trigger audit after insert or update or delete on public.profiles
  for each row execute function app.audit('id');
create trigger audit after insert or delete on public.profile_locations
  for each row execute function app.audit('profile_id', 'location_id');
create trigger audit after insert or update or delete on public.vendors
  for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.settings
  for each row execute function app.audit('id');
create trigger audit after insert or update or delete on public.notification_rules
  for each row execute function app.audit('id');

-- Par levels and shelf moves are audited; on_hand is not, because the ledger already is
-- the record of every on_hand change.
create trigger audit_config
  after update on public.stock_levels
  for each row
  when (
    (old.area, old.shelf, old.par, old.par_rule, old.par_note, old.reorder_requested, old.reorder_qty)
    is distinct from
    (new.area, new.shelf, new.par, new.par_rule, new.par_note, new.reorder_requested, new.reorder_qty)
  )
  execute function app.audit('item_id', 'location_id');

-- =====================================================================================
-- 11. Views
-- =====================================================================================
--
-- security_invoker = true makes a view run with the caller's privileges and policies, so
-- these views cannot leak anything the caller could not read from the tables directly.

-- The Item shape from types.ts. unit_cost is null unless the caller is an owner or manager.
create view public.items_with_cost
with (security_invoker = true)
as
select
  i.*,
  c.unit_cost,
  c.cost_is_sample
from public.items i
left join public.item_costs c on c.item_id = i.id;

-- The PurchaseOrderLine shape. Falls back to the catalogue cost when the order has no price.
create view public.purchase_order_lines_with_cost
with (security_invoker = true)
as
select
  l.*,
  coalesce(lc.unit_cost, ic.unit_cost) as unit_cost
from public.purchase_order_lines l
left join public.purchase_order_line_costs lc on lc.purchase_order_line_id = l.id
left join public.item_costs ic on ic.item_id = l.item_id;

-- =====================================================================================
-- 12. Grants
-- =====================================================================================
--
-- Privileges are set explicitly so this migration does not depend on a project's default
-- grants. Two layers apply to every request from a signed-in user:
--   GRANT   which operations and columns the `authenticated` role may touch at all
--   POLICY  which rows (section 13)
-- `anon` (no session) gets nothing. `service_role` (server only) bypasses policies.

grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Append-only tables: not even the server may rewrite history.
revoke update, delete, truncate on public.stock_movements from service_role;
revoke update, delete, truncate on public.audit_log from service_role;

-- Reference data
grant select on public.locations to authenticated;
grant update (name, short_name, timezone) on public.locations to authenticated;
grant select, insert, update on public.vendors to authenticated;

-- People. COLUMN-LEVEL SELECT: pin_hash, failed_pin_attempts and pin_locked_until are left
-- out, so no signed-in user can read a PIN hash or the lockout state, whatever the row
-- policy says. (`select *` on profiles is therefore refused; name the columns, as apps/web
-- does.)
grant select (id, email, name, role, active, has_pin, pin_updated_at, last_active_at, created_at, updated_at)
  on public.profiles to authenticated;
grant update (name, role, active) on public.profiles to authenticated;
grant select, insert, delete on public.profile_locations to authenticated;

-- Catalogue
grant select, insert on public.items to authenticated;
grant update (kind, name, brand, category, vendor_id, unit, polish_line, color_code, color_family, swatch, sku,
              abc_class, discontinued, image_url, description, note)
  on public.items to authenticated;
grant select, insert, update, delete on public.item_costs to authenticated;
grant select, insert, update, delete on public.item_barcodes to authenticated;
grant select, insert, update, delete on public.shelves to authenticated;

-- Stock. COLUMN-LEVEL UPDATE: on_hand, fill_level and the last-counted fields are absent,
-- so the ledger is the only way to change them.
grant select on public.stock_levels to authenticated;
grant insert (item_id, location_id, area, shelf, par, par_rule, par_note, reorder_requested, reorder_qty)
  on public.stock_levels to authenticated;
grant update (area, shelf, par, par_rule, par_note, reorder_requested, reorder_qty)
  on public.stock_levels to authenticated;

-- The ledger: read and append only. balance_after, created_at and is_sample are not
-- insertable; user_id and occurred_at are overwritten by the trigger.
grant select on public.stock_movements to authenticated;
grant insert (id, item_id, location_id, type, delta, reason, user_id, occurred_at, note,
              purchase_order_id, purchase_order_line_id, count_session_id, fill_level_after)
  on public.stock_movements to authenticated;

-- Purchasing. Approval and receipt fields are set by triggers, never by the client.
grant select, delete on public.purchase_orders to authenticated;
grant insert (id, number, location_id, vendor_id, kind, cycle, note) on public.purchase_orders to authenticated;
grant update (number, vendor_id, kind, cycle, note, status) on public.purchase_orders to authenticated;
grant select, delete on public.purchase_order_lines to authenticated;
grant insert (id, purchase_order_id, line_no, item_id, name, sku, color_code, variant, qty_ordered, note, discontinued)
  on public.purchase_order_lines to authenticated;
grant update (line_no, item_id, name, sku, color_code, variant, qty_ordered, variant_received, note, discontinued)
  on public.purchase_order_lines to authenticated;
grant select, insert, update, delete on public.purchase_order_line_costs to authenticated;

-- Counting. `expected`, `counted_by` and `counted_at` are set by the trigger.
grant select, delete on public.count_sessions to authenticated;
grant insert (id, location_id, area, name, assigned_to, due_at, blind) on public.count_sessions to authenticated;
grant update (area, name, assigned_to, due_at, blind, status) on public.count_sessions to authenticated;
grant select, delete on public.count_lines to authenticated;
grant insert (id, count_session_id, item_id, counted, counted_fill_level, note) on public.count_lines to authenticated;
grant update (counted, counted_fill_level, note) on public.count_lines to authenticated;

-- Flags are created by the scheduled scan (service role). Managers work them.
grant select on public.flags to authenticated;
grant update (status, assigned_to, resolution_note) on public.flags to authenticated;
grant select on public.flag_events to authenticated;
grant insert (flag_id, type, note) on public.flag_events to authenticated;

-- Configuration and history
grant select on public.notification_rules to authenticated;
grant update (roles, enabled) on public.notification_rules to authenticated;
grant select on public.digest_runs to authenticated;
grant select, insert on public.settings to authenticated;
grant update (flag_thresholds) on public.settings to authenticated;
grant select on public.audit_log to authenticated;

-- Views
grant select on public.items_with_cost to authenticated, service_role;
grant select on public.purchase_order_lines_with_cost to authenticated, service_role;

-- =====================================================================================
-- 13. Row-level security
-- =====================================================================================
--
-- RLS is ON for every table. With RLS on and no matching policy, a request sees and
-- changes nothing, so anything not granted below is denied.
--
-- Policy groups (the README describes each in a sentence):
--   A. location scoping        staff see only their locations; owners see all
--   B. catalogue               everyone reads; owners and managers write
--   C. costs                   owners and managers only
--   D. the ledger              append by role: front desk receives, technicians log use,
--                              managers adjust and transfer; nobody updates or deletes
--   E. purchasing              managers and owners order; front desk can read to receive
--   F. counting                the assignee counts; managers and owners approve
--   G. flags                   managers and owners only
--   H. people and settings     owners administer
--   I. history                 audit log and digest runs, read-only
--
-- `(select app.fn())` rather than `app.fn()`: Postgres then evaluates the helper once per
-- statement instead of once per row.

alter table public.locations                 enable row level security;
alter table public.vendors                   enable row level security;
alter table public.profiles                  enable row level security;
alter table public.profile_locations         enable row level security;
alter table public.items                     enable row level security;
alter table public.item_costs                enable row level security;
alter table public.item_barcodes             enable row level security;
alter table public.shelves                   enable row level security;
alter table public.stock_levels              enable row level security;
alter table public.stock_movements           enable row level security;
alter table public.purchase_orders           enable row level security;
alter table public.purchase_order_lines      enable row level security;
alter table public.purchase_order_line_costs enable row level security;
alter table public.count_sessions            enable row level security;
alter table public.count_lines               enable row level security;
alter table public.flags                     enable row level security;
alter table public.flag_events               enable row level security;
alter table public.notification_rules        enable row level security;
alter table public.digest_runs               enable row level security;
alter table public.settings                  enable row level security;
alter table public.audit_log                 enable row level security;

-- ---------------------------------------------------------------- A. location scoping

create policy "locations: staff read their own, owners read all"
  on public.locations for select to authenticated
  using ((select app.has_location(id)));

create policy "locations: owners edit"
  on public.locations for update to authenticated
  using ((select app.auth_role()) = 'owner')
  with check ((select app.auth_role()) = 'owner');

create policy "shelves: read at own locations"
  on public.shelves for select to authenticated
  using ((select app.has_location(location_id)));

create policy "shelves: managers and owners add"
  on public.shelves for insert to authenticated
  with check ((select app.is_manager()) and (select app.has_location(location_id)));

create policy "shelves: managers and owners edit"
  on public.shelves for update to authenticated
  using ((select app.is_manager()) and (select app.has_location(location_id)))
  with check ((select app.is_manager()) and (select app.has_location(location_id)));

create policy "shelves: managers and owners remove"
  on public.shelves for delete to authenticated
  using ((select app.is_manager()) and (select app.has_location(location_id)));

create policy "stock_levels: read at own locations"
  on public.stock_levels for select to authenticated
  using ((select app.has_location(location_id)));

create policy "stock_levels: managers and owners add an item to a location"
  on public.stock_levels for insert to authenticated
  with check ((select app.is_manager()) and (select app.has_location(location_id)));

-- Any staff member at the location may update, because front desk and technicians raise
-- reorder requests. app.guard_stock_level() limits them to those two columns, and the
-- column grants keep on_hand out of everyone's reach.
create policy "stock_levels: staff update at own locations"
  on public.stock_levels for update to authenticated
  using ((select app.has_location(location_id)))
  with check ((select app.has_location(location_id)));

-- ---------------------------------------------------------------- B. catalogue

create policy "vendors: all staff read"
  on public.vendors for select to authenticated
  using ((select app.auth_role()) is not null);

create policy "vendors: managers and owners add"
  on public.vendors for insert to authenticated
  with check ((select app.is_manager()));

create policy "vendors: managers and owners edit"
  on public.vendors for update to authenticated
  using ((select app.is_manager()))
  with check ((select app.is_manager()));

create policy "items: all staff read"
  on public.items for select to authenticated
  using ((select app.auth_role()) is not null);

create policy "items: managers and owners add"
  on public.items for insert to authenticated
  with check ((select app.is_manager()));

create policy "items: managers and owners edit"
  on public.items for update to authenticated
  using ((select app.is_manager()))
  with check ((select app.is_manager()));
-- No delete policy on items: discontinue instead.

create policy "item_barcodes: all staff read"
  on public.item_barcodes for select to authenticated
  using ((select app.auth_role()) is not null);

-- Front desk can attach a barcode while receiving; technicians cannot.
create policy "item_barcodes: front desk, managers and owners add"
  on public.item_barcodes for insert to authenticated
  with check (
    (select app.auth_role()) in ('owner', 'manager', 'front_desk')
    and created_by = (select app.auth_user_id())
  );

create policy "item_barcodes: managers and owners edit"
  on public.item_barcodes for update to authenticated
  using ((select app.is_manager()))
  with check ((select app.is_manager()));

create policy "item_barcodes: managers and owners remove"
  on public.item_barcodes for delete to authenticated
  using ((select app.is_manager()));

-- ---------------------------------------------------------------- C. costs

create policy "item_costs: managers and owners read"
  on public.item_costs for select to authenticated
  using ((select app.is_manager()));

create policy "item_costs: managers and owners add"
  on public.item_costs for insert to authenticated
  with check ((select app.is_manager()));

create policy "item_costs: managers and owners edit"
  on public.item_costs for update to authenticated
  using ((select app.is_manager()))
  with check ((select app.is_manager()));

create policy "item_costs: managers and owners remove"
  on public.item_costs for delete to authenticated
  using ((select app.is_manager()));

-- A line cost is visible only if the line is (the subquery runs under the caller's own
-- policies on purchase_order_lines and purchase_orders).
create policy "purchase_order_line_costs: managers and owners read"
  on public.purchase_order_line_costs for select to authenticated
  using (
    (select app.is_manager())
    and exists (select 1 from public.purchase_order_lines l where l.id = purchase_order_line_id)
  );

create policy "purchase_order_line_costs: managers and owners add"
  on public.purchase_order_line_costs for insert to authenticated
  with check (
    (select app.is_manager())
    and exists (select 1 from public.purchase_order_lines l where l.id = purchase_order_line_id)
  );

create policy "purchase_order_line_costs: managers and owners edit"
  on public.purchase_order_line_costs for update to authenticated
  using (
    (select app.is_manager())
    and exists (select 1 from public.purchase_order_lines l where l.id = purchase_order_line_id)
  )
  with check ((select app.is_manager()));

create policy "purchase_order_line_costs: managers and owners remove"
  on public.purchase_order_line_costs for delete to authenticated
  using (
    (select app.is_manager())
    and exists (select 1 from public.purchase_order_lines l where l.id = purchase_order_line_id)
  );

-- ---------------------------------------------------------------- D. the ledger

-- Managers and owners read the whole ledger for their locations. Other staff read only
-- their own entries: enough to see what they logged, not enough to study the controls.
create policy "stock_movements: managers read their locations, staff read their own"
  on public.stock_movements for select to authenticated
  using (
    (select app.has_location(location_id))
    and ((select app.is_manager()) or user_id = (select app.auth_user_id()))
  );

-- One INSERT policy per duty. They are permissive, so a row is accepted if it satisfies
-- any one of them. There is no policy that admits type = 'count': count movements are
-- posted only by the approval trigger.
create policy "stock_movements: front desk, managers and owners receive"
  on public.stock_movements for insert to authenticated
  with check (
    type = 'receive'
    and (select app.auth_role()) in ('owner', 'manager', 'front_desk')
    and (select app.has_location(location_id))
  );

create policy "stock_movements: technicians and all other staff log use"
  on public.stock_movements for insert to authenticated
  with check (
    type = 'use'
    and (select app.auth_role()) in ('owner', 'manager', 'front_desk', 'technician')
    and (select app.has_location(location_id))
  );

create policy "stock_movements: managers and owners adjust and transfer"
  on public.stock_movements for insert to authenticated
  with check (
    type in ('adjust', 'transfer_in', 'transfer_out')
    and (select app.is_manager())
    and (select app.has_location(location_id))
  );
-- No UPDATE or DELETE policy, no UPDATE or DELETE grant, and a trigger that raises.

-- ---------------------------------------------------------------- E. purchasing

-- Technicians do not see orders. Front desk does, in order to receive against them.
create policy "purchase_orders: front desk, managers and owners read at own locations"
  on public.purchase_orders for select to authenticated
  using (
    (select app.auth_role()) in ('owner', 'manager', 'front_desk')
    and (select app.has_location(location_id))
  );

create policy "purchase_orders: managers and owners create"
  on public.purchase_orders for insert to authenticated
  with check ((select app.is_manager()) and (select app.has_location(location_id)));

-- Which status changes are legal, and who may approve, is decided by
-- app.guard_purchase_order(): in particular, not the person who created the order.
create policy "purchase_orders: managers and owners update"
  on public.purchase_orders for update to authenticated
  using ((select app.is_manager()) and (select app.has_location(location_id)))
  with check ((select app.is_manager()) and (select app.has_location(location_id)));

create policy "purchase_orders: managers and owners delete drafts"
  on public.purchase_orders for delete to authenticated
  using (
    status = 'draft'
    and (select app.is_manager())
    and (select app.has_location(location_id))
  );

create policy "purchase_order_lines: read with the order"
  on public.purchase_order_lines for select to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = purchase_order_id));

create policy "purchase_order_lines: managers and owners add"
  on public.purchase_order_lines for insert to authenticated
  with check (
    (select app.is_manager())
    and exists (select 1 from public.purchase_orders o where o.id = purchase_order_id)
  );

-- Front desk is included so they can record the delivered variant and a note while
-- receiving; app.guard_purchase_order_line() stops them changing anything else.
create policy "purchase_order_lines: front desk, managers and owners update"
  on public.purchase_order_lines for update to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = purchase_order_id))
  with check (exists (select 1 from public.purchase_orders o where o.id = purchase_order_id));

create policy "purchase_order_lines: managers and owners remove"
  on public.purchase_order_lines for delete to authenticated
  using (
    (select app.is_manager())
    and exists (select 1 from public.purchase_orders o where o.id = purchase_order_id)
  );

-- ---------------------------------------------------------------- F. counting

create policy "count_sessions: assignee, managers and owners read"
  on public.count_sessions for select to authenticated
  using (
    (select app.has_location(location_id))
    and ((select app.is_manager()) or assigned_to = (select app.auth_user_id()))
  );

create policy "count_sessions: managers and owners schedule"
  on public.count_sessions for insert to authenticated
  with check ((select app.is_manager()) and (select app.has_location(location_id)));

-- The assignee may update (to start and submit). Approval is limited to a manager or owner
-- who did not perform the count by app.guard_count_session().
create policy "count_sessions: assignee, managers and owners update"
  on public.count_sessions for update to authenticated
  using (
    (select app.has_location(location_id))
    and ((select app.is_manager()) or assigned_to = (select app.auth_user_id()))
  )
  with check (
    (select app.has_location(location_id))
    and ((select app.is_manager()) or assigned_to = (select app.auth_user_id()))
  );

create policy "count_sessions: managers and owners delete unstarted counts"
  on public.count_sessions for delete to authenticated
  using (
    status = 'scheduled'
    and (select app.is_manager())
    and (select app.has_location(location_id))
  );

create policy "count_lines: read with the count"
  on public.count_lines for select to authenticated
  using (exists (select 1 from public.count_sessions s where s.id = count_session_id));

create policy "count_lines: managers and owners build the sheet"
  on public.count_lines for insert to authenticated
  with check (
    (select app.is_manager())
    and exists (select 1 from public.count_sessions s where s.id = count_session_id)
  );

create policy "count_lines: whoever can see the count enters quantities"
  on public.count_lines for update to authenticated
  using (exists (select 1 from public.count_sessions s where s.id = count_session_id))
  with check (exists (select 1 from public.count_sessions s where s.id = count_session_id));

create policy "count_lines: managers and owners remove lines"
  on public.count_lines for delete to authenticated
  using (
    (select app.is_manager())
    and exists (
      select 1 from public.count_sessions s
      where s.id = count_session_id and s.status in ('scheduled', 'in_progress')
    )
  );

-- ---------------------------------------------------------------- G. flags

-- Front desk and technicians never see flags: a flag can be about them.
create policy "flags: managers and owners read at own locations"
  on public.flags for select to authenticated
  using ((select app.is_manager()) and (select app.has_location(location_id)));

-- Assign, note, resolve, dismiss. app.guard_flag() stamps resolved_by and refuses to let
-- the subject of a flag close it.
create policy "flags: managers and owners work flags at own locations"
  on public.flags for update to authenticated
  using ((select app.is_manager()) and (select app.has_location(location_id)))
  with check ((select app.is_manager()) and (select app.has_location(location_id)));
-- No INSERT or DELETE policy: flags come from the scheduled scan.

create policy "flag_events: read with the flag"
  on public.flag_events for select to authenticated
  using (exists (select 1 from public.flags f where f.id = flag_id));

create policy "flag_events: managers and owners add notes"
  on public.flag_events for insert to authenticated
  with check (
    type = 'note'
    and (select app.is_manager())
    and exists (select 1 from public.flags f where f.id = flag_id)
  );

-- ---------------------------------------------------------------- H. people and settings

create policy "profiles: read self, owners read all, managers read their locations"
  on public.profiles for select to authenticated
  using (
    id = (select app.auth_user_id())
    or (select app.auth_role()) = 'owner'
    or (
      (select app.auth_role()) = 'manager'
      and exists (
        select 1 from public.profile_locations pl
        where pl.profile_id = profiles.id and app.has_location(pl.location_id)
      )
    )
  );

-- Role, name and active only (column grants); app.guard_profile() stops self-promotion.
-- Profiles are created by the server on first sign-in, so there is no INSERT policy.
create policy "profiles: owners edit"
  on public.profiles for update to authenticated
  using ((select app.auth_role()) = 'owner')
  with check ((select app.auth_role()) = 'owner');

create policy "profile_locations: read self, owners read all, managers read their locations"
  on public.profile_locations for select to authenticated
  using (
    profile_id = (select app.auth_user_id())
    or (select app.auth_role()) = 'owner'
    or ((select app.auth_role()) = 'manager' and app.has_location(location_id))
  );

create policy "profile_locations: owners assign"
  on public.profile_locations for insert to authenticated
  with check ((select app.auth_role()) = 'owner');

create policy "profile_locations: owners unassign"
  on public.profile_locations for delete to authenticated
  using ((select app.auth_role()) = 'owner');

create policy "notification_rules: all staff read"
  on public.notification_rules for select to authenticated
  using ((select app.auth_role()) is not null);

create policy "notification_rules: owners edit"
  on public.notification_rules for update to authenticated
  using ((select app.auth_role()) = 'owner')
  with check ((select app.auth_role()) = 'owner');

-- Thresholds describe exactly what the flag engine will and will not notice, so only
-- managers and owners can read them and only owners can change them.
create policy "settings: managers and owners read"
  on public.settings for select to authenticated
  using (
    (select app.is_manager())
    and (location_id is null or (select app.has_location(location_id)))
  );

create policy "settings: owners add"
  on public.settings for insert to authenticated
  with check ((select app.auth_role()) = 'owner');

create policy "settings: owners edit"
  on public.settings for update to authenticated
  using ((select app.auth_role()) = 'owner')
  with check ((select app.auth_role()) = 'owner');

-- ---------------------------------------------------------------- I. history

create policy "audit_log: owners read all, managers read their locations"
  on public.audit_log for select to authenticated
  using (
    (select app.auth_role()) = 'owner'
    or (
      (select app.auth_role()) = 'manager'
      and location_id is not null
      and (select app.has_location(location_id))
    )
  );
-- No write policy: rows come only from app.audit().

create policy "digest_runs: owners read all, managers read their locations"
  on public.digest_runs for select to authenticated
  using (
    (select app.auth_role()) = 'owner'
    or (
      (select app.auth_role()) = 'manager'
      and location_id is not null
      and (select app.has_location(location_id))
    )
  );
-- No write policy: rows come only from the cron route (service role).

-- =====================================================================================
-- 14. Default configuration
-- =====================================================================================
-- Application defaults, not client data. Locations and vendors are in supabase/seed.sql.

-- Mirrors FLAG_THRESHOLDS in packages/ui/engine/flags.ts.
insert into public.settings (location_id, flag_thresholds)
values (
  null,
  jsonb_build_object(
    'countVariancePct', 0.2,
    'countVarianceMinUnits', 2,
    'countVarianceHighPct', 0.4,
    'orderSpikeMultiple', 2,
    'orderSpikeMinExtraUnits', 4,
    'overParMultiple', 1.5,
    'overdueReceiptDays', 21,
    'adjustmentNoteUnits', 3,
    'openHour', 8,
    'closeHour', 20
  )
);

insert into public.notification_rules (id, label, description, channel, roles, enabled) values
  ('weekly-digest',     'Weekly digest',              'Monday 7:00 AM. Low stock, open flags, what to order this week.',                                         'email',  '{owner,manager}',                  true),
  ('monthly-digest',    'Monthly digest',             'First of the month. Spend, vendor performance, shrinkage and forecast for the month ahead.',              'email',  '{owner}',                          true),
  ('high-flag',         'High-severity flag',         'Sent when a count is far short, stock is written off after hours, or theft is suspected.',                'email',  '{owner,manager}',                  true),
  ('order-approval',    'Order waiting for approval', 'When a manager submits a purchase order.',                                                                'email',  '{owner}',                          true),
  ('count-due',         'Count due',                  'The morning a count is assigned to you.',                                                                 'in_app', '{manager,front_desk,technician}',  true),
  ('delivery-expected', 'Delivery expected',          'When an order is due to arrive at your location.',                                                        'in_app', '{front_desk}',                     false);
