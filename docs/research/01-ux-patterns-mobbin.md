# UX patterns for the Meraki inventory app (Mobbin research)

Research date: 2026-11-14. Source: Mobbin screen and flow search (web and iOS).

## How to read this

- Each section covers one screen type. It lists reference screens, what the pattern does well, and a concrete "Apply to Meraki" recommendation.
- Sections 1 to 3 were searched before this pass. Their screen descriptions come from the notes of that earlier search. Sections 4 to 17 were searched in this pass and are described from the returned screenshots.
- Mobbin previews are low resolution. Labels are quoted as read from the image; small text may be slightly off. Open the link to confirm before copying a detail exactly.
- Flow results are cited with the flow link (Mobbin returns one link per flow, not per step).
- Everything under "Apply to Meraki" is a recommendation, not something a reference app does.

Context that shapes the recommendations: two locations (Lynnfield, Newburyport); shared iPhones used as a home-screen web app plus desktop; three roles in today's process (management counts, executives order, front desk receives); about 1,500 polish colours plus back-bar consumables; shelf codes like "1A" inside areas (Nail Area, Supply Closet, Cleaning Closet, Wax Room); no cost data and no usage data yet; some quantities are text such as "Halfway Full".

---

## 1. Inventory list and dashboard (web) — previously searched

References
- [Fresha — "Stock on hand" report: brand, primary SKU, product, location, stock on hand, total cost, avg cost, retail price, retail value, % margin, low stock level; date stepper, filters, customise](https://mobbin.com/screens/17fb76f9-8b9d-4365-a4e3-dae35775780a)
- [Deel — Assets: total inventory card, stacked status bar by location state, filter chips, quick view per row](https://mobbin.com/screens/966dd7a5-28c6-4144-8a9d-a32e7e1f24fd)
- [Square — Item library: thumbnail rows, availability pill (Available / Sold out / Mixed), column picker, quick create](https://mobbin.com/screens/36ae5076-f9b4-488d-a3b9-ace1d89c8aba)
- [Shopify — Alerts popover](https://mobbin.com/screens/ebe2401d-db79-4367-92da-cce968a474b7)

What it does well
- Fresha puts the low stock level in the same row as stock on hand, so the reader compares the two numbers without opening anything. A totals row sits above the data.
- Deel summarises the whole inventory in one stacked bar before the table. The bar segments double as a legend for the status filter.
- Square reduces state to one pill per row. "Mixed" handles items whose variants are in different states, which is the polish-line case.

Apply to Meraki
- Desktop: a summary strip (items tracked, below par, out, flagged for review) with one stacked bar per location (OK / low / out). Below it a table: item, line or category, area and shelf, on hand, par, status pill, last counted (date and person).
- Leave cost columns out until cost data exists. Keep a column picker so they can be added later without a redesign.
- Group polish by line (OPI regular, OPI gel, OPI dip, DND, Dazzle Dry, Chisel, Aprés Gel-X) with a "Mixed" pill at the group level. Expand to see colours.
- Mobile: no table. One card per item with name, shelf code, on-hand value and status pill. Filter chips across the top (Low, Out, by area).

## 2. Mobile stock count row with stepper (iOS) — previously searched

References
- [Shopify — Inventory sheet: variant rows with minus, value, plus steppers; search; Save](https://mobbin.com/screens/78129b1d-65a8-4e90-907f-b112f819f4f6)
- [Vivino — Cellar: stepper plus history](https://mobbin.com/screens/a1a2ee4a-4802-46c3-a747-4fc625eb20d7)
- [Walmart — List rows with steppers and "Replace"](https://mobbin.com/screens/b8be9edd-7023-43ab-98ea-0e45ab7e461f)
- [alias — Inventory grouped by status and location](https://mobbin.com/screens/98106f05-accf-462b-a309-4e6f65ac1aeb)

What it does well
- The stepper keeps one-handed counting possible. Tapping the number opens a keypad for larger values.
- Shopify batches edits behind one Save, so a mistap is not written immediately.
- alias groups rows by where the thing is, which matches how a person walks a shelf.

Apply to Meraki
- Count rows grouped by area then shelf code (Supply Closet, then 1A, 1B, 2A). Each row: name, last count in grey only when the count is not blind, a minus / value / plus stepper.
- For containers, add a fill-level control beside the stepper: Full, 3/4, 1/2, 1/4, Empty. This replaces free text like "Halfway Full".
- Minimum 44 pt touch targets. Sticky footer with progress ("42 of 118 counted") and Save.

## 3. Purchase order creation (web) — previously searched

References
- [Shopify — Create purchase order: supplier to destination, line items with supplier SKU, quantity, cost; cost summary; note to supplier](https://mobbin.com/screens/5528f405-0e95-4df2-90ff-6457bbf9ce15)
- [Fresha — Stock order: product rows showing "85 in stock", order quantity, unit cost; supplier and deliver-to side panel; expected by](https://mobbin.com/screens/7799d93a-bb75-44bc-822b-52d1c888bf41)
- [Xero — Purchase order: approve button, Draft status, history and notes](https://mobbin.com/screens/766554ee-3bc1-4a98-9939-bbf3e517dd7f)

Also seen in this pass
- [Shopify — "Creating a purchase order" flow: empty state, supplier and destination pickers in the header, line items, reference number, note to supplier, tags, then a Draft order with "Mark as ordered" and a staff-only comment timeline](https://mobbin.com/flows/bdbc79e6-cbf8-45a8-b3a6-86ae24bf1827?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

What it does well
- Shopify reads as a sentence at the top: supplier, arrow, destination. Both are required before lines can be added.
- Fresha shows current stock inside the order line, so the person ordering does not need a second tab.
- Xero and Shopify both separate "draft" from "ordered" with an explicit button, and both keep a history on the order itself.

Apply to Meraki
- One order per vendor per location. Header: vendor (local nail supply, Costco/BJs, Amazon, Dazzle Dry, Farmhouse Fresh, other), arrow, location.
- Lines pre-filled from the restock list that management prepares by the 25th. Each line: item, on hand, par, suggested quantity (editable), note.
- States: Draft (management's restock list), Approved, Ordered (executive marks it placed, with order date and optional confirmation number), Partially received, Received, Closed.
- Unit cost is an optional field on the line. Capturing it at order time is the cheapest way to start building cost data.
- For Costco/BJs and Amazon runs there is no supplier document, so allow a photo of the receipt or an order link on the order.

---

## 4. Stocktake / inventory count flow

References
- [Fresha (web) — "Adding a stocktake" flow, 10 screens: intro, count screen, review, completed summary](https://mobbin.com/flows/fef047c4-690f-473a-8f7f-e4b06044e36c?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Shopify (iOS) — "Inventory" flow: list of variants with a tappable quantity pill per row, filter chips All / Incoming / Not Fulfillable, scan icon top right](https://mobbin.com/flows/abc432e3-ee29-4b98-b03a-bb3eee40c098?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) (an older version of the same list, with the location named above the rows, appears in the [Shopify "Inventory scanner" flow](https://mobbin.com/flows/89f70bf3-677a-4bdc-9490-97d1a83468cc?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp); flow previews do not label which step belongs to which flow, so treat the split between these two Shopify flows as approximate)
- [Wix (web) — Inventory list with an inline quantity field per row, or an "In stock" dropdown for untracked items](https://mobbin.com/screens/25d37e90-93d4-415c-8969-ef0f674f9a19?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

What is on screen (Fresha)
- Intro page sells four behaviours: count with a barcode scanner, pause and resume later, inventory updates only on completion, notes on the stocktake.
- Count screen: stocktake name and description, "Started just now", a "Quick-scan counting" toggle, a search field that also accepts scans, chips All / Uncounted / Counted with counts, and a table of product, Expected and a Counted input. A right panel lists "Your last counted products". Top right: Pause and Review stocktake.
- Review screen: chips All / Uncounted / Unmatched / Matched / Excluded. The Unmatched view explains itself in one line ("The amount you counted was more or less than expected..."). Columns: Expected, Counted (in red with a down arrow), Difference, Cost. Buttons: Options, Resume, Complete stocktake.
- Completed screen: Started on, Completed on, Counted by, Reviewed by, note, and a product summary with a totals row and a "Counted by" column per line.

What it does well
- Counting and committing are separate steps. Nothing changes until "Complete stocktake".
- Uncounted and Unmatched are one tap away, so the reviewer goes straight to the problems.
- "Counted by" and "Reviewed by" are stored as two names. That is the hook for a second-person check.
- Pause and resume suits a salon where a count is interrupted by clients.

What to change
- Fresha shows Expected on the count screen. That anchors the counter. Meraki should hide it during counting (blind count) and reveal it only at review.

Apply to Meraki
- Start a count by choosing location, then scope: full location, one area, or one shelf. The monthly count due by the 25th is a scheduled full count; cycle counts are smaller scopes.
- Count screen (phone first): rows in shelf order, stepper and fill-level control, chips All / Uncounted / Counted, progress in the footer, Pause. No expected quantity shown.
- Review screen (manager role): chips Uncounted / Unmatched / Matched. Columns Expected, Counted, Difference. Each unmatched row needs one of: Recount, or Accept with a reason code. Lines over the variance threshold need a second person.
- Completed screen: counted by, reviewed by, started, completed, totals of unit variance, link to the adjustments it created.
- Several people can count different areas of the same stocktake at once. Show who is on which area.

## 5. Receiving an order, including partial receipts

References
- [Shopify (web) — "Receiving inventory" flow, 4 screens: order page with progress, Receive items page, received state](https://mobbin.com/flows/7fb1788e-8f30-42a7-aacb-be61fffa681b?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Fresha (web) — "Receiving a stock order" flow, 7 screens: order drawer, Receive order page, list with Partial status](https://mobbin.com/flows/1a90cfcb-b4ce-47d5-af30-1be47b9fe9cc?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Fresha (web) — Receive order: Ordered, Received input, Unit cost, Total cost per line; "Auto-fill quantities"; "Add more products"; supplier, deliver-to, expected-by and fees in a side panel](https://mobbin.com/screens/a105efa0-23b4-45ec-88ce-13f550f7d8a7?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

What is on screen
- Shopify order page: status pill "Ordered", supplier and destination side by side, one overall progress bar ("Total received: 0 of 3"), a small progress bar per line ("0 of 1"), and a "Receive inventory" button.
- Shopify Receive items page: per line, an Accept field and a Reject field, each with an "All" shortcut. Links for "Accept all unreceived" and "Reject all unreceived". The bar fills green for accepted and red-striped for rejected. Saving shows "Inventory received" and the order status changes to Received.
- Fresha: the order opens in a drawer with a status pill, an Actions button and two tabs (details, Activity). After a short receipt, the list shows a "Partial" pill.

What it does well
- Accept and Reject are separate numbers. A damaged or wrong item is recorded, not silently dropped.
- Per-line progress makes a partial receipt obvious and leaves the order open for the remainder.
- "Add more products" (Fresha) handles the box that contains something that was not on the order.

Apply to Meraki
- Front desk opens "Expected deliveries" for their location and taps the order. Phone layout: one card per line with ordered quantity, a Received stepper, a "Not accepted" stepper with reason (damaged, wrong item, short), and an "All" shortcut.
- Every receipt stores date, quantity, receiver and, for orders above a set size, a second person's PIN as witness.
- Partial receipt keeps the order in "Partially received" with the outstanding lines listed. A later delivery adds a second receipt record to the same order.
- "Receive without an order" for Costco/BJs and Amazon runs: pick vendor, add items, attach receipt photo.
- Optional blind receiving: hide the ordered quantity until the receiver has entered a number. Turn on per vendor.
- The person who marked the order as placed cannot be the receiver on it (see separation of duties in the best-practices file).

## 6. Stock adjustment with reason codes

References
- [Shopify (web) — Product inventory card: "Set to" quantity, state "Damaged", and an "Add reason" menu with Correction, Count, Received, Return restock, Damaged, Theft or loss, Promotion or donation; the row previews "0 → 10" and "100 → 110"](https://mobbin.com/screens/9628dd30-7311-4334-b9d2-6b93bd89eecc?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Shopify (web) — "Updating inventory" flow: inline popover with "Adjust by", "(Original quantity: 0)", Reason "Correction (default)"; a second popover "Add Damaged"; Discard / Save bar; "Quantities updated" toast](https://mobbin.com/flows/6f31b520-0460-4338-962d-0805d862e1c5?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Deel (web) — Archive asset modal: required Reason dropdown ("Broken by user"), optional notes, one confirm button](https://mobbin.com/screens/bff44042-5f07-4ef1-8bdc-e520cf1a4dae?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Stripe (web) — Credit balance adjustment: starting balance and new balance side by side, adjustment type, amount, internal note](https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Square (web) — Settings navigation with a dedicated "Adjustment reasons" page next to Inventory settings](https://mobbin.com/flows/934645c4-0752-4808-98e6-147a9afdc50e?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

What it does well
- Shopify and Stripe both show before and after before the change is saved. The user sees the result of the adjustment, not just the delta.
- Shopify offers "Adjust by" and "Set to". Counting uses "set to"; breakage uses "adjust by".
- The reason is a short fixed list with a default. Deel makes it required and keeps notes optional.
- Square treats the reason list as configuration, so the business can add its own.

Apply to Meraki
- One bottom sheet on phone, one modal on desktop: item and location at the top; a toggle Add / Remove / Set to; quantity or fill level; a required reason; optional note and photo; a line that reads "On hand 6 → 4".
- Starting reason list: Used in service, Damaged or spilled, Expired or dried out, Lost, Suspected theft, Count correction, Given to client or promo, Returned to vendor, Moved to tester, Found. Editable by owners in settings.
- No default reason. A default becomes the answer to everything.
- "Lost" and "Suspected theft", and any removal above a threshold, require a note and create a flag in the review queue.
- Adjustments are never edited or deleted. A mistake is fixed with a reversing adjustment.

## 7. Activity / audit log

References
- [7shifts (web) — Activity Log: month stepper, "All Audit Types" and "All Employees" filters, rows of avatar, name, coloured verb pill (Added / Deleted / Declined), object, timestamp, "Show Details"](https://mobbin.com/screens/8b845427-b403-4eb7-87c9-aa771a00d378?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Deputy (web) — Timesheet history: grouped by day; each entry "name + action" with time; changed fields expand into a before → after row (Cost 90 → 0)](https://mobbin.com/screens/fd1a02ca-3bc4-47eb-bd05-a63926f531a3?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Xero (web) — "History and notes" table on a record: Date, User, Action, Detail ("Total changed from 120.00 to 292.00"), with "Add note"](https://mobbin.com/screens/002c8c1f-505c-4bbf-a2de-54ac2578e2d7?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Zendesk (web) — History: vertical timeline with a left rail to filter by user and by event type](https://mobbin.com/screens/22634310-09c4-4031-955f-b19edae488a0?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

Also returned: [Basecamp — "History of changes" as a simple dotted timeline beside the item](https://mobbin.com/screens/07446502-ce66-4714-a13d-fd4d6b9707a9?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Better Stack — incident timeline mixing system events and human comments](https://mobbin.com/screens/f155b080-db3d-49b2-ba36-f47a0570db1f?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp).

What it does well
- 7shifts leads with the person and a coloured verb. The log can be skimmed for "Deleted" without reading.
- Deputy and Xero state the old value and the new value. That is the part an owner needs when something looks wrong.
- Zendesk's two filters (who, what kind) are the two questions asked of an audit log.
- Xero places the history on the record itself, and lets a human add a note to it.

Apply to Meraki
- Two views of the same data. Global log (owners and managers): filters for location, person, action type, date range; rows of avatar, name, verb pill, item, "6 → 4", reason, time. Per-item history: the same rows on the item detail page.
- Verb pills: Counted, Received, Adjusted, Transferred, Ordered, Approved, Flagged, Edited par.
- Group by day. Expand a row for note, photo, device and the related count or order.
- Colour removals with reasons Lost or Suspected theft differently from routine use.
- Mobile: single-column list with the same filters behind a filter button.
- Read-only. Notes can be added; entries cannot be changed.

## 8. Low stock and reorder suggestions

References
- [Fresha (web) — Stock on hand report with a "Low stock level" column beside "Stock on hand"](https://mobbin.com/screens/17fb76f9-8b9d-4365-a4e3-dae35775780a?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Shopify (web) — Inventory table: Unavailable, Committed, Available, On hand, Incoming](https://mobbin.com/screens/d9deb551-88bf-4c93-91b3-43ef6659ccef?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Square (web) — Item library with a "Stock quantity" filter panel (operator such as "Greater than" plus an amount)](https://mobbin.com/screens/cf4e94c4-e74e-4c25-8bba-d47898ccd2ff?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Instacart (web) — "Buy it again": chips All items / Your aisles / Past orders / Saved, one-tap Add, and a "Likely out of stock" tag](https://mobbin.com/screens/f4b759b4-52a6-4331-9180-e21fb96becdf?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Programa (web) — Item panel with a Lead Time dropdown (In Stock, 1-2 weeks, 2-4 weeks, and so on) and a supplier field](https://mobbin.com/screens/e7439217-0d84-4334-8ea2-fc372db2a967?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

What it does well
- Shopify's "Incoming" column stops double ordering: low stock that is already on order looks different from low stock that is not.
- Instacart turns a reorder into one tap per item from a list built from history.
- Programa stores lead time as a coarse bucket, which is realistic when nobody knows it to the day.

What was not found
- No reference shows a true reorder-suggestion list (suggested quantity, days of cover, grouped by vendor). The recommendation below is assembled from the pieces above.

Apply to Meraki
- "Restock list" screen, grouped by vendor, one section each. Row: item, on hand, par, on order, suggested quantity (par minus on hand minus on order, rounded up to pack size), a checkbox, and an editable quantity.
- Footer per vendor: "Create order for Dazzle Dry (7 items)". This is the handoff from management's count to the executive's order.
- Status chips: Out, Below reorder point, Below par, On order.
- Until usage data exists, show no "days of cover". Add it once two or three counts give a usage rate. Label it as an estimate.
- Per item settings: par, reorder point, pack size, preferred vendor, lead time bucket.

## 9. Product (item) detail with stock history

References
- [Shopify (web) — Product page inventory card: per-location row of Unavailable, Committed, Available, On hand; "View adjustment history" link; SKU and barcode chips](https://mobbin.com/screens/baf38bbf-6371-4ba6-a32c-d35ad5f584c2?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Shopify (web) — Same card in edit state with quantities editable in place and an "Unsaved changes" bar](https://mobbin.com/screens/c4b861d5-b0db-49eb-bf7e-3d777a3c3dce?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Zoho CRM (web) — Product record: Overview / Timeline toggle, key fields at the top (vendor, quantity ordered, quantity in stock), a "Related List" rail](https://mobbin.com/screens/ba2433a6-6709-42d8-bb91-2def43b01982?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Uniswap (web) — Chart with a solid line up to a "Now" marker and a dashed projection after it, plus the caption "Amounts after now are projected and depend on future demand."](https://mobbin.com/screens/6ef0731b-fc66-4ec5-9b8f-0643734b2444?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

What it does well
- Shopify shows one row per location inside the product, so two sites compare at a glance.
- Zoho's Overview / Timeline toggle keeps facts and history apart without leaving the page.
- Uniswap's solid-then-dashed line with a "Now" marker is the clearest way seen to separate recorded history from forecast.

What was not found
- No inventory product page with a stock-level chart. The chart recommendation borrows from Uniswap, a finance product.

Apply to Meraki
- Header: name, line, colour swatch or photo, status (Active, Discontinued), barcode.
- Stock card: one row per location with on hand, par, on order, shelf code, last counted.
- Chart: on-hand over time as a step line (stock moves in steps, not slopes), a horizontal par line and reorder-point line, markers for receipts and counts, and a dashed projection to the estimated run-out date once usage data exists.
- Tabs: Overview, History (section 7 rows for this item), Orders.
- Actions: Adjust, Transfer, Add to restock list.
- Mobile: stacked cards in the same order; actions in a sticky bottom bar.

## 10. Barcode scanner (iOS)

References
- [Shopify (iOS) — Inventory scanner: bracketed viewfinder on the top half; bottom sheet with "Last scanned item", "Scan barcode to adjust inventory" and a "Review scans" button](https://mobbin.com/screens/7a1afa26-153f-41da-9459-fdd306f93a21?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Shopify (iOS) — "Scanning a product" flow: after a scan the sheet shows thumbnail, name, variant, "Original: 100 (+1)", an editable quantity pill, Remove, and "Review 1 scan"; an unknown code shows "Barcode not found" and offers "Save barcode to this product?"](https://mobbin.com/flows/32f9bd70-e1b2-471b-b273-126e453b50a4?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Shopify (iOS) — "Inventory scanner" flow, 2 screens](https://mobbin.com/flows/89f70bf3-677a-4bdc-9490-97d1a83468cc?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Bevel (iOS) — Multi-scan: viewfinder, a tray of scanned thumbnails with a remove badge, Continue, and "Single scan" / "Manual" buttons](https://mobbin.com/screens/5e98cbdb-0e93-4d12-ba0f-0128b51c3f52?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [alias (iOS) — Barcode / Image toggle, instruction line, torch, and a results sheet with an empty-state sentence](https://mobbin.com/screens/02e74760-1f5b-4a99-9f79-7f65699b02b3?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

Also returned: [MacroFactor — Barcode / Label toggle with keyboard and torch buttons](https://mobbin.com/screens/82a2917c-ff5a-4216-aaed-f1180af145d1?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [CVS Health — "Place barcode in brackets"](https://mobbin.com/screens/6a97348c-46ce-4d27-86bc-214ba5c035a2?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp).

What it does well
- Shopify keeps the camera live and puts the result in a sheet below it. The user scans the next item without dismissing anything.
- Each scan adds one, and the count is editable in the sheet. "Original: 100 (+1)" shows what will change.
- Scans collect into a batch that is reviewed once. Nothing is written per scan.
- An unknown barcode becomes a chance to attach it to an existing product.
- Bevel and MacroFactor always offer manual entry and a torch.

Apply to Meraki
- Scan is a mode inside Count, Receive and Transfer, and a shortcut tab on its own.
- Layout: camera on the top half, bottom sheet with the last scanned item, quantity stepper, fill-level control and "Review N scans".
- Unknown code: "Not found. Link to an existing item or create new." Linking a barcode is a manager permission.
- Always-visible "Type instead" and torch buttons. Supply closets are dark.
- Not every item has a usable barcode (decanted product, loose Gel-X tip sizes). Print shelf labels with the shelf code so a scan can open "everything on 2B".
- Build risk to check early: camera scanning in an iPhone home-screen web app. Test on the salon's actual phones before committing the count flow to it. Search-by-name must work as a complete fallback.

## 11. Passcode / PIN lock (iOS)

References
- [Starling (iOS) — "Enter your 6-digit passcode": brand at top, six boxes, "Forgot passcode", custom keypad with a Face ID key bottom left and delete bottom right](https://mobbin.com/screens/419cd61e-163c-4b82-9f44-e0b69e3944e6?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Revolut (iOS) — "Enter passcode": six dots, large borderless keypad, "Forgot your passcode?" at the bottom](https://mobbin.com/screens/081162b9-955f-4584-a006-048e557aa61e?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Crypto.com (iOS) — Passcode requested to confirm a single sensitive action, with the action named in the title bar and a Cancel button](https://mobbin.com/screens/299ac844-0702-48a7-8b6f-7c375cfa4297?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Afterpay (iOS) — "Set up a PIN code": four boxes, the active one outlined, system number pad](https://mobbin.com/screens/016c10b1-7379-4652-9623-e99e01f0f4c2?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

Also returned: [X — "Confirm your PIN" second-entry step](https://mobbin.com/screens/207325fd-b54b-4ae2-8909-074eca4d7ce3?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [One — "Create a passcode" with the last digit briefly visible](https://mobbin.com/screens/f67bf764-4c9f-4b0a-a064-e5caf95c6b3a?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp).

What it does well
- A custom keypad filling the lower half is reachable with one thumb and auto-submits on the last digit. No Continue button.
- Dots or boxes show progress without showing digits.
- Crypto.com reuses the same screen as a step-up check for one action, and says which action in the title.

Apply to Meraki
- The phones are shared, so the PIN identifies the person as well as unlocking the app. Step one: "Who's counting?" as a grid of staff names or avatars for the current location. Step two: that person's PIN.
- Four digits for staff, auto-submit, shake and clear on error, lockout after a set number of misses with a manager reset. Recommendation: six digits for owner accounts.
- Re-lock after a short idle period and on app background. A visible "Switch user" in the header.
- Step-up PIN (Crypto.com pattern) for: adjustments with Lost or Suspected theft, approving a count, receiving witness, editing par levels.
- Set-up flow: enter, then confirm (X and Afterpay pattern).
- No "Forgot passcode" self-service. A manager resets it, and the reset is logged.

## 12. Analytics / reports dashboard

References
- [Arcade (web) — Insights: five KPI tiles, each with a value and a change chip; hovering explains the number in a sentence ("70% of players clicked on a CTA (352 of 500). A decrease of 5%... compared to the previous period of the same length."); the chart below is titled with a finding, not a metric name](https://mobbin.com/screens/7bc9c360-fe3b-405c-9ee7-bdbfbdd0cbcb?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [incident.io (web) — Insights tab: a section title with one line on what to look for, comparison chips ("All incidents: No change", "Minor incidents: -50%"), a stacked bar by severity, and a tooltip comparing two date ranges](https://mobbin.com/screens/8dce681f-436f-4270-afe8-4984d08b59f3?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Featurebase (web) — Stat tiles that act as tabs over one area chart; range menu (Today, Yesterday, Last 7 days, Last 30 days, Last 12 months); "Top" lists with inline bars](https://mobbin.com/screens/c2c26f4e-bb5f-4900-bea6-b435f3826979?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Searchable (web) — Trend line above a colour-scaled table (rows by brand, columns by position)](https://mobbin.com/screens/f6a0bc31-f978-4c97-86b7-827682662c9d?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

Also returned: [Reddit — Trends: big number with a change chip "from previous month" over a line chart](https://mobbin.com/screens/b6e506f0-d945-4290-8f0c-6ea383e1463b?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp).

What it does well
- Arcade writes the takeaway as the chart title and explains each KPI in plain words with the comparison period stated.
- incident.io compares against the previous equal-length period by default and puts the change in a chip.
- Featurebase uses one chart and lets the tiles switch its metric. Fewer charts, less scrolling.
- Searchable's colour-scaled table is a compact way to compare many rows across a few columns.

Apply to Meraki
- Top: location switch (Lynnfield, Newburyport, Both) and period (This week, This month, Last month, Custom).
- KPI tiles with change versus previous period: items below par, stockouts, count variance (units), adjustments by Lost or Suspected theft, orders awaiting receipt, count completion.
- Insight cards written as sentences, each linking to the evidence: "Gel top coat in Lynnfield is being used about twice as fast as in Newburyport." "Three items were adjusted as Lost more than once this month."
- One main chart switched by tile. Stacked bars for adjustments by reason per week. A colour-scaled table of variance by category and location.
- Forecast shown as a dashed continuation (section 9) with the estimate labelled as such.
- These same blocks are the content of the weekly and monthly digest emails, so design the cards once.
- Mobile: tiles in a two-column grid, insight cards as a vertical list, charts full width.
- Until cost data exists, report in units and counts of events, not dollars.

## 13. Anomaly / flagged-item review queue

References
- [Deel (web) — "Action required" with a count badge in the side nav; table rows with a status pill ("Pending your approval") and approve / deny icons per row; bulk "Approve all your pending" and "Deny all your pending"](https://mobbin.com/screens/b6d82ee0-8694-4f55-a1d5-9f0964c8b13c?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Reddit (web) — Mod Queue: tabs Needs Review / Reported / Removed / Edited / Unmoderated; each card carries a reason tag ("This is spam") and inline actions; a toast confirms "1 action successful"](https://mobbin.com/screens/1caf9bf6-61a5-4cc2-b63f-705d756973f5?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Navan (web) — Transactions with tabs All / Flagged (count) / Info requested / ...; one line under the tab says what "Flagged" means](https://mobbin.com/screens/06edd93a-1f54-496f-8632-20a56c50dba1?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Xero (web) — Duplicate bill review: suspected duplicates grouped into expandable rows per contact ("3 Bills"), a "Keep all" action per group, and a note when a group was reviewed before](https://mobbin.com/screens/eaa61031-530a-4257-8597-19988a07959f?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

Also returned: [Stripe — Radar manual reviews: counts sent to review and in review, with an outcomes table](https://mobbin.com/screens/d4df0ce4-30b8-4770-bfb6-eb8b553bb2e9?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [QuickBooks — Pending / Posted / Excluded segmented control with counts](https://mobbin.com/screens/8fd16d88-dd92-4c23-a3d5-bc5cebd032ca?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp).

What it does well
- The queue has a count badge in navigation. It is a to-do list, not a report.
- Reddit shows why each item is in the queue, on the item.
- Navan's "Info requested" is a third outcome between approve and reject.
- Xero groups related items and remembers earlier decisions.
- Stripe tracks review outcomes over time, which shows whether the flags are useful.

Apply to Meraki
- "Needs review" queue for owners, with a badge. Tabs: Needs review, Info requested, Resolved.
- Each card: what was flagged, why (rule in plain words: "Count 9 below expected", "Adjusted as Lost twice in 30 days", "Received less than ordered", "Adjustment made outside opening hours"), who, when, location, and a link to the item history.
- Actions: Mark explained (with note), Ask for info (assigns to a person, moves to Info requested), Recount requested, Escalate.
- Group flags for the same item or the same person into one expandable row.
- Neutral wording. The queue lists events to explain, not accusations. Staff do not see flags raised about them.
- No bulk "resolve all". Each flag needs a human decision and a note.
- Resolved flags stay searchable and feed the monthly digest (flags raised, explained, unexplained).

## 14. Team members, roles and permissions

References
- [Lyssna (web) — Team members: invite by email with a role picker; the role menu describes each role in one sentence (Admin: full access including team and billing; Editor; Viewer); separate Invited and Collaborators lists; Resend invitation](https://mobbin.com/screens/249efdbd-e4f4-4fc7-a442-97f80c2c9a68?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Bonsai (web) — Team table: name, email, role pill (Owner / Partner / Collaborator), scope ("All Projects" or "1 Project"), joined or "Invite Pending"](https://mobbin.com/screens/1b575eab-0659-4b26-bc02-f27cce0b7e9c?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Wix (web) — Roles & Permissions: filters by role, table of name, role, joined on with a Pending badge; "Manage Roles" and "Invite Collaborators"](https://mobbin.com/screens/a4a3b2f6-f8ef-43cf-a3be-e6a4f4983cd0?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Zendesk (web) — One member's "Roles and access" tab as a small matrix: area, role dropdown, access checkbox](https://mobbin.com/screens/2f058231-0bcf-4abd-bb73-67dc5033b242?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

What it does well
- Lyssna explains each role where it is chosen. Nobody needs a separate permissions page to pick correctly.
- Bonsai's scope column is the model for "which location".
- Role pills make the table scannable.

Apply to Meraki
- Four fixed roles, each with a one-line description shown in the picker:
  - Owner / Executive: everything; places orders; reviews flags; receives digests.
  - Manager: runs and approves counts, builds the restock list, adjusts, transfers.
  - Front desk: receives deliveries, counts when assigned, routine adjustments.
  - Staff (technician): records "Used in service" and reports low or empty.
- Table columns: name, role pill, location scope (Lynnfield, Newburyport, Both), last active, PIN status (Set / Needs reset).
- Row menu: Change role, Change location, Reset PIN, Deactivate. Deactivate, never delete, so history keeps the name.
- Fixed roles are enough for this team size. Skip a custom permission matrix.
- Enforce separation of duties in the permission layer, not only in the role descriptions.

## 15. Notification preferences and digest settings

References
- [Klaviyo (web) — A checkbox opens each section; frequency as radios (Immediately / daily / weekly); "Send daily notifications on" time and timezone; weekly summary with day, time, timezone; recipients as chips chosen from account users](https://mobbin.com/screens/9c81deb8-8d8d-4954-9a35-060e2e2304c1?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Vanta (web) — "My alerts" as toggles with a channel dropdown and a note that alerts are batched; "Email digests" as toggles with a description, a frequency select and sub-toggles for categories to include](https://mobbin.com/screens/72dcdeac-877c-4a2e-a970-8065f4a3fa34?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Rox (web) — Frequency per insight type (Daily / None) and a "Digest Email" block with frequency and an "Include in digest" checklist where each item has a description](https://mobbin.com/screens/dd09330b-9025-45dd-affc-908f138c037d?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Hotjar (web) — Weekly summary emails with a checkbox per site, grouped by organisation](https://mobbin.com/screens/f9a70dd3-b0af-4a79-9ebd-8aa15305465b?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

Also returned: [Wrike — "Send report weekly on Monday at 6:00" and "monthly on the last Monday at 8:00" as inline sentences](https://mobbin.com/screens/a6797df0-83df-4032-8a5c-49e508b1fa2b?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Trello — Never / Periodically / Instantly](https://mobbin.com/screens/bb5b65c3-a4bb-44bf-9469-0d580adcb083?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp).

What it does well
- Alerts (something happened) and digests (a summary on a schedule) are separate blocks. Vanta and Rox both do this.
- Klaviyo and Wrike make the schedule a readable sentence with day and time.
- Rox and Vanta let the reader choose what goes into the digest, with a description per item.
- Hotjar's per-site checkbox is the per-location choice.

Apply to Meraki
- Block 1, Alerts: toggles for Stockout, Delivery short or damaged, New flag in review queue, Count overdue. Channel per alert (email now; push later if supported). Batch non-urgent alerts.
- Block 2, Weekly digest: on/off, day and time as a sentence ("Send every Monday at 8:00 AM Eastern"), locations to include, sections to include (Low stock and restock list, Receipts this week, Adjustments by reason, Open flags, Forecast run-outs).
- Block 3, Monthly digest: on/off, timing tied to the cycle ("Send on the 1st" or "after the monthly count is approved"), sections (Count variance and shrinkage, Usage trends, Orders placed and received, Flags raised and resolved, Discontinued and slow stock).
- Owners can set recipients for the business digests (chips, as in Klaviyo). Each person controls their own alerts.
- "Send me a test" button.

## 16. Stock transfer between locations

References
- [Shopify (web) — Transfers list: metric strip for the last 30 days (acceptance rate, total shipped, total received, total ordered, unique SKUs); table of transfer number, Origin, Destination, Status, Received "0 of 200", Expected arrival; "Create transfer"](https://mobbin.com/screens/79d41cc7-0344-471a-be0b-016cffecb047?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Wise (web) — Move between two of your own accounts: From with "Available" shown underneath, a swap button, To, one confirm button](https://mobbin.com/screens/1b06b1af-0d92-4b1f-b872-99b5bbea5627?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Deel (web) — Assets with an "In transit" segment in the status bar and a location filter](https://mobbin.com/screens/27f3bda0-f620-443a-b3c6-61a87141e9c5?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [OpenSea (web) — Transfer sheet: destination, the item with a quantity stepper, then "Review Transfer"](https://mobbin.com/screens/45f5d78e-3ee4-45a5-8285-12ada86d5b26?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

What it does well
- Shopify treats a transfer like a small order: origin, destination, status, and received-of-sent. The sending and receiving sides are both recorded.
- Wise shows what is available at the source next to the amount, and the swap button suits a business with exactly two places.
- Deel gives "In transit" its own status, so stock is never in neither place.

What was not found
- Shopify's transfer creation and receive steps were not captured in the results, only the list. The create form below is modelled on the purchase order and on Wise.

Apply to Meraki
- Create: From and To with a swap button (two locations, so To fills itself). Add items by search or scan. Each line shows available at the source and a quantity stepper. Optional reason (rebalancing, urgent stockout, event).
- States: Draft, Sent (leaves source on hand, shows as In transit), Received (arrives at destination), Received with difference.
- Receiving a transfer reuses the receiving screen from section 5, with accepted and not-accepted quantities.
- The sender and the receiver must be different people. A difference between sent and received creates a flag.
- List columns: number, From, To, status, received of sent, sent by, received by, dates.
- Moving stock between shelves inside one location is a simple "Move" action with no transit state.

## 17. Mobile bottom tab navigation

References
- [Shopify (iOS) — Floating tab bar: search on its own at the left, a centre pill with Home, Orders, Products and menu, and a separate round button at the right](https://mobbin.com/screens/1c61253e-04b1-4d58-bdd5-4ed0affe6da7?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Shopify (iOS) — The Products title opens a switcher menu: Products, Collections, Inventory, Purchase orders, Transfers, Gift cards, and "Scan inventory" below a divider](https://mobbin.com/flows/32f9bd70-e1b2-471b-b273-126e453b50a4?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [alias (iOS) — Five labelled tabs: Home, Search, Inventory, Orders, Account](https://mobbin.com/screens/e503d642-64d5-4b4c-8125-f221f0451ab6?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Chick-fil-A (iOS) — Five tabs with Scan in the centre position](https://mobbin.com/screens/6e604332-f105-4320-a1a6-687f78d88d17?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)
- [Blank Street (iOS) — Location switcher pill at the top of the screen, category tabs under it, five-tab bar](https://mobbin.com/screens/164e3c24-fdcc-432d-b0d1-23884cd616df?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp)

What it does well
- Shopify keeps four or five tabs and folds the long tail (purchase orders, transfers, scan) into a title switcher inside one tab.
- alias and Chick-fil-A label every tab. Icons alone are ambiguous for occasional users.
- Chick-fil-A puts the most frequent physical action, Scan, in the centre.
- Blank Street puts location at the top of every screen as a tappable pill.

Apply to Meraki
- Five labelled tabs: Home, Count, Scan (centre, emphasised), Orders, More.
  - Home: tasks for this person today (count due, deliveries expected, flags) and low-stock summary.
  - Count: active and scheduled counts; item list.
  - Scan: opens the scanner with a mode chooser (Look up, Count, Receive, Adjust, Transfer).
  - Orders: restock list, orders, deliveries to receive. Use a title switcher (Shopify pattern) for Restock list / Orders / Transfers.
  - More: Activity, Reports, Review queue (badge), Team, Settings.
- Tabs shown depend on role. A technician sees Home, Scan, More.
- Location pill at the top of every screen. Users scoped to one location see it as a label, not a control.
- Respect the iPhone home-indicator safe area in the installed web app. Keep the tab bar fixed and the primary action above it.
- Desktop: the same sections as a left sidebar.

---

## Pattern decisions

| Screen | Chosen pattern | Reference |
|---|---|---|
| Inventory list / dashboard | Summary strip with stacked status bar per location, then a table with on hand next to par and a status pill; cards on mobile | [Deel Assets](https://mobbin.com/screens/966dd7a5-28c6-4144-8a9d-a32e7e1f24fd), [Fresha Stock on hand](https://mobbin.com/screens/17fb76f9-8b9d-4365-a4e3-dae35775780a) |
| Mobile count row | Shelf-ordered rows with minus / value / plus stepper and a fill-level control; one Save | [Shopify Inventory sheet](https://mobbin.com/screens/78129b1d-65a8-4e90-907f-b112f819f4f6) |
| Purchase order | Vendor → location header, lines showing on hand and par, explicit Draft → Ordered step, history on the order | [Shopify Create PO](https://mobbin.com/screens/5528f405-0e95-4df2-90ff-6457bbf9ce15), [Fresha stock order](https://mobbin.com/screens/7799d93a-bb75-44bc-822b-52d1c888bf41) |
| Stocktake | Count → Review (Uncounted / Unmatched / Matched) → Complete, with pause and resume, counted-by and reviewed-by; expected quantity hidden while counting | [Fresha stocktake flow](https://mobbin.com/flows/fef047c4-690f-473a-8f7f-e4b06044e36c?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Receiving | Per-line Accept and Reject quantities with "All" shortcuts and progress bars; order stays open when partial | [Shopify receiving flow](https://mobbin.com/flows/7fb1788e-8f30-42a7-aacb-be61fffa681b?tab=screens&utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Stock adjustment | Sheet with Add / Remove / Set to, required reason from a fixed list, before → after preview | [Shopify adjust with reason](https://mobbin.com/screens/9628dd30-7311-4334-b9d2-6b93bd89eecc?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Audit log | Person + coloured verb + object rows, before → after detail on expand, filters by person and action type; same rows on the item page | [7shifts Activity Log](https://mobbin.com/screens/8b845427-b403-4eb7-87c9-aa771a00d378?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Deputy history](https://mobbin.com/screens/fd1a02ca-3bc4-47eb-bd05-a63926f531a3?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Low stock / reorder | Restock list grouped by vendor with on hand, par, on order and suggested quantity; one button creates the order | [Shopify Inventory with Incoming](https://mobbin.com/screens/d9deb551-88bf-4c93-91b3-43ef6659ccef?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Instacart Buy it again](https://mobbin.com/screens/f4b759b4-52a6-4331-9180-e21fb96becdf?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Item detail | Per-location stock rows, Overview / History tabs, step chart with par line and dashed forecast | [Shopify product inventory card](https://mobbin.com/screens/baf38bbf-6371-4ba6-a32c-d35ad5f584c2?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Uniswap projected line](https://mobbin.com/screens/6ef0731b-fc66-4ec5-9b8f-0643734b2444?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Barcode scanner | Live camera on top, last-scanned sheet below with editable quantity, batch review, link unknown barcode, manual entry and torch | [Shopify Inventory scanner](https://mobbin.com/screens/7a1afa26-153f-41da-9459-fdd306f93a21?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| PIN lock | Pick person, then 4-digit auto-submit keypad; same screen reused as step-up for sensitive actions | [Starling passcode](https://mobbin.com/screens/419cd61e-163c-4b82-9f44-e0b69e3944e6?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Crypto.com confirm with passcode](https://mobbin.com/screens/299ac844-0702-48a7-8b6f-7c375cfa4297?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Reports dashboard | KPI tiles with change versus previous period, sentence-style insight cards, one switchable chart | [Arcade Insights](https://mobbin.com/screens/7bc9c360-fe3b-405c-9ee7-bdbfbdd0cbcb?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [incident.io Insights](https://mobbin.com/screens/8dce681f-436f-4270-afe8-4984d08b59f3?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Review queue | Badged queue with tabs Needs review / Info requested / Resolved, reason shown on each card, per-item decisions | [Reddit Mod Queue](https://mobbin.com/screens/1caf9bf6-61a5-4cc2-b63f-705d756973f5?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Navan Flagged tab](https://mobbin.com/screens/06edd93a-1f54-496f-8632-20a56c50dba1?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Team and roles | Table with role pill and location scope; four fixed roles described in the picker | [Lyssna team](https://mobbin.com/screens/249efdbd-e4f4-4fc7-a442-97f80c2c9a68?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Bonsai team](https://mobbin.com/screens/1b575eab-0659-4b26-bc02-f27cce0b7e9c?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Notification settings | Alerts and digests as separate blocks; schedule as a sentence; choose sections and locations; recipient chips | [Klaviyo notifications](https://mobbin.com/screens/9c81deb8-8d8d-4954-9a35-060e2e2304c1?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Vanta digests](https://mobbin.com/screens/72dcdeac-877c-4a2e-a970-8065f4a3fa34?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Stock transfer | From / To with swap and available shown; Sent → In transit → Received with received-of-sent | [Shopify Transfers](https://mobbin.com/screens/79d41cc7-0344-471a-be0b-016cffecb047?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Wise move](https://mobbin.com/screens/1b06b1af-0d92-4b1f-b872-99b5bbea5627?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |
| Mobile navigation | Five labelled tabs with Scan in the centre, title switcher inside Orders, location pill on every screen | [Shopify iOS tab bar](https://mobbin.com/screens/1c61253e-04b1-4d58-bdd5-4ed0affe6da7?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp), [Chick-fil-A tabs](https://mobbin.com/screens/6e604332-f105-4320-a1a6-687f78d88d17?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) |

## Gaps in the research

- Reorder suggestions: no reference shows suggested quantities or days of cover. Section 8 is composed from adjacent patterns.
- Stock history chart on an item page: none found in an inventory product. Section 9 borrows the forecast treatment from a finance product.
- Transfer creation and transfer receiving: only the Shopify list screen was returned.
- A native iOS stocktake flow (count session with review) was not found. The iOS references are single-item scanning and inline quantity edits; the session structure comes from Fresha on web.
- Blind counting, fractional or fill-level quantities, and a variant matrix (shape × length × size, as needed for Aprés Gel-X tips) do not appear in any reference. These need original design.
- Theft or shrinkage review specific to inventory was not found. Section 13 uses expense, moderation and accounting queues as analogues.
- Shared-device user switching ("who is using this phone") was not found. The PIN references are all single-owner banking apps.

## Mobbin AI usage notice

None of the Mobbin results returned in this research (previous pass notes or this pass) included an `ai_usage_notice` field, so there is no notice text to reproduce.
