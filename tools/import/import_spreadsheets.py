#!/usr/bin/env python3
"""
Import Meraki's inventory workbooks into seed JSON for the prototype.

Reads the three "Master" workbooks in references/<drop>/ and writes:
  packages/ui/data/seed/catalog.json   items, shelves, vendors, par levels, on-hand snapshot
  packages/ui/data/seed/orders.json    2026 order cycles with received dates and quantities

Usage:
  python3 -m venv .venv && .venv/bin/pip install openpyxl
  .venv/bin/python tools/import/import_spreadsheets.py [references/111426]

Staff names in the "Receiver" / "Saved By" columns are NOT written to the seed files
(the repo may be public). They are replaced with the role that performs that step.
Pass --keep-names to write an unredacted copy to data/private/ (git-ignored) instead.
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import os
import re
import sys

import openpyxl

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KEEP_NAMES = "--keep-names" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
SRC = os.path.join(ROOT, args[0] if args else "references/111426")
OUT = os.path.join(ROOT, "data/private/seed" if KEEP_NAMES else "packages/ui/data/seed")

VENDORS = {
    "nail supply store": "nail-supply-store",
    "costco/bjs": "costco-bjs",
    "amazon": "amazon",
    "dazzle dry": "dazzle-dry",
    "farmhouse fresh": "farmhouse-fresh",
    "other": "other",
    "warehouse": "warehouse",
}


def s(v) -> str:
    """Cell to trimmed string."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return re.sub(r"\s+", " ", str(v)).strip()


def num(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else float(v)
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*", str(v))
    if m:
        f = float(m.group(1))
        return int(f) if f.is_integer() else f
    return None


def flag(v):
    """Checkbox / tick cell to bool or None."""
    if isinstance(v, bool):
        return v
    t = s(v)
    if t in ("√", "✓", "x", "X", "True"):
        return True
    if t == "False":
        return False
    return None


def iso(v):
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime("%Y-%m-%d")
    return None


def slug(*parts) -> str:
    t = "-".join(p for p in (s(x) for x in parts) if p).lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:80]


def vendor_id(name: str) -> str:
    return VENDORS.get(name.strip().lower(), "other" if name.strip() else "")


def find(prefix: str) -> str:
    hits = [f for f in glob.glob(os.path.join(SRC, "*.xlsx")) if os.path.basename(f).startswith(prefix)]
    if not hits:
        sys.exit(f"No workbook starting with {prefix!r} in {SRC}")
    return hits[0]


def rows(ws):
    for i, r in enumerate(ws.iter_rows(values_only=True), start=1):
        yield i, list(r) + [None] * 24


# --------------------------------------------------------------------------- supplies


def parse_par(v):
    """'Recommended' column: a number, or a rule written as text."""
    n = num(v)
    if n is not None:
        return {"par": n, "parRule": "quantity", "parNote": None}
    t = s(v)
    if not t or isinstance(v, (dt.datetime, dt.date)):
        return {"par": None, "parRule": "unset", "parNote": None}
    low = t.lower()
    if "pause" in low:
        return {"par": None, "parRule": "paused", "parNote": t}
    if "half" in low or "1/4" in low or "low" in low:
        return {"par": None, "parRule": "level", "parNote": t}
    return {"par": None, "parRule": "unset", "parNote": t}


def import_supplies(wb, location: str):
    ws = wb["SupplyList"]
    items, area, pending_area_reset = [], "", False
    seen = {}
    all_rows = list(rows(ws))
    for idx, (i, r) in enumerate(all_rows):
        a, shelf_raw, cat, name, vendor = s(r[0]), s(r[1]), s(r[2]), s(r[3]), s(r[4])
        if name == "Item Description" or shelf_raw == "Location":
            # Repeated header: the next area label below belongs to the rows that follow.
            for _, nxt in all_rows[idx + 1 : idx + 4]:
                if s(nxt[0]):
                    area = s(nxt[0])
                    break
            continue
        if a:
            area = a
        if not name or name.endswith("Supply List"):
            continue
        shelf, shelf_label = "", ""
        m = re.match(r"^(\d[A-Z])\b\.?\s*-?\s*(.*)$", shelf_raw)
        if m:
            shelf, shelf_label = m.group(1), m.group(2).strip()
        elif shelf_raw:
            shelf_label = shelf_raw
        par = parse_par(r[8])
        on_hand = num(r[9])
        note = "" if on_hand is not None else s(r[9])
        base = slug("sup", name)
        seen[base] = seen.get(base, 0) + 1
        item_id = base if seen[base] == 1 else f"{base}-{seen[base]}"
        items.append(
            {
                "id": item_id,
                "kind": "supply",
                "name": name,
                "category": cat.strip() or "Uncategorised",
                "vendorId": vendor_id(vendor),
                "unit": s(r[7]) if num(r[7]) is None else "",
                "location": location,
                "area": area or "Unassigned",
                "shelf": shelf,
                "shelfLabel": shelf_label,
                **par,
                "onHand": on_hand,
                "reorderFlag": flag(r[5]) is True,
                "reorderQty": num(r[6]),
                "note": note or None,
                "sourceRow": i,
            }
        )
    return items


# --------------------------------------------------------------------------- polish

# Only prefixes whose meaning is unambiguous are named. The rest (BB, GB, PG, ID, MT, Z, ME, CT, MJ, NC,
# TB, EM) are Meraki's own box groups: confirm their names with the salon before labelling them.
FAMILY_CODES = {
    "WH": "Whites", "PK": "Pinks", "RD": "Reds", "OR": "Oranges", "YG": "Yellows & Greens", "BL": "Blues",
    "PP": "Purples", "NN": "Nudes & Neutrals",
}


def family_of(code: str) -> str:
    prefix = re.match(r"[A-Za-z]*", code).group(0).upper()
    return FAMILY_CODES.get(prefix) or (f"Group {prefix}" if prefix else "Ungrouped")


STAFF_NAMES: set[str] = set()


def scrub(text):
    """Remove staff first names from free-text notes unless --keep-names."""
    if not text or KEEP_NAMES:
        return text
    for n in STAFF_NAMES:
        text = re.sub(rf"(?i)\b{re.escape(n)}\b", "staff", text)
    # Notes sometimes name whose client an item is held for ("for <Name> client"). Keep the fact, drop the name.
    text = re.sub(r"\bfor\s+[A-Z][a-z]+(?:'s)?\s+client\b", "for a client", text)
    text = re.sub(r"\b[A-Z][a-z]+'s\s+client\b", "a client", text)
    return text


def polish(line, brand, code, name, **extra):
    return {
        "id": slug("pol", line, code or name),
        "kind": "polish",
        "brand": brand,
        "line": line,
        "colorCode": code,
        "name": name,
        **extra,
    }


def import_opi(wb, location):
    ws = wb["PolishInventory"]
    out, family = [], ""
    for i, r in rows(ws):
        if i < 4:
            continue
        a, code, name = s(r[0]), s(r[1]), s(r[2])
        if a and not code:
            family = a if a != "." else ""
            continue
        if not name or not code or code == "Color Code":
            continue
        out.append(
            polish(
                "opi", "OPI", code, name,
                sku=s(r[3]) or None, family=family_of(code), collection=family if len(family) > 12 else None,
                location=location, reorderFlag=flag(r[4]) is True, reorderType=s(r[5]) or None, reorderQty=num(r[6]),
                finishes={
                    "regular": {"inUse": flag(r[7]) is True, "qty": num(r[8]), "box": s(r[9]) or None},
                    "gel": {"offered": flag(r[10]) is True, "inUse": flag(r[11]) is True, "qty": num(r[12]), "box": s(r[13]) or None},
                    "dip": {"inUse": flag(r[14]) is True},
                },
                outOfStock=flag(r[15]) is True, note=s(r[16]) or None, sourceRow=i,
            )
        )
    return out


def import_simple_line(wb, sheet, line, brand, location, cols, start=3, family=None):
    """Sheets with one row per colour. `cols` maps field -> column index."""
    ws = wb[sheet]
    out, seen = [], set()
    for i, r in rows(ws):
        if i < start:
            continue
        code, name = s(r[cols["code"]]), s(r[cols["name"]])
        if not name or name.lower() in ("product name",) or code.lower() == "color code":
            continue
        if not code:
            continue
        pid = slug("pol", line, code)
        if pid in seen:
            continue
        seen.add(pid)
        g = lambda k: r[cols[k]] if k in cols else None  # noqa: E731
        out.append(
            polish(
                line, brand, code, name,
                sku=s(g("sku")) or None, family=family or (family_of(code) if line == "opi-dip" else ""), location=location,
                reorderFlag=flag(g("reorder")) is True, reorderType=s(g("type")) or None, reorderQty=num(g("qty")),
                inUse=flag(g("inuse")) is True, backstock=num(g("backstock")), box=s(g("box")) or None,
                note=s(g("note")) or None, sourceRow=i,
            )
        )
    return out


def import_apres(wb, location):
    ws = wb[" ApresInventory"]
    sizes, out, shape = None, [], ""
    for i, r in rows(ws):
        if s(r[1]).startswith("Sizes"):
            sizes = [(c, s(r[c])) for c in range(3, 17) if s(r[c])]
            continue
        if not sizes:
            continue
        if s(r[1]):
            shape = s(r[1])
        length = s(r[2])
        if not shape or not length:
            continue
        by_size = {label: num(r[c]) or 0 for c, label in sizes}
        out.append(
            {
                "id": slug("apres", shape, length), "kind": "tips", "brand": "Aprés", "line": "apres-gel-x",
                "name": f"Gel-X Tips, {shape} {length.replace('- ', '-')}", "shape": shape, "length": length.replace("- ", "-"),
                "location": location, "bySize": by_size, "total": sum(by_size.values()), "sourceRow": i,
            }
        )
    return out


# --------------------------------------------------------------------------- order cycles

SUPPLY_SECTIONS = {"nail supply store", "costco/bjs", "amazon", "other", "dazzle dry", "warehouse"}
POLISH_SECTIONS = {
    "opi polishes": "opi", "opi": "opi", "dip powder - opi": "opi-dip", "dip powder - chisel": "chisel",
    "dazzle dry polishes": "dazzle-dry", "dazzle dry": "dazzle-dry", "dnd": "dnd",
}
MONTHS = {"jan": 1, "mar": 3, "apr": 4, "jul": 7}


def receiver_role(name: str):
    if not name:
        return None
    STAFF_NAMES.add(name.strip())
    return name if KEEP_NAMES else "front-desk"


def cycle_meta(ws, kind):
    meta = {"startDate": None, "savedOn": None, "savedBy": None}
    for i, r in rows(ws):
        if i > 4:
            break
        cells = [c for c in r if c is not None]
        for j, c in enumerate(r):
            if s(c).startswith("Inventory Start Date"):
                meta["startDate"] = next((iso(x) for x in r[j + 1 : j + 4] if iso(x)), None)
            if s(c).startswith("Saved On"):
                meta["savedOn"] = next((iso(x) for x in r[j + 1 : j + 4] if iso(x)), None)
            if s(c).startswith("Saved By"):
                who = next((s(x) for x in r[j + 1 : j + 4] if s(x)), "")
                if who:
                    STAFF_NAMES.add(who.strip())
                meta["savedBy"] = (who.title() if KEEP_NAMES else "manager") if who else None
        _ = cells
    return meta


def import_supply_cycle(ws):
    lines, section = [], ""
    for i, r in rows(ws):
        if i < 3:
            continue
        b = s(r[1])
        if b.lower() in SUPPLY_SECTIONS and not s(r[2]):
            section = b
            continue
        if not b or b == "Product" or b.startswith("#REF"):
            continue
        vendor = s(r[2]) or section
        if not s(r[2]) and num(r[3]) is None and flag(r[0]) is None:
            # Free-text reminder line above the table ("SANDING BANDS").
            lines.append({"vendorId": vendor_id(section), "name": b, "qtyOrdered": None, "freeText": True, "done": False,
                          "dateReceived": None, "qtyReceived": None, "receiver": None, "note": None, "sourceRow": i})
            continue
        lines.append(
            {
                "vendorId": vendor_id(vendor), "name": b, "qtyOrdered": num(r[3]), "freeText": False, "done": flag(r[0]) is True,
                "dateReceived": iso(r[4]), "qtyReceived": num(r[5]), "receiver": receiver_role(s(r[6])), "note": s(r[7]) or None,
                "sourceRow": i,
            }
        )
    return lines


def import_polish_cycle(ws):
    lines, section = [], "opi"
    for i, r in rows(ws):
        if i < 4:
            continue
        b = s(r[1])
        if b.lower() in POLISH_SECTIONS and not s(r[2]):
            section = POLISH_SECTIONS[b.lower()]
            continue
        if b == "SKU" or (not b and not s(r[2]) and not s(r[3])):
            continue
        name, code = s(r[2]), s(r[3])
        if not name and not code and not b:
            continue
        lines.append(
            {
                "line": section, "sku": b or None, "name": name or None, "colorCode": code or None, "type": s(r[4]) or None,
                "qtyOrdered": num(r[5]), "done": flag(r[0]) is True, "dateReceived": iso(r[6]), "qtyReceived": num(r[7]),
                "receiver": receiver_role(s(r[8])), "typeReceived": s(r[9]) or None, "note": s(r[10]) or None,
                "discontinued": flag(r[11]) is True, "sourceRow": i,
            }
        )
    return lines


def import_backlog(path, location):
    wb = openpyxl.load_workbook(path, data_only=True)
    cycles = []
    for ws in wb.worksheets:
        title = ws.title.strip()
        kind = "polish" if title.upper().endswith("P") else "supply"
        month = MONTHS.get(title[:3].lower())
        meta = cycle_meta(ws, kind)
        lines = import_polish_cycle(ws) if kind == "polish" else import_supply_cycle(ws)
        cycles.append({"id": slug(location, "2026", f"{month:02d}" if month else title, kind), "location": location, "kind": kind,
                       "label": title, "month": f"2026-{month:02d}" if month else None, **meta, "lines": lines})
    return cycles


def import_newburyport_order(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Order Form"]
    date, supply, polish_lines, section, in_table = None, [], [], "", False
    for i, r in rows(ws):
        b, c = s(r[1]), s(r[2])
        if date is None and iso(r[2]):
            date = iso(r[2])
            continue
        if b.lower() in POLISH_SECTIONS and not c:
            section, in_table = POLISH_SECTIONS[b.lower()], False
            continue
        if b == "SKU":
            in_table = True
            continue
        if c in ("Warehouse", "Product") or c.startswith("Newburyport"):
            continue
        if in_table and (b or c):
            polish_lines.append({"line": section, "sku": b or None, "name": c or None, "colorCode": s(r[3]) or None, "type": s(r[4]) or None,
                                 "qtyOrdered": num(r[5]), "done": False, "dateReceived": None, "qtyReceived": None, "receiver": None,
                                 "typeReceived": None, "note": None, "discontinued": False, "sourceRow": i})
        elif not in_table and c:
            supply.append({"vendorId": "warehouse", "name": c, "qtyOrdered": num(r[3]), "freeText": num(r[3]) is None, "done": False,
                           "dateReceived": None, "qtyReceived": None, "receiver": None, "note": s(r[3]) if num(r[3]) is None and s(r[3]) else None,
                           "sourceRow": i})
    base = {"location": "newburyport", "label": "Order Form", "month": date[:7] if date else None, "startDate": date, "savedOn": None, "savedBy": None}
    return [
        {"id": "newburyport-2026-08-supply", "kind": "supply", **base, "lines": supply},
        {"id": "newburyport-2026-08-polish", "kind": "polish", **base, "lines": polish_lines},
    ]


def main():
    lyn = openpyxl.load_workbook(find("1."), data_only=True)
    loc = "lynnfield"
    supplies = import_supplies(lyn, loc)
    polishes = import_opi(lyn, loc)
    polishes += import_simple_line(lyn, "DazzleDry", "dazzle-dry", "Dazzle Dry", loc,
                                   {"code": 0, "name": 2, "sku": 3, "reorder": 4, "type": 5, "qty": 6, "inuse": 7, "backstock": 8, "box": 9, "note": 10})
    polishes += import_simple_line(lyn, "OPIDip", "opi-dip", "OPI", loc,
                                   {"code": 1, "name": 3, "sku": 5, "inuse": 6, "backstock": 7, "reorder": 8, "type": 9, "note": 10})
    polishes += import_simple_line(lyn, "Chisel", "chisel", "Chisel", loc,
                                   {"code": 0, "name": 1, "sku": 2, "inuse": 3, "backstock": 4, "reorder": 5, "type": 6, "note": 7})
    for sheet in (" DND1-560", "  DND561-782", "DNDSheer856-892"):
        polishes += import_simple_line(lyn, sheet, "dnd", "DND", loc,
                                       {"code": 0, "name": 1, "reorder": 2, "type": 3, "qty": 4, "inuse": 5, "backstock": 6, "note": 7})
    # DND codes repeat across sheets only by mistake; keep the first.
    uniq, seen = [], set()
    for p in polishes:
        if p["id"] in seen:
            continue
        seen.add(p["id"])
        uniq.append(p)
    tips = import_apres(lyn, loc)

    cycles = import_backlog(find("3."), loc) + import_newburyport_order(find("2."))

    for group in (supplies, uniq, *[c["lines"] for c in cycles]):
        for row in group:
            if row.get("note"):
                row["note"] = scrub(row["note"])

    os.makedirs(OUT, exist_ok=True)
    catalog = {
        "source": "Lynnfield Inventory List 2026 (Master)",
        "importedAt": dt.date.today().isoformat(),
        "counts": {"supplies": len(supplies), "polishes": len(uniq), "tips": len(tips)},
        "supplies": supplies,
        "polishes": uniq,
        "tips": tips,
    }
    orders = {
        "source": "Lynnfield Inventory Monthly Backlog 2026 (Master); Newburyport Inventory Order Form 2026 (Master)",
        "importedAt": dt.date.today().isoformat(),
        "namesRedacted": not KEEP_NAMES,
        "cycles": cycles,
    }
    for name, data in (("catalog.json", catalog), ("orders.json", orders)):
        with open(os.path.join(OUT, name), "w") as fh:
            json.dump(data, fh, indent=1, ensure_ascii=False)
            fh.write("\n")
    print("wrote", OUT)
    print(" supplies", len(supplies), "| polishes", len(uniq), "| tips", len(tips))
    by_line = {}
    for p in uniq:
        by_line[p["line"]] = by_line.get(p["line"], 0) + 1
    print(" polish lines", by_line)
    for c in cycles:
        got = sum(1 for l in c["lines"] if l.get("done"))
        print(f" cycle {c['id']:34s} lines={len(c['lines']):3d} received={got:3d} start={c['startDate']} saved={c['savedOn']}")


if __name__ == "__main__":
    main()
