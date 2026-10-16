# RevenueCat stats

Read-only script: lists your RevenueCat projects and prints, per project, the overview metrics
(active subscriptions, trials, MRR, revenue, ...), products and offerings. GET requests only,
no dependencies (Python 3).

## Key

Create a V2 secret API key in RevenueCat (Project settings > API keys) with read permissions:
`project_configuration:projects:read`, `project_configuration:products:read`,
`project_configuration:offerings:read`, `charts_metrics:overview:read`.
Export it in your shell; never put it in a file in this repo:

Easiest: put the keys in `tools/revenuecat/.env` (gitignored; template in `.env.example`). Exported shell variables override it.

V2 keys are per project, so there is one per app (set only the ones you have):

```bash
export REVENUECAT_API_KEY_SPLITUP=sk_...
export REVENUECAT_API_KEY_NASAB=sk_...
export REVENUECAT_API_KEY_MISBAHA=sk_...
export REVENUECAT_API_KEY_MYDEEN=sk_...
export REVENUECAT_API_KEY_KADAK=sk_...
python3 tools/revenuecat/stats.py            # all apps with a key
python3 tools/revenuecat/stats.py nasab kadak  # only these
```

A plain `REVENUECAT_API_KEY` also works (shown as "default").

If a permission is missing, that section prints a "not available" note instead of numbers.

## Output files

Every run also writes to `tools/revenuecat/snapshots/` (gitignored; the repo is public, never commit these):

```
snapshots/index.html               open in a browser: charts + per-app cards (changes since last run)
snapshots/index.md                 one line per app
snapshots/<app>/report.md          readable summary: metrics, products, offerings, data limits
snapshots/<app>/latest.json        full data
snapshots/<app>/history/<date>.json  dated copy for trends
```

Point an AI at `snapshots/index.md` and the `report.md` files to analyse or draft post ideas.
Use `--out DIR` for another location or `--no-save` to only print.

## Notes

- Overview metrics are project-wide; per-product sales/revenue is not part of that endpoint,
  so "top products" is not reported.
- Charts & Metrics is rate limited (25 req/min); 429s are retried using `Retry-After`.
