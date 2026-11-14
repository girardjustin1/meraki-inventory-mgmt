// Schema check: runs the migrations and seeds in an in-memory Postgres (PGlite) with a minimal
// stand-in for the Supabase environment (roles and auth.jwt()), then exercises the policies and
// triggers: location scoping, cost hiding, the ledger rules, separation of duties, append-only,
// and (from 0002) admin / user access per permission, the profile guard rails and invites.
// Run from the repo root: npm run test:db
// It does not replace testing against a real Supabase project.
//
// Order: 0001 is applied, seeded and given staff fixtures FIRST, and 0002 is applied on top of
// that, so 0002 is tested the way it will really run: against a database that already has
// people in it. Every check written for 0001 then runs unchanged against the 0002 rules.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const root = process.argv[2] ?? process.cwd();
const db = new PGlite();

const bootstrap = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`;

let pass = 0;
let fail = 0;
const ok = (name) => { pass++; console.log(`  ok    ${name}`); };
const bad = (name, detail) => { fail++; console.log(`  FAIL  ${name}\n        ${detail}`); };

const as = async (uid, role = "authenticated") => {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : ""}', false); set role ${role};`);
};
const asAdmin = async () => { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`); };
// A signed-in user whose Clerk session token carries extra claims (email, email_verified, name).
const asClaims = async (uid, claims = {}) => {
  const json = JSON.stringify({ sub: uid, role: "authenticated", ...claims }).replace(/'/g, "''");
  await db.exec(`reset role; select set_config('request.jwt.claims', '${json}', false); set role authenticated;`);
};
// The server: the secret key, no user token. Bypasses policies, not constraints or triggers.
const asService = async () => { await db.exec(`reset role; select set_config('request.jwt.claims', '', false); set role service_role;`); };
// Same recipe as apps/web/lib/invites.ts and app.hash_invite_token(): hex SHA-256 of the UTF-8 token.
const sha256 = (token) => createHash("sha256").update(token, "utf8").digest("hex");

const expectOk = async (name, sql) => {
  try { const r = await db.query(sql); ok(name); return r.rows; } catch (e) { bad(name, e.message); return []; }
};
const expectFail = async (name, sql, pattern) => {
  try { const r = await db.query(sql); bad(name, `expected an error, got ${r.affectedRows ?? r.rows.length} row(s)`); }
  catch (e) { if (!pattern || pattern.test(e.message)) ok(`${name}  [${e.message.slice(0, 70)}]`); else bad(name, `wrong error: ${e.message}`); }
};
const expectRows = async (name, sql, n) => {
  try { const r = await db.query(sql); const got = r.rows.length; if (got === n) ok(name); else bad(name, `expected ${n} rows, got ${got}`); return r.rows; }
  catch (e) { bad(name, e.message); return []; }
};
const expectAffected = async (name, sql, n) => {
  try { const r = await db.query(sql); if (r.affectedRows === n) ok(name); else bad(name, `expected ${n} affected, got ${r.affectedRows}`); }
  catch (e) { bad(name, e.message); }
};
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0] ?? {})[0];
const expectEq = async (name, sql, want) => {
  try { const got = await scalar(sql); if (String(got) === String(want)) ok(`${name} = ${got}`); else bad(name, `expected ${want}, got ${got}`); }
  catch (e) { bad(name, e.message); }
};

console.log("== apply");
await db.exec(bootstrap);
try { await db.exec(readFileSync(`${root}/supabase/migrations/0001_init.sql`, "utf8")); ok("0001_init.sql applies"); }
catch (e) { bad("0001_init.sql applies", e.message + (e.position ? ` @${e.position}` : "")); console.log(e); process.exit(1); }
try { const s = readFileSync(`${root}/supabase/seed.sql`, "utf8"); await db.exec(s); await db.exec(s); ok("seed.sql applies twice"); }
catch (e) { bad("seed.sql applies", e.message); }
await expectEq("locations", "select count(*) from public.locations", 2);
await expectEq("vendors", "select count(*) from public.vendors", 7);
await expectEq("tables without RLS", "select count(*) from pg_tables where schemaname = 'public' and not rowsecurity", 0);
await expectEq("tables", "select count(*) from pg_tables where schemaname = 'public'", 21);

if (existsSync(`${root}/supabase/seed-catalog.sql`)) {
  console.log("== seed-catalog.sql");
  try {
    const s = readFileSync(`${root}/supabase/seed-catalog.sql`, "utf8");
    await db.exec(s); await db.exec(s);
    ok("seed-catalog.sql applies twice");
    for (const t of ["items", "stock_levels", "shelves", "purchase_orders", "purchase_order_lines", "stock_movements"]) {
      console.log(`        ${t}: ${await scalar(`select count(*) from public.${t}`)}`);
    }
    await expectEq("orphan stock levels", "select count(*) from public.stock_levels s left join public.items i on i.id = s.item_id where i.id is null", 0);
  } catch (e) { bad("seed-catalog.sql applies", e.message); }
}

console.log("== fixtures (as postgres)");
await db.exec(`
insert into public.profiles (id, email, name, role, pin_hash) values
  ('u_owner', 'o@example.com', 'O', 'owner', 'secret-hash'),
  ('u_mgr',   'm@example.com', 'M', 'manager', null),
  ('u_mgr2',  'm2@example.com','M2','manager', null),
  ('u_fd',    'f@example.com', 'F', 'front_desk', null),
  ('u_tech',  't@example.com', 'T', 'technician', null),
  ('u_nbp',   'n@example.com', 'N', 'manager', null),
  ('u_off',   'x@example.com', 'X', 'manager', null);
update public.profiles set active = false where id = 'u_off';
insert into public.profile_locations (profile_id, location_id) values
  ('u_mgr','lynnfield'), ('u_mgr2','lynnfield'), ('u_fd','lynnfield'), ('u_tech','lynnfield'), ('u_nbp','newburyport'), ('u_off','lynnfield');
insert into public.items (id, kind, name, category, vendor_id, unit) values
  ('t-item-a', 'supply', 'Test Item A', 'Test', 'amazon', 'Box'),
  ('t-item-b', 'supply', 'Test Item B', 'Test', 'amazon', 'Tub');
insert into public.item_costs (item_id, unit_cost) values ('t-item-a', 12.50);
insert into public.stock_levels (item_id, location_id, area, shelf, on_hand, par, par_rule) values
  ('t-item-a', 'lynnfield', 'Back', '1A', 10, 12, 'quantity'),
  ('t-item-b', 'lynnfield', 'Back', '1B', 1, null, 'level'),
  ('t-item-a', 'newburyport', 'Back', '1A', 4, 6, 'quantity');
`);
ok("fixtures inserted");

console.log("== apply 0002 on top (as postgres)");
try { await db.exec(readFileSync(`${root}/supabase/migrations/0002_access_and_invites.sql`, "utf8")); ok("0002_access_and_invites.sql applies to a database with staff in it"); }
catch (e) { bad("0002_access_and_invites.sql applies", e.message + (e.position ? ` @${e.position}` : "")); console.log(e); process.exit(1); }
await expectEq("tables after 0002 (invites added)", "select count(*) from pg_tables where schemaname = 'public'", 22);
await expectEq("tables without RLS after 0002", "select count(*) from pg_tables where schemaname = 'public' and not rowsecurity", 0);
await expectEq("existing owner became an admin", "select access_level from public.profiles where id = 'u_owner'", "admin");
await expectEq("everyone else became a user", "select count(*) from public.profiles where id <> 'u_owner' and access_level = 'user'", 6);
// Under 0002 approving an order takes an admin (no role grants orders.approve). The 0001 checks
// below have "a second manager" approve the order, so that second manager is made an admin here.
// Plain managers being refused is checked in the "admin vs user" section at the end.
await db.exec("update public.profiles set access_level = 'admin' where id = 'u_mgr2'");
ok("fixture: u_mgr2 is now an admin (a manager who can approve orders)");

console.log("== anon and unknown users");
await as(null, "anon");
await expectFail("anon cannot read items", "select * from public.items", /permission denied/);
await as("u_nobody");
await expectRows("user without profile sees no items", "select id from public.items where id like 't-item-%'", 0);
await as("u_off");
await expectRows("deactivated user sees no stock", "select item_id from public.stock_levels", 0);

console.log("== technician");
await as("u_tech");
await expectRows("reads catalogue", "select id from public.items where id like 't-item-%'", 2);
await expectRows("sees only own location stock", "select * from public.stock_levels where item_id = 't-item-a'", 1);
await expectRows("cannot read item_costs", "select * from public.item_costs", 0);
await expectEq("items_with_cost hides cost", "select coalesce(unit_cost::text, 'null') from public.items_with_cost where id = 't-item-a'", "null");
await expectFail("cannot read pin_hash", "select pin_hash from public.profiles", /permission denied/);
await expectFail("cannot select * from profiles", "select * from public.profiles", /permission denied/);
await expectRows("reads only own profile", "select id, has_pin from public.profiles", 1);
await expectRows("cannot see orders", "select id from public.purchase_orders", 0);
await expectRows("cannot see flags", "select id from public.flags", 0);
await expectRows("cannot see audit log", "select id from public.audit_log", 0);
await expectRows("cannot see settings", "select id from public.settings", 0);
await expectOk("logs use", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','use',-1,'used_in_service','u_owner')");
await expectEq("use stamped with real user, not the supplied one", "select user_id from public.stock_movements where item_id = 't-item-a' and location_id = 'lynnfield' and type = 'use'", "u_tech");
await expectEq("balance_after written", "select balance_after from public.stock_movements where item_id = 't-item-a' and location_id = 'lynnfield' and type = 'use'", "9.00");
await expectEq("on_hand applied", "select on_hand from public.stock_levels where item_id = 't-item-a' and location_id = 'lynnfield'", "9.00");
await expectFail("cannot receive", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','receive',5,'received_order','u_tech')", /row-level security/);
await expectFail("cannot adjust", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','adjust',-1,'damaged','u_tech')", /row-level security/);
await expectFail("cannot post a count movement", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id, count_session_id) values ('t-item-a','lynnfield','count',5,'cycle_count','u_tech','x')", /row-level security|foreign key/);
await expectFail("cannot log use at another location", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','newburyport','use',-1,'used_in_service','u_tech')", /row-level security/);
await expectFail("cannot set on_hand directly", "update public.stock_levels set on_hand = 99 where item_id = 't-item-a'", /permission denied/);
await expectFail("cannot change par", "update public.stock_levels set par = 1 where item_id = 't-item-a' and location_id = 'lynnfield'", /manager or owner/);
await expectAffected("can raise a reorder request", "update public.stock_levels set reorder_requested = true, reorder_qty = 2 where item_id = 't-item-a' and location_id = 'lynnfield'", 1);
await expectFail("cannot edit items", "insert into public.items (id, kind, name, category, vendor_id) values ('t-x','supply','x','x','amazon')", /row-level security/);
await expectFail("cannot update a movement", "update public.stock_movements set delta = -5", /permission denied/);
await expectFail("cannot delete a movement", "delete from public.stock_movements", /permission denied/);
await expectFail("use needs negative delta", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','use',1,'used_in_service','u_tech')", /delta_sign/);
await expectFail("reason must match type", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','use',-1,'damaged','u_tech')", /reason_matches_type/);
await expectFail("reason required", "insert into public.stock_movements (item_id, location_id, type, delta, user_id) values ('t-item-a','lynnfield','use',-1,'u_tech')", /null value|not-null/);

console.log("== other-location manager");
await as("u_nbp");
await expectRows("sees no Lynnfield stock", "select * from public.stock_levels where location_id = 'lynnfield'", 0);
await expectRows("sees Newburyport stock", "select * from public.stock_levels where location_id = 'newburyport' and item_id = 't-item-a'", 1);
await expectRows("sees one location", "select id from public.locations", 1);
await expectRows("sees no Lynnfield movements", "select id from public.stock_movements where location_id = 'lynnfield'", 0);
await expectEq("sees costs", "select unit_cost from public.items_with_cost where id = 't-item-a'", "12.50");
await expectFail("cannot create an order at Lynnfield", "insert into public.purchase_orders (id, number, location_id, vendor_id, cycle) values ('po-x','PO-X','lynnfield','amazon','2026-11')", /row-level security/);

console.log("== purchase order: create -> approve -> send -> receive");
await as("u_mgr");
await expectOk("manager creates a draft", "insert into public.purchase_orders (id, number, location_id, vendor_id, cycle) values ('po-1','PO-TEST-1','lynnfield','amazon','2026-11')");
await expectEq("created_by stamped", "select created_by from public.purchase_orders where id = 'po-1'", "u_mgr");
await expectOk("adds a line", "insert into public.purchase_order_lines (id, purchase_order_id, item_id, name, qty_ordered) values ('po-1:l1','po-1','t-item-a','Test Item A',6)");
await expectFail("cannot skip approval", "update public.purchase_orders set status = 'sent' where id = 'po-1'", /cannot go from/);
await expectAffected("submits for approval", "update public.purchase_orders set status = 'awaiting_approval' where id = 'po-1'", 1);
await expectFail("creator cannot approve own order", "update public.purchase_orders set status = 'approved' where id = 'po-1'", /Separation of duties/);
await expectFail("cannot set approved_by directly", "update public.purchase_orders set approved_by = 'u_mgr2' where id = 'po-1'", /permission denied/);
await as("u_fd");
await expectAffected("front desk cannot approve (update matches no row)", "update public.purchase_orders set status = 'approved' where id = 'po-1'", 0);
await expectEq("still awaiting approval", "select status from public.purchase_orders where id = 'po-1'", "awaiting_approval");
await expectFail("cannot receive before the order is sent", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id, purchase_order_line_id) values ('t-item-a','lynnfield','receive',6,'received_order','u_fd','po-1:l1')", /only sent orders/);
await as("u_mgr2");
await expectAffected("a second manager approves", "update public.purchase_orders set status = 'approved' where id = 'po-1'", 1);
await expectEq("approved_by stamped", "select approved_by from public.purchase_orders where id = 'po-1'", "u_mgr2");
await expectFail("line quantities frozen after approval", "update public.purchase_order_lines set qty_ordered = 60 where id = 'po-1:l1'", /Only the delivered variant/);
await expectAffected("marks sent", "update public.purchase_orders set status = 'sent' where id = 'po-1'", 1);
await as("u_mgr");
await expectFail("creator cannot receive own order", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id, purchase_order_line_id) values ('t-item-a','lynnfield','receive',6,'received_order','u_mgr','po-1:l1')", /Separation of duties/);
await as("u_fd");
await expectFail("front desk cannot fake qty_received", "update public.purchase_order_lines set qty_received = 6 where id = 'po-1:l1'", /permission denied/);
await expectOk("front desk receives part", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id, purchase_order_line_id) values ('t-item-a','lynnfield','receive',4,'received_order','u_fd','po-1:l1')");
await expectEq("order partially received", "select status from public.purchase_orders where id = 'po-1'", "partially_received");
await expectAffected("front desk records delivered variant", "update public.purchase_order_lines set variant_received = 'Gel' where id = 'po-1:l1'", 1);
await expectOk("front desk receives the rest", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id, purchase_order_line_id) values ('t-item-a','lynnfield','receive',2,'received_order','u_fd','po-1:l1')");
await expectEq("line qty_received", "select qty_received from public.purchase_order_lines where id = 'po-1:l1'", "6.00");
await expectEq("line received_by", "select received_by from public.purchase_order_lines where id = 'po-1:l1'", "u_fd");
await expectEq("order received", "select status from public.purchase_orders where id = 'po-1'", "received");
await expectEq("on_hand after receipt", "select on_hand from public.stock_levels where item_id = 't-item-a' and location_id = 'lynnfield'", "15.00");
await expectFail("front desk cannot see cost of line", "select unit_cost from public.purchase_order_lines_with_cost where id = 'po-1:l1' and unit_cost is not null limit 1 offset 0 for update", /./);
await expectEq("front desk gets null line cost", "select coalesce(unit_cost::text,'null') from public.purchase_order_lines_with_cost where id = 'po-1:l1'", "null");
await asAdmin();
await expectFail("constraint: approver = creator rejected even for the server", "update public.purchase_orders set approved_by = 'u_mgr' where id = 'po-1'", /approver_is_not_creator/);

console.log("== adjustments");
await as("u_mgr");
await expectFail("3+ unit adjustment needs a note", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','adjust',-3,'damaged','u_mgr')", /large_adjustment_needs_note/);
await expectFail("blank note does not count", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id, note) values ('t-item-a','lynnfield','adjust',-3,'damaged','u_mgr','  ')", /large_adjustment_needs_note/);
await expectOk("with a note it is accepted", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id, note) values ('t-item-a','lynnfield','adjust',-3,'damaged','u_mgr','Box crushed in delivery')");
await expectOk("small adjustment without note", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','adjust',-1,'expired','u_mgr')");
await expectEq("on_hand after adjustments", "select on_hand from public.stock_levels where item_id = 't-item-a' and location_id = 'lynnfield'", "11.00");
await expectAffected("manager can change par", "update public.stock_levels set par = 14 where item_id = 't-item-a' and location_id = 'lynnfield'", 1);

console.log("== count: schedule -> count -> submit -> approve");
await expectOk("manager schedules a count for front desk", "insert into public.count_sessions (id, location_id, area, name, assigned_to, due_at) values ('cs-1','lynnfield','Back','Back room','u_fd','2026-11-20')");
await expectOk("builds the sheet", "insert into public.count_lines (count_session_id, item_id) values ('cs-1','t-item-a'), ('cs-1','t-item-b')");
await as("u_tech");
await expectRows("unassigned staff cannot see the count", "select id from public.count_sessions", 0);
await as("u_fd");
await expectAffected("assignee starts", "update public.count_sessions set status = 'in_progress' where id = 'cs-1'", 1);
await expectAffected("assignee counts item A", "update public.count_lines set counted = 8 where count_session_id = 'cs-1' and item_id = 't-item-a'", 1);
await expectAffected("assignee counts item B by fill level", "update public.count_lines set counted_fill_level = 'half' where count_session_id = 'cs-1' and item_id = 't-item-b'", 1);
await expectEq("expected snapshot taken by trigger", "select expected from public.count_lines where count_session_id = 'cs-1' and item_id = 't-item-a'", "11.00");
await expectEq("counted_by stamped", "select counted_by from public.count_lines where count_session_id = 'cs-1' and item_id = 't-item-a'", "u_fd");
await expectFail("client cannot supply expected", "update public.count_lines set expected = 8 where count_session_id = 'cs-1'", /permission denied/);
await expectAffected("assignee submits", "update public.count_sessions set status = 'submitted' where id = 'cs-1'", 1);
await expectFail("lines locked after submit", "update public.count_lines set counted = 11 where count_session_id = 'cs-1' and item_id = 't-item-a'", /no longer be edited/);
await expectFail("counter cannot approve own count", "update public.count_sessions set status = 'approved' where id = 'cs-1'", /manager or owner|Separation/);
await expectEq("on_hand unchanged before approval", "select on_hand from public.stock_levels where item_id = 't-item-a' and location_id = 'lynnfield'", "11.00");
await as("u_tech");
await expectOk("use logged between count and approval", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','use',-1,'used_in_service','u_tech')");
await as("u_mgr");
await expectAffected("manager who did not count approves", "update public.count_sessions set status = 'approved' where id = 'cs-1'", 1);
await expectRows("count movements posted", "select id from public.stock_movements where count_session_id = 'cs-1'", 2);
await expectEq("variance delta = counted - expected", "select delta from public.stock_movements where count_session_id = 'cs-1' and item_id = 't-item-a'", "-3.00");
await expectEq("count movement attributed to the counter", "select user_id from public.stock_movements where count_session_id = 'cs-1' and item_id = 't-item-a'", "u_fd");
await expectEq("on_hand = 11 - 1 used - 3 variance", "select on_hand from public.stock_levels where item_id = 't-item-a' and location_id = 'lynnfield'", "7.00");
await expectEq("fill level applied", "select fill_level from public.stock_levels where item_id = 't-item-b' and location_id = 'lynnfield'", "half");
await expectEq("last_counted_by", "select last_counted_by from public.stock_levels where item_id = 't-item-a' and location_id = 'lynnfield'", "u_fd");
await expectFail("approved count is final", "update public.count_sessions set status = 'in_progress' where id = 'cs-1'", /cannot go from/);

await expectOk("manager schedules a count for themself", "insert into public.count_sessions (id, location_id, area, name, assigned_to, due_at) values ('cs-2','lynnfield','Back','Self count','u_mgr','2026-11-21')");
await db.exec("insert into public.count_lines (count_session_id, item_id) values ('cs-2','t-item-a'); update public.count_sessions set status = 'in_progress' where id = 'cs-2'; update public.count_lines set counted = 7 where count_session_id = 'cs-2'; update public.count_sessions set status = 'submitted' where id = 'cs-2';");
await expectFail("manager cannot approve a count they performed", "update public.count_sessions set status = 'approved' where id = 'cs-2'", /Separation of duties/);
await asAdmin();
await expectFail("constraint: approver = assignee rejected even for the server", "update public.count_sessions set status = 'approved', approved_by = 'u_mgr' where id = 'cs-2'", /approver_did_not_count/);
await as("u_mgr2");
await expectAffected("a different manager approves it", "update public.count_sessions set status = 'approved' where id = 'cs-2'", 1);
await expectEq("zero-variance movement recorded", "select delta from public.stock_movements where count_session_id = 'cs-2'", "0.00");

console.log("== flags");
await asAdmin();
await expectOk("server inserts a flag about u_mgr", "insert into public.flags (id, type, severity, title, summary, location_id, user_id, evidence) values ('f-1','unexplained_adjustment','high','t','s','lynnfield','u_mgr','[{\"label\":\"a\",\"value\":\"b\"}]')");
await as("u_fd");
await expectRows("front desk cannot see flags", "select id from public.flags", 0);
await expectAffected("front desk cannot update flags", "update public.flags set status = 'dismissed', resolution_note = 'x' where id = 'f-1'", 0);
await as("u_nbp");
await expectRows("other-location manager cannot see it", "select id from public.flags", 0);
await as("u_mgr");
await expectAffected("subject may add themselves as reviewing", "update public.flags set status = 'reviewing' where id = 'f-1'", 1);
await expectFail("subject cannot resolve a flag about themself", "update public.flags set status = 'resolved', resolution_note = 'fine' where id = 'f-1'", /Separation of duties/);
await expectFail("managers cannot insert flags", "insert into public.flags (id, type, severity, title, summary, location_id) values ('f-2','data_quality','low','t','s','lynnfield')", /permission denied|row-level security/);
await as("u_mgr2");
await expectFail("resolving needs a note", "update public.flags set status = 'resolved' where id = 'f-1'", /closed_needs_note/);
await expectOk("manager adds a note", "insert into public.flag_events (flag_id, type, note) values ('f-1','note','Checked the camera')");
await expectAffected("another manager resolves with a note", "update public.flags set status = 'resolved', resolution_note = 'Approved write-off', assigned_to = 'u_mgr2' where id = 'f-1'", 1);
await expectEq("resolved_by stamped", "select resolved_by from public.flags where id = 'f-1'", "u_mgr2");
await expectEq("flag history rows (created, status, note, assigned, status)", "select count(*) from public.flag_events where flag_id = 'f-1'", 5);
await expectEq("note stamped with author", "select user_id from public.flag_events where flag_id = 'f-1' and type = 'note'", "u_mgr2");

console.log("== people");
await as("u_mgr");
await expectRows("manager sees staff at their location (not N, not owner)", "select id from public.profiles", 5);
await expectAffected("manager cannot change roles", "update public.profiles set role = 'owner' where id = 'u_mgr'", 0);
await as("u_owner");
await expectRows("owner sees everyone", "select id from public.profiles", 7);
await expectFail("owner cannot change own role", "update public.profiles set role = 'manager' where id = 'u_owner'", /your own role/);
await expectAffected("owner promotes technician", "update public.profiles set role = 'front_desk' where id = 'u_tech'", 1);
await expectFail("owner cannot write pin_hash", "update public.profiles set pin_hash = 'x' where id = 'u_tech'", /permission denied/);
await expectRows("owner reads all locations", "select id from public.locations", 2);
await expectAffected("owner edits thresholds", "update public.settings set flag_thresholds = flag_thresholds || '{\"overdueReceiptDays\": 28}' where location_id is null", 1);

console.log("== append-only and audit (as postgres)");
await asAdmin();
await expectFail("update on stock_movements raises", "update public.stock_movements set note = 'x'", /append-only/);
await expectFail("delete on stock_movements raises", "delete from public.stock_movements", /append-only/);
await expectFail("truncate on stock_movements raises", "truncate public.stock_movements", /append-only/);
await expectFail("update on audit_log raises", "update public.audit_log set action = 'insert'", /append-only/);
await expectFail("delete on audit_log raises", "delete from public.audit_log", /append-only/);
await expectFail("cannot delete an item with ledger history", "delete from public.items where id = 't-item-a'", /foreign key|append-only/);
await expectEq("ledger sums to on_hand delta (10 start -> 7)", "select 10 + sum(delta) from public.stock_movements where item_id = 't-item-a' and location_id = 'lynnfield'", "7.00");
await expectEq("last balance_after = on_hand", "select balance_after from public.stock_movements where item_id = 't-item-a' and location_id = 'lynnfield' order by created_at desc, occurred_at desc limit 1", "7.00");
const audit = await db.query("select table_name, action, count(*)::int as n from public.audit_log where row_id not like 'sup-%' and row_id not like 'pol-%' and row_id not like 'apres-%' and row_id not like '%2026-0%' group by 1,2 order by 1,2");
console.log("        audit rows: " + audit.rows.map((r) => `${r.table_name}.${r.action}=${r.n}`).join(", "));
await expectEq("audit captured the approval with actor", "select actor_id from public.audit_log where table_name = 'purchase_orders' and row_id = 'po-1' and new_row ->> 'status' = 'approved'", "u_mgr2");
await expectEq("audit never stores pin_hash", "select count(*) from public.audit_log where old_row ? 'pin_hash' or new_row ? 'pin_hash'", 0);
await expectEq("par change audited", "select count(*) from public.audit_log where table_name = 'stock_levels' and row_id = 't-item-a:lynnfield' and new_row ->> 'par' = '14.00'", 1);
await expectEq("on_hand changes are not duplicated into audit", "select count(*) from public.audit_log where table_name = 'stock_levels'", 2);
await as("u_mgr");
await expectEq("manager reads audit for own location only", "select count(*) from public.audit_log where location_id is distinct from 'lynnfield'", 0);

// =====================================================================================
// 0002: access levels and invites
// =====================================================================================

console.log("== 0002: the permission matrix matches packages/ui/engine/permissions.ts");
{
  // ROLE_GRANTS in permissions.ts is the source for the screens; app.role_grants() is the copy
  // the policies use. Read the TypeScript and compare, so the two cannot drift unnoticed.
  await asAdmin();
  const src = readFileSync(`${root}/packages/ui/engine/permissions.ts`, "utf8");
  const all = [...src.matchAll(/\{\s*id:\s*"([a-z]+\.[a-z]+)"/g)].map((m) => m[1]);
  const from = src.indexOf("export const ROLE_GRANTS");
  const block = from < 0 ? "" : src.slice(from, src.indexOf("\n};", from));
  const listFor = (key) => {
    const m = block.match(new RegExp(`\\n\\s*"?${key}"?\\s*:\\s*\\[([^\\]]*)\\]`));
    return m ? [...m[1].matchAll(/"([a-z]+\.[a-z]+)"/g)].map((x) => x[1]) : null;
  };
  if (all.length === 19) ok("permissions.ts lists 19 permissions"); else bad("permissions.ts lists 19 permissions", `found ${all.length}: update app.role_grants() and this check`);
  const sqlList = `array[${all.map((p) => `'${p}'`).join(",")}]`;
  for (const [tsRole, dbRole] of [["manager", "manager"], ["front-desk", "front_desk"], ["technician", "technician"]]) {
    const want = listFor(tsRole);
    const name = `ROLE_GRANTS["${tsRole}"] = app.role_grants('${dbRole}', ...)`;
    if (!want) { bad(name, "could not find the list in permissions.ts"); continue; }
    try {
      const rows = (await db.query(`select p, app.role_grants('${dbRole}', p) as granted from unnest(${sqlList}) as p`)).rows;
      const diff = rows.filter((r) => r.granted !== want.includes(r.p)).map((r) => `${r.p} (sql ${r.granted}, ts ${want.includes(r.p)})`);
      if (diff.length) bad(name, `differs on: ${diff.join(", ")}`); else ok(`${name}  [${want.length} granted]`);
    } catch (e) { bad(name, e.message); }
  }
  await expectEq("owner role is granted everything", `select bool_and(app.role_grants('owner', p)) from unnest(${sqlList}) as p`, "true");
  await expectFail("an unknown permission is an error, not a silent no", "select app.role_grants('manager', 'orders.aprove')", /Unknown permission/);
}

console.log("== 0002: admin vs user, permission by permission");
await asAdmin();
await db.exec(`
insert into public.profiles (id, email, name, role, access_level) values
  ('u_adm',   'adm@example.com', 'Ada Admin', 'technician', 'admin'),
  ('u_tech2', 't2@example.com',  'T2',        'technician', 'user');
insert into public.profile_locations (profile_id, location_id) values ('u_tech2', 'lynnfield');
insert into public.digest_runs (period, location_id, range_start, range_end, status) values
  ('weekly', 'lynnfield', '2026-11-01', '2026-11-07', 'sent'),
  ('weekly', 'newburyport', '2026-11-01', '2026-11-07', 'sent'),
  ('monthly', null, '2026-10-01', '2026-10-31', 'skipped');
insert into public.flags (id, type, severity, title, summary, location_id, user_id) values
  ('f-3', 'unexplained_adjustment', 'high', 't', 's', 'newburyport', 'u_adm');
`);
ok("fixtures: u_adm (admin, role technician, no locations), u_tech2 (user technician, Lynnfield)");

// stock.view, locations.all
await as("u_tech2");
await expectRows("stock.view: user sees stock at own location only", "select location_id from public.stock_levels where item_id = 't-item-a'", 1);
await expectRows("locations.all: user sees one location", "select id from public.locations", 1);
await as("u_adm");
await expectRows("stock.view + locations.all: admin sees stock at every location, with no location rows", "select location_id from public.stock_levels where item_id = 't-item-a'", 2);
await expectRows("locations.all: admin sees both locations", "select id from public.locations", 2);
await expectEq("auth_is_admin() is true for an admin whose role is technician", "select app.auth_is_admin()", "true");

// usage.log
await as("u_tech2");
await expectOk("usage.log: user technician logs use at own location", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','use',-1,'used_in_service','u_tech2')");
await expectFail("usage.log: user cannot log use at another location", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','newburyport','use',-1,'used_in_service','u_tech2')", /row-level security/);
await as("u_adm");
await expectOk("usage.log: admin logs use at any location", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','newburyport','use',-1,'used_in_service','u_adm')");

// stock.adjust
await as("u_fd");
await expectFail("stock.adjust: user front desk cannot adjust", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','adjust',-1,'damaged','u_fd')", /row-level security/);
await as("u_tech2");
await expectFail("stock.adjust: user technician cannot adjust", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','adjust',-1,'damaged','u_tech2')", /row-level security/);
await as("u_adm");
await expectOk("stock.adjust: admin with a technician role adjusts, at a location they are not assigned to", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','newburyport','adjust',-1,'damaged','u_adm')");
await expectAffected("stock.adjust: admin changes a par level", "update public.stock_levels set par = 7 where item_id = 't-item-a' and location_id = 'newburyport'", 1);

// counts.schedule, stock.count, counts.approve
await as("u_fd");
await expectFail("counts.schedule: user front desk cannot schedule a count", "insert into public.count_sessions (id, location_id, area, name, assigned_to, due_at) values ('cs-x','lynnfield','Back','x','u_fd','2026-11-25')", /row-level security/);
await as("u_tech2");
await expectRows("stock.count: user sees no counts that are not assigned to them", "select id from public.count_sessions", 0);
await as("u_adm");
await expectOk("counts.schedule: admin schedules a count (assigned to themself)", "insert into public.count_sessions (id, location_id, area, name, assigned_to, due_at) values ('cs-3','newburyport','Back','Admin count','u_adm','2026-11-25')");
await expectRows("stock.count: admin sees every count", "select id from public.count_sessions", 3);
await db.exec("insert into public.count_lines (count_session_id, item_id) values ('cs-3','t-item-a'); update public.count_sessions set status = 'in_progress' where id = 'cs-3'; update public.count_lines set counted = 2 where count_session_id = 'cs-3'; update public.count_sessions set status = 'submitted' where id = 'cs-3';");
await expectFail("counts.approve: separation of duties binds admins (cannot approve a count they performed)", "update public.count_sessions set status = 'approved' where id = 'cs-3'", /Separation of duties/);
await as("u_nbp");
await expectAffected("counts.approve: a user manager approves it", "update public.count_sessions set status = 'approved' where id = 'cs-3'", 1);

// orders.view, orders.create, orders.approve, orders.receive
await as("u_tech2");
await expectRows("orders.view: user technician sees no orders", "select id from public.purchase_orders", 0);
await as("u_fd");
await expectRows("orders.view: user front desk sees orders at own location", "select id from public.purchase_orders where id = 'po-1'", 1);
await expectFail("orders.create: user front desk cannot create an order", "insert into public.purchase_orders (id, number, location_id, vendor_id, cycle) values ('po-x','PO-X','lynnfield','amazon','2026-11')", /row-level security/);
await as("u_adm");
await expectRows("orders.view: admin with a technician role sees orders (0001 went by role name)", "select id from public.purchase_orders where id = 'po-1'", 1);
await expectOk("orders.create: admin creates an order", "insert into public.purchase_orders (id, number, location_id, vendor_id, cycle) values ('po-2','PO-TEST-2','newburyport','amazon','2026-11')");
await db.exec("insert into public.purchase_order_lines (id, purchase_order_id, item_id, name, qty_ordered) values ('po-2:l1','po-2','t-item-a','Test Item A',2); update public.purchase_orders set status = 'awaiting_approval' where id = 'po-2';");
await as("u_nbp");
await expectFail("orders.approve: a user manager cannot approve, even an order they did not create", "update public.purchase_orders set status = 'approved' where id = 'po-2'", /Only an admin can approve/);
await as("u_adm");
await expectFail("orders.approve: separation of duties binds admins (cannot approve an order they created)", "update public.purchase_orders set status = 'approved' where id = 'po-2'", /Separation of duties/);
await as("u_mgr2");
await expectAffected("orders.approve: a different admin approves", "update public.purchase_orders set status = 'approved' where id = 'po-2'", 1);
await as("u_nbp");
await expectAffected("orders.create: a user manager places the approved order", "update public.purchase_orders set status = 'sent' where id = 'po-2'", 1);
await as("u_tech2");
await expectFail("orders.receive: user technician cannot receive", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id) values ('t-item-a','lynnfield','receive',1,'received_order','u_tech2')", /row-level security/);
await as("u_adm");
await expectFail("orders.receive: separation of duties binds admins (cannot receive an order they created)", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id, purchase_order_line_id) values ('t-item-a','newburyport','receive',2,'received_order','u_adm','po-2:l1')", /Separation of duties/);
await as("u_nbp");
await expectOk("orders.receive: a user manager receives it", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id, purchase_order_line_id) values ('t-item-a','newburyport','receive',2,'received_order','u_nbp','po-2:l1')");
await expectOk("orders.create: user manager creates a second order", "insert into public.purchase_orders (id, number, location_id, vendor_id, cycle) values ('po-3','PO-TEST-3','newburyport','amazon','2026-11')");
await db.exec("insert into public.purchase_order_lines (id, purchase_order_id, item_id, name, qty_ordered) values ('po-3:l1','po-3','t-item-a','Test Item A',1); update public.purchase_orders set status = 'awaiting_approval' where id = 'po-3';");
await as("u_adm");
await expectAffected("orders.approve: admin approves an order someone else created", "update public.purchase_orders set status = 'approved' where id = 'po-3'", 1);
await db.exec("update public.purchase_orders set status = 'sent' where id = 'po-3'");
await expectOk("orders.receive: admin with a technician role receives (0001 went by role name)", "insert into public.stock_movements (item_id, location_id, type, delta, reason, user_id, purchase_order_line_id) values ('t-item-a','newburyport','receive',1,'received_order','u_adm','po-3:l1')");
await expectEq("that order is received", "select status from public.purchase_orders where id = 'po-3'", "received");

// flags.view, flags.resolve
await as("u_tech2");
await expectRows("flags.view: user technician sees no flags", "select id from public.flags", 0);
await as("u_mgr");
await expectRows("flags.view: user manager sees flags at own location only", "select id from public.flags", 1);
await as("u_adm");
await expectRows("flags.view: admin sees flags at every location", "select id from public.flags", 2);
await expectFail("flags.resolve: separation of duties binds admins (cannot close a flag about themself)", "update public.flags set status = 'resolved', resolution_note = 'fine' where id = 'f-3'", /Separation of duties/);
await as("u_nbp");
await expectAffected("flags.resolve: a user manager closes it", "update public.flags set status = 'resolved', resolution_note = 'Checked with the owner' where id = 'f-3'", 1);

// costs.view, reports.view
await as("u_tech2");
await expectEq("costs.view: user technician gets no cost", "select coalesce(unit_cost::text, 'null') from public.items_with_cost where id = 't-item-a'", "null");
await expectEq("reports.view: user technician reads only their own ledger entries", "select count(*) from public.stock_movements where user_id <> 'u_tech2'", 0);
await as("u_mgr");
await expectEq("reports.view: user manager reads the whole ledger for own location", "select count(*) > 0 from public.stock_movements where user_id <> 'u_mgr'", "true");
await expectEq("reports.view: and nothing from another location", "select count(*) from public.stock_movements where location_id <> 'lynnfield'", 0);
await as("u_adm");
await expectEq("costs.view: admin with a technician role sees costs", "select unit_cost from public.items_with_cost where id = 't-item-a'", "12.50");
await expectEq("reports.view: admin reads the ledger for every location", "select count(distinct location_id) from public.stock_movements", 2);

// digests.view, activity.view
await as("u_fd");
await expectEq("digests.view: user front desk sees no digest runs", "select count(*) from public.digest_runs", 0);
await expectEq("activity.view: user front desk sees no audit log", "select count(*) from public.audit_log", 0);
await as("u_mgr");
await expectEq("digests.view: user manager sees digest runs for own location", "select count(*) from public.digest_runs", 1);
await expectEq("activity.view: user manager sees no rows without a location (role changes, invites, settings)", "select count(*) from public.audit_log where location_id is null", 0);
await as("u_adm");
await expectEq("digests.view: admin sees every digest run", "select count(*) from public.digest_runs", 3);
await expectEq("activity.view: admin sees rows without a location", "select count(*) > 0 from public.audit_log where location_id is null", "true");

// team.manage
await as("u_mgr");
await expectAffected("team.manage: user manager cannot change a role", "update public.profiles set role = 'front_desk' where id = 'u_tech2'", 0);
await expectFail("team.manage: user manager cannot assign a location", "insert into public.profile_locations (profile_id, location_id) values ('u_tech2','newburyport')", /row-level security/);
await expectAffected("team.manage: user manager cannot unassign a location", "delete from public.profile_locations where profile_id = 'u_tech2'", 0);
await as("u_adm");
await expectRows("team.manage: admin who is not an owner reads every profile", "select id from public.profiles", 9);
await expectAffected("team.manage: admin who is not an owner changes a role", "update public.profiles set role = 'front_desk' where id = 'u_tech2'", 1);
await expectOk("team.manage: admin assigns a location", "insert into public.profile_locations (profile_id, location_id) values ('u_tech2','newburyport')");
await expectAffected("team.manage: admin unassigns a location", "delete from public.profile_locations where profile_id = 'u_tech2' and location_id = 'newburyport'", 1);

// settings.manage
await as("u_mgr");
await expectAffected("settings.manage: user manager cannot edit thresholds", "update public.settings set flag_thresholds = flag_thresholds || '{\"overdueReceiptDays\": 30}' where location_id is null", 0);
await expectFail("settings.manage: user manager cannot add a vendor (0001 allowed it)", "insert into public.vendors (id, name, channel) values ('t-vendor','T','email_po')", /row-level security/);
await expectAffected("settings.manage: user manager cannot edit a vendor", "update public.vendors set note = 'x' where id = 'amazon'", 0);
await expectAffected("settings.manage: user manager cannot edit notification rules", "update public.notification_rules set enabled = false where id = 'count-due'", 0);
await expectAffected("settings.manage: user manager cannot rename a location", "update public.locations set name = 'X' where id = 'lynnfield'", 0);
await as("u_adm");
await expectAffected("settings.manage: admin edits thresholds", "update public.settings set flag_thresholds = flag_thresholds || '{\"overdueReceiptDays\": 30}' where location_id is null", 1);
await expectOk("settings.manage: admin adds a vendor", "insert into public.vendors (id, name, channel) values ('t-vendor','T','email_po')");
await expectAffected("settings.manage: admin edits notification rules", "update public.notification_rules set enabled = false where id = 'count-due'", 1);
await expectAffected("settings.manage: admin renames a location", "update public.locations set short_name = 'Lynnfield' where id = 'lynnfield'", 1);

console.log("== 0002: guard rails on roles and access levels");
await as("u_adm");
await expectFail("an admin cannot change their own access level", "update public.profiles set access_level = 'user' where id = 'u_adm'", /your own/);
await expectFail("an admin cannot deactivate themself", "update public.profiles set active = false where id = 'u_adm'", /your own/);
await as("u_mgr2");
await expectFail("an admin cannot change their own role", "update public.profiles set role = 'technician' where id = 'u_mgr2'", /your own role/);
await as("u_mgr");
await expectAffected("a user cannot make themself an admin", "update public.profiles set access_level = 'admin' where id = 'u_mgr'", 0);
await expectAffected("a user cannot make someone else an admin", "update public.profiles set access_level = 'admin' where id = 'u_tech2'", 0);
await expectEq("still a user", "select access_level from public.profiles where id = 'u_mgr'", "user");
await as("u_adm");
await expectAffected("an admin makes someone an admin", "update public.profiles set access_level = 'admin' where id = 'u_nbp'", 1);
await expectFail("an owner cannot be made a user, by another admin", "update public.profiles set access_level = 'user' where id = 'u_owner'", /Owners are always admins/);
await asAdmin();
await expectFail("an owner cannot be made a user, by the server either", "update public.profiles set access_level = 'user' where id = 'u_owner'", /Owners are always admins/);
await expectEq("audit: access-level change recorded with its actor", "select actor_id from public.audit_log where table_name = 'profiles' and row_id = 'u_nbp' and 'profile.access_changed' = any (events)", "u_adm");
await expectEq("audit: role change recorded with its actor", "select actor_id from public.audit_log where table_name = 'profiles' and row_id = 'u_tech2' and 'profile.role_changed' = any (events)", "u_adm");
await expectEq("audit: the row holds the before and after", "select (old_row ->> 'access_level') || ' -> ' || (new_row ->> 'access_level') from public.audit_log where table_name = 'profiles' and row_id = 'u_nbp' and 'profile.access_changed' = any (events)", "user -> admin");
await as("u_adm");
await expectAffected("an admin makes them a user again", "update public.profiles set access_level = 'user' where id = 'u_nbp'", 1);
await as("u_owner");
await expectAffected("making someone an owner", "update public.profiles set role = 'owner' where id = 'u_tech2'", 1);
await expectEq("makes them an admin too", "select access_level from public.profiles where id = 'u_tech2'", "admin");
await db.exec("update public.profiles set role = 'technician' where id = 'u_tech2'; update public.profiles set access_level = 'user' where id = 'u_tech2';");
await asAdmin();
await db.exec("insert into public.profiles (id, email, name, role) values ('u_owner2', 'o2@example.com', 'O2', 'owner')");
await expectEq("a new owner inserted without an access level is an admin", "select access_level from public.profiles where id = 'u_owner2'", "admin");
await db.exec("update public.profiles set active = false where id = 'u_adm'");
await as("u_adm");
await expectRows("a deactivated admin sees nothing", "select id from public.locations", 0);
await expectEq("and is no longer an admin to the policies", "select app.auth_is_admin()", "false");
await asAdmin();
await db.exec("update public.profiles set active = true where id = 'u_adm'");

console.log("== 0002: invites: who can create and read them");
const T = {
  email: "mk_" + "A1b2C3d4".repeat(5) + "aaa",   // 43 characters after the prefix, like a real token
  open: "mk_" + "Z9y8X7w6".repeat(5) + "bbb",
  late: "mk_" + "L4t3L4t3".repeat(5) + "ccc",
  late2: "mk_" + "N3wN3wN3".repeat(5) + "ddd",
  lateResent: "mk_" + "R3s3ntR3".repeat(5) + "eee",
  short: "mk_" + "Sh0rtSh0".repeat(5) + "fff",
  admin: "mk_" + "Adm1nAdm".repeat(5) + "ggg",
  admin2: "mk_" + "Adm2nAdm".repeat(5) + "hhh",
  back: "mk_" + "B4ckB4ck".repeat(5) + "iii",
  gone: "mk_" + "G0n3G0n3".repeat(5) + "jjj",
};
const H = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, sha256(v)]));
const inviteId = async (hash) => { await asAdmin(); return scalar(`select id from public.invites where token_hash = '${hash}'`); };

await as(null, "anon");
await expectFail("anon cannot read invites", "select id from public.invites", /permission denied/);
await expectFail("anon cannot read the invites view", "select id from public.invites_with_status", /permission denied/);
await expectFail("anon cannot call invite_preview (token lookup is not open to the anon role)", `select * from public.invite_preview('${T.email}')`, /permission denied/);
await expectFail("anon cannot call accept_invite", `select public.accept_invite('${T.email}')`, /permission denied/);
await as("u_owner");
await expectFail("signed-in users cannot call invite_preview either, admins included", `select * from public.invite_preview('${T.email}')`, /permission denied/);
await asAdmin();
await expectEq("privileges: invite_preview is for the service role only", "select has_function_privilege('anon', 'public.invite_preview(text)', 'execute')::text || has_function_privilege('authenticated', 'public.invite_preview(text)', 'execute')::text || has_function_privilege('service_role', 'public.invite_preview(text)', 'execute')::text", "falsefalsetrue");
await expectEq("privileges: accept_invite is for signed-in users only", "select has_function_privilege('anon', 'public.accept_invite(text)', 'execute')::text || has_function_privilege('authenticated', 'public.accept_invite(text)', 'execute')::text", "falsetrue");

await as("u_mgr");
await expectFail("a non-admin cannot create an invite", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.email}', 'new.tech@example.com', 'technician', 'user', '{lynnfield}')`, /row-level security/);
await expectFail("a non-admin cannot create an admin invite (its own rule, checked first)", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.admin}', 'ops.lead@example.com', 'manager', 'admin', '{}')`, /Only an admin can invite an admin/);

await as("u_owner");
await expectOk("an admin creates an email invite", `insert into public.invites (token_hash, email, name, role, access_level, location_ids, note) values ('${H.email}', '  New.Tech@Example.com ', 'Devon', 'technician', 'user', '{lynnfield}', 'Starts Monday.')`);
await expectEq("the email is stored lower-cased and trimmed", "select email from public.invites_with_status where name = 'Devon'", "new.tech@example.com");
await expectEq("invited_by is stamped from the token", "select invited_by from public.invites_with_status where name = 'Devon'", "u_owner");
await expectEq("status is pending", "select status from public.invites_with_status where name = 'Devon'", "pending");
await expectEq("an email invite defaults to 7 days", "select (expires_at - token_issued_at) = interval '168 hours' from public.invites_with_status where name = 'Devon'", "true");
await expectFail("not even an admin can read the token hash", "select token_hash from public.invites", /permission denied/);
await expectFail("one pending invite per email (case-insensitive)", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.late2}', 'NEW.TECH@example.com', 'technician', 'user', '{lynnfield}')`, /already pending/);
await expectFail("the owner role cannot be invited", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.late2}', 'boss@example.com', 'owner', 'admin', '{}')`, /invites_role_not_owner/);
await expectFail("a user invite needs at least one location", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.late2}', 'nowhere@example.com', 'technician', 'user', '{}')`, /invites_user_needs_location/);
await expectFail("unknown locations are refused", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.late2}', 'nowhere@example.com', 'technician', 'user', '{boston}')`, /Unknown location/);
await expectFail("someone who already has access cannot be invited again", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.late2}', 'm@example.com', 'technician', 'user', '{lynnfield}')`, /already has access/);
await expectFail("a malformed email is refused", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.late2}', 'not-an-email', 'technician', 'user', '{lynnfield}')`, /invites_email_check/);
await expectFail("the token itself cannot be stored in place of its hash", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${T.late2}', 'raw@example.com', 'technician', 'user', '{lynnfield}')`, /invites_token_hash_check/);
await expectOk("an admin creates an open link (no email)", `insert into public.invites (token_hash, role, access_level, location_ids) values ('${H.open}', 'front_desk', 'user', '{newburyport}')`);
await expectEq("an open link defaults to 48 hours", `select (expires_at - token_issued_at) = interval '48 hours' from public.invites_with_status where email is null`, "true");
await expectFail("an open link cannot grant admin access", `insert into public.invites (token_hash, role, access_level, location_ids) values ('${H.late2}', 'manager', 'admin', '{}')`, /invites_admin_needs_email/);
await expectFail("an open link cannot last longer than 48 hours", `insert into public.invites (token_hash, role, access_level, location_ids, expires_at) values ('${H.late2}', 'front_desk', 'user', '{newburyport}', now() + interval '3 days')`, /invites_open_link_ttl/);
await expectFail("an email invite cannot last longer than 7 days", `insert into public.invites (token_hash, email, role, access_level, location_ids, expires_at) values ('${H.late2}', 'slow@example.com', 'technician', 'user', '{lynnfield}', now() + interval '8 days')`, /invites_email_ttl/);
await expectOk("a shorter expiry is accepted", `insert into public.invites (token_hash, email, role, access_level, location_ids, expires_at) values ('${H.short}', 'short@example.com', 'technician', 'user', '{lynnfield}', now() + interval '1 day')`);
await expectFail("the client cannot write the acceptance fields", "update public.invites set accepted_at = now(), accepted_by = 'u_owner' where name = 'Devon'", /permission denied/);
await expectFail("the client cannot edit what an invite grants", "update public.invites set role = 'manager' where name = 'Devon'", /permission denied/);
await expectFail("the expiry cannot be pushed out without resending", "update public.invites set expires_at = now() + interval '6 days' where email = 'short@example.com'", /only when it is resent/);
await as("u_mgr");
await expectRows("a non-admin reads no invites", "select id from public.invites_with_status", 0);
await expectAffected("a non-admin cannot revoke an invite", "update public.invites set revoked_at = now() where email = 'short@example.com'", 0);
await asAdmin();
await expectFail("what an invite grants cannot be edited by the server either", "update public.invites set role = 'manager' where name = 'Devon'", /cannot be changed/);
await expectEq("audit: invite created, with its actor", "select actor_id from public.audit_log where table_name = 'invites' and 'invite.created' = any (events) order by id limit 1", "u_owner");
await expectEq("audit never stores the token hash", "select count(*) from public.audit_log where old_row ? 'token_hash' or new_row ? 'token_hash'", 0);

console.log("== 0002: invites: preview (the server, as service_role)");
await asService();
await expectRows("preview of a pending invite returns one row", `select * from public.invite_preview('${T.email}')`, 1);
await expectEq("preview: status, inviter, role, access", `select status || '|' || inviter_name || '|' || role || '|' || access_level from public.invite_preview('${T.email}')`, "pending|O|technician|user");
await expectEq("preview: location names, not ids", `select array_to_string(location_names, ',') from public.invite_preview('${T.email}')`, "Lynnfield");
await expectEq("preview: note and greeting name", `select note || '|' || invitee_name from public.invite_preview('${T.email}')`, "Starts Monday.|Devon");
await expectEq("preview: the email is masked", `select masked_email || '|' || email_bound from public.invite_preview('${T.email}')`, "n••••@example.com|true");
await expectEq("preview: the full address appears nowhere in the result", `select to_jsonb(p)::text like '%new.tech%' from public.invite_preview('${T.email}') p`, "false");
await expectEq("preview: exactly the safe fields (no id, no email, no hash)", `select array_to_string(array(select jsonb_object_keys(to_jsonb(p)) order by 1), ',') from public.invite_preview('${T.email}') p`, "access_level,email_bound,expires_at,invitee_name,inviter_name,location_names,masked_email,note,role,status");
await expectEq("preview of an open link: not email-bound, no masked email", `select email_bound || '|' || coalesce(masked_email, 'null') from public.invite_preview('${T.open}')`, "false|null");
await expectRows("preview of an unknown token returns nothing", `select * from public.invite_preview('${T.late2}')`, 0);
await expectRows("preview does not accept the stored hash as a token", `select * from public.invite_preview('${H.email}')`, 0);
await expectRows("preview of a null token returns nothing", "select * from public.invite_preview(null)", 0);

console.log("== 0002: invites: accept");
await as(null);
await expectEq("no user in the token: refused", `select public.accept_invite('${T.email}') ->> 'error'`, "not_signed_in");
await asClaims("u_new");
await expectEq("no email claim in the token: refused", `select public.accept_invite('${T.email}') ->> 'error'`, "email_claim_missing");
await asClaims("u_new", { email: "someone.else@example.com", email_verified: true });
await expectEq("wrong email: refused", `select public.accept_invite('${T.email}') ->> 'error'`, "email_mismatch");
await asClaims("u_new", { email: "new.tech@example.com", email_verified: false });
await expectEq("unverified email: refused", `select public.accept_invite('${T.email}') ->> 'error'`, "email_not_verified");
await asClaims("u_new", { email: "new.tech@example.com", email_verified: true });
await expectEq("unknown token: refused", `select public.accept_invite('${T.late2}') ->> 'error'`, "invalid");
await asAdmin();
await expectEq("nothing was written by the refused attempts", "select (select count(*) from public.profiles where id = 'u_new') || '|' || (select status from public.invites_with_status where name = 'Devon')", "0|pending");
await asClaims("u_new", { email: "New.Tech@Example.com", email_verified: true, name: "Devon Reyes" });
await expectEq("the invited Google account accepts (email compared case-insensitively)", `select public.accept_invite('${T.email}') ->> 'ok'`, "true");
await expectEq("the new person can read their own profile", "select role || '|' || access_level || '|' || email || '|' || name from public.profiles where id = 'u_new'", "technician|user|new.tech@example.com|Devon Reyes");
await expectEq("and sees stock at the invited location", "select count(*) > 0 from public.stock_levels where location_id = 'lynnfield'", "true");
await expectRows("and nothing at the other one", "select item_id from public.stock_levels where location_id = 'newburyport'", 0);
await expectRows("and no invites", "select id from public.invites_with_status", 0);
await asAdmin();
await expectEq("profile_locations written", "select string_agg(location_id, ',') from public.profile_locations where profile_id = 'u_new'", "lynnfield");
await expectEq("the invite is marked accepted, by them", "select status || '|' || accepted_by from public.invites_with_status where name = 'Devon'", "accepted|u_new");
await expectEq("audit: invite accepted, actor is the person who accepted", "select actor_id from public.audit_log where table_name = 'invites' and 'invite.accepted' = any (events) order by id limit 1", "u_new");
await expectEq("audit: profile created in the same step", "select count(*) from public.audit_log where table_name = 'profiles' and row_id = 'u_new' and 'profile.created' = any (events) and actor_id = 'u_new'", 1);
await asClaims("u_new", { email: "new.tech@example.com", email_verified: true });
await expectEq("the same person accepting twice is told it is already done", `select (public.accept_invite('${T.email}') ->> 'ok') || '|' || (public.accept_invite('${T.email}') ->> 'already_accepted')`, "true|true");
await asClaims("u_other", { email: "new.tech@example.com", email_verified: true });
await expectEq("double acceptance: a second account cannot use the same invite", `select public.accept_invite('${T.email}') ->> 'error'`, "already_accepted");
await asAdmin();
await expectEq("and got no profile", "select count(*) from public.profiles where id in ('u_other') or email = 'new.tech@example.com'", 1);
await expectEq("static: accept_invite locks the invite row before checking it (FOR UPDATE)", "select prosrc ~* 'token_hash = app.hash_invite_token\\(accept_invite.token\\)\\s+for update' from pg_proc where proname = 'accept_invite'", "true");
await asService();
await expectEq("preview of an accepted invite: status only", `select status || '|' || (role is null and note is null and masked_email is null and location_names is null)::text from public.invite_preview('${T.email}')`, "accepted|true");
await as("u_owner");
await expectFail("an accepted invite cannot be revoked", "update public.invites set revoked_at = now() where name = 'Devon'", /accepted and can no longer be changed/);

await asClaims("u_mgr", { email: "m@example.com", email_verified: true });
await expectEq("someone who already has access cannot accept another invite", `select public.accept_invite('${T.open}') ->> 'error'`, "already_member");
await asAdmin();
await expectEq("their role is untouched and the link is still pending", "select (select role from public.profiles where id = 'u_mgr') || '|' || (select status from public.invites_with_status where email is null)", "manager|pending");
await asClaims("u_open", { email: "walkin@example.com", email_verified: true });
await expectEq("an open link is accepted by whoever holds it", `select public.accept_invite('${T.open}') ->> 'ok'`, "true");
await asAdmin();
await expectEq("with the role, access and location on the link", "select p.role || '|' || p.access_level || '|' || p.name || '|' || (select string_agg(location_id, ',') from public.profile_locations where profile_id = p.id) from public.profiles p where p.id = 'u_open'", "front_desk|user|walkin|newburyport");
await asClaims("u_open2", { email: "second@example.com", email_verified: true });
await expectEq("an open link works once", `select public.accept_invite('${T.open}') ->> 'error'`, "already_accepted");

console.log("== 0002: invites: expired, revoked, resent");
await asAdmin();
await db.exec(`insert into public.invites (token_hash, email, role, access_level, location_ids, invited_by, created_at, token_issued_at, expires_at)
  values ('${H.late}', 'late@example.com', 'technician', 'user', '{lynnfield}', 'u_owner', now() - interval '10 days', now() - interval '10 days', now() - interval '3 days')`);
const lateId = await inviteId(H.late);
await as("u_owner");
await expectEq("an invite past its expiry shows as expired", `select status from public.invites_with_status where id = '${lateId}'`, "expired");
await asService();
await expectEq("preview: expired, and nothing about what it granted", `select status || '|' || (role is null)::text from public.invite_preview('${T.late}')`, "expired|true");
await asClaims("u_late", { email: "late@example.com", email_verified: true });
await expectEq("an expired invite cannot be accepted", `select public.accept_invite('${T.late}') ->> 'error'`, "expired");
await as("u_owner");
await expectOk("an expired invite does not block a new one to the same email", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.late2}', 'late@example.com', 'technician', 'user', '{lynnfield}')`);
await expectFail("resending the old one is refused while the new one is pending", `update public.invites set token_hash = '${H.lateResent}' where id = '${lateId}'`, /already pending/);
const late2Id = await inviteId(H.late2);
await as("u_owner");
await expectAffected("an admin revokes an invite", `update public.invites set revoked_at = now() where id = '${late2Id}'`, 1);
await expectEq("revoked: status and who revoked it", `select status || '|' || revoked_by from public.invites_with_status where id = '${late2Id}'`, "revoked|u_owner");
await expectFail("a revoked invite is final (cannot be resent)", `update public.invites set token_hash = '${H.gone}' where id = '${late2Id}'`, /revoked and can no longer be changed/);
await asService();
await expectEq("preview: revoked", `select status from public.invite_preview('${T.late2}')`, "revoked");
await asClaims("u_late", { email: "late@example.com", email_verified: true });
await expectEq("a revoked invite cannot be accepted", `select public.accept_invite('${T.late2}') ->> 'error'`, "revoked");
await asAdmin();
await expectEq("audit: invite revoked, with its actor", `select actor_id from public.audit_log where table_name = 'invites' and row_id = '${late2Id}' and 'invite.revoked' = any (events)`, "u_owner");
await as("u_owner");
await expectAffected("an admin resends the expired invite (a new token)", `update public.invites set token_hash = '${H.lateResent}' where id = '${lateId}'`, 1);
await expectEq("resent: pending again, a fresh 7 days, counted", `select status || '|' || resend_count || '|' || ((expires_at - token_issued_at) = interval '168 hours')::text || '|' || (token_issued_at > created_at)::text from public.invites_with_status where id = '${lateId}'`, "pending|1|true|true");
await asService();
await expectRows("the old link stops working the moment it is resent", `select * from public.invite_preview('${T.late}')`, 0);
await expectEq("the new link previews as pending", `select status from public.invite_preview('${T.lateResent}')`, "pending");
await asAdmin();
await expectEq("audit: invite resent, with its actor", `select actor_id from public.audit_log where table_name = 'invites' and row_id = '${lateId}' and 'invite.resent' = any (events)`, "u_owner");
await asClaims("u_late", { email: "late@example.com", email_verified: true });
await expectEq("the old token is refused", `select public.accept_invite('${T.late}') ->> 'error'`, "invalid");
await expectEq("the new token is accepted", `select public.accept_invite('${T.lateResent}') ->> 'ok'`, "true");

console.log("== 0002: invites: admin invites, returning staff");
await as("u_adm");
await expectOk("an admin who is not an owner creates an admin invite", `insert into public.invites (token_hash, email, name, role, access_level, location_ids) values ('${H.admin}', 'ops.lead@example.com', 'Priya', 'manager', 'admin', '{}')`);
await asClaims("u_ops", { email: "ops.lead@example.com", email_verified: true });
await expectEq("the admin invite is accepted", `select public.accept_invite('${T.admin}') ->> 'access_level'`, "admin");
await expectRows("the new admin sees every location with no location rows", "select id from public.locations", 2);
await expectEq("name falls back to the one on the invite", "select name from public.profiles where id = 'u_ops'", "Priya");
await as("u_owner");
await expectOk("a former (deactivated) member can be invited again", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.back}', 'x@example.com', 'technician', 'user', '{newburyport}')`);
await asClaims("u_off", { email: "x@example.com", email_verified: true });
await expectEq("they accept with the same account", `select public.accept_invite('${T.back}') ->> 'ok'`, "true");
await asAdmin();
await expectEq("and are switched back on with what the new invite grants, not what they had", "select p.active || '|' || p.role || '|' || (select string_agg(location_id, ',') from public.profile_locations where profile_id = p.id) from public.profiles p where p.id = 'u_off'", "true|technician|newburyport");
await expectEq("audit: reactivation recorded", "select count(*) from public.audit_log where table_name = 'profiles' and row_id = 'u_off' and 'profile.reactivated' = any (events) and actor_id = 'u_off'", 1);
await db.exec("insert into public.profiles (id, email, name, role, active) values ('u_gone', 'gone@example.com', 'G', 'technician', false)");
await as("u_owner");
await expectOk("invite to an address that belongs to an old profile under another account id", `insert into public.invites (token_hash, email, role, access_level, location_ids) values ('${H.gone}', 'gone@example.com', 'technician', 'user', '{lynnfield}')`);
await asClaims("u_gone_new", { email: "gone@example.com", email_verified: true });
await expectEq("is refused at acceptance, for an admin to sort out", `select public.accept_invite('${T.gone}') ->> 'error'`, "email_in_use");
await asAdmin();
await expectEq("and wrote nothing", "select (select count(*) from public.profiles where id = 'u_gone_new') || '|' || (select status from public.invites_with_status where email = 'gone@example.com')", "0|pending");

console.log("== 0002: the last admin (as postgres and as the server)");
await asAdmin();
await expectOk("every admin but one can be demoted", "update public.profiles set access_level = 'user' where access_level = 'admin' and role <> 'owner'");
await db.exec("update public.profiles set active = false where id = 'u_owner2'");
await expectEq("one active admin left", "select string_agg(id, ',') from public.profiles where active and access_level = 'admin'", "u_owner");
await expectFail("the last admin cannot be deactivated", "update public.profiles set active = false where id = 'u_owner'", /last admin/);
await expectFail("the last admin cannot be demoted", "update public.profiles set role = 'manager', access_level = 'user' where id = 'u_owner'", /last admin/);
await expectFail("the last admin cannot be deleted", "delete from public.profiles where id = 'u_owner'", /last admin/);
await asService();
await expectFail("not by the server (service role) either", "update public.profiles set active = false where id = 'u_owner'", /last admin/);
await as("u_owner");
await expectFail("the last admin cannot demote themself (own-access rule)", "update public.profiles set role = 'manager', access_level = 'user' where id = 'u_owner'", /your own/);
await expectAffected("they make a second admin", "update public.profiles set access_level = 'admin' where id = 'u_mgr'", 1);
await as("u_mgr");
await expectAffected("with two admins, one can demote the other, an owner included", "update public.profiles set role = 'manager', access_level = 'user' where id = 'u_owner'", 1);
await asAdmin();
await expectFail("and the one who remains is now protected", "update public.profiles set access_level = 'user' where id = 'u_mgr'", /last admin/);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
