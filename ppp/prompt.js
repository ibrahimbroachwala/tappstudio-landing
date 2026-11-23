/* Builds the "Set up these prices with AI" prompt from the page's current state. Pure, no DOM.
   Global PPPPrompt in the browser, module.exports in Node. */
(function (root) {
    'use strict';

    var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PPPEngine;

    function today() {
        var d = new Date();
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    /**
     * s: { result ({anchor, rows}), price, base, baseCurrency, kind, snap, addTax, tiers, data,
     *      fxDate, fxSource, pointsBuilt, productName, mode ('create'|'reprice'), name (country -> name) }
     */
    function build(s) {
        var name = s.name;
        var kindLabel = s.kind === 'sub' ? 'auto-renewing subscription' : 'one-time purchase (non-consumable)';
        var product = (s.productName || '').trim() || (s.kind === 'sub' ? 'Pro monthly' : 'Lifetime');
        var key = product.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'product';
        var rows = s.result.rows.slice().sort(function (a, b) { return a.country.a2.localeCompare(b.country.a2); });
        var us = rows.filter(function (r) { return r.country.a2 === 'US'; })[0];
        var baseUsd = us && us.apple ? E.plain(us.apple.price, 'USD') : s.result.anchor.toFixed(2);
        var L = [];

        L.push('# Set up regional App Store and Google Play prices for my app');
        L.push('');
        L.push('You are working in my app\'s repository. I want you to set up a repeatable, scripted way to set regional prices for one product on both the Apple App Store and Google Play, using the price table below. Work carefully: this changes what real customers pay.');
        L.push('');
        L.push('## 1. Where these prices come from');
        L.push('');
        L.push('I made this table with the free PPP price tool at https://tappstudio.in/ppp/ on ' + today() + '. How it works:');
        L.push('');
        L.push('- I entered **' + E.plain(s.price, s.baseCurrency) + ' ' + s.baseCurrency + '** as my price in **' + name(s.base) + '** (' + s.base.a2 + ', tier ' + s.base.tier + ').');
        L.push('- Each country is in one of 5 tiers by its **price level ratio**: the World Bank\'s PPP conversion factor (GDP, LCU per international $, indicator PA.NUS.PPP) divided by the official exchange rate (PA.NUS.FCRF), latest year available (mostly 2025). US = 1.0. Where the World Bank has no figure, or differs from the IMF World Economic Outlook figure (NGDPD / PPPGDP) by more than 20% (usually a currency redenomination), the IMF figure is used. Countries with no data from either stay in tier 1.');
        L.push('- Tiers and multipliers used:');
        s.tiers.forEach(function (t) {
            L.push('  - Tier ' + t.id + ' (' + t.name + '): ratio ' + (t.max == null ? '>= ' + t.min.toFixed(2) : t.min.toFixed(2) + ' to < ' + t.max.toFixed(2)) + ', price multiplier **' + t.mult.toFixed(2) + 'x**');
        });
        L.push('- Formula: Tier 1 pre-tax USD anchor = my price / FX / my tier multiplier' + (s.addTax ? ' / (1 + my country\'s VAT)' : '') + ' = **' + s.result.anchor.toFixed(2) + ' USD**. Each country = anchor x its tier multiplier' + (s.addTax ? ' x (1 + its standard VAT/GST rate; not for US/CA, where store prices exclude tax)' : '') + ' x FX into the currency each store bills it in.');
        L.push('- Exchange rates: ' + s.fxSource + ', dated ' + s.fxDate + '.');
        L.push('- App Store prices were ' + (s.snap ? 'snapped to the nearest real App Store Connect ' + (s.kind === 'sub' ? 'subscription' : 'in-app purchase') + ' price point for each territory (snapshot ' + s.pointsBuilt + '), so they should exist exactly.' : 'rounded to local price patterns, not checked against Apple\'s price points: some may not exist exactly. Your script must find the nearest real point and show me.'));
        L.push('- Google Play prices were rounded to local price patterns (.99, 99, 1,490, 480 JPY...). Play accepts any price within its per-currency minimum and maximum.');
        L.push('- What is approximate: PPP data is annual and lags a year; FX moves daily; VAT rates come from an open dataset (node-sales-tax). Treat this as a well-reasoned starting point, not a guarantee.');
        L.push('');
        L.push('## 2. The product');
        L.push('');
        L.push('- Product: **' + product + '**, ' + kindLabel + '.');
        L.push('- ' + (s.mode === 'reprice' ? 'It already exists in both stores. Only re-price it; don\'t change its listing text or create anything.' : 'It is new. Create it in both stores (ask me for the display name and description in each language I support), then price it.'));
        L.push('- US price (base_usd): **' + baseUsd + ' USD**.');
        L.push('');
        L.push('## 3. What to build');
        L.push('');
        L.push('First, inspect the project: find the iOS bundle ID, the Android package name, and the existing product IDs (StoreKit configuration, RevenueCat or other billing SDK setup, Play Billing code). **Ask me for anything you can\'t find. Never guess an ID.**');
        L.push('');
        L.push('Then create `scripts/store_pricing/` with:');
        L.push('');
        L.push('1. `pricing.yaml`, the single source of truth (structure below; the overrides are already filled in for you).');
        L.push('2. `_common.py`: loads and validates the YAML, prices as `Decimal` from strings (never floats), CSV writing, a `confirm()` that requires typing `yes`.');
        L.push('3. `apple_pricing.py` and `play_pricing.py`, each with three commands:');
        L.push('   - `discover`: read-only; lists the app\'s products and IDs so I can fill in the YAML.');
        L.push('   - `plan`: read-only; writes `out/<store>_plan_<timestamp>.csv` with columns store, product, region, currency, current_price, new_price, change, and prints a summary (count of increases, decreases, unchanged).');
        L.push('   - `apply`: shows the same plan, asks me to type `yes`, then writes the prices. Idempotent: skips territories already at the target price.');
        L.push('4. `requirements.txt` (PyJWT[crypto], requests, PyYAML, google-api-python-client, google-auth) and a short `README.md`.');
        L.push('5. Add `scripts/store_pricing/credentials/` and `scripts/store_pricing/out/` to `.gitignore`.');
        L.push('');
        L.push('Rules for both scripts:');
        L.push('- A price must match a store price point **exactly**. If it doesn\'t, stop and print the nearest valid ones. Never round silently.');
        L.push('- Use each store\'s billing currency for each country (they differ: Apple bills over 100 territories in USD, Play bills some countries in local currency where Apple uses USD, and the reverse). The YAML has separate `apple` and `play` overrides for this reason.');
        L.push('- Only touch the products listed in the YAML.');
        L.push('- Retry with exponential backoff on HTTP 429 and 5xx for GET requests; surface write failures instead of blindly retrying them.');
        L.push('- Check every endpoint and field below against the current official Apple and Google documentation before you write the code. APIs change; if something differs, follow the docs and tell me.');
        L.push('');
        L.push('### App Store Connect API (apple_pricing.py)');
        L.push('- Auth: ES256 JWT signed with my `.p8` key, header `kid` = Key ID, claims `iss` = Issuer ID, `aud` = `appstoreconnect-v1`, expiry at most 20 minutes.');
        L.push('- Find the app: `GET /v1/apps?filter[bundleId]=...`.');
        if (s.kind === 'sub') {
            L.push('- Subscriptions: `GET /v1/apps/{id}/subscriptionGroups`, then `/v1/subscriptionGroups/{id}/subscriptions`. Price points per territory: `GET /v1/subscriptions/{id}/pricePoints?filter[territory]=XXX`. Current prices: `GET /v1/subscriptions/{id}/prices?include=subscriptionPricePoint,territory`. Set a price with `POST /v1/subscriptionPrices` (one request per territory; there is no bulk endpoint).');
            L.push('- Price increases for existing subscribers: decide with me per run whether to keep existing subscribers on their current price (`preserveCurrentPrice: true`) or move them. Apple notifies subscribers of increases and may require consent; list the territories that are increases in the plan output.');
        } else {
            L.push('- One-time purchases: `GET /v1/apps/{id}/inAppPurchasesV2?filter[productId]=...`. Price points: `GET /v2/inAppPurchases/{id}/pricePoints?filter[territory]=XXX`. Set all prices in one `POST /v1/inAppPurchasePriceSchedules` with `baseTerritory` USA and a `manualPrices` entry per territory.');
        }
        L.push('- Apple territory IDs are ISO 3166-1 alpha-3 (USA, IND, GBR). The table gives both codes.');
        L.push('');
        L.push('### Google Play Android Publisher API v3 (play_pricing.py)');
        L.push('- Auth: service account JSON key, scope `https://www.googleapis.com/auth/androidpublisher`.');
        L.push('- `monetization.convertRegionPrices` returns Play\'s converted price for every region plus the current `regionsVersion`; use that version on writes (it changes when a region changes currency, e.g. Bulgaria moving to the euro).');
        if (s.kind === 'sub') {
            L.push('- Subscriptions: `monetization.subscriptions.get` / `patch` on the base plan\'s `regionalConfigs` (price per region code, ISO alpha-2) with `regionsVersion.version`. Existing subscribers stay on their old price unless migrated with `monetization.subscriptions.basePlans.migratePrices`; ask me before migrating anyone, and note Play\'s notice rules for increases.');
        } else {
            L.push('- One-time products: use the current one-time products API (`monetization.onetimeproducts`) if the app uses it, otherwise the legacy `inappproducts` resource; check which one the product lives in with `discover`.');
        }
        L.push('- Play rejects prices outside each currency\'s min/max: report those regions instead of failing the whole run.');
        L.push('');
        L.push('### Credentials (I will create these; tell me exactly where to save them)');
        L.push('- Apple: App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → Generate, access **App Manager**. Download the `.p8` once, save as `scripts/store_pricing/credentials/AuthKey.p8`; Key ID and Issuer ID go in `pricing.yaml`. Docs: https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api');
        L.push('- Google: enable the Google Play Android Developer API in Google Cloud, create a service account and a JSON key, save as `scripts/store_pricing/credentials/play-service-account.json`, then invite the service account email in Play Console → Users and permissions with: view app information, manage store presence (products and prices), and manage orders and subscriptions (only if migrating subscribers). New permissions can take up to a day. Docs: https://developers.google.com/android-publisher/getting_started');
        L.push('- Never print, log or commit keys.');
        L.push('');
        L.push('## 4. pricing.yaml (fill in the IDs; keep the overrides as they are)');
        L.push('');
        L.push('```yaml');
        L.push('# Regional prices from https://tappstudio.in/ppp/ (' + E.plain(s.price, s.baseCurrency) + ' ' + s.baseCurrency + ' in ' + s.base.a2 + ', FX ' + s.fxDate + ').');
        L.push('# Prices are strings. Overrides are keyed by ISO 3166-1 alpha-2 and written in the currency');
        L.push('# that store bills the country in.');
        L.push('apple:');
        L.push('  bundle_id: ""          # from the project');
        L.push('  key_id: ""             # App Store Connect Team key');
        L.push('  issuer_id: ""');
        L.push('  private_key_path: credentials/AuthKey.p8');
        L.push('  base_territory: USA');
        L.push('play:');
        L.push('  package_name: ""       # from the project');
        L.push('  service_account_path: credentials/play-service-account.json');
        L.push('products:');
        L.push('  ' + key + ':');
        L.push('    kind: ' + (s.kind === 'sub' ? 'subscription' : 'one_time'));
        if (s.kind === 'sub') {
            L.push('    apple_product_id: ""');
            L.push('    play_subscription_id: ""');
            L.push('    play_base_plan_id: ""');
        } else {
            L.push('    apple_product_id: ""');
            L.push('    play_product_id: ""');
        }
        L.push('    base_usd: "' + baseUsd + '"');
        L.push('    overrides:');
        L.push('      apple:');
        rows.forEach(function (r) {
            if (r.apple) L.push('        ' + r.country.a2 + ': "' + E.plain(r.apple.price, r.apple.currency) + ' ' + r.apple.currency + '"   # ' + name(r.country) + ', tier ' + r.tier);
        });
        L.push('      play:');
        rows.forEach(function (r) {
            if (r.play) L.push('        ' + r.country.a2 + ': "' + E.plain(r.play.price, r.play.currency) + ' ' + r.play.currency + '"   # ' + name(r.country) + ', tier ' + r.tier);
        });
        L.push('```');
        L.push('');
        L.push('## 5. Reference table (' + rows.length + ' countries)');
        L.push('');
        L.push('| ISO2 | ISO3 | Country | Tier | PPP ratio | App Store | Google Play | ≈ USD |');
        L.push('|---|---|---|---|---|---|---|---|');
        rows.forEach(function (r) {
            var c = r.country;
            L.push('| ' + c.a2 + ' | ' + (c.a3 || '') + ' | ' + name(c) + ' | ' + r.tier + ' | ' + (c.ratio == null ? 'no data' : c.ratio.toFixed(2)) + ' | ' +
                (r.apple ? E.plain(r.apple.price, r.apple.currency) + ' ' + r.apple.currency : 'not sold') + ' | ' +
                (r.play ? E.plain(r.play.price, r.play.currency) + ' ' + r.play.currency : 'not sold') + ' | ' +
                (r.usd == null ? '' : r.usd.toFixed(2)) + ' |');
        });
        L.push('');
        L.push('## 6. Finish like this');
        L.push('');
        L.push('1. Show me the files you created and the IDs you found (or still need).');
        L.push('2. Once I\'ve added credentials, run `discover`, then `plan` for both stores.');
        L.push('3. Compare every planned price with the YAML and list any mismatch, any price that isn\'t a valid price point (with the nearest valid ones), and every increase.');
        L.push('4. **Stop and wait for me.** Don\'t run `apply` until I say so.');
        return L.join('\n');
    }

    var api = { build: build };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PPPPrompt = api;
})(typeof window !== 'undefined' ? window : this);
