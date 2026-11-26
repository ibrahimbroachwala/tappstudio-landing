/* Builds the "Set up these prices with AI" prompt from the page's current state. Pure, no DOM.
   Global PPPPrompt in the browser, module.exports in Node. */
(function (root) {
    'use strict';

    var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PPPEngine;

    /**
     * s: { result ({anchor, rows}), price, base, baseCurrency, kind, snap,
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

        L.push('# Set up regional App Store and Google Play prices');
        L.push('');
        L.push('Work in my app repository. Set up a repeatable pricing workflow using the YAML below as the source of truth. Start with read-only discovery and a dry run. **Wait for my explicit approval before creating products, changing prices, or migrating subscribers.**');
        L.push('');
        L.push('## Product and pricing inputs');
        L.push('');
        L.push('- Product label: **' + product + '** (' + kindLabel + '). Use this label for the config entry. Confirm the actual store IDs separately.');
        L.push('- ' + (s.mode === 'reprice' ? 'Reprice the existing product in both stores. Preserve its listing metadata.' : 'Prepare creation in both stores. Ask me to confirm the product IDs, store-specific settings, display names and localizations before creating anything.'));
        L.push('- Pricing source: https://tappstudio.in/ppp/. Base input: ' + E.plain(s.price, s.baseCurrency) + ' ' + s.baseCurrency + ' in ' + name(s.base) + '. Exchange rates: ' + s.fxSource + ', dated ' + s.fxDate + '. Taxes and store commission are excluded.');
        L.push('- Apple prices ' + (s.snap ? 'were snapped to a price-point snapshot dated ' + s.pointsBuilt + '. Validate them against the live price points for this product.' : 'were rounded locally. Check each one against the live price points for this product.'));
        L.push('');
        L.push('## Build and review');
        L.push('');
        L.push('1. Inspect the repo for existing pricing scripts and billing configuration. Reuse existing tooling where practical. Find the bundle ID, package name and store product IDs, including the Play base plan or purchase option where applicable. Ask me to confirm missing or ambiguous IDs.');
        L.push('2. Verify current APIs, permissions and pricing rules against the official App Store Connect and Google Play Android Publisher documentation. Tell me which local credentials to provide. Keep secret keys out of source control, logs and generated reports.');
        L.push('3. Save the supplied prices in `scripts/store_pricing/pricing.yaml` or the repo’s existing pricing config. Treat amounts as exact decimals. Use each store’s billing currency and map the YAML’s ISO alpha-2 keys to the territory IDs each API expects.');
        L.push('4. Provide read-only `discover` and `plan` commands or their equivalents. Show store, product, region, currency, current price and proposed price in a reviewable report. Flag increases, unavailable regions, currency mismatches and invalid prices. For unsupported Apple prices, show the nearest valid alternatives. For Play, validate regional price limits. Keep the supplied prices unchanged until I approve any substitutions.');
        L.push('5. Provide an `apply` command that checks the approved plan, skips unchanged prices and requires explicit confirmation. Block writes when validation issues remain. For subscriptions, show how existing subscribers will be affected and ask separately before migrating them.');
        L.push('6. Summarize the files and IDs, run the read-only checks once credentials are available, and stop for my approval. If a new product needs to exist before live prices can be validated, show a creation preview first and rerun the pricing plan after approved creation.');
        L.push('');
        L.push('## pricing.yaml');
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
            if (r.apple) L.push('        "' + r.country.a2 + '": "' + E.plain(r.apple.price, r.apple.currency) + ' ' + r.apple.currency + '"   # ' + name(r.country) + ', tier ' + r.tier);
        });
        L.push('      play:');
        rows.forEach(function (r) {
            if (r.play) L.push('        "' + r.country.a2 + '": "' + E.plain(r.play.price, r.play.currency) + ' ' + r.play.currency + '"   # ' + name(r.country) + ', tier ' + r.tier);
        });
        L.push('```');
        L.push('');
        return L.join('\n');
    }

    var api = { build: build };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PPPPrompt = api;
})(typeof window !== 'undefined' ? window : this);
