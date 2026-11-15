# Inventory control best practices for Meraki Spa

Written 2026-11-14 as input to the inventory app design.

## Scope and how to read this

- Covers back-bar (professional-use) consumables and about 1,500 polish colours across Lynnfield and Newburyport.
- Statements marked **Established practice** are standard inventory control. Statements marked **Recommendation** are judgement calls for Meraki and should be confirmed with the owners.
- No statistics are quoted as targets. Meraki has no cost or usage data yet, so the first job is to create a baseline.
- Sources are listed at the end. They are mostly vendor guides. They were used to confirm formulas and common practice, taken from search result summaries rather than a full read of each page.

## Where Meraki is today

Monthly cycle from the current spreadsheets:

1. Management counts and lists restock needs by the 25th.
2. Executives place orders in the first week of the month.
3. Front desk records received items with date, quantity and receiver.
4. Management files a monthly backlog and resets.

This already separates counting, ordering and receiving between three groups. The app should keep that split and make it enforceable. What is missing: par levels, reason-coded adjustments, a variance check on counts, usage data, cost data, and numeric quantities for part-used containers.

---

## 1. Par levels and reorder points

**Established practice**

- Reorder point = average daily usage × lead time (days) + safety stock.
- Safety stock covers variation in usage and in delivery time. A simple method: (maximum daily usage × maximum lead time) − (average daily usage × average lead time).
- The formula above assumes stock is checked continuously and an order can be placed at any time.
- When orders are placed on a fixed schedule, the target must also cover the wait until the next order. Order-up-to level (par) = average daily usage × (review period + lead time) + safety stock. Order quantity = par − on hand − on order.

**Applied to Meraki**

- Meraki orders monthly, so the review period is about 30 days. For a vendor with a 5-day lead time, par covers about 35 days of usage plus safety stock.
- Keep both numbers per item and per location:
  - Par: what the monthly order tops up to.
  - Reorder point: the level that triggers an off-cycle top-up from a fast vendor (local nail supply, Amazon, Costco/BJs).
- Lead time is a property of the vendor. Record it once per vendor and let items inherit it. Direct-ship brands (Dazzle Dry, Farmhouse Fresh) will be longer than a local store run. Actual lead times need to be confirmed with whoever orders.

**Recommendation**

- There is no usage data yet. Do not calculate pars in the first two cycles. Ask management for a judgement par per item ("we should never have fewer than N"), record it, and replace it with a calculated value once two or three counts exist.
- Usage between two counts = opening count + received − transfers out + transfers in − closing count. Divide by days between counts for average daily usage.
- Round suggested order quantities up to the pack size (a case of gloves, a box of tips).
- For polish colours, par is usually 1 bottle on the wall, with a back-up bottle only for the most-used colours. Treat a colour as "low" by fill level, not by bottle count.
- Review pars quarterly and after any service-menu change.

## 2. ABC classification and cycle counting

**Established practice**

- ABC analysis ranks items so effort goes where the risk is. The classic basis is annual usage value (usage × unit cost): a small share of items (A) accounts for most of the value, B is the middle, C is the long tail.
- Cycle counting counts a subset of items on a rotating schedule instead of everything at once. A items are counted most often, C items least often.
- Published schedules vary. The cadence used for this project is: A weekly, B monthly, C quarterly.
- An item that is low value but critical to delivering a service can be promoted to a higher class.
- Re-run the classification periodically, because usage shifts.

**Applied to Meraki**

- There is no cost data, so value-based ranking is not possible yet.

**Recommendation**

- Classify on three questions until cost data exists: How fast is it used? Would running out stop a service? Is it easy to walk off with or resell?
- Suggested starting classes (to be confirmed by management):
  - A, weekly: high-turn service essentials and attractive items. Examples: gel base and top coats, Dazzle Dry system bottles, Gel-X tip boxes in the common sizes, gloves, files and buffers bought by the case, Farmhouse Fresh product, acetone.
  - B, monthly: the working polish lines by shelf, dip powders, wax supplies, most back-bar consumables.
  - C, quarterly: slow colours, seasonal or discontinued shades, cleaning-closet stock.
- Count by shelf, not by SKU list. A weekly A count should be one short walk of named shelves. The app schedules "this week: Supply Closet 1A, 1B; Nail Area 3C".
- The existing full count by the 25th stays as the monthly B count and the basis for the restock list. C shelves rotate so each is covered once a quarter.
- With 1,500 colours, a full polish count is a presence-and-level check: is each colour there, and is it Full, Half, Low or Empty. Do not ask anyone to key 1,500 numbers.
- Once unit costs are captured, re-rank by usage value and compare with the judgement classes.

## 3. Blind counts

**Established practice**

- In a blind count the counter does not see the system quantity until after entering what they counted. This removes the temptation to confirm the expected number.
- Differences are reviewed by someone other than the counter.

**Recommendation**

- Make blind the default for every count. Show expected quantity only on the review screen, to the manager role.
- Show the previous count only for fill levels where it helps orientation (for example "last: 3/4"), and make that a setting.
- Trigger an automatic recount request when a line is outside the variance threshold. The recount is also blind, ideally by a second person.

## 4. Receiving: two-person check

**Established practice**

- Receiving is checked against what was ordered. Quantity, item and condition are verified at the door, not later.
- Shortages, damage and substitutions are recorded at receipt. They are not netted off silently.
- A second person verifying the receipt reduces both honest miscounts and diversion. Blind receiving (the receiver does not see the ordered quantity) is a stronger version of the same control.

**Applied to Meraki**

- Front desk already records date, quantity and receiver. The gaps are: comparison to the order, a record of what was not accepted, and a witness.

**Recommendation**

- Every receipt stores: order reference, date and time, received quantity, not-accepted quantity with reason, receiver, witness (second PIN).
- Require the witness for direct-ship brand orders and any delivery above a set number of lines. Allow single-person receipt for a small store run, but require a photo of the receipt.
- Short or damaged lines create a follow-up task for the person who ordered.
- Put stock away to its shelf code at receipt. Received-but-not-shelved stock is where items go missing.

## 5. Separation of duties

**Established practice**

- No single person should be able to order, receive, record and count the same stock. Splitting those duties means a loss needs two people to hide it.
- The person who orders is not the person who receives.
- The person who counts is not the only person who approves the resulting adjustment.
- Where a team is too small to split every duty, owner review of an independent report is the compensating control.

**Applied to Meraki**

| Duty | Who today | Rule in the app |
|---|---|---|
| Count and restock list | Management | Counter cannot approve their own variance lines above threshold |
| Place order | Executives | The person who marks an order as placed cannot receive it |
| Receive | Front desk | Receiver cannot edit the ordered quantity; witness on larger receipts |
| Adjust stock | Not defined | Any role can record use or damage; Lost and Suspected theft need manager review |
| Transfer | Not defined | Sender and receiver are different people |
| Set pars, edit items, manage users | Not defined | Owner and manager only; every change logged |

**Recommendation**

- Enforce these in permissions, with an explicit owner override that is itself logged and appears in the digest.
- The weekly and monthly owner digests are the compensating control. They should list overrides, self-approved items and unresolved flags first.

## 6. Reason-coded adjustments

**Established practice**

- Every change to on-hand quantity outside receiving and counting carries a reason from a fixed list. Free text alone cannot be reported on.
- Reason codes turn "stock went down" into categories that can be trended: use, damage, expiry, loss, theft, correction.
- Adjustments are corrected by a reversing entry, not by editing history.

**Recommendation**

- Starting list: Used in service, Damaged or spilled, Expired or dried out, Lost, Suspected theft, Count correction, Given to client or promo, Returned to vendor, Moved to tester or display, Found.
- Keep the list under a dozen. Owners can add reasons; retired reasons are hidden, not deleted.
- Require a note for Lost, Suspected theft and Count correction. Offer a photo for Damaged.
- No default reason in the form.
- Report adjustments by reason, by person and by location each month.

## 7. Variance thresholds and shrinkage rate

**Established practice**

- Variance = counted quantity − expected (book) quantity, per item.
- Shrinkage rate = (book inventory − physical inventory) ÷ book inventory × 100. It can be measured in units or in value at cost.
- A tolerance is set per class. Variances inside tolerance are accepted automatically; outside tolerance they need a recount and a supervisor's approval. Tighter tolerances for A items, looser for C.
- Shrinkage has several causes: theft, breakage, spoilage, miscounts, receiving errors and unrecorded use. The rate alone does not say which.

**Applied to Meraki**

- Without cost data, measure in units and in number of lines with a variance. Add value once costs are captured.
- For consumables used in services, most "shrinkage" in the first months will be unrecorded use, not loss. Expect the number to look bad until usage recording settles.

**Recommendation**

- Starting tolerances, to be tuned after three cycles:
  - A items: any difference triggers a recount.
  - B items: recount when the difference is more than 1 unit or one fill level, whichever applies.
  - C items: recount when the difference is more than 2 units.
- Track per location per month: shrinkage rate in units, lines counted, lines with variance, lines recounted, adjustments by reason.
- Compare locations with each other and each location with its own history. Do not set an external target until there is a three-month baseline.
- Flag patterns, not single events: the same item short in consecutive counts, shortfalls concentrated on one shelf, or one person's counts repeatedly differing from recounts.

## 8. Usage-per-service benchmarking

**Established practice**

- Salons set an expected amount of product per service, then compare expected consumption with actual. A container that runs out much sooner than its expected number of services signals over-use, waste, a wrong standard, or loss.
- Expected usage for a period = Σ (number of each service performed × standard usage of the product for that service).
- Actual usage for the period = opening stock + received ± transfers − closing stock.
- Back-bar stock is tracked separately from retail stock, because it is consumed by services, not sales.

**Applied to Meraki**

- This needs two inputs that do not exist yet: service counts per period and location, and a standard usage per service.
- Service counts would come from the booking system. Whether they can be exported by service type and location needs to be confirmed.

**Recommendation**

- Do not build this in the first release. Collect the data that makes it possible: counts with fill levels, receipts, and service counts.
- Start with a handful of products where the link to a service is direct: gel top and base coat per gel manicure, Gel-X tips per full set, pedicure liners per pedicure, wax per waxing service, gloves per service.
- Set standards by observation over two weeks at each location, not from a supplier brochure. Record them as a range.
- Report the ratio actual ÷ expected per product, per location, per month. Investigate when it sits outside the agreed range for two periods running.
- Comparing the two locations against each other is useful before any formal standard exists.
- Present it as a product and process measure. It is not reliable enough to assess individuals.

## 9. Audit trail

**Established practice**

- Every stock movement is recorded with who, when, what, how much, and why. The record is append-only.
- The trail is reviewed by someone independent of the people making the entries.

**Recommendation**

- Fields on every entry: person (from PIN), role, location, device, date and time, item, action type, quantity before and after, reason, note or photo, and the related count, order or transfer.
- Log configuration changes too: par edits, item edits, role changes, PIN resets, overrides.
- No deletion and no editing. Corrections are new entries that reference the original.
- Individual PINs on shared phones are what make the trail meaningful. Shared logins make it worthless.
- Keep entries when a staff member leaves. Deactivate the account; keep the name on the history.
- Retention period is an owner decision. Recommendation: keep indefinitely, since the volume is small.

## 10. Non-numeric quantities ("Halfway Full")

**Established practice**

- Part-used containers are counted as a fraction of a full unit. Bars and restaurants do the same with open bottles, estimating to a fixed set of levels.
- A small fixed set of levels gives more consistent counts between people than free estimates.

**Recommendation**

- Give each item a counting method:
  - Each: whole units only (gloves by box, files by pack).
  - Container level: sealed units plus the level of the open one.
  - Presence and level: polish colours.
- Fixed levels: Full (1.0), 3/4 (0.75), 1/2 (0.5), 1/4 (0.25), Empty (0).
- On hand = sealed units + level of the open container. Two sealed gallons and one half-used gallon is 2.5.
- Store the unit of measure and the pack size on the item (bottle, gallon, box of 100) so "2.5" is unambiguous.
- Migrate spreadsheet text: "Halfway Full" → 0.5, "Almost empty" → 0.25, "Full" → 1.0. Anything unclear is left blank and counted fresh.
- One fill level is the smallest difference that counts as a variance for these items. Finer than that is noise.
- Par for a container item can be fractional, for example "reorder when below 1.25".

## 11. Stock transfers between locations

**Established practice**

- A transfer is recorded at both ends: sent by the source, confirmed by the destination. Stock in between is "in transit" and belongs to neither shelf.
- Transfers are not done as a negative adjustment at one site and a positive one at the other. That breaks the link between the two and hides differences.
- A difference between sent and received is investigated like a receiving shortage.

**Recommendation**

- States: Draft, Sent, Received, Received with difference.
- Sender and receiver are different people. Each confirms with their PIN.
- Record the reason (rebalancing, urgent stockout, event).
- Transfers count as usage for neither location. They are excluded from usage calculations and from shrinkage.
- A location that keeps borrowing the same item has a par problem. Show repeat transfers in the monthly digest.
- A move between shelves within one location is a simple location change with no transit state, still logged.

## 12. Discontinued colours

**Established practice**

- Discontinued items are kept in the system with an inactive status. History is retained; reordering is blocked.
- Remaining stock is used through, cleared, or written off with a reason. It is not left as phantom stock.

**Recommendation**

- Item statuses: Active, Discontinued (use through), Retired.
  - Active: counted, reorderable, appears in low-stock alerts.
  - Discontinued: counted, not reorderable, excluded from low-stock alerts, shown with a badge. When it reaches Empty it moves to Retired automatically.
  - Retired: hidden from counts and lists, searchable, history kept.
- Record why (discontinued by brand, removed from Meraki's range, seasonal) and an optional replacement colour.
- Seasonal collections: mark an end date so they drop off the restock list without anyone remembering.
- Bottles pulled from the wall get an adjustment with reason "Expired or dried out" or "Returned to vendor", not a silent delete.
- For Aprés Gel-X tips, track each shape × length × size as its own item so a single size can run low or be dropped without affecting the rest.
- Report slow stock quarterly: colours with no recorded use across two counts.

---

## Suggested order of adoption

All of this is a **Recommendation**.

1. Cycle 1: load items with shelf codes and counting method. Individual PINs. Blind monthly count with fill levels. Reason-coded adjustments. Receiving against orders.
2. Cycle 2: judgement pars and the restock list. Variance review with thresholds. Weekly A-shelf counts. Transfers.
3. Cycle 3: calculated usage and pars from two counts. Flags and the review queue. Owner digests with shrinkage in units.
4. Later: unit costs captured at ordering, value-based ABC, usage-per-service comparison, forecasted run-out dates.

## Open questions for the owners

- Actual lead time per vendor.
- Whether service counts by type and location can be exported from the booking system.
- Who may approve variances and resolve flags at each location.
- The receipt size above which a witness is required.
- Whether unit costs will be entered at ordering.

## Sources

Vendor and practitioner guides surfaced by web search on 2026-11-14. Used to confirm formulas and common practice from search summaries; individual pages were not read in full. No benchmark figures from these pages are relied on above.

- Reorder point and safety stock: [QuickBooks — reorder point formula](https://quickbooks.intuit.com/r/growing-complex-businesses/reorder-point-formula/), [Simple Sheets — reorder point calculator](https://www.simplesheets.co/reorder-point-calculator), [Unleashed — the reorder point formula](https://www.unleashedsoftware.com/blog/the-reorder-point-formula-everything-you-need-to-know/)
- Cycle counting, ABC classes, blind counts, variance tolerances: [QT9 — cycle counting](https://qt9software.com/glossary/cycle-counting), [Cleverence — cycle counting SOP template](https://www.cleverence.com/inventory/templates/sop-cycle-counting/), [Fabrico — implementing a cycle counting program](https://www.fabrico.io/blog/how-to-implement-cycle-counting-program-manufacturing/)
- Shrinkage formula and internal controls: [Patriot Software — what is inventory shrinkage](https://www.patriotsoftware.com/blog/accounting/what-is-inventory-shrinkage/amp/), [RedBeam — inventory shrinkage causes, formula and prevention](https://redbeam.com/blog/inventory-shrinkage-causes-formula-and-how-to-prevent-it), [ZenGRC — internal control practices to prevent inventory loss](https://www.zengrc.com/blog/internal-control-practices-to-prevent-inventory-loss/), [Shopify — retail shrink](https://www.shopify.com/retail/retail-shrink)
- Salon back-bar usage per service: [Square — how to manage inventory at a beauty salon](https://squareup.com/au/en/the-bottom-line/operating-your-business/manage-inventory-beauty-salon), [Zenoti — salon and spa inventory](https://zenoti.com/platform/inventory)

Not sourced (standard practice stated from general knowledge): the order-up-to formula for fixed-schedule ordering, fractional counting of open containers, two-step transfers, and discontinued-item status handling.
