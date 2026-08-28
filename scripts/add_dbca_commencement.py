#!/usr/bin/env python3
"""
Add DBCA-2025-COMMENCE: the Domestic Building Contracts Amendment Act 2025
commencement date, verified against Consumer Affairs Victoria.

Why this source and not legislation.vic.gov.au: the Act's own page
(legislation.vic.gov.au/as-made/acts/domestic-building-contracts-amendment-act-2025)
is reachable and names the Act, but does NOT state the commencement date. The
"by 1 December 2026" figure appears only in the CAV news item, so that is the
only page on which this claim can be verified.

The claim is deliberately worded "by" rather than "on": the page says the laws
"will take effect by 1 December 2026", which is a ceiling, not a fixed date.

Additive and idempotent: upserts by id, touching nothing else. Run:
    python3 scripts/add_dbca_commencement.py
    python3 scripts/verify_register.py --live
"""
import json, os, sys, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fsutil
import verify_register as vr
import requests

URL = ("https://www.consumer.vic.gov.au/latest-news/"
       "new-domestic-building-contract-laws-passed-in-victoria")
NEEDLE = "take effect by 1 December 2026"
TODAY = datetime.date.today().isoformat()

TASKS = ["water-supply", "sanitary-drainage", "roofing-stormwater",
         "gasfitting", "heated-water"]


def main():
    kind, status, text, final = vr.fetch_ex(URL, session=requests.Session())
    if kind != "ok":
        sys.exit(f"fetch failed: {kind} {status} — not adding an unverified claim")
    if NEEDLE.lower() not in text.lower():
        sys.exit(f"needle {NEEDLE!r} absent — refusing to add")
    moved = not vr.same_url(final, URL)

    i = text.lower().find("the domestic building contracts amendment act 2025")
    j = text.lower().find(NEEDLE.lower())
    start = i if 0 <= i < j else j
    end = min(len(text), j + len(NEEDLE) + 2)
    quote = " ".join(text[start:end].split())

    entry = {
        "id": "DBCA-2025-COMMENCE",
        "jurisdiction": "VIC",
        "claim": ("Domestic Building Contracts Amendment Act 2025 (passed 11 September 2025) "
                  "takes effect by 1 December 2026"),
        "value": "by 1 December 2026",
        "key_substring": NEEDLE,
        "source_url": URL,
        "fails_if": ("the commencement date is deferred, fixed to a specific date, or the "
                     "Act commences early; or CAV archives this news item so the date is "
                     "no longer published here"),
        "status": "verified",
        "verified": {
            "against": final,
            "on": TODAY,
            "by_agent": f"dbca-add-{TODAY}",
            "quote": quote,
        },
        "ui": {
            "title": "New domestic building contract laws — by 1 December 2026",
            "ref": "by 1 December 2026",
            "doc": "DBC Amendment Act 2025 (CAV)",
            "obligation": "documentation",
            "tradeTasks": TASKS,
            "tags": ["domestic building", "contracts", "commencement",
                     "forthcoming", "consumer", "DBCA 2025"],
        },
    }
    if moved:
        entry["source_moved_to"] = final
        entry["next_edit"] = f"Update source_url to {final}"

    reg = json.load(open("register.json", encoding="utf-8"))
    ids = [e["id"] for e in reg["entries"]]
    if entry["id"] in ids:
        reg["entries"][ids.index(entry["id"])].update(entry)
        action = "updated"
    else:
        reg["entries"].append(entry)
        action = "added"
    reg["register_version"] = f"{TODAY}-dbca"
    reg["generated_on"] = TODAY

    fsutil.atomic_write_json("register.json", reg)
    fsutil.atomic_write_json("public/register.json", reg)
    print(f"{action} {entry['id']}; register now {len(reg['entries'])} entries "
          f"(version {reg['register_version']})")
    print(f"quote: {quote}")


if __name__ == "__main__":
    main()
