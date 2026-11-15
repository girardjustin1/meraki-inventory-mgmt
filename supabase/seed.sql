-- Reference data only: the two salon locations and the vendors.
-- No staff, no stock, no orders, no client data. Safe to run more than once.
--
-- Apply after migrations/0001_init.sql:
--   CLI:        supabase db push --include-seed        (or: psql "$DATABASE_URL" -f supabase/seed.sql)
--   Dashboard:  SQL Editor -> paste -> Run
--
-- The catalogue, stock levels and the imported 2026 orders are loaded separately by
-- tools/seed/build-seed-sql.ts, which writes supabase/seed-catalog.sql.

insert into public.locations (id, name, short_name, timezone) values
  ('lynnfield',   'Meraki Lynnfield',   'Lynnfield',   'America/New_York'),
  ('newburyport', 'Meraki Newburyport', 'Newburyport', 'America/New_York')
on conflict (id) do nothing;

-- Lead times are assumptions (lead_time_is_estimate = true) until receipts logged in the
-- app give real numbers.
insert into public.vendors (id, name, channel, lead_time_days, lead_time_is_estimate, note) values
  ('nail-supply-store', 'Nail Supply Store', 'in_store', 14, true, 'Local distributor. Most back-bar supplies and OPI, DND and Chisel colours.'),
  ('costco-bjs',        'Costco / BJ''s',    'in_store',  3, true, 'Paper goods and cleaning supplies. Bought in person.'),
  ('amazon',            'Amazon',            'api',       3, true, 'Amazon Business can accept orders by API once the account is approved.'),
  ('dazzle-dry',        'Dazzle Dry',        'portal',    7, true, 'Ordered through the Dazzle Dry professional portal.'),
  ('farmhouse-fresh',   'FarmHouse Fresh',   'portal',   10, true, 'Wholesale portal for spa treatments.'),
  ('warehouse',         'Meraki warehouse',  'internal',  2, true, 'Internal transfer from shared back stock.'),
  ('other',             'Other',             'email_po',  7, true, null)
on conflict (id) do nothing;
