#!/usr/bin/env python3
"""Snapshots every App Store price point into ppp/data/apple-points.json. Read-only.

    <venv>/bin/python ppp/build/build_apple_points.py ~/Projects/Nasab/scripts/store_pricing

Takes a store pricing folder (like Nasab's) for its App Store Connect client, pricing.yaml and
credentials; only GET requests are made. Uses one subscription and one in-app purchase of that app
to read the subscription and one-time price ladders for every territory. Territories with an
identical ladder share one entry, which keeps the file small.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from decimal import Decimal
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "apple-points.json"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    folder = Path(sys.argv[1]).expanduser().resolve()
    sys.path.insert(0, str(folder))
    import yaml  # noqa: E402  (from the store pricing venv)
    from apple_pricing import AppStoreConnect  # noqa: E402

    cfg = yaml.safe_load((folder / "pricing.yaml").read_text())
    a = cfg["apple"]
    api = AppStoreConnect(a["key_id"], a["issuer_id"], (folder / a["private_key_path"]).read_text())
    app = api.request("GET", "/v1/apps", {"filter[bundleId]": a["bundle_id"]})["data"][0]["id"]

    groups, _ = api.get_all(f"/v1/apps/{app}/subscriptionGroups", {"limit": 50})
    sub_id = api.get_all(f"/v1/subscriptionGroups/{groups[0]['id']}/subscriptions", {"limit": 50})[0][0]["id"]
    iaps, _ = api.get_all(f"/v1/apps/{app}/inAppPurchasesV2", {"limit": 50})
    iap_id = iaps[0]["id"]

    territories, _ = api.get_all("/v1/territories", {"limit": 200})
    currency = {t["id"]: t["attributes"]["currency"] for t in territories}
    print(f"{len(currency)} territories")

    ladders: list[list[float]] = []
    index: dict[tuple, int] = {}
    out: dict[str, dict] = {"sub": {}, "iap": {}}
    for kind, path in (("sub", f"/v1/subscriptions/{sub_id}/pricePoints"),
                       ("iap", f"/v2/inAppPurchases/{iap_id}/pricePoints")):
        for n, terr in enumerate(sorted(currency), 1):
            points, _ = api.get_all(path, {"filter[territory]": terr, "limit": 8000})
            prices = sorted({Decimal(p["attributes"]["customerPrice"]) for p in points
                             if Decimal(p["attributes"]["customerPrice"]) > 0})
            key = tuple(prices)
            if key not in index:
                index[key] = len(ladders)
                ladders.append([float(p) for p in prices])
            out[kind][terr] = index[key]
            print(f"\r{kind} {n}/{len(currency)} {terr} {len(prices)} points, {len(ladders)} ladders", end="")
        print()

    OUT.write_text(json.dumps({
        "built": dt.date.today().isoformat(),
        "source": "App Store Connect API price points (customer prices)",
        "currency": currency,
        "ladders": ladders,
        "sub": out["sub"],
        "iap": out["iap"],
    }, separators=(",", ":")))
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
