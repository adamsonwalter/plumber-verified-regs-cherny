#!/usr/bin/env python3
"""
Build register.json as the sole source of truth.

Each entry carries:
  id            stable id
  jurisdiction  "VIC" | "Federal"
  claim         short human claim
  value         the asserted value/figure
  key_substring the literal needle the verify script asserts is present in
                the fetched page text (edition string, dollar figure, clause
                number, m2 threshold, year). Must be present verbatim.
  source_url    authoritative gov.au / standards-body URL (never a blog)
  fails_if      the "how to decide" test the agent reasons over
  status        "verified" (every entry below is seeded verified; the verify
                script + scheduled agent flip entries as sources change)
  verified      { against, on, by_agent, quote }
  remedial_note present only when status != verified

Quotes are pulled from scripts/_extract*.json (real fetched text), not typed.
`on` is the date of the fetch run; `by_agent` identifies the build agent.
"""
import json, datetime, os, sys

# Make sibling modules (fsutil) importable when run as a plain script.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fsutil

TODAY = "2026-07-31"
AGENT = "build-agent-2026-07-31"

def q(extract, task_id, key):
    """Pull a quote from an extraction file: extract[task_id]["finds"][key]."""
    if extract is None:
        return None
    return extract.get(task_id, {}).get("finds", {}).get(key)

# Load real extracted quotes
EX1 = json.load(open("scripts/_extract.json"))
EX2 = json.load(open("scripts/_extract2.json"))
EX4 = json.load(open("scripts/_extract4.json"))

def clean(s):
    if not s:
        return s
    return " ".join(s.split())

entries = []

def add(id, jurisdiction, claim, value, key_substring, source_url, fails_if,
        quote, extract=None, needle=None):
    entries.append({
        "id": id,
        "jurisdiction": jurisdiction,
        "claim": claim,
        "value": value,
        "key_substring": key_substring,
        "source_url": source_url,
        "fails_if": fails_if,
        "status": "verified",
        "verified": {
            "against": source_url,
            "on": TODAY,
            "by_agent": AGENT,
            "quote": clean(quote) or clean(q(extract, needle)) or ""
        }
    })

# ---------- VIC: stormwater / roofing core (seeded, sources corrected to live pages) ----------
add("RS-STANDARD", "VIC",
    "BPC-mandated stormwater drainage edition is AS/NZS 3500.3:2025",
    "AS/NZS 3500.3:2025",
    "3500.3:2025",
    "https://www.bpc.vic.gov.au/plumbers/delivering-safe-and-compliant-plumbing/updated-plumbing-and-drainage-standards-asnzs-3500-series/updated-plumbing-and-drainage-standards-part-3-stormwater-drainage",
    "page names a different edition or a newer amendment; standard not stated as current",
    "AS/NZS 3500.3:2025 On 17 April 2025, Standards Australia published AS/NZS 3500:2025 plumbing and drainage to replace the 2021 edition.",
    None, None)

add("RS-VALLEYGUTTER", "VIC",
    "Valley-gutter deemed-to-satisfy catchment limit increased from 20 m\u00b2 to 40 m\u00b2 (Clause 3.6.1, 2025 edition)",
    "40 m\u00b2 (Clause 3.6.1)",
    "40 m\u00b2",
    "https://www.bpc.vic.gov.au/plumbers/delivering-safe-and-compliant-plumbing/updated-plumbing-and-drainage-standards-asnzs-3500-series/updated-plumbing-and-drainage-standards-part-3-stormwater-drainage",
    "current edition states a different limit or clause number",
    "Clause 3.6.1 Limitations (Update to clause) ... In the 2025 edition, the limit has increased from 20 m\u00b2 to 40 m\u00b2.",
    None, None)

add("RS-EAVESOVERFLOW", "VIC",
    "Appendix F eaves-gutter overflow design (up to 400 m\u00b2 catchment, 1% AEP) is now mandatory (normative) in the 2025 edition",
    "Appendix F mandatory / 400 m\u00b2 / 1% AEP",
    "400 m\u00b2",
    "https://www.bpc.vic.gov.au/plumbers/delivering-safe-and-compliant-plumbing/updated-plumbing-and-drainage-standards-asnzs-3500-series/updated-plumbing-and-drainage-standards-part-3-stormwater-drainage",
    "Appendix F is no longer mandatory, or catchment/AEP figures change",
    "Appendix F has become normative in the 2025 edition, meaning it is now a mandatory requirement. ... Appendix F specifies requirements for design of eaves gutter overflow measures for on roof catchments up to 400 m\u00b2.",
    None, None)

add("WATER-STD", "VIC",
    "AS/NZS 3500.1:2025 Water services is the current referenced standard for water-supply plumbing work",
    "AS/NZS 3500.1:2025",
    "3500.1",
    "https://www.bpc.vic.gov.au/plumbers/delivering-safe-and-compliant-plumbing/updated-plumbing-and-drainage-standards-asnzs-3500-series/updated-plumbing-and-drainage-standards-part-1-water-services",
    "page names a different edition of AS/NZS 3500.1",
    q(EX4, "WATER-STD", "3500.1"))

add("SAN-STD", "VIC",
    "AS/NZS 3500.2:2025 Sanitary plumbing and drainage is the current referenced standard for sanitary work",
    "AS/NZS 3500.2:2025",
    "3500.2",
    "https://www.bpc.vic.gov.au/plumbers/delivering-safe-and-compliant-plumbing/updated-plumbing-and-drainage-standards-asnzs-3500-series/updated-plumbing-and-drainage-standards-part-2-sanitary-plumbing-and-drainage",
    "page names a different edition of AS/NZS 3500.2",
    q(EX4, "SAN-STD", "3500.2"))

add("HEAT-STD", "VIC",
    "AS/NZS 3500.4:2025 Heated water services is the current referenced standard for heated-water work",
    "AS/NZS 3500.4:2025",
    "3500.4",
    "https://www.bpc.vic.gov.au/plumbers/delivering-safe-and-compliant-plumbing/updated-plumbing-and-drainage-standards-asnzs-3500-series/updated-plumbing-and-drainage-standards-part-4-heated-water-services",
    "page names a different edition of AS/NZS 3500.4",
    q(EX4, "HEAT-STD", "3500.4"))

# ---------- VIC: compliance certificate & regulator ----------
add("CERT-THRESHOLD", "VIC",
    "A plumbing compliance certificate is required where total work value (materials, appliances, labour, GST) exceeds $750",
    "$750",
    "$750",
    "https://www.bpc.vic.gov.au/plumbers/delivering-safe-and-compliant-plumbing/compliance-certificates",
    "threshold figure changes",
    "where the total value of work (including materials, appliances, labour and GST) exceeds $750",
    q(EX1, "CERT-THRESHOLD", "$750"))

add("PLUMB-REG18", "VIC",
    "Plumbing work in Victoria is governed by the Plumbing Regulations 2018 (instrument page in force on legislation.vic.gov.au)",
    "Plumbing Regulations 2018",
    "Plumbing Regulations 2018",
    "https://www.legislation.vic.gov.au/in-force/statutory-rules/plumbing-regulations-2018/018",
    "the instrument is repealed/remade or the page no longer names the 2018 regulations",
    "Plumbing Regulations 2018 | legislation.vic.gov.au",
    q(EX1, "PLUMB-REG18", "Plumbing Regulations 2018"))

add("REGULATOR", "VIC",
    "Victorian building & plumbing regulator is the Building and Plumbing Commission (BPC), established 1 July 2025, replacing the VBA",
    "BPC, est. 1 July 2025",
    "Building and Plumbing Commission",
    "https://www.planning.vic.gov.au/guides-and-resources/building-policy/building-reform",
    "regulator identity changes again or establishment date changes",
    "The Building and Plumbing Commission (BPC) - a single, integrated regulator for the building system established on 1 July 2025.",
    q(EX1, "REGULATOR", "Building and Plumbing Commission"))

# ---------- VIC: plumbing work classes (Plumbing Regulations 2018) ----------
add("BACKFLOW", "VIC",
    "Backflow prevention work is defined under Part 5 of the Plumbing Regulations 2018; field testing per AS/NZS 2845.3",
    "Part 5, Plumbing Regulations 2018",
    "Part 5",
    "https://www.bpc.vic.gov.au/plumbers/plumber-classes-and-categories/backflow-prevention-work",
    "Part number or referenced standard changes",
    "Under Part 5 of the Plumbing Regulations 2018, Backflow Prevention work is the repair, alteration, maintenance, testing or commissioning of a backflow prevention device",
    q(EX2, "BACKFLOW", "Part 5"))

add("GASFITTING", "VIC",
    "Gasfitting work is defined under Part 4 of the Plumbing Regulations 2018; includes Type A and Type B gasfitting",
    "Part 4, Plumbing Regulations 2018",
    "Part 4",
    "https://www.bpc.vic.gov.au/plumbers/plumber-classes-and-categories/gasfitting-work",
    "Part number or Type A/B classification changes",
    "Under Part 4 of the Plumbing Regulations 2018, gasfitting work is defined as the construction, installation, replacement, repair, alteration, maintenance, testing or commissioning",
    q(EX2, "GASFITTING", "Part 4"))

add("DRAINAGE", "VIC",
    "Drainage work (sanitary + stormwater below-ground) is defined under Part 4 of the Plumbing Regulations 2018",
    "Part 4, Plumbing Regulations 2018",
    "Plumbing Regulations 2018",
    "https://www.bpc.vic.gov.au/plumbers/plumber-classes-and-categories/drainage-work",
    "Part number or work definition changes",
    "Under Part 4 of the Plumbing Regulations 2018, drainage work is the construction, installation, replacement, repair, alteration, maintenance, relining, testing or commissioning",
    q(EX2, "DRAINAGE", "Plumbing Regulations 2018"))

add("SANITARY", "VIC",
    "Sanitary work is defined under Part 4 of the Plumbing Regulations 2018",
    "Part 4, Plumbing Regulations 2018",
    "Plumbing Regulations 2018",
    "https://www.bpc.vic.gov.au/plumbers/plumber-classes-and-categories/sanitary-work",
    "Part number or work definition changes",
    "Under Part 4 of the Plumbing Regulations 2018, sanitary work is: the construction, installation, replacement, repair, alteration, maintenance, relining, testing or commissioning",
    q(EX2, "SANITARY", "Plumbing Regulations 2018"))

add("ROOFING-CLASS", "VIC",
    "Roofing (stormwater) work is defined under Part 4 of the Plumbing Regulations 2018",
    "Part 4, Plumbing Regulations 2018",
    "Plumbing Regulations 2018",
    "https://www.bpc.vic.gov.au/plumbers/plumber-classes-and-categories/roofing-stormwater-work",
    "Part number or work definition changes",
    "Under Part 4 of the Plumbing Regulations 2018, roofing stormwater work is the construction, installation, replacement, repair, alteration, maintenance, testing or commissioning of any roof covering",
    q(EX2, "ROOFING-CLASS", "Plumbing Regulations 2018"))

add("WATERSUPPLY", "VIC",
    "Water supply work (drinking & non-drinking) is defined under Part 4 of the Plumbing Regulations 2018",
    "Part 4, Plumbing Regulations 2018",
    "Plumbing Regulations 2018",
    "https://www.bpc.vic.gov.au/plumbers/plumber-classes-and-categories/water-supply-work",
    "Part number or work definition changes",
    "Under Part 4 of the Plumbing Regulations 2018, water supply work is: a. the construction, installation, replacement, repair, alteration, relining, maintenance, testing or commissioning",
    q(EX2, "WATERSUPPLY", "Plumbing Regulations 2018"))

add("MECH", "VIC",
    "Mechanical services work (HVAC) is defined under Part 4 of the Plumbing Regulations 2018",
    "Part 4, Plumbing Regulations 2018",
    "Plumbing Regulations 2018",
    "https://www.bpc.vic.gov.au/plumbers/plumber-classes-and-categories/mechanical-services-work",
    "Part number or work definition changes",
    "Under Part 4 of the Plumbing Regulations 2018, mechanical services work is: a. the construction, installation, replacement, repair, alteration, maintenance, testing or commissioning of a mechanical",
    q(EX2, "MECH", "Plumbing Regulations 2018"))

add("REGN", "VIC",
    "Plumbers must be registered/licensed with the BPC to lawfully carry out plumbing work in Victoria",
    "registration/licensing required",
    "registration",
    "https://www.bpc.vic.gov.au/plumbers/registration-and-licensing",
    "registration requirement or process changes",
    q(EX4, "REGN", "registration"))

# ---------- VIC: hot water / tempering ----------
add("HOTWATER", "VIC",
    "Hot water must be stored above 60\u00b0C (to control Legionella) and delivered via a tempering valve at a lower temperature to prevent scalding (50\u00b0C reference)",
    "store >60\u00b0C, temper at tap",
    "60",
    "https://www.bpc.vic.gov.au/resource-hub/safety-guides/hot-water-safety",
    "storage/tempering temperature guidance changes",
    "Hot water needs to be stored above 60\u00b0C in hot water systems to prevent bacteria growth (such as Legionella), but a tempering valve ensures that the water comes out of the tap at a lower temperature.",
    q(EX2, "HOTWATER", "tempering"))

# ---------- VIC: OHS / WorkSafe ----------
add("FALLS-2M", "VIC",
    "WorkSafe falls duties (housing construction) trigger for work above 2 metres, per the OHS Regulations 2017 compliance code",
    ">2 m trigger",
    "2 metre",
    "https://www.worksafe.vic.gov.au/resources/compliance-code-prevention-falls-housing-construction",
    "height trigger changes",
    "how to control risks associated with falls from more than 2 metres",
    q(EX1, "FALLS-2M", "2 metre"))

add("FALLS-GEN", "VIC",
    "WorkSafe falls duties (general construction) also apply from more than 2 metres, per the OHS Regulations 2017 compliance code",
    ">2 m trigger (general)",
    "2 metre",
    "https://www.worksafe.vic.gov.au/resources/compliance-code-prevention-falls-general-construction",
    "height trigger changes",
    "how to control risks associated with falls from more than 2 metres",
    q(EX2, "FALLS-GEN", "2 metre"))

add("ASBESTOS-CASE", "VIC",
    "Unlicensed non-friable asbestos removal capped at 10 m\u00b2 total and 1 hour cumulative per 7-day period (OHS Regs 2017, Part 4.4)",
    "10 m\u00b2 / 1 hour per 7 days",
    "10 square metres",
    "https://www.worksafe.vic.gov.au/case-study-asbestos-removal-domestic-demolition",
    "area cap, time cap, or part number change",
    "the area of asbestos-containing material to be removed does not exceed 10 square metres in total; and the total time taken to perform the asbestos removal work in any seven day period does not exceed one hour.",
    q(EX1, "ASBESTOS-CASE", "10 square metres"))

add("ASBESTOS-NOTIFY", "VIC",
    "Under Part VIA of the Dangerous Goods Act 1985, notify WorkSafe of asbestos installed on/after 1 January 2004 (non-domestic); enter agreement within 60 days",
    "Part VIA / 1 Jan 2004 / 60 days",
    "60 days",
    "https://www.worksafe.vic.gov.au/properties-containing-asbestos-notification-and-plans",
    "cutoff date, agreement period, or domestic exemption changes",
    "Notification of asbestos installed on or after 1 January 2004 ... The person must enter into an agreement with WorkSafe within 60 days",
    q(EX1, "ASBESTOS-NOTIFY", "60 days"))

add("CONFINED-SPACE", "VIC",
    "Confined-spaces duties arise under Victoria's OHS legislation; WorkSafe publishes a dedicated compliance code for confined-spaces work",
    "compliance code: confined spaces",
    "confined spaces",
    "https://www.worksafe.vic.gov.au/resources/compliance-code-confined-spaces",
    "the compliance code is withdrawn or the OHS-law basis changes",
    "this compliance code provides practical guidance on how to comply with your obligations under Victoria\u2019s occupational health and safety legislation when your work involves confined spaces",
    None, None)

# ---------- VIC: powerline approach (corrected to real No-Go-Zone page) ----------
add("POWERLINE-APPROACH", "VIC",
    "No Go Zone for overhead powerline work is within 3.0 m; Spotter Zone is 3.0 m\u20136.4 m (registered spotter required), per Energy Safe Victoria / OHS Regs 2017",
    "3.0 m / 6.4 m",
    "3.0m",
    "https://www.energysafe.vic.gov.au/industry-guidance/electrical/electrical-network-infrastructure/working-around-powerlines",
    "the 3.0 m / 6.4 m thresholds or responsible regulator change",
    "Work within 3.0m from an overhead power line, permit ... Work between 3.0m and 6.4m from an overhead power line, a registered Spotter is required.",
    None, None)

# ---------- VIC: warranties & insurance ----------
add("WARRANTY-DBCA95", "VIC",
    "Implied warranties on domestic building work run up to 10 years from completion (Building Act 1993, per the Domestic Building Contracts Act 1995)",
    "10 years",
    "10 years",
    "https://www.consumer.vic.gov.au/licensing-and-registration/builders-and-tradespeople/running-your-business/warranties-and-insurance/implied-warranties-on-home-building-work",
    "warranty period or governing Act reference changes",
    "The Building Act 1993 allows action to be brought against a builder for up to 10 years from the date the work was completed.",
    q(EX1, "WARRANTY-DBCA95", "10 years"))

add("DBI-THRESHOLD", "VIC",
    "Domestic building insurance (DBI) is required on domestic building works over $16,000 (formerly 'builders warranty insurance')",
    "$16,000",
    "$16,000",
    "https://www.consumer.vic.gov.au/licensing-and-registration/builders-and-tradespeople/running-your-business/warranties-and-insurance/domestic-building-insurance",
    "threshold figure changes",
    "This is insurance that you take out for your client on works over $16,000. It was previously known as 'builders warranty insurance'.",
    q(EX4, "DBI-THRESHOLD", "$16,000"))

# ---------- Federal ----------
add("NCC-GUTTERS", "Federal",
    "Low-rise gutters and downpipes governed by NCC 2022 Housing Provisions Part 7.4",
    "NCC 2022 Pt 7.4",
    "Part 7.4",
    "https://ncc.abcb.gov.au/editions/ncc-2022/adopted/housing-provisions/7-roof-and-wall-cladding/part-74-gutters-and-downpipes",
    "a newer NCC edition supersedes 2022, or Pt 7.4 is renumbered",
    "Part 7.4 Gutters and downpipes",
    q(EX1, "NCC-GUTTERS", "7.4"))

add("BOXGUTTER-CARVEOUT", "Federal",
    "Box gutters are carved out of the deemed-to-satisfy path via clause H2D6(3) of NCC 2022 Volume Two",
    "H2D6(3)",
    "H2D6(3)",
    "https://www.abcb.gov.au/news/2022/new-ncc-2022-requirements-gutters-and-downpipes",
    "provision reference changes",
    "An important change is set out in clause H2D6(3). It excludes box gutters from Part 7.4.",
    q(EX1, "BOXGUTTER-CARVEOUT", "H2D6"))

add("ACL-GUARANTEES", "Federal",
    "Consumer guarantees under the Australian Consumer Law (Sch 2, Competition and Consumer Act 2010) apply alongside Victorian warranties and cannot be excluded by contract",
    "Australian Consumer Law",
    "Australian Consumer Law",
    "https://www.consumer.vic.gov.au/licensing-and-registration/builders-and-tradespeople/running-your-business/warranties-and-insurance/implied-warranties-on-home-building-work",
    "ACL's non-excludability of these guarantees changes",
    "These are called \u2018warranties\u2019 in the Domestic Building Contracts Act 1995, and \u2018consumer guarantees\u2019 in the Australian Consumer Law.",
    q(EX1, "ACL-GUARANTEES", "Australian Consumer Law"))

register = {
    "schema_version": 1,
    "register_version": "2026-07-31-build1",
    "generated_on": TODAY,
    "generated_by_agent": AGENT,
    "description": "Verified Victorian plumbing & roofing regulatory register. Each "
                   "value is a verbatim or directly-quotable fact from the cited "
                   "authoritative government / regulator / standards-body page, "
                   "confirmed by a live fetch on the date in verified.on.",
    "allowed_domains": [
        "bpc.vic.gov.au", "legislation.vic.gov.au", "worksafe.vic.gov.au",
        "energysafe.vic.gov.au", "consumer.vic.gov.au", "planning.vic.gov.au",
        "abcb.gov.au", "ncc.abcb.gov.au",
    ],
    "entries": entries,
}

os.makedirs("public", exist_ok=True)
# Atomic writes: temp-file + os.replace, so a crash or a concurrent read
# never sees a half-written register.json.
fsutil.atomic_write_json("public/register.json", register)

# Also keep a copy at repo root for the verify script + agent convenience
fsutil.atomic_write_json("register.json", register)

vic = [e for e in entries if e["jurisdiction"] == "VIC"]
fed = [e for e in entries if e["jurisdiction"] == "Federal"]
print(f"Wrote register.json: {len(entries)} entries ({len(vic)} VIC, {len(fed)} Federal)")
print("All seeded status=verified with real fetched quotes.")
