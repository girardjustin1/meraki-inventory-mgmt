# Meraki Inventory: product requirements

Status: first-pass prototype, 14 November 2026. Everything described under "Built in this pass" exists in Storybook and the Next.js prototype. Nothing is connected to live services yet.

## 1. What this is

An inventory app for Meraki Spa's two locations (Lynnfield and Newburyport). Staff use it on a phone at the shelf and on a desktop in the office to count stock, reorder, and receive deliveries. Managers and the owner use it to see what is running low, what is going missing, and what to order, and they get a weekly and a monthly digest by email.

It replaces three Google Sheets workbooks: the inventory list, the order form, and the monthly backlog.

## 2. What the spreadsheets told us

The three workbooks were imported as they are. These findings come from Meraki's own 2026 data and shaped the requirements.

| Finding | Detail | What it means for the product |
| --- | --- | --- |
| The catalogue is large | 145 supplies in four areas (Nail Area, Supply Closet, Cleaning Closet, Wax Room), 1,583 polish colours across five lines (OPI, OPI dip, DND, Dazzle Dry, Chisel), 19 Gel-X tip sets | Polish needs its own swatch-based view. Counting has to be fast and shelf-ordered. |
| Orders take a long time to land | About 48 days on average from the count date to the receipt date for the main nail supply vendor | Par levels have to cover a long gap, or orders have to go out sooner after the count. This is the single biggest lever on stockouts. |
| Much of what is ordered is not logged as received | Of 338 order lines with a quantity, 209 have a receipt. At Lynnfield 119 lines are open, including all 15 lines of the July supply order | Either goods arrived and were not logged, or they did not arrive. The sheets cannot tell which. Receiving must be a required step with a named person. |
| Vendors short-ship | The main vendor filled 61% of the quantity on orders where receiving began; Dazzle Dry 41% | Fill rate per vendor belongs in the monthly digest. Repeat out-of-stock colours need a discontinue or replace decision. |
| Receipts do not always match orders | 8 lines where quantity received differs from ordered (one line: 20 ordered, 6 received). 7 polish lines where a different type arrived (Regular ordered, Gel received) | Receiving needs accept and reject quantities per line, and a way to record that a different type arrived. |
| Order sizes jump | 3 lines at 2× or more the item's usual quantity | Warn at the moment of ordering, not afterwards. |
| There is no cost data | No prices anywhere in the workbooks | Spend, stock value and shrinkage in dollars are not possible until invoices or a price list are loaded. The prototype uses sample costs and labels them. |
| There is no usage data | Only orders and occasional on-hand numbers | Forecasts start from order history (25 of 145 supplies have two or more cycles). They improve sharply once counts are logged in the app. |
| Quantities are often words | 32 items are tracked as "Halfway Full" or "Order at halfway" | Bulk items are counted by fill level (Empty, ¼, Half, ¾, Full), not forced into a number. |
| Par levels are incomplete | 31 supplies have no par level; 2 are paused | The app flags these as data to fix and still works without them. |
| The list has drifted | 2 products appear on two rows; 15 order lines do not match any catalogue item; several categories are mislabelled | A one-time clean-up, then the app prevents new duplicates. |

One caution on these numbers: a line with no receipt may simply never have been ticked on the sheet. The app treats it as "not confirmed", not as a loss.

## 3. Goals

1. Everyone can see what is on the shelf at each location, on a phone, in under ten seconds.
2. Every change to stock has a person, a time and a reason attached, and cannot be edited afterwards.
3. Managers are told what to order and when, with the reasoning shown.
4. Anything unusual is flagged with its evidence, so shrinkage is noticed in days, not months.
5. The owner gets one weekly and one monthly email that says what needs a decision.

Not goals for the first release: point-of-sale or retail sales, payroll, accounting, booking. Meevo stays the system for appointments; a later milestone reads service counts from it.

## 4. Who uses it

| Role | Does | Sees costs | Devices |
| --- | --- | --- | --- |
| Owner | Approves orders, reviews flags, reads digests, manages the team and settings. Sees both locations. | Yes | Phone, desktop |
| Manager | Schedules and approves counts, builds orders, reviews flags for their location. | Yes | Desktop, phone |
| Front desk | Receives deliveries, counts assigned shelves, requests items. | No | Phone, shared tablet |
| Technician | Logs what they use, counts assigned shelves, requests items. | No | Phone |

Separation of duties is enforced by the app and again in the database: the person who creates an order cannot approve or receive it, and the person who counts cannot approve their own count.

## 5. How the work flows

Meraki already runs a monthly cycle (from the "Directions" sheet). The app keeps it and tightens each step.

1. **Count** (management, due the 25th). Scheduled by shelf, counted blind on a phone: the counter does not see the expected number. A-class items are counted weekly, B monthly, C quarterly.
2. **Review**. A manager compares counted against expected, accepts or asks for a recount, then approves. Approval posts the adjustments and raises flags for large variances.
3. **Order** (first week of the month). The app proposes an order per vendor from days of cover, par levels and requests. The manager edits quantities; the owner approves.
4. **Receive** (front desk, when goods arrive). Per line: accept, reject, or record that a different type arrived. Partial receipts keep the order open.
5. **Flags and digest**. Rules run daily. High-severity flags email the owner and manager at once. The weekly digest lists what to order and what to check; the monthly digest covers vendors, variance and the forecast.

## 6. Requirements

### 6.1 Stock

- One list per location with search, status filters (Out, Low, In stock, Overstocked, No par) and filters by area, vendor and category.
- Each item shows on hand, par, reorder point, days of cover, shelf, vendor and when it was last counted and by whom.
- Polish is browsed by line and colour family as swatches, with regular and gel quantities. Gel-X tips are a shape, length and size grid.
- Item page: history of every movement, forecast with its reasoning, order history, flags, and settings.
- Adjustments use "Set to" or "Adjust by" with a required reason and a before and after preview. Changes of three or more units need a note.

### 6.2 Barcode scanning

- Camera scanning in the browser, no app store install: the standard `BarcodeDetector` interface with a ZXing WebAssembly fallback so it works in iPhone Safari.
- Four modes: Look up, Count, Use, Receive.
- Meraki prints its own QR labels for shelves and for products without a usable barcode. Scanning a shelf label opens that shelf's count.
- An unknown manufacturer barcode can be linked to a catalogue item once, then is recognised from then on. An item can hold several barcodes: OPI's small bottles carry a short 8-digit form of the 12-digit code, and refills differ from bottles.
- A UPC lookup service fills in name, brand and image for new products. In a live test of 16 verified barcodes from Meraki's catalogue, UPCitemdb's free tier recognised 11; Open Beauty Facts recognised none. The misses were professional refills, case packs and nail-supply-only brands, which is why Meraki's own labels matter. Recommendation: UPCitemdb free tier for the prototype, its paid tier for the onboarding month only.
- To verify early: camera access inside an iPhone home-screen web app, and read rates on small polish-bottle barcodes. If read rates are poor, the paid options are STRICH, Scandit or Dynamsoft.

### 6.3 Counting

- Sessions by area and shelf, assigned to a person with a due date. Pause and resume.
- Blind by default. Quantity stepper for counted items, fill-level picker for bulk items, "can't find it" and notes per line.
- Review screen with Unmatched, Matched and Uncounted tabs; variance in units, percent and value.

### 6.4 Ordering

- Reorder suggestions with the reason for each line and an editable quantity.
- A warning when a quantity is at least twice the item's usual order.
- One draft purchase order per vendor; owner approval before sending.
- Sending depends on the vendor (full detail in `docs/research/03-wholesale-and-product-data.md`):
  - **Every vendor**: a purchase order by email, or a printable pick list for in-store runs. This is the baseline and needs nothing from the vendor.
  - **Shopify-based vendors** (Dazzle Dry, FarmHouse Fresh and Starpil professional portals, and most nail-supply distributors): a link that opens a pre-filled cart. Whether the link keeps wholesale pricing after login is not confirmed and needs a test with Meraki's account.
  - **Amazon Business**: the only vendor with ordering APIs. Access is by application and Amazon's approval, which is not guaranteed for a single small buyer.
  - **No API, EDI or punch-out was found** for Costco Business Center, BJ's, OPI's distributors (CosmoProf, SalonCentric), DND, NuGenesis, Chisel or Aprés. Ordering "straight from the app" for these means the app prepares the order and a person places it.

### 6.5 Receiving

- Open orders list with age and progress.
- Per-line accept and reject quantities, an "All" shortcut, wrong-type control for polish, notes.
- Receiving more than was ordered is allowed and raises a flag.

### 6.6 Flags

Rules are simple and explainable. Each flag states what was observed, shows the numbers, and suggests a next step. A flag is a prompt to check, not a conclusion.

| Rule | Trigger (default, adjustable per location) | Works on today's data |
| --- | --- | --- |
| Receiving mismatch | Quantity received differs from ordered | Yes |
| Wrong type received | Regular ordered, gel received, and so on | Yes |
| Unusual order size | 2× the item's median order and at least 4 units more | Yes |
| Order not received | Open lines older than 21 days or twice the vendor lead time | Yes |
| Overstock | On hand above 1.5× par | Yes |
| Stockout risk | Days of cover shorter than vendor lead time | Yes |
| Vendor out of stock | Same colour unavailable in two or more cycles | Yes |
| Count variance | Off by 20% or more and at least 2 units | Needs counts in the app |
| Missed count | Scheduled count past its due date | Needs counts in the app |
| Unexplained adjustment | Write-off after hours, without a note, or marked lost | Needs the app's ledger |
| Usage out of line with services | Product used per service against a benchmark | Needs Meevo service counts |
| Data quality | Duplicates, missing par levels | Yes |

Review queue with Open, Reviewing and Resolved; assignment; notes; a required outcome and note to close. Resolving a high-severity flag asks for the reviewer's PIN.

### 6.7 Forecasting

- Usage rate per item from order history today, from the movement ledger once it exists.
- Reorder point = usage during lead time + safety stock. Safety stock uses demand variability when there are three or more observations and half of lead-time demand otherwise.
- Suggested quantity orders up to the larger of par or (review period + lead time) demand plus safety stock.
- Every forecast carries a confidence level (high: three or more cycles; medium: two; low: one or borrowed from the other location) and a sentence explaining how it was worked out.
- Seasonality is not modelled yet: one year of sparse data is not enough. It is added when there are 12 months of ledger data.

### 6.8 Digests

- Weekly (Monday 7:00 AM, owners and managers): low and out, what to order this week, open flags, orders not received.
- Monthly (the 1st, owner): vendor fill rate and lead time, count variance, stock value and spend once costs exist, forecast for the month ahead.
- Sent with Resend. The same content is viewable in the app.

### 6.9 Sign-in and PIN

- Sign-in with Google through Clerk, limited to invited staff.
- A four-digit PIN locks the app after a period of inactivity and on shared devices lets staff switch user quickly. The PIN is a convenience lock on top of the Google session, not a second factor.
- Five wrong attempts locks for 60 seconds.

### 6.10 Works everywhere

- Responsive from 360px to desktop. Sidebar on desktop; top bar and five bottom tabs on a phone (Home, Stock, Scan, Orders, More).
- Installable from Safari with "Add to Home Screen": full-screen, own icon.
- Online only in the first release. Offline counting is a later milestone.

## 7. Design system

Untitled UI React (MIT), vendored into `packages/ui`, themed to match merakispainc.com: Figtree for text, Instrument Serif italic as the accent, aqua `#65c5c3` primary buttons with ink `#17262e` text, deep teal `#245b59` for links and controls, cool slate neutrals, mist `#f1f7f8` page background. Every screen has Storybook stories at desktop and phone widths.

## 8. Architecture

- **Next.js on Vercel** for the app, API routes and scheduled jobs.
- **Supabase** (Postgres) with row-level security. Stock is an append-only ledger: on-hand, usage, forecasts and flags are derived from it. Clerk is connected as a third-party auth provider so the database enforces roles.
- **Clerk** for Google sign-in and sessions.
- **Resend** for digests and alerts.
- The forecast, flag and digest engines are plain TypeScript functions with no I/O. The same code runs in Storybook, in the app and in the cron jobs.

See `docs/architecture.md` and `supabase/migrations/0001_init.sql`.

## 9. Built in this pass

- **Importer** for the three workbooks (`tools/import`), producing the seed catalogue and the 2026 orders. Staff names are not written to the repo.
- **Engines** for forecasting, flags and digests, running on the imported data. 26 automated tests.
- **Design system** themed to the website, and 21 screens in Storybook, each at desktop and phone widths: home, stock (supplies, polish, tips), item detail, scan, counts, count session, count review, orders, order detail, new order, receive, flags, flag detail, activity, reports, digests, team, settings, sign-in, PIN lock, more.
- **Barcode scanner** component with a real camera path (native detector, ZXing fallback) and a demo mode. The fallback was exercised in desktop Chrome with a synthetic barcode video. It has not been tested on a physical iPhone.
- **Next.js prototype** rendering every screen on 27 routes. Production build passes.
- **Backend, written and not connected**: Supabase schema (21 tables, 63 row-level-security policies), Clerk request guard, PIN lock API, Resend digest and flag-alert emails, cron routes, home-screen manifest and icons. The schema was run in an in-memory Postgres with 140 checks on its rules (`npm run test:db`). Nothing has run against real Supabase, Clerk, Resend or Vercel.
- **Product data** for 55 products gathered from public manufacturer and distributor pages: 52 with a photo, 41 with a check-digit-validated UPC, each with its source page. 44 catalogue supplies now show a photo. Images are hot-linked for the prototype; before production they should be approved by a person and copied to Meraki's own storage, or supplied by the vendor.
- **Research**: UX patterns (Mobbin, 79 reference screens), inventory controls, vendor and product-data options (`docs/research`).

Known limits of the prototype:

- Screens keep their state locally. Saving a count, receipt or adjustment updates that screen only, and choosing a location does not carry to the next page.
- Polish swatch colours are approximations from the colour family, not the real shades.
- The scanner's fallback decoder is downloaded from a public CDN at run time. For production it should be hosted with the app.
- Vendor lead times are assumptions. The measured figure is the whole cycle, about 48 days.
- The flag thresholds shown in Settings are not yet read from the database.

## 10. Milestones after this pass

| Milestone | Contents | Depends on |
| --- | --- | --- |
| 1. Review | Walk the screens with the owner; settle the open questions below | Nothing |
| 2. Live data | Create the Supabase, Clerk, Resend and Vercel projects; load the catalogue; real sign-in and PIN | Account access, sending domain |
| 3. Daily use at Lynnfield | Counts, receiving, adjustments and scanning on real data; print shelf labels; weekly digest | Milestone 2; a cleaned supply list |
| 4. Ordering | Reorder builder and approvals live; emailed purchase orders; costs from invoices | Vendor contacts and price lists |
| 5. Newburyport | Second location with its own catalogue and counts; transfers between locations | Newburyport inventory list |
| 6. Deeper insight | Usage per service from Meevo; seasonality; vendor API ordering where available; offline counting | Meevo API access; 6 to 12 months of ledger data |

## 11. Open questions

1. **Costs.** Can Meraki supply invoices or a price list? Without them there is no spend, stock value or dollar shrinkage.
2. **Newburyport.** The workbook holds an order form but no inventory list. Is its catalogue the same as Lynnfield's?
3. **The 119 open order lines.** Did those goods arrive? A one-time reconciliation would reset the baseline.
4. **Colour groups.** OPI codes use prefixes such as BB, GB, PG, ID, MT, ME, CT, MJ, NC, TB, EM and Z. What does each stand for?
5. **Who approves orders**, and above what amount?
6. **Usage logging.** Should technicians log product use as they go, or is consumption inferred from counts? Logging is more precise and more work.
7. **Devices.** Personal phones, a shared tablet at the desk, or both? This decides how prominent the PIN and user switching are.
8. **"Nail Supply Store" and "Warehouse".** Which distributor is the nail supply store, and is the warehouse a Meraki stockroom?
9. **Who receives the digests** and flag alerts at each location?
10. **Repository visibility.** The GitHub repository is public. It should be private before any client data or keys are added.
