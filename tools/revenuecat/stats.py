#!/usr/bin/env python3
"""Read-only RevenueCat stats per project. GET requests only; key from env only.

Usage: python3 tools/revenuecat/stats.py [app ...] [--out DIR] [--no-save]\nKeys (env or tools/revenuecat/.env): REVENUECAT_API_KEY_SPLITUP / _NASAB / _MISBAHA / _MYDEEN / _KADAK (one per project)
"""
import html
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.revenuecat.com"
API = BASE + "/v2"
DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snapshots")


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def get(path, key, params=None, retries=5):
    url = path if path.startswith("http") else API + path
    if path.startswith("/v2/"):  # next_page links come back as absolute paths
        url = BASE + path
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, method="GET", headers={
        "Authorization": "Bearer " + key, "Accept": "application/json"})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:
                msg = json.loads(body).get("message") or body
            except ValueError:
                msg = body[:200]
            if e.code == 429 and attempt < retries:
                wait = float(e.headers.get("Retry-After") or 2 ** attempt)
                print(f"  rate limited, retrying in {wait:g}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise ApiError(e.code, msg)
        except urllib.error.URLError as e:
            raise ApiError(0, f"network error: {e.reason}")


def get_all(path, key, params=None):
    params = dict(params or {}, limit=100)
    items, page = [], get(path, key, params)
    while True:
        items += page.get("items", [])
        nxt = page.get("next_page")
        if not nxt:
            return items
        page = get(nxt, key)


def explain(e, what, perm):
    if e.status in (401, 403):
        return f"{what}: not available ({e.status}). The key likely lacks the `{perm}` permission."
    if e.status == 404:
        return f"{what}: not found (404)."
    return f"{what}: error {e.status}: {e}"


def fmt(v):
    if isinstance(v, float) and not v.is_integer():
        return f"{v:,.2f}"
    return f"{int(v):,}" if isinstance(v, (int, float)) else str(v)


def table(rows, headers):
    widths = [max(len(str(x)) for x in col) for col in zip(headers, *rows)]
    line = lambda r: "  " + "  ".join(str(c).ljust(w) for c, w in zip(r, widths)).rstrip()
    print(line(headers))
    print(line(["-" * w for w in widths]))
    for r in rows:
        print(line(r))


def project_stats(p, key):
    out = {"id": p["id"], "name": p.get("name"), "errors": []}
    pid = p["id"]
    for field, path, perm, fetch in (
        ("metrics", f"/projects/{pid}/metrics/overview", "charts_metrics:overview:read", get),
        ("products", f"/projects/{pid}/products", "project_configuration:products:read", get_all),
        ("offerings", f"/projects/{pid}/offerings", "project_configuration:offerings:read", get_all),
    ):
        try:
            out[field] = fetch(path, key)
        except ApiError as e:
            out[field] = None
            out["errors"].append(explain(e, field, perm))
    return out


def show(s):
    print(f"\n== {s['name']} ({s['id']}) ==")
    m = s["metrics"]
    if m:
        cur = m.get("currency", "")
        rows = []
        for x in m.get("metrics", []):
            period = "now" if x.get("period") == "P0D" else "28d" if x.get("period") == "P28D" else x.get("period")
            unit = x.get("unit") or ""
            rows.append([x.get("name") or x["id"], fmt(x["value"]), (cur if unit == "$" else unit), period])
        table(rows, ["Metric", "Value", "Unit", "Period"])
    prods = s["products"]
    if prods is not None:
        subs = [p for p in prods if p.get("type") == "subscription"]
        print(f"\n  Products: {len(prods)} total, {len(subs)} subscriptions, "
              f"{sum(p.get('state') == 'active' for p in prods)} active")
        print("  (Per-product sales/revenue is not in the overview endpoint, so no ranking is shown.)")
        table([[p.get("display_name") or p.get("store_identifier"), p.get("type"),
                (p.get("subscription") or {}).get("duration") or "", p.get("state")]
               for p in prods[:15]], ["Product", "Type", "Duration", "State"])
        if len(prods) > 15:
            print(f"  ... and {len(prods) - 15} more")
    offs = s["offerings"]
    if offs is not None:
        print("\n  Offerings: " + (", ".join(
            o.get("lookup_key", "?") + ("*" if o.get("is_current") else "") for o in offs) or "none")
            + ("   (* = current)" if offs else ""))
    for err in s["errors"]:
        print("  ! " + err)


def load_env_file():
    """Load tools/revenuecat/.env (gitignored). Real environment variables win."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.isfile(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip("\"'")
            if v:
                os.environ.setdefault(k.strip(), v)


APPS = ["splitup", "nasab", "misbaha", "mydeen", "kadak"]


def load_keys(selected):
    """One V2 key per RevenueCat project: REVENUECAT_API_KEY_<APP>, plus optional REVENUECAT_API_KEY."""
    load_env_file()
    keys = {}
    for app in APPS:
        k = os.environ.get("REVENUECAT_API_KEY_" + app.upper())
        if k:
            keys[app] = k
    if os.environ.get("REVENUECAT_API_KEY"):
        keys["default"] = os.environ["REVENUECAT_API_KEY"]
    unknown = [a for a in selected if a not in keys]
    if unknown:
        sys.exit("No key set for: " + ", ".join(unknown) + ". Set REVENUECAT_API_KEY_<APP> (apps: "
                 + ", ".join(APPS) + ").")
    return {a: keys[a] for a in selected} if selected else keys


HTML_CSS = """
:root{--bg:#f6f5f2;--card:#fff;--fg:#1c1b19;--mut:#76736c;--line:#e4e1da;--bar:#2f7d5b}
@media(prefers-color-scheme:dark){:root{--bg:#121212;--card:#1c1c1b;--fg:#ecebe7;--mut:#9a978f;--line:#2e2d2a;--bar:#4fb78a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0}h2{font-size:17px;margin:0 0 12px}
.sub{color:var(--mut);margin:4px 0 24px}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
.row{display:grid;grid-template-columns:110px 1fr 70px;gap:8px;align-items:center;margin:6px 0;font-size:14px}
.track{background:var(--line);border-radius:6px;height:14px;overflow:hidden}.fill{background:var(--bar);height:100%}
.num{text-align:right;font-variant-numeric:tabular-nums}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.kpi{border:1px solid var(--line);border-radius:8px;padding:8px}.kpi b{display:block;font-size:20px}.kpi span{color:var(--mut);font-size:12px}
.d{font-size:12px;color:var(--mut)}.up{color:#2f9e63}.down{color:#d2504a}
.pill{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:1px 10px;margin:2px;font-size:12px}
.cur{background:var(--bar);color:#fff;border-color:var(--bar)}table{width:100%;border-collapse:collapse;font-size:13px}
td,th{text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:500}
.err{color:#d2504a;font-size:13px}
"""

METRIC_ORDER = ["active_subscriptions", "active_trials", "mrr", "revenue", "new_customers", "active_users"]


def _metrics(s):
    return {x["id"]: x for x in (s.get("metrics") or {}).get("metrics", [])}


def _delta(cur, prev):
    if prev is None or cur == prev:
        return ""
    diff = cur - prev
    return f'<div class="d {"up" if diff > 0 else "down"}">{"+" if diff > 0 else ""}{fmt(diff)} since last run</div>'


def html_index(results, prev, fetched):
    e = html.escape
    out = [f"<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
           f"<title>RevenueCat snapshot</title><style>{HTML_CSS}</style><main>"
           f"<h1>RevenueCat snapshot</h1><p class=sub>Fetched {fetched} UTC. Project-wide totals from the API; "
           "per-product revenue is not available. Revenue, new customers and active users are the trailing 28 days.</p>"]
    out.append("<div class=grid>")
    for mid, title in (("revenue", "Revenue (28d)"), ("new_customers", "New customers (28d)"),
                       ("active_users", "Active users (28d)"), ("active_subscriptions", "Active subscriptions (now)")):
        vals = [(s["app"], _metrics(s).get(mid, {}).get("value")) for s in results]
        mx = max([v for _, v in vals if v] or [1])
        out.append(f"<div class=card><h2>{e(title)}</h2>")
        for app, v in vals:
            w = 0 if v is None else v / mx * 100
            out.append(f'<div class=row><span>{e(app)}</span><div class=track><div class=fill style="width:{w:.1f}%"></div></div>'
                       f'<span class=num>{"n/a" if v is None else fmt(v)}</span></div>')
        out.append("</div>")
    out.append("</div>")
    for s in results:
        m, pm = _metrics(s), _metrics(prev.get(s["app"], {}))
        cur = (s.get("metrics") or {}).get("currency", "")
        out.append(f"<div class=card><h2>{e(s.get('name') or s['app'])} <span class=d>({e(s['app'])})</span></h2><div class=kpis>")
        for mid in METRIC_ORDER:
            if mid in m:
                x = m[mid]
                unit = f" {cur}" if x.get("unit") == "$" else ""
                out.append(f"<div class=kpi><b>{fmt(x['value'])}{unit}</b><span>{e(x.get('name') or mid)}</span>"
                           f"{_delta(x['value'], pm.get(mid, {}).get('value'))}</div>")
        out.append("</div>")
        prods = s.get("products")
        if prods is not None:
            types = {}
            for p in prods:
                types[p.get("type")] = types.get(p.get("type"), 0) + 1
            out.append("<p><b>Products</b> " + "".join(f"<span class=pill>{e(str(t))}: {n}</span>" for t, n in types.items()) + "</p>")
            out.append("<table><tr><th>Product<th>Type<th>Duration<th>State</tr>" + "".join(
                f"<tr><td>{e(p.get('display_name') or p.get('store_identifier') or '')}<td>{e(str(p.get('type')))}"
                f"<td>{e((p.get('subscription') or {}).get('duration') or '')}<td>{e(str(p.get('state')))}</tr>" for p in prods) + "</table>")
        offs = s.get("offerings")
        if offs is not None:
            out.append("<p><b>Offerings</b> " + ("".join(
                f"<span class='pill{' cur' if o.get('is_current') else ''}'>{e(o.get('lookup_key') or '?')}</span>" for o in offs) or "none") + "</p>")
        out += [f'<p class=err>{e(x)}</p>' for x in s.get("errors", [])]
        out.append("</div>")
    return "".join(out)


def report_md(s, fetched):
    """Markdown report for one project, written for an AI (or human) to analyse."""
    L = [f"# RevenueCat stats: {s['app']} ({s.get('name')})", "",
         f"- Fetched: {fetched} (UTC)", f"- Project id: {s['id']}",
         "- Source: RevenueCat API v2, read-only. Only numbers the API returned are included.", ""]
    m = s["metrics"]
    L.append("## Overview metrics")
    if m:
        cur = m.get("currency", "")
        L += [f"Currency: {cur}. Period `now` = current value, `28d` = trailing 28 days.", "",
              "| Metric | Value | Unit | Period | Description |", "|---|---|---|---|---|"]
        for x in m.get("metrics", []):
            period = "now" if x.get("period") == "P0D" else "28d" if x.get("period") == "P28D" else x.get("period")
            L.append(f"| {x.get('name') or x['id']} | {fmt(x['value'])} | {x.get('unit') or ''} | {period} | "
                     f"{(x.get('description') or '').replace('|', '/')} |")
    else:
        L.append("Not available (see Errors).")
    L += ["", "## Products"]
    if s["products"] is not None:
        L += [f"{len(s['products'])} total.", "",
              "| Product | Store id | Type | Duration | Trial | State |", "|---|---|---|---|---|---|"]
        for p in s["products"]:
            sub = p.get("subscription") or {}
            L.append(f"| {p.get('display_name') or ''} | {p.get('store_identifier')} | {p.get('type')} | "
                     f"{sub.get('duration') or ''} | {sub.get('trial_duration') or ''} | {p.get('state')} |")
    else:
        L.append("Not available (see Errors).")
    L += ["", "## Offerings"]
    if s["offerings"] is not None:
        for o in s["offerings"]:
            L.append(f"- `{o.get('lookup_key')}`{' (current)' if o.get('is_current') else ''}: {o.get('display_name')}")
        if not s["offerings"]:
            L.append("None.")
    else:
        L.append("Not available (see Errors).")
    L += ["", "## Limits of this data",
          "- Overview metrics are project-wide totals. Per-product sales/revenue and trends are NOT included.",
          "- Compare with earlier files in `history/` for change over time.", ""]
    if s["errors"]:
        L += ["## Errors"] + [f"- {e}" for e in s["errors"]] + [""]
    return "\n".join(L)


def save(results, outdir):
    now = time.gmtime()
    fetched = time.strftime("%Y-%m-%d %H:%M", now)
    stamp = time.strftime("%Y-%m-%d_%H%M", now)
    written, prev = [], {}
    for s in results:
        try:
            with open(os.path.join(outdir, s["app"], "latest.json")) as f:
                prev[s["app"]] = json.load(f)
        except (OSError, ValueError):
            pass
    for s in results:
        d = os.path.join(outdir, s["app"])
        os.makedirs(os.path.join(d, "history"), exist_ok=True)
        data = json.dumps({"fetched_at": fetched + "Z", "app": s["app"], **s}, indent=2)
        for name, text in (("latest.json", data), ("report.md", report_md(s, fetched)),
                           (f"history/{stamp}.json", data)):
            with open(os.path.join(d, name), "w") as f:
                f.write(text)
        written.append(d)
    index = ["# RevenueCat snapshot index", "", f"Fetched {fetched} UTC. One folder per app: "
             "`report.md` (readable summary), `latest.json` (full data), `history/` (dated copies).", ""]
    for s in results:
        mm = {x["id"]: x["value"] for x in (s["metrics"] or {}).get("metrics", [])}
        brief = ", ".join(f"{k}={fmt(v)}" for k, v in mm.items() if k in
                          ("active_subscriptions", "active_trials", "mrr", "revenue")) or "no metrics"
        index.append(f"- [{s['app']}]({s['app']}/report.md): {brief}")
    with open(os.path.join(outdir, "index.md"), "w") as f:
        f.write("\n".join(index) + "\n")
    with open(os.path.join(outdir, "index.html"), "w") as f:
        f.write(html_index(results, prev, fetched))
    return written


def main():
    args = sys.argv[1:]
    outdir, nosave = DEFAULT_OUT, False
    if "--no-save" in args:
        args.remove("--no-save")
        nosave = True
    if "--out" in args:
        i = args.index("--out")
        if i + 1 >= len(args):
            sys.exit(__doc__)
        outdir = args[i + 1]
        del args[i:i + 2]
    if any(a.startswith("-") for a in args):
        sys.exit(__doc__)
    keys = load_keys([a.lower() for a in args])
    if not keys:
        sys.exit("No keys set. Fill tools/revenuecat/.env (see .env.example) or export REVENUECAT_API_KEY_<APP>.")
    results = []
    for app, key in keys.items():
        try:
            projects = get_all("/projects", key)
        except ApiError as e:
            print(f"\n== {app} ==\n  ! " + explain(e, "projects", "project_configuration:projects:read"))
            continue
        for p in projects:
            s = project_stats(p, key)
            s["app"] = app
            results.append(s)
            show(s)
    if results and not nosave:
        save(results, outdir)
        print(f"\nWrote index.html, index.md and per-app report.md / latest.json / history/ to {outdir}")


if __name__ == "__main__":
    main()
