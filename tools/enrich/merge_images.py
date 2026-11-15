#!/usr/bin/env python3
"""
Merge product-imagery research into packages/ui/data/seed/images.json.

Input: a folder of JSON files, each an array of findings keyed by catalogue item id
(the format is described in docs/research/04-product-imagery.md). Every finding is checked
before it is kept:

  - the id exists in the catalogue
  - the image URL is https, and answers 200 with an image content type
  - a UPC, when given, passes its check digit
  - one image is not used for more than a handful of different items (a sign of a collection
    photo standing in for individual products)

For polish, a real swatch colour is sampled from the swatch image when there is one, so the
polish wall can show the true shade instead of a guess from the colour family.

Usage:
  python3 -m venv .venv && .venv/bin/pip install pillow
  .venv/bin/python tools/enrich/merge_images.py <findings-folder> [--no-network] [--no-swatches]

Nothing private goes through here: findings hold public product pages only.
"""
from __future__ import annotations

import collections
import concurrent.futures as cf
import glob
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SEED = os.path.join(ROOT, "packages", "ui", "data", "seed")
OUT = os.path.join(SEED, "images.json")
UA = "Mozilla/5.0 (compatible; catalogue-image-check/1.0)"
CONFIDENCE = ("high", "medium", "low")
# One photo shared by more items than this is treated as a collection photo and dropped.
MAX_SHARED = 3

args = [a for a in sys.argv[1:] if not a.startswith("--")]
NETWORK = "--no-network" not in sys.argv
SWATCHES = "--no-swatches" not in sys.argv and NETWORK
if not args:
    sys.exit(__doc__)


def upc_ok(code: str) -> bool:
    digits = re.sub(r"\D", "", code or "")
    if len(digits) not in (8, 12, 13, 14):
        return False
    body, check = digits[:-1], int(digits[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def fetch(url: str, limit: int | None = None) -> tuple[int, str, bytes]:
    """GET with a byte limit. Returns (status, content type, body)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,*/*;q=0.5"})
    if limit:
        req.add_header("Range", f"bytes=0-{limit - 1}")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, res.headers.get("Content-Type", ""), res.read(limit) if limit else res.read()
    except urllib.error.HTTPError as err:
        return err.code, "", b""
    except Exception:  # timeouts, TLS, DNS
        return 0, "", b""


def image_ok(url: str) -> bool:
    status, kind, body = fetch(url, 2048)
    if status not in (200, 206):
        return False
    return kind.startswith("image/") or body[:4] in (b"\x89PNG", b"RIFF", b"GIF8") or body[:2] == b"\xff\xd8"


def median_hex(pixels: list[tuple[int, int, int]]) -> str:
    r, g, b = (sorted(p[i] for p in pixels)[len(pixels) // 2] for i in range(3))
    return f"#{r:02x}{g:02x}{b:02x}"


def sample_hex(url: str) -> str | None:
    """
    The colour of a swatch image. Swatches come as a filled chip, a dot on white, or a painted nail
    tip on white with the name printed under it, so the white background is left out, and so is dark
    lettering when it is only a small part of the picture. A chip that is white all over stays white.
    """
    from PIL import Image  # imported late so --no-swatches needs no Pillow

    status, _kind, body = fetch(url)
    if status != 200 or not body:
        return None
    try:
        img = Image.open(io.BytesIO(body)).convert("RGBA")
    except Exception:
        return None
    img.thumbnail((96, 96))
    raw = img.tobytes()
    solid = [(raw[i], raw[i + 1], raw[i + 2]) for i in range(0, len(raw), 4) if raw[i + 3] > 200]
    if len(solid) < 50:
        return None
    dark = [p for p in solid if max(p) < 48]
    lettering = len(dark) < len(solid) * 0.05
    coloured = [p for p in solid if min(p) <= 225 and not (lettering and max(p) < 48)]
    return median_hex(coloured if len(coloured) >= len(solid) * 0.03 else solid)


def photo_hex(url: str) -> str | None:
    """
    A rough shade from a bottle or jar photo: the median of the lower part of the picture (below the
    cap or lid), leaving out the white background and label. An estimate, and stored as one.
    """
    from PIL import Image

    status, _kind, body = fetch(url)
    if status != 200 or not body:
        return None
    try:
        img = Image.open(io.BytesIO(body)).convert("RGBA")
    except Exception:
        return None
    img.thumbnail((120, 120))
    w, h = img.size
    raw = img.crop((w // 5, int(h * 0.45), w - w // 5, int(h * 0.92))).tobytes()
    pixels = [
        (raw[i], raw[i + 1], raw[i + 2])
        for i in range(0, len(raw), 4)
        if raw[i + 3] > 200 and not (raw[i] > 232 and raw[i + 1] > 232 and raw[i + 2] > 232)
    ]
    if len(pixels) < 80:
        return None
    return median_hex(pixels)


catalog = json.load(open(os.path.join(SEED, "catalog.json")))
known = {row["id"]: row for group in ("supplies", "polishes", "tips") for row in catalog[group]}

found: dict[str, dict] = {}
rejected: collections.Counter[str] = collections.Counter()
for path in sorted(glob.glob(os.path.join(args[0], "*.json"))):
    try:
        rows = json.load(open(path))
    except json.JSONDecodeError:
        print(f"skipped {os.path.basename(path)}: not valid JSON")
        continue
    for row in rows if isinstance(rows, list) else []:
        item_id, url = row.get("id"), (row.get("imageUrl") or "").strip()
        if item_id not in known:
            rejected["unknown id"] += 1
        elif not url.startswith("https://"):
            rejected["not an https image URL"] += 1
        elif row.get("confidence") not in CONFIDENCE:
            rejected["no confidence given"] += 1
        else:
            best = found.get(item_id)
            if not best or CONFIDENCE.index(row["confidence"]) < CONFIDENCE.index(best["confidence"]):
                found[item_id] = row

uses = collections.Counter(row["imageUrl"].split("?")[0] for row in found.values())
for item_id in [i for i, row in found.items() if uses[row["imageUrl"].split("?")[0]] > MAX_SHARED]:
    del found[item_id]
    rejected["one photo shared by many items"] += 1

if NETWORK:
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        ok = dict(zip(found, pool.map(lambda i: image_ok(found[i]["imageUrl"]), list(found))))
    for item_id, good in ok.items():
        if not good:
            del found[item_id]
            rejected["image did not load"] += 1

swatch: dict[str, str] = {}
if SWATCHES:
    with_swatch = [i for i, row in found.items() if known[i]["kind"] == "polish" and (row.get("swatchUrl") or "").startswith("https://")]
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        for item_id, colour in zip(with_swatch, pool.map(lambda i: sample_hex(found[i]["swatchUrl"]), with_swatch)):
            if colour:
                swatch[item_id] = colour

# Colours with a photo and no chip: estimate the shade from the photo.
estimate: dict[str, str] = {}
if SWATCHES:
    need = [
        i
        for i, row in found.items()
        if known[i]["kind"] == "polish" and i not in swatch and not re.fullmatch(r"#[0-9a-fA-F]{6}", (row.get("colorHex") or "").strip()) and row["confidence"] != "low"
    ]
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        for item_id, colour in zip(need, pool.map(lambda i: photo_hex(found[i]["imageUrl"]), need)):
            if colour:
                estimate[item_id] = colour

out: dict[str, dict] = {}
for item_id in sorted(found):
    row = found[item_id]
    entry = {"imageUrl": row["imageUrl"].strip(), "sourceUrl": row.get("sourceUrl"), "confidence": row["confidence"]}
    stated = (row.get("colorHex") or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", stated):
        entry["colorHex"] = stated.lower()
    elif item_id in swatch:
        entry["colorHex"] = swatch[item_id]
    elif item_id in estimate:
        entry["colorHex"] = estimate[item_id]
        entry["colorFrom"] = "photo"
    if known[item_id]["kind"] == "supply" and row.get("description"):
        entry["description"] = " ".join(str(row["description"]).split())[:240]
    if row.get("upc") and upc_ok(str(row["upc"])):
        entry["upc"] = re.sub(r"\D", "", str(row["upc"]))
    if row.get("notes"):
        entry["notes"] = " ".join(str(row["notes"]).split())[:200]
    out[item_id] = entry

json.dump({"note": "Public product pages only. Images are hot-linked for the prototype.", "items": out}, open(OUT, "w"), indent=0, ensure_ascii=False)

by_kind = collections.Counter(known[i]["kind"] if known[i]["kind"] != "polish" else f"polish:{known[i]['line']}" for i in out)
totals = collections.Counter(row["kind"] if row["kind"] != "polish" else f"polish:{row['line']}" for row in known.values())
print(f"wrote {len(out)} items to {os.path.relpath(OUT, ROOT)}")
for kind in sorted(totals):
    print(f"  {kind:<20} {by_kind[kind]:>5} of {totals[kind]}")
print("  confidence:", dict(collections.Counter(row["confidence"] for row in out.values())))
print("  swatch colours from the brand:", sum(1 for row in out.values() if "colorHex" in row and "colorFrom" not in row))
print("  swatch colours estimated from the photo:", sum(1 for row in out.values() if row.get("colorFrom") == "photo"))
if rejected:
    print("  rejected:", dict(rejected))
