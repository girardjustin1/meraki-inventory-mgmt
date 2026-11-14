-- =====================================================================================
-- Meraki Inventory: access levels (Admin / User) and invite links
-- =====================================================================================
--
-- Apply after 0001_init.sql. Safe on a database that already holds profiles: existing owners
-- become admins, everyone else becomes a user. Not written to be re-run.
--
-- The model mirrors packages/ui/engine/permissions.ts, which is the single source for the
-- screens. Change both together.
--
--   ACCESS LEVEL   admin  everything, at every location, including team, invites, settings
--                  user   what their ROLE grants, at their own locations
--   ROLE           owner (always an admin), manager, front_desk, technician
--
-- Separation of duties is unchanged and binds admins exactly as it binds everyone else:
-- nobody approves an order they created, receives an order they created, approves a count
-- they performed, or closes a flag about themselves.
--
-- Sections:
--    1. Access level on profiles
--    2. Permission helpers (auth_is_admin, role_grants, can) and the two redefined helpers
--    3. Profile guard rails: own role / own access level, owners are admins, last admin
--    4. Order approval is admin-only
--    5. Audit log: named events, and never the token hash
--    6. Policies reworked to the permission model
--    7. Invites: table, constraints, guard trigger, status view
--    8. Invites: grants and row-level security
--    9. invite_preview() and accept_invite()

-- =====================================================================================
-- 1. Access level on profiles
-- =====================================================================================

create type public.access_level as enum ('admin', 'user');

alter table public.profiles
  add column access_level public.access_level not null default 'user';

-- Before this migration "owner" was the only way to hold full access, so owners carry over
-- as admins and nobody loses anything.
update public.profiles set access_level = 'admin' where role = 'owner';

-- Owners are always admins. A constraint, so it holds for every writer including the
-- service role and the SQL editor. The profile trigger (section 3) fills the value in, so
-- `insert into profiles (..., role) values (..., 'owner')` still works without naming it.
alter table public.profiles
  add constraint profiles_owner_is_admin check (role <> 'owner' or access_level = 'admin');

create index profiles_admin_idx on public.profiles (id) where active and access_level = 'admin';

comment on column public.profiles.access_level is
  'admin = everything at every location; user = what the role grants at their own locations. Owners are always admins.';

-- =====================================================================================
-- 2. Permission helpers
-- =====================================================================================

-- True when the caller is an active admin.
create or replace function app.auth_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.access_level = 'admin' or p.role = 'owner'
      from public.profiles p
      where p.id = app.auth_user_id()
        and p.active
    ),
    false
  )
$$;

-- What a role grants a USER. This is ROLE_GRANTS from packages/ui/engine/permissions.ts,
-- with roles and nothing else translated to snake_case. tools/db/check-schema.mjs reads
-- that file and fails if the two lists differ.
-- An unknown permission raises, so a typo in a policy is an error and not a silent "no".
create or replace function app.role_grants(p_role public.user_role, p_permission text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_permission not in (
    'stock.view', 'stock.count', 'stock.adjust', 'usage.log',
    'counts.schedule', 'counts.approve',
    'orders.view', 'orders.create', 'orders.approve', 'orders.receive',
    'flags.view', 'flags.resolve', 'costs.view', 'reports.view', 'digests.view', 'activity.view',
    'team.manage', 'settings.manage', 'locations.all'
  ) then
    raise exception 'Unknown permission "%"', p_permission using errcode = '22023';
  end if;

  return case p_role
    -- Owners are always admins, so this row only matters as documentation.
    when 'owner' then true
    when 'manager' then p_permission in (
      'stock.view', 'stock.count', 'usage.log', 'stock.adjust',
      'counts.schedule', 'counts.approve',
      'orders.view', 'orders.create', 'orders.receive',
      'flags.view', 'flags.resolve', 'costs.view', 'reports.view', 'digests.view', 'activity.view'
    )
    when 'front_desk' then p_permission in ('stock.view', 'stock.count', 'usage.log', 'orders.view', 'orders.receive')
    when 'technician' then p_permission in ('stock.view', 'stock.count', 'usage.log')
    else false
  end;
end;
$$;

-- Can the caller do this? Admins: always. Users: when their role grants it.
-- The same question as can() in permissions.ts, without the location part.
create or replace function app.can(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select app.role_grants(p.role, p_permission) or p.access_level = 'admin'
      from public.profiles p
      where p.id = app.auth_user_id()
        and p.active
    ),
    false
  )
$$;

-- REDEFINED from 0001. "Manager-level" now means an admin (whatever their role) or a user
-- whose role is manager. Every 0001 policy and trigger written with is_manager() picks the
-- new meaning up from here: stock.adjust, counts.schedule, counts.approve, orders.create,
-- flags.view, flags.resolve, costs.view.
create or replace function app.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.auth_is_admin() or coalesce(app.auth_role() = 'manager', false)
$$;

-- REDEFINED from 0001. Admins act at every location ("locations.all"); users only where
-- they have a profile_locations row. Before, "every location" belonged to the owner role.
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
        p.access_level = 'admin'
        or p.role = 'owner'
        or exists (
          select 1
          from public.profile_locations pl
          where pl.profile_id = p.id
            and pl.location_id = p_location_id
        )
      )
  )
$$;

grant execute on function app.auth_is_admin() to authenticated, service_role;
grant execute on function app.role_grants(public.user_role, text) to authenticated, service_role;
grant execute on function app.can(text) to authenticated, service_role;

-- =====================================================================================
-- 3. Profile guard rails
-- =====================================================================================

-- True only inside public.accept_invite(), for the profile that function is creating or
-- reactivating. The setting is transaction-local and is set and cleared by that function.
-- Nothing reachable over the Data API can set it: API callers cannot run set_config().
create or replace function app.accepting_invite_for(p_profile_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('app.accepting_invite', true), '') = p_profile_id, false)
$$;

-- REPLACES the 0001 version, and now also runs on INSERT.
--   * owners are always admins (every writer)
--   * nobody changes their own role or access level, or deactivates themselves
--   * only an admin changes anyone's role, access level or active flag
create or replace function app.guard_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := app.auth_user_id();
begin
  if new.role = 'owner' then
    if tg_op = 'UPDATE' and old.role = 'owner' and old.access_level = 'admin' and new.access_level = 'user' then
      raise exception 'Owners are always admins. Change the role first.' using errcode = '23514';
    end if;
    new.access_level := 'admin';
  end if;

  if tg_op = 'INSERT' or v_uid is null then
    return new;
  end if;

  -- Accepting an invite is the one case where a person's own row changes under their own
  -- token: an inactive profile is switched back on with the invite's role and access.
  if app.accepting_invite_for(old.id) then
    if new.id <> old.id then
      raise exception 'Profile id comes from Clerk and cannot be edited here' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id <> old.id or new.email <> old.email then
    raise exception 'Profile id and email come from Clerk and cannot be edited here' using errcode = '42501';
  end if;
  if v_uid = old.id and (new.role <> old.role or new.access_level <> old.access_level or new.active <> old.active) then
    raise exception 'You cannot change your own role or your own access level, or deactivate yourself' using errcode = '42501';
  end if;
  if (new.role <> old.role or new.access_level <> old.access_level or new.active <> old.active)
     and not app.auth_is_admin() then
    raise exception 'Only an admin can change roles and access levels' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function app.guard_profile();

-- The last active admin cannot be demoted, deactivated or deleted, by anyone: this trigger
-- does not step aside for the service role or the SQL editor. Without an admin nobody could
-- invite, change roles or change settings again.
-- The advisory lock makes two simultaneous demotions queue up, so they cannot each see the
-- other as "the remaining admin" and both go through.
-- (Triggers fire in name order: profiles_guard has already forced owners to admin.)
create or replace function app.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (old.active and old.access_level = 'admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.active and new.access_level = 'admin' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('meraki.profiles.last_admin'));

  if not exists (
    select 1 from public.profiles p
    where p.id <> old.id and p.active and p.access_level = 'admin'
  ) then
    raise exception 'This is the last admin. Make someone else an admin first.' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger profiles_last_admin
  before update or delete on public.profiles
  for each row execute function app.guard_last_admin();

-- =====================================================================================
-- 4. Order approval is admin-only
-- =====================================================================================

-- REPLACES the 0001 version. One change: awaiting_approval -> approved needs the
-- "orders.approve" permission, which no role grants, so it takes an admin. Managers still
-- build, submit, send and close orders ("orders.create").
-- Separation of duties is checked FIRST and applies to admins too: an admin who created an
-- order cannot approve it.
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
    raise exception 'Only a manager or an admin can change an order' using errcode = '42501';
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
    -- Separation of duties: ordering and approving are different people. Admins included.
    if old.created_by = v_uid then
      raise exception 'Separation of duties: you cannot approve an order you created' using errcode = '42501';
    end if;
    if not app.can('orders.approve') then
      raise exception 'Only an admin can approve an order' using errcode = '42501';
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

-- =====================================================================================
-- 5. Audit log: named events
-- =====================================================================================

-- What happened, in words, for the changes people ask about by name. A row can carry more
-- than one (a role and an access level changed in the same update). Empty for everything
-- else; old_row and new_row still hold the full before and after.
--   profile.created  profile.role_changed  profile.access_changed
--   profile.deactivated  profile.reactivated  profile.deleted
--   profile.location_added  profile.location_removed
--   invite.created  invite.resent  invite.revoked  invite.accepted
alter table public.audit_log
  add column events text[] not null default '{}';

create index audit_log_events_idx on public.audit_log using gin (events);

-- REPLACES the 0001 version. Two changes: `events` is filled in for profiles,
-- profile_locations and invites, and token_hash joins pin_hash in the list of columns that
-- are never copied into the log.
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
  v_events    text[] := '{}';
  -- Never copied into the log: secrets, and counters that change on every request.
  v_hidden    text[] := array['pin_hash', 'token_hash'];
  v_noise     text[] := array['updated_at', 'last_active_at'];
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  -- Named events. Worked out before the hidden columns are removed, because "resent" is
  -- recognised by the token hash changing.
  if tg_table_name = 'profiles' then
    if tg_op = 'INSERT' then
      v_events := array['profile.created'];
    elsif tg_op = 'DELETE' then
      v_events := array['profile.deleted'];
    else
      if v_old ->> 'role' is distinct from v_new ->> 'role' then
        v_events := array_append(v_events, 'profile.role_changed');
      end if;
      if v_old ->> 'access_level' is distinct from v_new ->> 'access_level' then
        v_events := array_append(v_events, 'profile.access_changed');
      end if;
      if v_old ->> 'active' is distinct from v_new ->> 'active' then
        v_events := array_append(v_events, case when (v_new ->> 'active')::boolean then 'profile.reactivated' else 'profile.deactivated' end);
      end if;
    end if;
  elsif tg_table_name = 'profile_locations' then
    v_events := array[case when tg_op = 'DELETE' then 'profile.location_removed' else 'profile.location_added' end];
  elsif tg_table_name = 'invites' then
    if tg_op = 'INSERT' then
      v_events := array['invite.created'];
    elsif tg_op = 'UPDATE' then
      if v_old ->> 'accepted_at' is null and v_new ->> 'accepted_at' is not null then
        v_events := array_append(v_events, 'invite.accepted');
      end if;
      if v_old ->> 'revoked_at' is null and v_new ->> 'revoked_at' is not null then
        v_events := array_append(v_events, 'invite.revoked');
      end if;
      if v_old ->> 'token_hash' is distinct from v_new ->> 'token_hash' then
        v_events := array_append(v_events, 'invite.resent');
      end if;
    end if;
  end if;

  v_old := v_old - v_hidden;
  v_new := v_new - v_hidden;

  -- Skip updates that changed nothing worth recording.
  if tg_op = 'UPDATE' and (v_old - v_noise) = (v_new - v_noise) and cardinality(v_events) = 0 then
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

  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, location_id, old_row, new_row, events)
  values (app.auth_user_id(), app.auth_role(), lower(tg_op), tg_table_name, v_row_id, v_location, v_old, v_new, v_events);

  return null;
end;
$$;

-- =====================================================================================
-- 6. Policies reworked to the permission model
-- =====================================================================================
--
-- Every permission in permissions.ts, and where the database enforces it. "0001" means the
-- policy or trigger from the first migration already says the right thing once is_manager()
-- and has_location() carry their new meaning (section 2); those are left alone.
--
--   stock.view        0001  stock_levels, shelves, locations: has_location(); catalogue: any active staff
--   stock.count       0001  count_sessions / count_lines: the assignee, or manager-level
--   usage.log         0001  stock_movements insert, type = use: any active staff at the location
--   stock.adjust      0001  stock_movements insert, adjust and transfers: is_manager(); par levels: guard_stock_level()
--   counts.schedule   0001  count_sessions / count_lines insert and delete: is_manager()
--   counts.approve    0001  guard_count_session(): is_manager(), and never a count they performed
--   orders.view       HERE  purchase_orders select: was a list of roles, now can('orders.view')
--   orders.create     0001  purchase_orders / lines insert, update, delete: is_manager()
--   orders.approve    HERE  guard_purchase_order() (section 4): admin only, never their own order
--   orders.receive    HERE  stock_movements insert, type = receive, and item_barcodes insert:
--                           were lists of roles, now can('orders.receive')
--   flags.view        0001  flags, flag_events select: is_manager() at the location
--   flags.resolve     0001  flags update, guard_flag(): is_manager(), and never a flag about themselves
--   costs.view        0001  item_costs, purchase_order_line_costs: is_manager()
--   reports.view      0001  no table of its own. Reports are computed from the ledger, orders and costs:
--                           manager-level callers read their locations' ledger; other staff read only their own entries
--   digests.view      HERE  digest_runs select: admins all, can('digests.view') at their locations
--   activity.view     HERE  audit_log select: admins all, can('activity.view') at their locations
--   team.manage       HERE  profiles update, profile_locations insert and delete, invites (section 8): admin only
--   settings.manage   HERE  settings, notification_rules, locations, vendors writes: admin only
--                           (0001 let managers add and edit vendors; permissions.ts files vendors under settings)
--   locations.all     HERE  has_location() (section 2): true everywhere for admins
--
-- A policy with a list of role names cannot see an admin whose role is, say, technician.
-- That is why the three role-list policies are rewritten with app.can().

-- ---------------------------------------------------------------- settings.manage

drop policy "locations: owners edit" on public.locations;
create policy "locations: admins edit"
  on public.locations for update to authenticated
  using ((select app.can('settings.manage')))
  with check ((select app.can('settings.manage')));

drop policy "vendors: managers and owners add" on public.vendors;
create policy "vendors: admins add"
  on public.vendors for insert to authenticated
  with check ((select app.can('settings.manage')));

drop policy "vendors: managers and owners edit" on public.vendors;
create policy "vendors: admins edit"
  on public.vendors for update to authenticated
  using ((select app.can('settings.manage')))
  with check ((select app.can('settings.manage')));

drop policy "notification_rules: owners edit" on public.notification_rules;
create policy "notification_rules: admins edit"
  on public.notification_rules for update to authenticated
  using ((select app.can('settings.manage')))
  with check ((select app.can('settings.manage')));

drop policy "settings: owners add" on public.settings;
create policy "settings: admins add"
  on public.settings for insert to authenticated
  with check ((select app.can('settings.manage')));

drop policy "settings: owners edit" on public.settings;
create policy "settings: admins edit"
  on public.settings for update to authenticated
  using ((select app.can('settings.manage')))
  with check ((select app.can('settings.manage')));

-- ---------------------------------------------------------------- orders.view, orders.receive

drop policy "purchase_orders: front desk, managers and owners read at own locations" on public.purchase_orders;
create policy "purchase_orders: read with orders.view at own locations"
  on public.purchase_orders for select to authenticated
  using ((select app.can('orders.view')) and (select app.has_location(location_id)));

drop policy "stock_movements: front desk, managers and owners receive" on public.stock_movements;
create policy "stock_movements: receive with orders.receive"
  on public.stock_movements for insert to authenticated
  with check (
    type = 'receive'
    and (select app.can('orders.receive'))
    and (select app.has_location(location_id))
  );

-- Attaching a barcode happens while receiving.
drop policy "item_barcodes: front desk, managers and owners add" on public.item_barcodes;
create policy "item_barcodes: add with orders.receive"
  on public.item_barcodes for insert to authenticated
  with check (
    (select app.can('orders.receive'))
    and created_by = (select app.auth_user_id())
  );

-- ---------------------------------------------------------------- team.manage

-- Managers still read the staff at their locations: they assign counts to them.
drop policy "profiles: read self, owners read all, managers read their locations" on public.profiles;
create policy "profiles: read self, admins read all, managers read their locations"
  on public.profiles for select to authenticated
  using (
    id = (select app.auth_user_id())
    or (select app.auth_is_admin())
    or (
      (select app.auth_role()) = 'manager'
      and exists (
        select 1 from public.profile_locations pl
        where pl.profile_id = profiles.id and app.has_location(pl.location_id)
      )
    )
  );

-- Name, role, access level and active only (column grants). app.guard_profile() stops
-- anyone changing their own role or access level; app.guard_last_admin() keeps one admin.
-- Profiles are created by public.accept_invite(), so there is still no INSERT policy.
drop policy "profiles: owners edit" on public.profiles;
create policy "profiles: admins edit"
  on public.profiles for update to authenticated
  using ((select app.can('team.manage')))
  with check ((select app.can('team.manage')));

drop policy "profile_locations: read self, owners read all, managers read their locations" on public.profile_locations;
create policy "profile_locations: read self, admins read all, managers read their locations"
  on public.profile_locations for select to authenticated
  using (
    profile_id = (select app.auth_user_id())
    or (select app.auth_is_admin())
    or ((select app.auth_role()) = 'manager' and app.has_location(location_id))
  );

drop policy "profile_locations: owners assign" on public.profile_locations;
create policy "profile_locations: admins assign"
  on public.profile_locations for insert to authenticated
  with check ((select app.can('team.manage')));

drop policy "profile_locations: owners unassign" on public.profile_locations;
create policy "profile_locations: admins unassign"
  on public.profile_locations for delete to authenticated
  using ((select app.can('team.manage')));

-- ---------------------------------------------------------------- activity.view, digests.view

-- Rows with no location (role changes, invites, settings) are for admins only.
drop policy "audit_log: owners read all, managers read their locations" on public.audit_log;
create policy "audit_log: admins read all, activity.view reads own locations"
  on public.audit_log for select to authenticated
  using (
    (select app.auth_is_admin())
    or (
      (select app.can('activity.view'))
      and location_id is not null
      and (select app.has_location(location_id))
    )
  );

drop policy "digest_runs: owners read all, managers read their locations" on public.digest_runs;
create policy "digest_runs: admins read all, digests.view reads own locations"
  on public.digest_runs for select to authenticated
  using (
    (select app.auth_is_admin())
    or (
      (select app.can('digests.view'))
      and location_id is not null
      and (select app.has_location(location_id))
    )
  );

-- Column grants for the new column. pin_hash and the lockout columns stay ungranted.
grant select (access_level) on public.profiles to authenticated;
grant update (access_level) on public.profiles to authenticated;

-- =====================================================================================
-- 7. Invites
-- =====================================================================================
--
-- An invite is the only way to get a profile, and a profile is the only way to see
-- anything. A person is invited either
--   by email      only the Google account with that address can accept; valid up to 7 days
--   by open link  whoever holds the link can accept, once; valid up to 48 hours; never admin
--
-- THE TOKEN IS NEVER STORED. The link carries a random token; this table holds only its
-- SHA-256 hash (hex). The app shows the token once, when the invite is created or resent.
-- Someone who can read this table, a backup of it or the audit log still cannot build a
-- working link. A fast hash is the right tool here: the token is 32 random bytes, so there
-- is nothing to brute-force, unlike a PIN or a password.

create type public.invite_status as enum ('pending', 'accepted', 'expired', 'revoked');

create table public.invites (
  id                   uuid primary key default gen_random_uuid(),
  -- SHA-256 of the token, lower-case hex. See public.invite_preview() for the exact recipe.
  token_hash           text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Lower-cased. Null = an open link.
  email                text check (email is null or (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  -- Typed by the inviter; used to greet the person on the accept screen.
  name                 text,
  role                 public.user_role not null,
  access_level         public.access_level not null default 'user',
  location_ids         text[] not null default '{}',
  -- Null only for invites written by the server or from the SQL editor.
  invited_by           text references public.profiles (id) on delete set null,
  -- Shown to the invitee.
  note                 text check (note is null or length(note) <= 500),
  created_at           timestamptz not null default now(),
  -- When the current token was issued: equal to created_at until the invite is resent.
  token_issued_at      timestamptz not null default now(),
  resend_count         integer not null default 0 check (resend_count >= 0),
  expires_at           timestamptz not null,
  accepted_at          timestamptz,
  accepted_by          text references public.profiles (id) on delete set null,
  revoked_at           timestamptz,
  revoked_by           text references public.profiles (id) on delete set null,
  -- Reserved: the id of a Clerk invitation, if Clerk is ever switched to invite-only
  -- sign-up for email invites (docs/architecture.md, "Clerk and sign-up"). Unused today.
  clerk_invitation_id  text,

  constraint invites_token_hash_key unique (token_hash),
  -- Ownership is granted with one SQL statement by someone with database access, never by a link.
  constraint invites_role_not_owner check (role <> 'owner'),
  -- A user with no locations would sign in and see nothing.
  constraint invites_user_needs_location check (access_level = 'admin' or cardinality(location_ids) >= 1),
  -- An open link works for whoever holds it. Admin access is only ever given to a named
  -- Google account.
  constraint invites_admin_needs_email check (access_level = 'user' or email is not null),
  constraint invites_expiry_after_issue check (expires_at > token_issued_at),
  -- Hours, not days, so the limit does not move with daylight saving.
  constraint invites_open_link_ttl check (email is not null or expires_at <= token_issued_at + interval '48 hours'),
  constraint invites_email_ttl check (email is null or expires_at <= token_issued_at + interval '168 hours'),
  constraint invites_accepted_together check ((accepted_at is null) = (accepted_by is null)),
  constraint invites_not_accepted_and_revoked check (accepted_at is null or revoked_at is null)
);

create index invites_email_idx on public.invites (email) where email is not null;
create index invites_created_idx on public.invites (created_at desc);

-- One definition of "status", used by the view, the preview and the guard.
create or replace function app.invite_state(p_accepted_at timestamptz, p_revoked_at timestamptz, p_expires_at timestamptz)
returns public.invite_status
language sql
stable
set search_path = ''
as $$
  select case
    when p_accepted_at is not null then 'accepted'
    when p_revoked_at is not null then 'revoked'
    when p_expires_at <= now() then 'expired'
    else 'pending'
  end::public.invite_status
$$;

-- "One pending invite per email" cannot be a unique index, because pending depends on the
-- clock. This check runs under a per-email advisory lock, so two simultaneous invites to the
-- same address cannot both pass it.
create or replace function app.assert_no_pending_invite(p_email text, p_except uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('meraki.invites.email:' || p_email));
  if exists (
    select 1 from public.invites i
    where i.email = p_email
      and i.id is distinct from p_except
      and app.invite_state(i.accepted_at, i.revoked_at, i.expires_at) = 'pending'
  ) then
    raise exception 'An invite for % is already pending. Resend it or revoke it first.', p_email using errcode = '23505';
  end if;
end;
$$;

-- Runs before every insert and update on invites.
--   INSERT  stamps who and when from the token; lower-cases the email; fills in the
--           default expiry; checks the locations exist; refuses a second pending invite
--           for the same email and an invite for someone who already has access; and
--           refuses an admin invite from anyone who is not an admin.
--   UPDATE  only three things can happen to an invite, and only while it is not accepted
--           and not revoked: it is accepted (accept_invite()), revoked, or resent with a
--           new token. Who it is for and what it grants never change: revoke and re-invite.
-- Unlike the workflow guards in 0001 this one does not step aside for the service role,
-- apart from the identity stamps, which need a signed-in caller.
create or replace function app.guard_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      text := app.auth_user_id();
  v_ttl      interval;
  v_unknown  text;
begin
  if tg_op = 'INSERT' then
    new.email := nullif(lower(btrim(new.email)), '');
    new.name  := nullif(btrim(new.name), '');
    new.note  := nullif(btrim(new.note), '');

    if v_uid is not null then
      new.invited_by      := v_uid;
      new.created_at      := now();
      new.token_issued_at := now();
      new.resend_count    := 0;
      new.accepted_at     := null;
      new.accepted_by     := null;
      new.revoked_at      := null;
      new.revoked_by      := null;
      -- Its own rule, separate from "who may invite at all" (the INSERT policy): if inviting
      -- is ever opened to managers, they still cannot hand out admin access.
      if new.access_level = 'admin' and not app.auth_is_admin() then
        raise exception 'Only an admin can invite an admin' using errcode = '42501';
      end if;
    end if;

    v_ttl := case when new.email is null then interval '48 hours' else interval '168 hours' end;
    if new.expires_at is null then
      new.expires_at := new.token_issued_at + v_ttl;
    end if;

    select l into v_unknown
    from unnest(new.location_ids) as l
    where not exists (select 1 from public.locations loc where loc.id = l)
    limit 1;
    if v_unknown is not null then
      raise exception 'Unknown location "%"', v_unknown using errcode = '23503';
    end if;
    new.location_ids := array(select distinct l from unnest(new.location_ids) as l order by l);

    if new.email is not null then
      if exists (select 1 from public.profiles p where lower(p.email) = new.email and p.active) then
        raise exception '% already has access', new.email using errcode = '23505';
      end if;
      perform app.assert_no_pending_invite(new.email, new.id);
    end if;
    return new;
  end if;

  -- ---- UPDATE ----
  if old.accepted_at is not null then
    raise exception 'This invite has been accepted and can no longer be changed' using errcode = '23514';
  end if;
  if old.revoked_at is not null then
    raise exception 'This invite has been revoked and can no longer be changed' using errcode = '23514';
  end if;
  if (new.id, new.email, new.name, new.role, new.access_level, new.location_ids, new.invited_by, new.note, new.created_at)
     is distinct from
     (old.id, old.email, old.name, old.role, old.access_level, old.location_ids, old.invited_by, old.note, old.created_at) then
    raise exception 'Who an invite is for and what it grants cannot be changed. Revoke it and send a new one.' using errcode = '23514';
  end if;

  if new.accepted_at is not null then
    -- Reachable only from public.accept_invite() and the service role: signed-in users have
    -- no UPDATE privilege on accepted_at or accepted_by.
    if new.revoked_at is not null or new.token_hash <> old.token_hash then
      raise exception 'An invite cannot be accepted and changed in the same step' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.revoked_at is not null then
    if new.token_hash <> old.token_hash then
      raise exception 'An invite cannot be revoked and resent in the same step' using errcode = '23514';
    end if;
    new.revoked_at := now();
    new.revoked_by := coalesce(v_uid, new.revoked_by);
    new.expires_at := old.expires_at;
    return new;
  end if;

  if new.token_hash <> old.token_hash then
    -- Resent: a new token and a fresh clock. The old link stops working at this moment,
    -- because its hash is no longer on file.
    v_ttl := case when new.email is null then interval '48 hours' else interval '168 hours' end;
    new.token_issued_at := now();
    new.resend_count    := old.resend_count + 1;
    if new.expires_at is null or new.expires_at = old.expires_at then
      new.expires_at := now() + v_ttl;
    end if;
    if new.email is not null then
      perform app.assert_no_pending_invite(new.email, new.id);
    end if;
    return new;
  end if;

  if (new.expires_at, new.token_issued_at, new.resend_count) is distinct from (old.expires_at, old.token_issued_at, old.resend_count) then
    raise exception 'The expiry of an invite changes only when it is resent' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger invites_guard
  before insert or update on public.invites
  for each row execute function app.guard_invite();

create trigger audit after insert or update or delete on public.invites
  for each row execute function app.audit('id');

-- What admins read: every column except the token hash, plus the derived status.
-- security_invoker: the caller's own privileges and policies apply, so this view shows a
-- non-admin exactly what the table would, which is nothing.
create view public.invites_with_status
with (security_invoker = true)
as
select
  i.id,
  i.email,
  i.name,
  i.role,
  i.access_level,
  i.location_ids,
  i.invited_by,
  i.note,
  i.created_at,
  i.token_issued_at,
  i.resend_count,
  i.expires_at,
  i.accepted_at,
  i.accepted_by,
  i.revoked_at,
  i.revoked_by,
  i.clerk_invitation_id,
  app.invite_state(i.accepted_at, i.revoked_at, i.expires_at) as status
from public.invites i;

-- =====================================================================================
-- 8. Invites: grants and row-level security
-- =====================================================================================

-- A Supabase project grants new tables in `public` to anon and authenticated by default.
-- Start from nothing, as 0001 does.
revoke all on public.invites from public, anon, authenticated;
revoke all on public.invites_with_status from public, anon, authenticated;

grant all on public.invites to service_role;
grant select on public.invites_with_status to authenticated, service_role;

-- COLUMN-LEVEL: token_hash is writable (the server hashes the token and inserts as the
-- signed-in admin) but never readable, not even by admins. accepted_at and accepted_by are
-- not writable: only accept_invite() sets them.
grant select (id, email, name, role, access_level, location_ids, invited_by, note, created_at, token_issued_at,
              resend_count, expires_at, accepted_at, accepted_by, revoked_at, revoked_by, clerk_invitation_id)
  on public.invites to authenticated;
grant insert (id, token_hash, email, name, role, access_level, location_ids, note, expires_at, clerk_invitation_id)
  on public.invites to authenticated;
grant update (token_hash, expires_at, revoked_at, clerk_invitation_id)
  on public.invites to authenticated;

grant execute on function app.invite_state(timestamptz, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function app.accepting_invite_for(text) to authenticated, service_role;
-- Only ever called from the invite trigger.
revoke all on function app.assert_no_pending_invite(text, uuid) from public;

alter table public.invites enable row level security;

-- Admins manage invites ("team.manage"). Nobody else can read them: not managers, not the
-- person invited, and not anon, which has no privilege on the table at all. The public
-- accept page gets what it needs from invite_preview() below.
create policy "invites: admins read"
  on public.invites for select to authenticated
  using ((select app.can('team.manage')));

create policy "invites: admins create"
  on public.invites for insert to authenticated
  with check ((select app.can('team.manage')));

create policy "invites: admins revoke and resend"
  on public.invites for update to authenticated
  using ((select app.can('team.manage')))
  with check ((select app.can('team.manage')));
-- No DELETE policy and no DELETE grant: an invite is revoked, not erased.

-- =====================================================================================
-- 9. invite_preview() and accept_invite()
-- =====================================================================================

-- THE HASH RECIPE, used here and in apps/web/lib/invites.ts:
--   lower-case hex of SHA-256 over the UTF-8 bytes of the token exactly as it appears in the link
create or replace function app.hash_invite_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

-- What the accept screen may show someone who holds a link, before they sign in.
--
-- WHO CAN CALL IT: the service role only. Not anon, not authenticated. The browser never
-- talks to this function; it calls GET /api/invites/preview, and the server calls this. So
-- every token lookup passes through one URL of the app, where it can be rate limited, and
-- the publishable key gives nobody a way to probe tokens against the database directly.
--
-- WHAT IT RETURNS: no row for a token that is not on file (the API reports that the same
-- way as a malformed one). For a pending invite: who invited, the role, access level,
-- location names (the short ones: "Lynnfield"), the note, the expiry, the first name the inviter typed, and the email
-- only in masked form ("n••••@example.com"). For an invite that is accepted, expired or
-- revoked: the status, the inviter's name and the expiry, and nothing else.
-- It never returns an id, a full email address or the hash, and it never looks anything up
-- by email, so it cannot be used to learn whether an address has an account or an invite.
create or replace function public.invite_preview(token text)
returns table (
  status          public.invite_status,
  inviter_name    text,
  role            public.user_role,
  access_level    public.access_level,
  location_names  text[],
  note            text,
  expires_at      timestamptz,
  email_bound     boolean,
  masked_email    text,
  invitee_name    text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.status,
    (select nullif(p.name, '') from public.profiles p where p.id = i.invited_by),
    case when s.status = 'pending' then i.role end,
    case when s.status = 'pending' then i.access_level end,
    case when s.status = 'pending' then
      coalesce((select array_agg(l.short_name order by l.short_name) from public.locations l where l.id = any (i.location_ids)), '{}')
    end,
    case when s.status = 'pending' then i.note end,
    i.expires_at,
    i.email is not null,
    case when s.status = 'pending' and i.email is not null
      then left(i.email, 1) || '••••@' || split_part(i.email, '@', 2)
    end,
    case when s.status = 'pending' then i.name end
  from public.invites i
  cross join lateral (select app.invite_state(i.accepted_at, i.revoked_at, i.expires_at) as status) s
  where invite_preview.token is not null
    and length(invite_preview.token) <= 200
    and i.token_hash = app.hash_invite_token(invite_preview.token)
$$;

-- Accepts an invite for the signed-in Clerk user. Everything happens in this one function
-- call, which is one transaction: the profile, its locations, the invite marked accepted,
-- and the audit rows (written by the audit triggers) all commit together or not at all.
--
-- IDENTITY comes from the verified Clerk session token and from nowhere else:
--   sub             the Clerk user id (always present)
--   email           the user's primary email address. NOT in a Clerk session token by
--                   default: it is added in the Clerk dashboard under Sessions > Customize
--                   session token, as  "email": "{{user.primary_email_address}}"
--   email_verified  optional, "{{user.email_verified}}". If present it must be true.
--   name            optional, "{{user.full_name}}". Falls back to the name on the invite.
-- If the email claim is missing this function refuses every invite with
-- 'email_claim_missing', open links included, because a profile needs an email address
-- and the only trustworthy source is the token. Nothing is written. The caller never
-- supplies an email as an argument.
--
-- SINGLE USE: the invite row is locked (FOR UPDATE) before it is checked. If two people
-- submit the same link at the same instant, the second waits, then sees it accepted.
-- The same person submitting twice (a double tap, a retry) gets ok both times.
--
-- Returns jsonb: { ok: true, already_accepted, profile_id, role, access_level, location_ids }
--            or  { ok: false, error } where error is one of
--   not_signed_in  invalid  already_accepted  revoked  expired  email_claim_missing
--   email_not_verified  email_mismatch  already_member  email_in_use
create or replace function public.accept_invite(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          text  := app.auth_user_id();
  v_claims       jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_email        text  := nullif(lower(btrim(coalesce(v_claims ->> 'email', ''))), '');
  v_name         text  := nullif(btrim(coalesce(v_claims ->> 'name', '')), '');
  v_invite       public.invites%rowtype;
  v_profile      public.profiles%rowtype;
  v_has_profile  boolean;
  v_locations    text[];
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if accept_invite.token is null or length(accept_invite.token) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_invite
  from public.invites i
  where i.token_hash = app.hash_invite_token(accept_invite.token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if v_invite.accepted_at is not null then
    if v_invite.accepted_by = v_uid then
      return jsonb_build_object(
        'ok', true, 'already_accepted', true, 'profile_id', v_uid,
        'role', v_invite.role, 'access_level', v_invite.access_level,
        'location_ids', coalesce((select jsonb_agg(pl.location_id order by pl.location_id) from public.profile_locations pl where pl.profile_id = v_uid), '[]'::jsonb)
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;
  if v_invite.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;
  if v_invite.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if v_email is null then
    return jsonb_build_object('ok', false, 'error', 'email_claim_missing');
  end if;
  if v_claims ? 'email_verified' and lower(coalesce(v_claims ->> 'email_verified', '')) <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'email_not_verified');
  end if;
  if v_invite.email is not null and v_invite.email <> v_email then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  select * into v_profile from public.profiles p where p.id = v_uid for update;
  v_has_profile := found;

  -- Someone who already has access keeps exactly what they have. Otherwise an owner tapping
  -- a technician's open link would turn themselves into a technician.
  if v_has_profile and v_profile.active then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;
  -- The address belongs to a different Clerk user's profile (for example a former staff
  -- member whose Clerk account was deleted and recreated). An admin has to sort that out.
  if exists (select 1 from public.profiles p where lower(p.email) = v_email and p.id <> v_uid) then
    return jsonb_build_object('ok', false, 'error', 'email_in_use');
  end if;

  -- Locations removed since the invite was written are dropped, not fatal.
  select coalesce(array_agg(l.id order by l.id), '{}') into v_locations
  from public.locations l
  where l.id = any (v_invite.location_ids);

  perform set_config('app.accepting_invite', v_uid, true);

  if v_has_profile then
    -- A former member coming back: switched on again with what THIS invite grants.
    update public.profiles
    set email        = v_email,
        name         = coalesce(nullif(name, ''), v_name, v_invite.name, split_part(v_email, '@', 1)),
        role         = v_invite.role,
        access_level = v_invite.access_level,
        active       = true
    where id = v_uid;
    delete from public.profile_locations where profile_id = v_uid;
  else
    insert into public.profiles (id, email, name, role, access_level, active)
    values (v_uid, v_email, coalesce(v_name, v_invite.name, split_part(v_email, '@', 1)), v_invite.role, v_invite.access_level, true);
  end if;

  insert into public.profile_locations (profile_id, location_id)
  select v_uid, l from unnest(v_locations) as l;

  update public.invites
  set accepted_at = now(),
      accepted_by = v_uid
  where id = v_invite.id;

  perform set_config('app.accepting_invite', '', true);

  return jsonb_build_object(
    'ok', true, 'already_accepted', false, 'profile_id', v_uid,
    'role', v_invite.role, 'access_level', v_invite.access_level,
    'location_ids', to_jsonb(v_locations)
  );
end;
$$;

-- A Supabase project also grants new functions in `public` to anon and authenticated by
-- default, and Postgres grants them to PUBLIC. Take all of that away, then grant exactly:
--   invite_preview  -> service_role only (the server, behind /api/invites/preview)
--   accept_invite   -> authenticated only (it needs the caller's Clerk token)
revoke all on function public.invite_preview(text) from public, anon, authenticated;
revoke all on function public.accept_invite(text) from public, anon, authenticated;
revoke all on function app.hash_invite_token(text) from public;
grant execute on function public.invite_preview(text) to service_role;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function app.hash_invite_token(text) to service_role;
