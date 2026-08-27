#!/usr/bin/env python3
"""
Add verified clause POINTERS for the AS/NZS 3500:2025 changes to register.json.

Why pointers, and why only these
--------------------------------
A pointer says *where a requirement lives* ("isolation valve location is at
AS/NZS 3500.1:2025 Clause 5.4.2"). It does not restate the requirement's
numeric value. That split matters:

  * The clause reference is a fact published on a free BPC page, so it can be
    machine-verified verbatim by scripts/verify_register.py like any other
    entry, and clause numbers are not copyrightable.
  * The numeric limit lives inside the paywalled standard. It needs a licensed
    copy and a human attestation, which this register has no evidence model
    for yet. Those are deliberately NOT added here.

Every clause reference below was extracted from the BPC "Summary of key
changes" tables for each part -- never from memory, and never from the
sibling trade-regulations-okf clause set, whose ws-1xx/san-1xx references were
found to be sequentially generated and demonstrably wrong (that set places
hot/cold separation at cl 5.4 and isolation valves at cl 8.1, where BPC states
verbatim that 5.4.2 is isolation valves before flexible hose assemblies).

This script is ADDITIVE and idempotent: it upserts by entry id and leaves every
existing entry, including its hand-maintained `ui` block, untouched. It does
NOT regenerate the register -- scripts/build_register.py predates the `ui`
blocks added in 2bb361d and would strip them.

Run: python3 scripts/add_standard_pointers.py
Then: python3 scripts/verify_register.py --live
"""
import json, os, re, sys, datetime
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fsutil

TODAY = datetime.date.today().isoformat()
AGENT = f"pointer-agent-{TODAY}"

BASE = ("https://www.bpc.vic.gov.au/plumbers/delivering-safe-and-compliant-plumbing/"
        "updated-plumbing-and-drainage-standards-asnzs-3500-series/")
PART_SLUG = {
    "1": "updated-plumbing-and-drainage-standards-part-1-water-services",
    "2": "updated-plumbing-and-drainage-standards-part-2-sanitary-plumbing-and-drainage",
    "3": "updated-plumbing-and-drainage-standards-part-3-stormwater-drainage",
    "4": "updated-plumbing-and-drainage-standards-part-4-heated-water-services",
}
PART_STD = {"1": "AS/NZS 3500.1:2025", "2": "AS/NZS 3500.2:2025",
            "3": "AS/NZS 3500.3:2025", "4": "AS/NZS 3500.4:2025"}
PART_DOC = {"1": "BPC — 3500.1 key changes", "2": "BPC — 3500.2 key changes",
            "3": "BPC — 3500.3 key changes", "4": "BPC — 3500.4 key changes"}
PART_TASK = {"1": ["water-supply"], "2": ["sanitary-drainage"],
             "3": ["roofing-stormwater"], "4": ["heated-water"]}

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Accept-Language": "en-AU,en;q=0.9",
}

# part, clause ref, short title, obligation, extra trade tasks, extra tags
POINTERS = [
    ("1", "Clause 1.3",      "Normative references — standards now called up",        "technical",  [], ["normative", "references"]),
    ("1", "Clause 2.3.1",    "Pipes and fittings — 110 mm replaces 100 mm",           "product",    [], ["pipe-sizing", "materials"]),
    ("1", "Clause 2.3.3",    "Semi-flexible hose assemblies — new restrictions",      "product",    [], ["flexible-hose", "semi-rigid"]),
    ("1", "Clause 4.4.6",    "Backflow — AVBs now testable, commissioning required",  "technical",  ["backflow"], ["backflow", "avb", "2845.3"]),
    ("1", "Clause 4.6.1",    "Backflow — AVBs must be fitted with line strainers",    "technical",  ["backflow"], ["backflow", "avb", "strainer"]),
    ("1", "Clause 4.6.2.2",  "Backflow devices — accessibility for testing",          "technical",  ["backflow"], ["backflow", "accessibility"]),
    ("1", "Clause 5.4.2",    "Isolation valve before each flexible hose assembly",    "technical",  [], ["isolation-valve", "flexible-hose"]),
    ("1", "Clause 5.20",     "Miscellaneous devices and appliances — new section",    "technical",  [], ["appliances", "devices"]),
    ("1", "Clause 9.1",      "Non-drinking water meter — consult network operator",   "technical",  [], ["water-meter", "non-drinking"]),

    ("2", "Clause 1.1",      "Scope — trade waste pre-treatment excluded",            "technical",  [], ["scope", "trade-waste"]),
    ("2", "Clause 13.21",    "Connection of tundishes — disconnector gully allowed",  "technical",  [], ["tundish"]),
    ("2", "Clause 13.24.3",  "Conversion to waterless urinals — restricted",          "technical",  [], ["waterless-urinal", "struvite"]),
    ("2", "Clause 13.28.1",  "Miscellaneous devices — new sanitary section",          "technical",  [], ["appliances", "devices"]),
    ("2", "Clause 13.28.2",  "Miscellaneous devices — materials requirement",         "product",    [], ["materials", "appliances"]),
    ("2", "Clause 13.28.3",  "Miscellaneous devices — connection to sanitary system", "technical",  [], ["connection", "tundish"]),
    ("2", "Clause 13.28.4",  "Miscellaneous devices — intermittent discharge",        "technical",  [], ["discharge", "trap-seal"]),
    ("2", "Clause 13.28.5",  "Miscellaneous devices — large-volume discharge",        "technical",  [], ["discharge", "sizing"]),
    ("2", "Clause 14.2.1",   "Multi-unit sewer infrastructure — coordinate with authority", "documentation", [], ["multi-unit", "water-authority"]),
    ("2", "Clause 16.2",     "Vacuum drainage — PP pipe now permitted",               "product",    [], ["vacuum-drainage", "materials"]),

    ("3", "Clause 2.2.1",    "Stormwater discharge quality and quantity — new note",  "technical",  [], ["discharge", "council"]),
    ("3", "Clause 2.2.2",    "Materials for devices connected to stormwater",         "product",    [], ["materials", "appliances"]),
    ("3", "Clause 3.6.2",    "Valley gutter design procedure — new Figure 3.6.2",     "technical",  [], ["valley-gutter", "design"]),
    ("3", "Clause 5.3.8.1",  "Miscellaneous devices — new stormwater section",        "technical",  [], ["appliances", "devices"]),
    ("3", "Clause 5.3.8.2",  "Device discharge to stormwater — via tundish or pit",   "technical",  [], ["tundish", "discharge"]),
    ("3", "Clause 5.3.8.3",  "Stormwater system sized for maximum discharge",         "technical",  [], ["sizing", "discharge"]),

    ("4", "Clause 2.3.1",    "Pipes and fittings — 110 mm replaces 100 mm",           "product",    [], ["pipe-sizing", "materials"]),
    ("4", "Clause 2.3.2.1",  "Flexible hose accessibility — relocated clause",        "technical",  [], ["flexible-hose", "accessibility"]),
    ("4", "Clause 2.3.3",    "Semi-flexible hose assemblies — new restrictions",      "product",    [], ["flexible-hose", "semi-rigid"]),
    ("4", "Clause 5.4.2",    "Unconcealed water storage tanks — safe trays",          "technical",  [], ["storage-tank", "safe-tray"]),
    ("4", "Clause 10.10.2",  "Isolating valve before flexible hose to mixer/tap",     "technical",  [], ["isolation-valve", "flexible-hose"]),
]


def page_text(session, part):
    r = session.get(BASE + PART_SLUG[part], headers=HEADERS, timeout=45)
    r.raise_for_status()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", r.text, flags=re.S | re.I)
    return " ".join(re.sub(r"<[^>]+>", " ", t).split())


def clause_quote(text, ref):
    """Verbatim BPC text for one clause heading, cut before the next heading."""
    i = text.find(ref)
    if i < 0:
        return None
    chunk = text[i:i + 700]
    # stop where the next clause heading begins (bare "13.28 Title" or "Clause 4.5")
    m = re.search(r"\s(?:Clause\s)?\d+\.\d+(?:\.\d+)*\s+[A-Z]", chunk[len(ref):])
    if m:
        chunk = chunk[:len(ref) + m.start()]
    chunk = " ".join(chunk.split())
    if len(chunk) > 300:
        cut = chunk.rfind(". ", 0, 300)
        chunk = chunk[:cut + 1] if cut > 120 else chunk[:300].rstrip() + "…"
    return chunk


def main():
    session = requests.Session()
    texts = {}
    for part in PART_SLUG:
        texts[part] = page_text(session, part)
        print(f"fetched part {part}: {len(texts[part])} chars")

    reg_path = "register.json"
    reg = json.load(open(reg_path, encoding="utf-8"))
    by_id = {e["id"]: e for e in reg["entries"]}
    added = updated = skipped = 0

    for part, ref, title, obligation, extra_tasks, tags in POINTERS:
        text = texts[part]
        if ref not in text:
            print(f"  SKIP {PART_STD[part]} {ref}: not present verbatim on page")
            skipped += 1
            continue
        quote = clause_quote(text, ref)
        std = PART_STD[part]
        num = ref.replace("Clause ", "")
        eid = f"PTR-{std.split()[1].split(':')[0]}-{num}"
        entry = {
            "id": eid,
            "jurisdiction": "VIC",
            "claim": f"{title} — {std} {ref}",
            "value": f"{std} {ref}",
            "key_substring": ref,
            "source_url": BASE + PART_SLUG[part],
            "fails_if": (f"BPC no longer lists {ref} among the {std} 2025-edition "
                         f"changes, or the clause is renumbered"),
            "status": "verified",
            "verified": {
                "against": BASE + PART_SLUG[part],
                "on": TODAY,
                "by_agent": AGENT,
                "quote": quote or "",
            },
            "ui": {
                "title": title,
                "ref": ref,
                "doc": PART_DOC[part],
                "obligation": obligation,
                "tradeTasks": PART_TASK[part] + extra_tasks,
                "tags": ["pointer", "2025-change", std.split()[1].split(":")[0]] + tags,
            },
        }
        if eid in by_id:
            by_id[eid].update(entry)
            updated += 1
        else:
            reg["entries"].append(entry)
            by_id[eid] = entry
            added += 1

    reg["register_version"] = f"{TODAY}-pointers"
    reg["generated_on"] = TODAY
    fsutil.atomic_write_json(reg_path, reg)
    fsutil.atomic_write_json("public/register.json", reg)
    print(f"\nadded {added}, updated {updated}, skipped {skipped}; "
          f"register now {len(reg['entries'])} entries "
          f"(version {reg['register_version']})")


if __name__ == "__main__":
    main()
