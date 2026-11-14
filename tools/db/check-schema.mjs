// Schema check: runs the migration and seeds in an in-memory Postgres (PGlite) with a minimal
// stand-in for the Supabase environment (roles and auth.jwt()), then exercises the policies and
// triggers: location scoping, cost hiding, the ledger rules, separation of duties, append-only.
// Run from the repo root: npm run test:db
// It does not replace testing against a real Supabase project.
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
