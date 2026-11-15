# Product imagery

Written 2026-11-14. Eight research agents searched public brand and distributor pages for a photo of every catalogue item that had none. This note records what was found, where it came from, what the search showed is wrong in the catalogue, and how to re-run the merge.

## Result

| Group | Items | With a photo | Real swatch colour | Barcode found |
| :-- | --: | --: | --: | --: |
| OPI lacquer and gel | 333 | 333 | 315 | 301 |
| OPI dip powder | 134 | 134 | 120 | 119 |
| DND | 576 | 576 | 546 | 0 |
| Chisel dip powder | 438 | 438 | 183 | 0 |
| Dazzle Dry | 102 | 102 | 89 | 10 |
| Aprés Gel-X tips | 19 | 19 | n/a | 0 |
| Supplies | 145 | 92 shown | n/a | 9 new |

- **Polish and tips**: every one of the 1,602 colours and tip boxes has a photo.
- **Supplies**: 92 of 145 show a photo (44 before this pass). Of the other 53, 41 name no specific product ("Nail Art Glitter", "Aluminum Foil"), 7 have a low-confidence match that is held back, and 5 were not found or could not be identified.
- **Swatch colours**: 1,253 colours now use the brand's own colour (a published value or one sampled from the brand's colour chip). 330 more are estimated from the bottle photo and are still labelled approximate in the app.
- **Confidence**: 1,361 high, 288 medium, 10 low. Low-confidence matches are stored and not shown.
- **Cost**: 66 Firecrawl calls in total. Almost everything came from the brands' free public product feeds.

## Where the images come from

| Source | Used for |
| :-- | :-- |
| opi.com product pages | OPI lacquer, gel and dip (photo, swatch, colour value, barcode) |
| dndgel.com product feed | DND and DND DC duos |
| chiselnailart.com product feed | Chisel Solid, Ombre, Glow and Glitter |
| dazzledry.com product feed | Dazzle Dry lacquer |
| Aprés's store feed | Gel-X tip boxes |
| Brand sites (NuGenesis, LeChat, Daily Charme, Honey's Nail Secret, Cre8tion, CND, Barbicide, Lysol, Swiffer and others) | Supplies |
| Distributors (Beyond Polish, Transdesign, Skylark, Nails Plus, QQ Nail Supply, Nail Company and others) | Retired shades and supplies the brand does not list |
| BJ's listings | Berkley Jensen and Wellsley Farms house brands |

Images are hot-linked from these pages for the prototype. Before production they should be approved by a person and copied to Meraki's own storage, or supplied by the vendors.

## What the search showed is wrong in the catalogue

These come from the spreadsheets. Nothing was changed in the catalogue: they need a person to check the shelf and correct the sheet.

### Codes that point at a different colour

| Item | Sheet says | Brand says |
| :-- | :-- | :-- |
| OPI Cliffside Karaoke | N92 | N80 |
| OPI dip Just Lanai-ing Around | W63 (OPI by Popular Vote) | H72 |
| OPI dip My Private Jet | MI08 (OPI Nails the Runway) | B59 |
| OPI dip OPI Nails the Runway | U18 (Rub-a-Pub-Pub) | MI08 |
| OPI dip Malaga Wine | L88 | L87 |
| Dazzle Dry Whisper White | L903 (Diamonds After Dark) | L902 |
| Dazzle Dry Artisan | L805 (Picking Peonies) | L804 |
| Dazzle Dry At First Blush | L106 | L107 |
| Dazzle Dry Prima Ballerina | L243 (Less is Mauve) | L244 |
| Dazzle Dry Peacefully Me | L193 (Breathe Free) | L194 |
| Dazzle Dry Take a Chance | L289 (XOXO) | L871 |
| Dazzle Dry Going Cray Sea | L158 (Hey Sexy!) | L157 |
| Dazzle Dry Campus Crush | L230 | L231 |
| Dazzle Dry Party Dress | L232 (Perfectly Plaid) | L233 |
| Dazzle Dry Saphira | none | L876 |
| DND 94 "Aqua Pink" | 94 | DC 094 is American Beauty; Aqua Pink is DC 058 |
| DND 104 "Dust Pink" | 104 | DC 104 is Dusty Peach |
| Chisel Glitter 16 and 17 | codes 26 and 27 | names and SKUs say 16 and 17 |

### Lines and names

- **DND DC**: DND codes 1–144 and 254–289 (180 rows) are DND DC colours written without the "DC" prefix. The classic DND range starts at 401.
- **Chisel**: "Nail Art 1A" to "30B" (60 rows) are Chisel's Metallic range, once sold as "Standard". Bare codes 1–10 are Glow in the Dark and 11–20 are Glitter.
- **Spelling**: about 130 colour names differ from the brand's spelling (for example "Malagna Wine", "Sturdust", "Plank Bubblegum", "$ Leaf Clover"). The brand's spelling is in each finding's `matchedName`.
- **Supplies**: "Daily Charmer" is Daily Charme; "Honey Pham" is Honey's Nail Secret; "Barbacide" is Barbicide; "Vivian" is Vivian by Tony Ly; "RY" is Riya's Nails; "RED" is RED Nail Design; "Zen Builder Gel" is now KaZEN; "Lysol Advance Powder Gel" is Lysol Advanced Power Clinging Gel; "Scott Trifold" is sold as Multi-Fold.
- **Possible duplicate**: "Chrome Base" and "Pyramid Chrome Base Coat Gel Polish".
- **Categories**: several supplies sit in the wrong category (alcohol under Essential Oils, files and buffers under Seasonal Spa Treatments).
- **Cannot tell**: "Bond Aid Body Power" could be OPI Bond-Aid or Gold Bond Body Powder; "Arina" (quick dry oil, acrylic liquid) was not found as a brand anywhere.

### Probably retired

- OPI: 77 lacquer shades are marked unavailable on opi.com, and 14 dip shades are no longer listed there.
- Dazzle Dry: 12 shades are not in the current catalogue.
- DND: 504 Orange Aura and 710 Champagne Sparkles are not on the brand site.
- FarmHouse Fresh Butter Brulee Powder Milk Bath is not in the current wholesale list.

### Brand-site errors worth knowing

- chiselnailart.com shows the previous number's jar on the pages for Solid 35–147. The correctly numbered files were used, checked against two distributors' swatches, and marked medium confidence.
- Chisel Solid 156 looks periwinkle on the brand's photo and black at two distributors.
- OPI's published colour value is a placeholder for some shades; 43 such values were dropped.

## How it works

- `tools/enrich/findings/*.json` holds what each search returned, one record per item id, with the image, the page it is on, the brand's name for the product, a confidence and notes.
- `tools/enrich/merge_images.py tools/enrich/findings` checks every record (the id exists, the image loads, a barcode passes its check digit, one photo is not reused across many items), samples swatch colours, and writes `packages/ui/data/seed/images.json`.
- `packages/ui/data/inventory.ts` applies that file by item id. Photos checked by hand in `enrichment.json` win. Low-confidence records are skipped.

To add or correct a photo, edit or add a record in `findings/` and run the merge again.

## Not done

- Barcodes for DND, Chisel and most Dazzle Dry colours. A distributor feed carries barcodes for about 160 more Dazzle Dry shades.
- Photos were checked by loading each URL and by viewing samples and contact sheets, not by a person comparing every photo with the shelf.
- The 41 generic supplies need a real product name before a photo can be attached.
