#!/usr/bin/env python3
"""Builds ppp/data/countries.json and ppp/data/rates.json for the PPP price tool. Stdlib only.

    python3 ppp/build/build_data.py APPLE_PLAN.csv PLAY_PLAN.csv IMF_FOLDER
    python3 ppp/build/build_data.py --rates-only

The two CSVs are `plan` outputs of a store pricing script (columns: store, product, region,
currency, ...): they give every App Store territory (ISO 3166 alpha-3) and Google Play region
(alpha-2) and the currency each store bills it in. IMF_FOLDER holds NGDPD.json and PPPGDP.json, opened in a browser
and saved from https://www.imf.org/external/datamapper/api/v1/<code>. Sources:

- World Bank WDI: PA.NUS.PPP (PPP conversion factor, GDP) / PA.NUS.FCRF (official exchange rate)
  = price level ratio, using the latest year where both exist.
- IMF World Economic Outlook (DataMapper): NGDPD / PPPGDP, the same ratio, for economies the World
  Bank doesn't cover (e.g. Taiwan).
- fawazahmed0/currency-api for an FX snapshot (the page fetches live rates; this is the fallback).

Tiers are fixed cut-offs on the ratio (TIERS below); each tier's multiplier is the median ratio of
its countries, rounded to 0.05. No hand edits per country.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import statistics
import sys
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data"

# Lower bound of each tier's price level ratio (1.0 = US prices). Tier 5 takes everything below.
TIERS = [
    {"id": 1, "name": "Full price", "min": 0.75},
    {"id": 2, "name": "High", "min": 0.55},
    {"id": 3, "name": "Upper middle", "min": 0.40},
    {"id": 4, "name": "Lower middle", "min": 0.28},
    {"id": 5, "name": "Low", "min": 0.0},
]
FIRST_YEAR, LAST_YEAR = 2019, 2025
DISAGREE = 0.2  # see the World Bank / IMF check in main()

# Alpha-3 codes the World Bank country list doesn't map to alpha-2.
EXTRA_A3 = {"TWN": "TW", "AIA": "AI", "MSR": "MS", "XKX": "XK", "XKS": "XK", "VGB": "VG", "COK": "CK"}

UA = {"User-Agent": "ppp-build/1.0", "Accept": "application/json"}


def get_json(url: str):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def wb_indicator(code: str) -> dict[str, dict[int, float]]:
    url = (f"https://api.worldbank.org/v2/country/all/indicator/{code}"
           f"?format=json&date={FIRST_YEAR}:{LAST_YEAR}&per_page=20000")
    data = get_json(url)[1] or []
    out: dict[str, dict[int, float]] = {}
    for row in data:
        if row["value"] is not None and row["countryiso3code"]:
            out.setdefault(row["countryiso3code"], {})[int(row["date"])] = float(row["value"])
    return out


def imf_indicator(folder: str, code: str) -> dict[str, dict[int, float]]:
    # Saved by hand: the IMF refuses scripts and asks for permission before automated bulk downloads.
    data = json.loads((Path(folder) / f"{code}.json").read_text())["values"][code]
    return {c: {int(y): float(v) for y, v in years.items() if v is not None} for c, years in data.items()}


def read_plan(path: str) -> dict[str, str]:
    """{region: currency} from a store plan CSV."""
    with open(path, newline="") as f:
        return {row["region"]: row["currency"] for row in csv.DictReader(f)}


def tier_of(ratio: float | None) -> int:
    if ratio is None:
        return 1
    for t in TIERS:
        if ratio >= t["min"]:
            return t["id"]
    return TIERS[-1]["id"]


def write_rates(countries: list[dict]) -> None:
    """Refreshes rates.json, the saved copy the page uses only when live rates can't be reached."""
    print("Fetching FX snapshot...")
    rates = get_json("https://latest.currency-api.pages.dev/v1/currencies/usd.min.json")
    needed = sorted({c for r in countries for c in (r["apple"], r["play"]) if c})
    missing = [c for c in needed if c.lower() not in rates["usd"]]
    if missing:
        sys.exit(f"error: FX snapshot lacks {missing}")
    (OUT / "rates.json").write_text(json.dumps({
        "date": rates["date"], "source": "fawazahmed0/currency-api",
        "usd": {c: rates["usd"][c.lower()] for c in needed},
    }, separators=(",", ":")))
    print(f"rates.json: {rates['date']}")


def main() -> None:
    if sys.argv[1:] == ["--rates-only"]:
        write_rates(json.loads((OUT / "countries.json").read_text())["countries"])
        return
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    apple = read_plan(sys.argv[1])
    play = read_plan(sys.argv[2])

    wb_countries = get_json("https://api.worldbank.org/v2/country?format=json&per_page=400")[1]
    a3_to_a2 = {c["id"]: c["iso2Code"] for c in wb_countries if len(c["iso2Code"]) == 2}
    a3_to_a2.update(EXTRA_A3)
    a2_to_a3 = {v: k for k, v in a3_to_a2.items() if k != "XKS"}

    rows: dict[str, dict] = {}
    for a3, cur in apple.items():
        a2 = a3_to_a2.get(a3)
        if not a2:
            sys.exit(f"error: no alpha-2 for App Store territory {a3}; add it to EXTRA_A3.")
        rows.setdefault(a2, {"a2": a2, "a3": a3})["apple"] = cur
    for a2, cur in play.items():
        if a2.startswith("OTHER_"):  # Play's "rest of world" price buckets, not countries
            continue
        # Play-only regions without a World Bank code (e.g. Vatican City) keep a3 = None.
        rows.setdefault(a2, {"a2": a2, "a3": a2_to_a3.get(a2)})["play"] = cur

    print("Fetching World Bank data...")
    ppp, fx = wb_indicator("PA.NUS.PPP"), wb_indicator("PA.NUS.FCRF")
    gni = wb_indicator("NY.GNP.PCAP.CD")
    imf_usd, imf_ppp = imf_indicator(sys.argv[3], "NGDPD"), imf_indicator(sys.argv[3], "PPPGDP")

    for r in rows.values():
        a3 = a2_to_a3.get(r["a2"], r["a3"])  # World Bank code (Apple uses XKS for Kosovo, WB XKX)
        r.setdefault("apple", None)
        r.setdefault("play", None)
        r["ratio"] = r["src"] = r["year"] = None
        imf_years = sorted(y for y in set(imf_usd.get(a3, {})) & set(imf_ppp.get(a3, {})) if y <= LAST_YEAR)
        imf_ratio = {y: imf_usd[a3][y] / imf_ppp[a3][y] for y in imf_years if imf_ppp[a3][y]}
        years = sorted(set(ppp.get(a3, {})) & set(fx.get(a3, {})), reverse=True)
        if years:
            y = years[0]
            wb_ratio = ppp[a3][y] / fx[a3][y]
            # The two sources should agree closely. A gap over DISAGREE is almost always a currency
            # redenomination mixed into one World Bank series (e.g. Bulgaria's PPP already in euro
            # while its exchange rate is still in lev), so the IMF figure is used instead.
            if y in imf_ratio and abs(imf_ratio[y] / wb_ratio - 1) > DISAGREE:
                r.update(ratio=round(imf_ratio[y], 3), src="IMF", year=y,
                         note=f"World Bank gives {wb_ratio:.3f}, IMF {imf_ratio[y]:.3f}; IMF used")
            else:
                r.update(ratio=round(wb_ratio, 3), src="WB", year=y)
        elif imf_ratio:
            y = max(imf_ratio)
            r.update(ratio=round(imf_ratio[y], 3), src="IMF", year=y)
        g = gni.get(a3, {})
        r["gni"] = round(g[max(g)]) if g else None
        r["tier"] = tier_of(r["ratio"])

    tiers = []
    for i, t in enumerate(TIERS):
        members = [r["ratio"] for r in rows.values() if r["tier"] == t["id"] and r["ratio"] is not None]
        median = statistics.median(members) if members else 1.0
        mult = 1.0 if t["id"] == 1 else round(round(median * 20) / 20, 2)
        tiers.append({**t, "max": None if i == 0 else TIERS[i - 1]["min"], "mult": mult,
                      "count": sum(1 for r in rows.values() if r["tier"] == t["id"])})

    countries = sorted(rows.values(), key=lambda r: r["a2"])
    built = dt.date.today().isoformat()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "countries.json").write_text(json.dumps({
        "built": built,
        "sources": {
            "ppp": f"World Bank WDI PA.NUS.PPP / PA.NUS.FCRF, latest year {FIRST_YEAR}-{LAST_YEAR}",
            "ppp_fallback": "IMF World Economic Outlook NGDPD / PPPGDP",
            "gni": "World Bank WDI NY.GNP.PCAP.CD (Atlas method, current USD)",
            "stores": "App Store Connect and Google Play Console price exports",
        },
        "tiers": tiers,
        "countries": countries,
    }, separators=(",", ":"), ensure_ascii=False))

    write_rates(countries)

    print(f"\n{len(countries)} countries ({sum(1 for r in countries if r['apple'])} App Store, "
          f"{sum(1 for r in countries if r['play'])} Play), built {built}")
    for t in tiers:
        names = sorted(r["a2"] for r in countries if r["tier"] == t["id"])
        print(f"Tier {t['id']} {t['name']:13} >= {t['min']:.2f}  x{t['mult']:.2f}  {t['count']:3}  {' '.join(names)}")
    nodata = [r["a2"] for r in countries if r["ratio"] is None]
    imf = [r["a2"] for r in countries if r["src"] == "IMF"]
    for r in countries:
        if r.get("note"):
            print(f"{r['a2']}: {r['note']}")
    print(f"IMF: {' '.join(imf) or '-'}\nNo PPP data (kept in tier 1): {' '.join(nodata) or '-'}")


if __name__ == "__main__":
    main()
