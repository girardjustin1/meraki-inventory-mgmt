# Wholesale ordering and product data sources

Written 2026-11-14 as input to the inventory app design.

## Scope and how to read this

- Covers two questions: where product data (names, images, barcodes) can come from, and how far "order from the app" can realistically go for each vendor Meraki buys from.
- **Confirmed** means it was read on the vendor's own page or observed directly in a test during this research. **Not confirmed** means no source was found; treat it as unknown, not as "no".
- Platform detection (Shopify, BigCommerce and so on) was done by reading each site's public response headers and endpoints on 2026-11-14.
- Nothing here is legal advice. The terms-of-service notes are a plain reading of the pages cited.
- Companion data file: `packages/ui/data/seed/enrichment.json` (55 product entries, 41 with a validated barcode, 52 with an image).

## Summary

1. No nail or spa supplier Meraki uses offers a public ordering API. Amazon Business is the only vendor with real ordering APIs, and access is by application and Amazon's approval.
2. Most nail brands and nail-supply distributors run on Shopify. That gives two useful things without any API agreement: a public product feed for catalogue data, and documented cart links that open a pre-filled cart on the vendor's site.
3. The practical design is three tiers: a purchase order by email for everyone, a pre-filled cart link for Shopify vendors, and API ordering for Amazon Business only if Amazon approves access.
4. Barcode lookup services cover mainstream salon retail brands well and professional or bulk sizes poorly. In a test of 16 verified barcodes, UPCitemdb's free tier matched 11 and Open Beauty Facts matched none. The app needs its own barcode-to-item table; a lookup service only speeds up first-time entry.
5. Manufacturer sites publish barcodes more often than expected, but the data has errors. Every barcode should be check-digit validated and confirmed by scanning the physical item.

---

## 1. UPC and barcode lookup APIs

### What was tested

Sixteen barcodes that were first verified on manufacturer or distributor pages were looked up on the two services that allow anonymous calls.

| Product | UPCitemdb (free) | Open Beauty Facts |
| :-- | :-- | :-- |
| Seche Vite 0.5 oz | Hit, 10 images | Miss |
| OPI Nail Envy | Hit, 4 images | Miss |
| OPI Nail Lacquer Funny Bunny | Hit, 10 images | Miss |
| OPI Drip Dry 27 mL | Hit, 10 images | Miss |
| ORLY Bonder | Hit, 10 images | Miss |
| Dazzle Dry Base Coat 0.5 oz | Hit, no image | Miss |
| Barbicide 64 oz | Hit, 5 images | Miss |
| Aprés Gel-X Natural Almond Medium box | Hit, 1 image | Miss |
| Mia Secret Blooming Gel | Hit, 1 image | Miss |
| IBD Powerbond | Hit, 3 images | Miss |
| Milken sanding bands 100 ct | Hit, 1 image | Miss |
| NuGenesis Prep Liquid 0.5 oz | Miss | Miss |
| Dazzle Dry Base Coat 8 oz (pro refill) | Miss | Miss |
| Cre8tion disposable liners (case) | Miss | Miss |
| Starpil Starsoft soft wax 500 ml | Miss | Miss |
| FarmHouse Fresh Whipped Honey 12 oz | Miss | Miss |

Result: UPCitemdb 11 of 16, Open Beauty Facts 0 of 16. The misses are the pattern to plan for: professional refill sizes, case packs, and brands sold mainly through nail-supply stores. Barcode Lookup and Go-UPC need a key, so they were not tested.

### Comparison

| Service | Free tier | Paid plans | Limits | Terms and notes |
| :-- | :-- | :-- | :-- | :-- |
| **UPCitemdb** | Yes. No sign-up or key. 100 requests per day, lookup and search combined. | DEV $99/month: 20,000 lookups/day. PRO $699/month: 150,000 lookups/day. | Free tier returned `X-RateLimit-Limit: 6` in testing and rejected a seventh rapid call with HTTP 429; spacing calls 12 seconds apart worked. DEV is 15 lookups per 30 seconds. | Returns title, brand, images and category. The site says eBay sales data is not returned by the API because it cannot be redistributed. No clause on storing results was found on the docs page; **not confirmed**. |
| **Barcode Lookup** | "Free test API account"; its call limit is not stated. | Starter $99/month (5,000 calls), Advanced $249 (25,000), Professional $499 (100,000), Enterprise $949 (500,000). | Per-minute limits not stated on the pricing page. | Returns images, description, brand, category and store offers. Coverage for these products **not confirmed** (not tested). Data-storage terms not stated on the page. |
| **Go-UPC** | No free tier. A trial key is available on request. | Developer $74.95/month (5,000 requests), Startup $245 (45,000), Enterprise $795 (450,000). | Monthly quota only; per-minute limits not stated. | Claims over 500 million products. Coverage for these products **not confirmed** (not tested). |
| **Open Beauty Facts** | Free and open. | None. | No numeric limit. Guidance is one API call per real user scan; bulk use should take the nightly export. | Database under ODbL, images under CC BY-SA, attribution required. Consumer cosmetics focus. 0 of 16 hits here, so not useful for this catalogue. |
| **GS1 US Data Hub (View/Use)** | None found for bulk use. | Subscription from $500/year; the store lists tiers at $500, $1,000, $1,500 and $2,500. API add-on starts at $6,500 and export add-on at $5,000. | Not reviewed. | Authoritative for who owns a barcode and for brand-entered core attributes. Whether records include images or marketing descriptions is **not confirmed**. Too expensive for what Meraki needs. |

### Recommendation

- **Prototype: UPCitemdb free tier.** No key, no cost, and 100 calls a day is enough to demonstrate scan-to-add. Throttle to one call every 12 seconds or so and cache every response.
- **Production: UPCitemdb DEV ($99/month), bought only for the onboarding month.** It is the same API and response shape as the prototype, it had the best measured coverage, and it is month-to-month. After the initial load of roughly 1,500 polishes and a few hundred supplies, new items arrive a few at a time and the free tier or manual entry is enough. Before paying, request trial keys from Go-UPC and Barcode Lookup and run the 41 verified barcodes in `enrichment.json` through all three; switch if one clearly wins.
- **In both cases the app's own table is the source of truth.** A lookup miss must fall through to "scan, pick the item from our list, link the barcode", so the barcode is learned once and never asked for again.

### Barcode handling rules the app needs

These came out of the enrichment work and matter more than the choice of API.

- **Store several barcodes per item.** OPI lacquer and small treatment bottles are listed by distributors with 8-digit codes (for example `09419113` for Funny Bunny) alongside the 12-digit code OPI publishes (`094100001913`). The short one is the UPC-E form of the same number. A scanner may return either, so expand UPC-E to UPC-A before matching.
- **Normalise length.** Sites publish the same code as 11, 12, 13 or 14 digits (leading zeros dropped or added). Normalise to 12-digit UPC-A or 13-digit EAN before comparing.
- **Validate the check digit.** Several published codes fail it: NuGenesis lists an 11-digit code for the Activator 0.5 oz, Dazzle Dry lists malformed codes for two mini sizes, and distributors sometimes paste a SKU into the barcode field.
- **Reformulations change codes.** OPI Nail Envy and OPI's gel base coat both have an older and a newer barcode in circulation. Old stock on the shelf will scan as the old one.
- **Size is part of identity.** A refill and a service bottle of the same product have different barcodes. The item model needs a variant level (product, then size) with the barcode on the variant.

---

## 2. Supplier ordering options, vendor by vendor

### Amazon Business

- **APIs exist.** Confirmed from Amazon's documentation: a Product Search API, an Ordering API and a Cart API. Other Amazon Business APIs (reconciliation, reporting, user management) are referenced but were not reviewed.
- **Ordering API.** `placeOrder` submits an order with line items, shipping address, an optional PO number and price expectations (an order is rejected if the price exceeds what the caller expected). A `TrialMode` attribute runs the checks without creating an order. The US is a supported region. Default rate is 0.5 requests per second with a burst of 10. The reference names Pay by Invoice explicitly; whether a card on the account can be used through the API is **not confirmed**.
- **Cart API.** Adds and changes items by ASIN. The documented cart type is described as independent of the Amazon Business website cart, so it should not be assumed to pre-fill the cart a buyer sees on amazon.com. **Not confirmed** either way; ask Amazon.
- **Access.** There is no self-service key. The process is: complete an onboarding questionnaire about the company and use case, Amazon Business reviews it, and if approved you create a Solution Provider Portal account and a developer profile. Amazon assigns API roles; "You cannot self-select Amazon Business API roles." Whether Amazon approves a single small business building a tool for its own account is **not confirmed**. Plan for a refusal or a long wait.
- **Without the API.** Amazon Business has saved lists and reorder inside the account. The app can store the ASIN and link to the product page (`https://www.amazon.com/dp/<ASIN>`). A multi-item add-to-cart URL existed under the Associates programme, but its documentation now redirects to a notice that Product Advertising API 5 is deprecated, so do not build on it. Punch-out for procurement suites is offered by Amazon Business but needs a punch-out-capable purchasing system and was not verified here.
- **Realistic integration:** apply for API access now, and build the list-and-link flow regardless.

### Costco Business Center

- **No customer API, EDI or punch-out found.** Search results for "Costco EDI" are all about suppliers selling to Costco, not customers buying from it.
- The Business Center site (costcobusinessdelivery.com) has Lists, Buy Again and Order By Item Number. A phone line and live chat are listed.
- Delivery by Costco truck: order by 3 p.m. for delivery as early as the next business day (from Costco's site, via search summary). Same-day delivery is run by Instacart with a $35 minimum (same source). US minimums and fees vary by ZIP code and were **not confirmed**.
- **Realistic integration:** store the Costco item number against each item, generate a shopping list sorted for the site's Order By Item Number page, and link to it. A person places the order.

### BJ's Wholesale Club

- **No API or business ordering integration found.**
- Business memberships exist (Business Club Card and Business Club+ Card). Ordering is through bjs.com or the app with same-day delivery or curbside pickup; fees vary by location and order size.
- **Realistic integration:** shopping list and link only, the same as Costco.

### OPI (Wella Company) and the professional distributors

- OPI names two professional channels: **Wellastore** (us.wella.professionalstore.com), "the official online shop of the Wella Company", with professional pricing, and **CosmoProf**, for licensed professionals only. **SalonCentric** also carries OPI.
- **No B2B API was found for Wellastore, CosmoProf or SalonCentric.** "SalonCentric EDI" offerings exist but are for brands supplying SalonCentric. SalonCentric's SalonInteractive programme is for shipping retail products to a salon's clients, not for back-bar ordering.
- All three are login-only web shops (CosmoProf runs on Salesforce Commerce Cloud; SalonCentric blocks automated requests). SalonCentric also has a mobile app with reorder.
- opi.com itself is a useful data source: each product page carries structured data with the GTIN and image.
- **Realistic integration:** purchase order email or PDF for the person who orders, plus a link to the distributor's product page. A licence-verified account at each distributor is needed.

### Brand-direct vendors

| Vendor | How salons buy | Platform | API, EDI or punch-out | Realistic integration |
| :-- | :-- | :-- | :-- | :-- |
| **Dazzle Dry** | Dazzle Dry Pro store (pro.dazzledry.com) after credential verification. Has a bulk quick-order form. | Shopify | None found | Pre-filled cart link. The pro store's public feed lists pro sizes with barcodes (8 oz Base Coat, 8 oz Top Coat). |
| **FarmHouse Fresh** | Wholesale portal (fhfpartners.com) with a spa-partner login. | Shopify | None found | Pre-filled cart link. The portal's feed lists professional sizes (32 oz and 1 gallon) and a library of downloadable partner photography. |
| **Starpil** | Starpil PRO (starpilpro.com). Free pro account, "no mandatory minimums". | Shopify | None found | Pre-filled cart link. |
| **NuGenesis** | Wholesale collection on nugenesisnails.com "for approved wholesale customers only"; request an account by contacting them. Also sold through distributors. | Shopify | None found | Pre-filled cart link once a wholesale login exists; otherwise order through the nail-supply distributor. |
| **Aprés Nail** | apresnail.com. A Licensed Pro tier needs a valid licence and $1,000 spent on one account in a calendar year. Also sold by distributors. | Shopify back end with a custom storefront | None found | Link to product pages. Standard Shopify cart links were **not confirmed** on this custom storefront; test one. Or buy through a distributor. |
| **DND (Daisy Nail Design)** | Through authorised nail-supply distributors. One distributor states a 24-bottle minimum and a business licence. dndgel.com is a consumer store. | Shopify (consumer site) | None found | Order through the distributor. |
| **Chisel Nail Art** | By phone: the site says to call to place a wholesale order, and to send a business licence to open an account. A distributor list is published. | Shopify (consumer site) | None found | Purchase order by email or phone. No barcodes or SKUs are published. |
| **CnC (acetone, alcohol)** | "Visit your nearest nail supply store"; the site does not take online orders for these. | Shopify (catalogue only) | None | Shopping list for the in-store run. |
| **Cre8tion** | cre8tionproducts.com shows case and pallet pricing; also sold by distributors. | Shopify | None found | Pre-filled cart link or distributor order. |

### Online nail-supply wholesalers

| Store | Platform | Public product feed | Notes |
| :-- | :-- | :-- | :-- |
| Skyline Beauty Supply | Shopify | Yes | Often has barcodes filled in. |
| Nail Company | Shopify | Yes | Carries Spa Redi, Milken, Nomi, iGel, Chisel, DND. Its SKU field holds internal numbers, not manufacturer codes. |
| Sleek Nail | Shopify | Yes | Shares listings with Beyond Polish. |
| Beyond Polish | Shopify | Yes | |
| ND Nail Supply | Shopify | Yes | Few barcodes. |
| Premier Nail Source | Shopify | Yes | Few barcodes. |
| Universal Nail Supplies | Shopify | Yes | |
| Nail Supply Inc | BigCommerce | No | Product pages only. |
| Nails Plus | **Not confirmed** | No | The site answered with a browser challenge. |

**What Shopify storefronts expose.** Observed on every Shopify store above, without logging in:

- `/products.json?limit=250&page=N` lists the catalogue: title, vendor, description, images, variants and SKUs.
- `/products/<handle>.js` returns one product, including each variant's `barcode` when the merchant filled it in.
- `/search/suggest.json?q=…` returns search matches.
- `/cart/<variant_id>:<qty>,<variant_id>:<qty>` opens a cart or checkout with those items. Shopify documents this as a cart permalink and calls the format legacy.

**What the terms allow, plainly.**

- Shopify's API terms prohibit using the Shopify API "to conduct any systematic or automated data collection activities". Those terms bind developers who hold Shopify API credentials. The storefront JSON endpoints above need no credentials and are not offered to third parties as an API, so nothing grants permission to use them either.
- Each store's own terms are what apply to a visitor. Skyline Beauty Supply's terms contain no scraping or automated-access clause and its robots.txt does not mention the product feed. Other stores were not checked one by one.
- Product photos and descriptions are copyrighted by the brand or the store whatever the terms say.
- **Position to take:** looking up the handful of products Meraki actually buys from a store it has an account with, at low volume, to fill its own internal catalogue is low risk and comparable to a staff member reading the page. Copying a store's whole catalogue, republishing its images, or polling it for prices is not something any of these terms permit. For anything beyond occasional lookups, ask the vendor for a product data sheet or permission in writing.
- Wholesale portals show partner pricing in the same feeds. Do not store or display another party's price list beyond Meraki's own account.

---

## 3. A realistic "order from the app" design

The app's job is to turn a count into the right list for each vendor and hand it to the person who orders. It should not try to be a procurement system.

### Tier A: purchase order per vendor (works for every vendor)

- From items at or below par, group by preferred vendor and generate one purchase order each: vendor item number, description, size, quantity, last price paid, ship-to location, and a PO number.
- Send as a PDF attached to an email through Resend, to the vendor's order address or to the Meraki executive who places orders. Keep the "to" address per vendor configurable.
- For in-person vendors (the local nail supply store, Costco, BJ's), the same list renders as a phone-friendly checklist.
- Record the PO as "sent" and let the front desk receive against it. This already matches Meraki's count, order, receive split.
- This tier is the whole integration for Chisel, DND through a distributor, CnC, OPI through CosmoProf or SalonCentric, Costco and BJ's.

### Tier B: pre-filled cart or deep link (Shopify vendors, Amazon lists)

- For each item, store the vendor's product URL and, for Shopify vendors, the variant ID.
- "Open cart at vendor" builds `https://<store>/cart/<variant>:<qty>,…` and opens it in the browser. The person logs in, checks the cart and pays. Candidates: Dazzle Dry Pro, FarmHouse Fresh partners portal, Starpil PRO, NuGenesis, Cre8tion, and the Shopify distributors.
- Two things to test with a real account before promising this: that the cart keeps its contents through login on a login-gated wholesale store, and that wholesale pricing applies to a cart created by link. Both are **not confirmed**.
- For Amazon, Costco and BJ's, link to the product page or the saved list. No cart pre-fill.
- The app still records the PO as in Tier A. The cart link is a convenience on top.

### Tier C: API ordering (Amazon Business only, if approved)

- Use `TrialMode` first to validate an order, then `placeOrder` with a PO number and expected prices so an unexpected price increase rejects the order instead of going through.
- Require a human approval step in the app before any real order is submitted.
- Depends entirely on Amazon approving access and on a supported payment method on the account.

### What is not possible

- Placing orders automatically with OPI, DND, Dazzle Dry, NuGenesis, Chisel, Aprés, FarmHouse Fresh, Starpil, CosmoProf, SalonCentric, Costco or BJ's. None has a customer-facing ordering API.
- Reading live stock or Meraki's contract price from any vendor.
- Order status, tracking or invoices coming back into the app, except from Amazon Business if API access is granted. Receiving stays manual.
- Logging in to a vendor site on staff's behalf. Scripting a login-only store would breach normal site terms and would break without warning.

---

## 4. Product images and descriptions

### Legal and practical notes

- Product photos and marketing copy belong to the manufacturer or to the retailer who shot them. An internal tool used by staff carries little practical risk, but that is not the same as having permission.
- **Hot-linking** (the prototype's approach) keeps no copy, but images disappear or change when the vendor updates its site, some hosts block it, and every page view tells the vendor's server that Meraki's app loaded the image. Fine for a prototype, not for production.
- **Storing copies** is more reliable and is what production needs, but it is copying. Prefer images the vendor has supplied for partner use.
- **Best sources, in order:**
  1. Vendor-supplied partner assets. FarmHouse Fresh's wholesale portal already offers downloadable product photography to partners. Ask Dazzle Dry, NuGenesis, Starpil and the OPI distributor rep for a product data sheet or image pack.
  2. The manufacturer's own product page.
  3. A distributor's listing, as a last resort.
  4. A photo taken in the salon. For generic consumables and anything with no web presence (Divina, Arina), this is the only option and takes seconds on a phone.
- Write descriptions in Meraki's own words: one or two factual sentences about what the item is for. Do not paste vendor marketing copy.
- For colour swatches, no source states a hex value for OPI, DND or Dazzle Dry shades. Sample the colour from the vendor's swatch image or a photo of the bottle, and label it approximate.

### Recommended pipeline

1. **Seed.** Load `enrichment.json` for the items already researched.
2. **Find.** For an item with no image, search by brand and product name (Firecrawl search), preferring the manufacturer's domain.
3. **Extract.** Read the product page's structured data first: `application/ld+json` gives name, image and GTIN on opi.com and FarmHouse Fresh, and Shopify stores give the same through the product endpoint. Scrape page text only if that fails.
4. **Validate.** Check-digit the barcode, normalise it, and flag any conflict between sources.
5. **Human approve.** Show the candidate image, name, size and barcode to a manager, who accepts, edits or rejects. Nothing is published without this step. The Chisel example below shows why.
6. **Store.** On approval, copy the image into Supabase Storage (resize to a thumbnail and one larger size) and save the source URL, the date and who approved it. Serve from Supabase, not the vendor.
7. **Confirm by scan.** The first time the physical item is scanned, confirm or replace the stored barcode.

### Data quality findings from the enrichment run

- **Chisel Solid 65:** the manufacturer's page headed "Solid 065" has the browser title "Solid 64" and an image file named for 64, while the "Solid 066" page is titled and imaged as 65. The jar photos show no number. The image was left empty rather than guessed.
- **Divina cuticle softener and Arina quick dry oil:** no manufacturer or distributor page was found. Fields are empty.
- **Nomi spa soak tablets:** the only barcode found fails its check digit.
- **Distributor barcodes** are unreliable on their own. Some hold SKUs or unrelated numbers. Codes were kept only when they matched the manufacturer's number range or a second source.
- **Professional sizes** are mostly missing from public barcode data. Dazzle Dry's pro store publishes them; FarmHouse Fresh's portal publishes SKUs but no barcodes.

---

## 5. Vendor summary

| Vendor | Integration tier | Effort | What is needed from Meraki |
| :-- | :-- | :-- | :-- |
| Amazon Business | C if approved, otherwise B (links and lists) | High for C, low for B | Amazon Business account admin, payment method on the account, completed API onboarding questionnaire, ASINs for regular items |
| Costco Business Center | A (shopping list by item number) plus link | Low | Membership number, Costco item numbers for regular items, delivery ZIP code |
| BJ's | A (shopping list) plus link | Low | Membership details, item links |
| OPI via Wellastore, CosmoProf or SalonCentric | A, plus product links | Low | Which distributor is used, account number, licence on file, rep contact, OPI item codes |
| Dazzle Dry | B (pro store cart link) | Low to medium | Pro account login, confirmation that cart links keep pro pricing |
| FarmHouse Fresh | B (partner portal cart link) | Low to medium | Spa-partner login, which sizes are bought (32 oz or gallon), rep contact, permission to use partner photography |
| Starpil | B (Starpil PRO cart link) | Low to medium | Pro account login, which wax formulas are bought |
| NuGenesis | B if a wholesale login exists, otherwise A | Low to medium | Wholesale account or the distributor's name |
| Aprés Nail | A, plus product links; B only if cart links are confirmed to work | Low | Account login, whether the Licensed Pro tier applies, shapes and sizes stocked |
| DND | A (through distributor) | Low | Distributor name and account number, colour numbers stocked |
| Chisel | A (email or phone order) | Low | Sales rep contact, account number, colour numbers stocked |
| Cre8tion | B or A, depending on where it is bought | Low | Whether bought direct or from the nail supply store |
| Local nail supply store (CnC acetone, Divina, Arina, Milken, Infa-Lab, Nomi, Spa Redi) | A (checklist for the in-store run, or emailed PO) | Low | Store name, contact and whether they accept emailed orders; label photos for items with no web listing |
| Online nail-supply distributors (Skyline, Nail Company and similar) | B (Shopify cart link) | Low to medium | Which stores Meraki has accounts with |

Tier A is a purchase order by email or checklist. Tier B is a pre-filled cart or product link. Tier C is API ordering.

---

## Open questions for Meraki

1. Which distributor supplies OPI today, and is there a named rep?
2. Which "Nail Supply Store" appears on the order form, and does it take emailed orders?
3. Which sizes are actually bought for FarmHouse Fresh, Starpil, Barbicide, OPI Drip Dry and Bond Aid? The enrichment file notes an assumption for each.
4. Is the Amazon account an Amazon Business account, and who administers it?
5. Is anyone willing to photograph labels for the items with no web listing?

---

## Sources

Barcode lookup services
- UPCitemdb API plans and limits: https://devs.upcitemdb.com/
- Barcode Lookup API pricing: https://www.barcodelookup.com/api
- Go-UPC API plans: https://go-upc.com/plans/api
- Open Beauty Facts data and licence: https://world.openbeautyfacts.org/data
- GS1 US APIs and pricing: https://www.gs1us.org/tools/gs1-us-data-hub/gs1-us-apis
- GS1 US Data Hub Product View/Use price tiers: https://store.gs1us.org/product-view-use/p

Amazon Business
- Onboarding overview: https://docs.business.amazon.com/docs/onboarding-overview
- Ordering API reference: https://docs.business.amazon.com/docs/ordering-api-v1-reference
- Cart API reference: https://docs.business.amazon.com/docs/cart-api-v1-reference
- Product Search API reference: https://amazon-business-group-2.readme.io/docs/product-search-api-v1-reference
- Amazon Business API Policy (listed, could not be opened): https://www.amazon.com/gp/help/customer/display.html?nodeId=GMS895VBGEKST23Q
- Product Advertising API 5 deprecation notice: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation

Warehouse clubs
- Costco Business Center: https://www.costcobusinessdelivery.com/
- Costco Business Center customer service: https://www.costcobusinessdelivery.com/customer-service
- Costco same-day: https://www.costco.com/f/-/same-day
- BJ's membership: https://www.bjs.com/membership/club/ and https://www.bjs.com/membership/clubplus/

Professional distributors and brands
- OPI, where to buy: https://www.opi.com/blog/product-spotlight/where-to-buy-opi-nail-polish
- Wellastore: https://us.wella.professionalstore.com/en-US
- CosmoProf: https://www.cosmoprofbeauty.com/
- SalonCentric: https://www.saloncentric.com/ and https://www.saloncentric.com/opi
- SalonCentric SalonInteractive: https://www.saloncentric.com/salon-interactive.html
- SalonCentric supplier EDI (third party): https://www.ezcomsoftware.com/retailer-edi/salon-centric-edi/
- Dazzle Dry Pro: https://pro.dazzledry.com/ and https://pro.dazzledry.com/pages/sign-up-application-form
- FarmHouse Fresh wholesale portal: https://fhfpartners.com/ and https://farmhousefreshgoods.com/pages/become-a-partner
- Starpil PRO: https://starpilpro.com/ and https://www.starpilwax.com/pages/wholesale-waxing-supplies
- NuGenesis wholesale: https://nugenesisnails.com/collections/wholesale
- NuGenesis distributors: https://nugenesisnails.com/pages/dip-powder-local-distributors
- Aprés Licensed Pro requirements: https://help.apresnail.com/en-US/what-are-the-requirements-to-qualify-for-the-licensed-pro-tier-1362709
- DND distributor terms (Esther's Nail Center): https://www.esthersnc.com/form/wholesale-registration/
- DND authorised distributor (Team Nail Supply): https://teamnailsupply.com/blogs/news/now-authorized-distributor-of-dnd-apres-usa
- Chisel distributor and wholesale ordering: https://chiselnailart.com/pages/distributor
- CnC acetone (not sold online): https://cncgel.com/products/cnc-100-plus-acetone

Shopify
- Cart permalinks: https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks
- API licence and terms of use: https://www.shopify.com/legal/api-terms
- Acceptable use policy: https://www.shopify.com/legal/aup
- Skyline Beauty Supply terms of service: https://skylinebeautysupply.com/policies/terms-of-service

Product pages used for enrichment are listed per item in `packages/ui/data/seed/enrichment.json` (`sourceUrl`).
