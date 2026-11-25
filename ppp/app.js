/* PPP price tool UI. Needs engine.js (PPPEngine) and prompt.js (PPPPrompt) loaded first. */
(function () {
    'use strict';

    var E = window.PPPEngine;
    var FX_URLS = [
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
        'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json'
    ];
    var FX_TTL = 12 * 60 * 60 * 1000; // one fetch per visitor per 12 hours
    var STORE_KEY = 'ppp.settings';
    var RATES_KEY = 'ppp.rates.v2';

    var $ = function (id) { return document.getElementById(id); };
    var regionNames = (function () {
        try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { return null; }
    })();
    function name(c) { return (regionNames && regionNames.of(c.a2)) || c.a2; }

    var data = null;          // countries.json
    var points = null;        // apple-points.json (lazy)
    var pointsLoading = null;
    var fx = null;            // { date, source, usd: {CUR: rate}, live }
    var byA2 = {};
    var defaultsMult = {};
    var state = {
        price: 4.99, base: 'US', kind: 'sub', snap: true, store: 'both',
        view: 'tier', sort: 'name', q: '', mult: {}
    };
    var result = null;

    // ---------- persistence ----------
    function loadSettings() {
        try {
            var s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
            Object.keys(state).forEach(function (k) { if (s[k] !== undefined) state[k] = s[k]; });
        } catch (e) { }
    }
    function saveSettings() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { }
    }

    // ---------- data ----------
    function getJSON(url, cache) {
        return fetch(url, { cache: cache || 'default' }).then(function (r) {
            if (!r.ok) throw new Error(url + ' ' + r.status);
            return r.json();
        });
    }

    function loadRates(needed) {
        try {
            var cached = JSON.parse(localStorage.getItem(RATES_KEY) || 'null');
            if (cached && Date.now() - cached.fetched < FX_TTL) return Promise.resolve(cached);
        } catch (e) { }
        var tryUrl = function (i) {
            if (i >= FX_URLS.length) return Promise.reject(new Error('no live rates'));
            // jsDelivr lets browsers keep @latest for 7 days, so always revalidate; FX_TTL is our own limit.
            return getJSON(FX_URLS[i], 'no-cache').then(function (j) {
                var usd = {};
                needed.forEach(function (c) { if (j.usd[c.toLowerCase()]) usd[c] = j.usd[c.toLowerCase()]; });
                usd.USD = 1;
                var out = { date: j.date, source: 'fawazahmed0/currency-api via ' + (i === 0 ? 'jsDelivr' : 'Cloudflare Pages'), usd: usd, live: true, fetched: Date.now() };
                try { localStorage.setItem(RATES_KEY, JSON.stringify(out)); } catch (e) { }
                return out;
            }).catch(function () { return tryUrl(i + 1); });
        };
        return tryUrl(0).catch(function () {
            return getJSON('data/rates.json').then(function (j) {
                return { date: j.date, source: j.source + ' (saved copy; live rates unavailable)', usd: j.usd, live: false };
            });
        });
    }

    function ensurePoints() {
        if (points || !state.snap) return Promise.resolve(points);
        if (!pointsLoading) {
            pointsLoading = getJSON('data/apple-points.json').then(function (j) { points = j; return j; })
                .catch(function () { points = null; return null; });
        }
        return pointsLoading;
    }

    // ---------- formatting ----------
    var fmtCache = {};
    function money(price, currency) {
        var k = currency;
        if (!fmtCache[k]) {
            try {
                fmtCache[k] = new Intl.NumberFormat('en', { style: 'currency', currency: currency, currencyDisplay: 'narrowSymbol' });
            } catch (e) { fmtCache[k] = null; }
        }
        var digits = E.plain(price, currency).split('.')[1];
        var n = digits ? digits.length : 0;
        if (!fmtCache[k]) return E.plain(price, currency) + ' ' + currency;
        var f = new Intl.NumberFormat('en', { style: 'currency', currency: currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: n, maximumFractionDigits: n });
        return f.format(price);
    }
    function usd(n) { return n == null ? '–' : '$' + n.toFixed(2); }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function flag(c) {
        return '<img class="ppp-flag" src="flags/' + c.a2.toLowerCase() + '.svg" width="24" height="18" alt="" loading="lazy" decoding="async">';
    }

    // ---------- compute + render ----------
    function tiers() {
        return data.tiers.map(function (t) {
            var m = parseFloat(state.mult[t.id]);
            return Object.assign({}, t, { mult: m > 0 ? m : t.mult });
        });
    }

    function compute() {
        var base = byA2[state.base] || byA2.US;
        result = E.computeRows({
            price: state.price, base: base, countries: data.countries, fx: fx.usd, tiers: tiers(),
            snap: state.snap && !!points, kind: state.kind, points: points
        });
    }

    function priceCell(p, c, store) {
        if (!p) return '<td class="ppp-na">' + (c[store] ? 'no rate' : 'Not sold') + '</td>';
        var title = p.exact ? 'Your price' : p.snapped ? 'Nearest App Store price point' : 'Rounded to local price pattern';
        var badge = store === 'apple' && state.snap && !p.hasLadder && !p.exact ? ' <span class="ppp-badge" title="No price point data for this territory; rounded instead">≈</span>' : '';
        return '<td class="ppp-price" title="' + title + '">' + esc(money(p.price, p.currency)) + badge +
            (p.currency !== E.baseCurrency(c) && p.currency === 'USD' ? '<span class="ppp-cur">USD</span>' : '') + '</td>';
    }

    function rowHTML(r) {
        var c = r.country;
        var ratio = c.ratio == null ? '<span class="ppp-na" title="No World Bank or IMF price level data; kept at full price">no data</span>'
            : '<span title="' + (c.src === 'IMF' ? 'IMF World Economic Outlook' : 'World Bank WDI') + ', ' + c.year + (c.note ? '. ' + esc(c.note) : '') + '">' + c.ratio.toFixed(2) + (c.src === 'IMF' ? '<sup>IMF</sup>' : '') + '</span>';
        var hide = state.store;
        return '<tr' + (c.a2 === state.base ? ' class="is-base"' : '') + '>' +
            '<th scope="row"><span class="ppp-country">' + flag(c) + '<span>' + esc(name(c)) + '</span><span class="ppp-code">' + c.a2 + '</span></span></th>' +
            '<td class="ppp-tiercol"><span class="ppp-tier t' + r.tier + '">' + r.tier + '</span></td>' +
            '<td class="ppp-num ppp-ratio">' + ratio + '</td>' +
            (hide !== 'play' ? priceCell(r.apple, c, 'apple') : '') +
            (hide !== 'apple' ? priceCell(r.play, c, 'play') : '') +
            '<td class="ppp-num">' + usd(r.usd) + '</td>' +
            '</tr>';
    }

    function headHTML() {
        return '<thead><tr><th scope="col">Country</th><th scope="col" class="ppp-tiercol">Tier</th><th scope="col" class="ppp-num ppp-ratio" title="World Bank price level ratio, US = 1.00">PPP ratio</th>' +
            (state.store !== 'play' ? '<th scope="col">App Store</th>' : '') +
            (state.store !== 'apple' ? '<th scope="col">Google Play</th>' : '') +
            '<th scope="col" class="ppp-num">≈ USD</th></tr></thead>';
    }

    function visibleRows() {
        var q = state.q.trim().toLowerCase();
        return result.rows.filter(function (r) {
            var c = r.country;
            if (state.store === 'apple' && !c.apple) return false;
            if (state.store === 'play' && !c.play) return false;
            if (!q) return true;
            return name(c).toLowerCase().indexOf(q) >= 0 || c.a2.toLowerCase() === q || (c.a3 || '').toLowerCase() === q ||
                (c.apple || '').toLowerCase() === q || (c.play || '').toLowerCase() === q;
        });
    }

    function render() {
        compute();
        var out = $('ppp-results');
        if (!result.anchor) {
            out.innerHTML = '<p class="ppp-empty">Enter a price above zero to see every country.</p>';
            $('ppp-summary').textContent = '';
            $('ppp-ai-btn').disabled = true;
            return;
        }
        $('ppp-ai-btn').disabled = false;
        var base = byA2[state.base];
        var cur = E.baseCurrency(base);
        var rows = visibleRows();
        var ts = tiers();
        var us = result.rows.filter(function (r) { return r.country.a2 === 'US'; })[0];
        $('ppp-summary').innerHTML = esc(money(state.price, cur)) + ' in ' + flag(base) + ' ' + esc(name(base)) +
            ' (tier ' + base.tier + ') → <strong>' + (us && us.apple ? esc(money(us.apple.price, 'USD')) : usd(result.anchor)) + '</strong> in the US' +
            ' <span class="ppp-muted">· ' + rows.length + ' of ' + result.rows.length + ' countries shown</span>';

        var html = '';
        if (state.view === 'tier') {
            ts.forEach(function (t) {
                var list = E.sortRows(rows.filter(function (r) { return r.tier === t.id; }), state.sort, name);
                if (!list.length) return;
                html += '<section class="ppp-group" aria-labelledby="tier-' + t.id + '">' +
                    '<header class="ppp-group-head"><h3 id="tier-' + t.id + '"><span class="ppp-tier t' + t.id + '">' + t.id + '</span> ' + esc(t.name) + '</h3>' +
                    '<p><strong>' + t.mult.toFixed(2) + '×</strong> · PPP ratio ' + (t.max == null ? '≥ ' + t.min.toFixed(2) : t.min.toFixed(2) + '–' + t.max.toFixed(2)) + ' · ' + list.length + ' countries</p></header>' +
                    '<div class="ppp-table-wrap"><table class="ppp-table">' + headHTML() + '<tbody>' + list.map(rowHTML).join('') + '</tbody></table></div></section>';
            });
        } else {
            var all = E.sortRows(rows, state.sort, name);
            html = '<div class="ppp-table-wrap"><table class="ppp-table">' + headHTML() + '<tbody>' + all.map(rowHTML).join('') + '</tbody></table></div>';
        }
        out.innerHTML = html || '<p class="ppp-empty">No countries match “' + esc(state.q) + '”.</p>';
        if ($('ppp-ai-dialog').open) updatePrompt();
    }

    // ---------- inputs ----------
    function fillCountrySelect() {
        var sel = $('ppp-country');
        var list = data.countries.slice().sort(function (a, b) { return name(a).localeCompare(name(b)); });
        sel.innerHTML = list.map(function (c) {
            return '<option value="' + c.a2 + '">' + esc(name(c)) + ' (' + E.baseCurrency(c) + ')</option>';
        }).join('');
    }

    function syncInputs() {
        $('ppp-price').value = state.price;
        $('ppp-country').value = state.base;
        $('ppp-cur').textContent = E.baseCurrency(byA2[state.base]);
        $('ppp-country-flag').innerHTML = flag(byA2[state.base]);
        document.querySelectorAll('[name="ppp-kind"]').forEach(function (r) { r.checked = r.value === state.kind; });
        document.querySelectorAll('[name="ppp-view"]').forEach(function (r) { r.checked = r.value === state.view; });
        $('ppp-snap').checked = state.snap;
        $('ppp-store').value = state.store;
        $('ppp-sort').value = state.sort;
        $('ppp-search').value = state.q;
        data.tiers.forEach(function (t) {
            var input = $('ppp-mult-' + t.id);
            if (input) input.value = (parseFloat(state.mult[t.id]) || t.mult).toFixed(2);
        });
    }

    var timer = null;
    function changed(debounce) {
        saveSettings();
        clearTimeout(timer);
        var go = function () { ensurePoints().then(render); };
        if (debounce) timer = setTimeout(go, 150); else go();
    }

    function buildMultInputs() {
        $('ppp-mults').innerHTML = data.tiers.map(function (t) {
            return '<label class="ppp-mult"><span><span class="ppp-tier t' + t.id + '">' + t.id + '</span> ' + esc(t.name) + '</span>' +
                '<input type="number" id="ppp-mult-' + t.id + '" min="0.05" max="2" step="0.05" inputmode="decimal" data-tier="' + t.id + '">' +
                '<small>data default ' + t.mult.toFixed(2) + '×</small></label>';
        }).join('');
        $('ppp-mults').addEventListener('input', function (e) {
            var id = e.target.getAttribute('data-tier');
            if (!id) return;
            var v = parseFloat(e.target.value);
            if (v > 0) state.mult[id] = v; else delete state.mult[id];
            changed(true);
        });
        $('ppp-mult-reset').addEventListener('click', function () {
            state.mult = {};
            syncInputs();
            changed();
        });
    }

    function bind() {
        $('ppp-price').addEventListener('input', function (e) {
            var v = parseFloat(String(e.target.value).replace(',', '.'));
            state.price = v > 0 ? v : 0;
            changed(true);
        });
        $('ppp-country').addEventListener('change', function (e) {
            state.base = e.target.value;
            syncInputs();
            changed();
        });
        document.querySelectorAll('[name="ppp-kind"]').forEach(function (r) {
            r.addEventListener('change', function () { state.kind = r.value; changed(); });
        });
        document.querySelectorAll('[name="ppp-view"]').forEach(function (r) {
            r.addEventListener('change', function () { state.view = r.value; changed(); });
        });
        $('ppp-snap').addEventListener('change', function (e) { state.snap = e.target.checked; changed(); });
        $('ppp-store').addEventListener('change', function (e) { state.store = e.target.value; changed(); });
        $('ppp-sort').addEventListener('change', function (e) { state.sort = e.target.value; changed(); });
        $('ppp-search').addEventListener('input', function (e) { state.q = e.target.value; changed(true); });
        $('ppp-copy-md').addEventListener('click', copyMarkdown);
        $('ppp-csv').addEventListener('click', downloadCSV);
        bindDialog();
    }

    // ---------- export ----------
    function exportRows() {
        return E.sortRows(result.rows, 'name', name);
    }
    function flash(btn, text) {
        var old = btn.textContent;
        btn.textContent = text;
        setTimeout(function () { btn.textContent = old; }, 1600);
    }
    function copyText(text, btn) {
        var done = function () { flash(btn, 'Copied'); };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
        } else { fallbackCopy(text); done(); }
    }
    function fallbackCopy(text) {
        var t = document.createElement('textarea');
        t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch (e) { }
        document.body.removeChild(t);
    }
    function copyMarkdown(e) {
        var lines = ['| Country | ISO | Tier | PPP ratio | App Store | Google Play | ≈ USD |', '|---|---|---|---|---|---|---|'];
        exportRows().forEach(function (r) {
            var c = r.country;
            lines.push('| ' + name(c) + ' | ' + c.a2 + ' | ' + r.tier + ' | ' + (c.ratio == null ? '–' : c.ratio.toFixed(2)) + ' | ' +
                (r.apple ? E.plain(r.apple.price, r.apple.currency) + ' ' + r.apple.currency : '–') + ' | ' +
                (r.play ? E.plain(r.play.price, r.play.currency) + ' ' + r.play.currency : '–') + ' | ' + usd(r.usd) + ' |');
        });
        copyText(lines.join('\n'), e.currentTarget);
    }
    function download(name, text, type) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: type }));
        a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }
    function downloadCSV() {
        var q = function (s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        var lines = [['country', 'iso2', 'iso3', 'tier', 'ppp_ratio', 'ppp_source', 'apple_currency', 'apple_price', 'play_currency', 'play_price', 'usd'].join(',')];
        exportRows().forEach(function (r) {
            var c = r.country;
            lines.push([name(c), c.a2, c.a3 || '', r.tier, c.ratio == null ? '' : c.ratio, c.src ? c.src + ' ' + c.year : '',
                r.apple ? r.apple.currency : '', r.apple ? E.plain(r.apple.price, r.apple.currency) : '',
                r.play ? r.play.currency : '', r.play ? E.plain(r.play.price, r.play.currency) : '',
                r.usd == null ? '' : r.usd.toFixed(2)].map(q).join(','));
        });
        download('ppp-prices-' + state.base + '-' + E.plain(state.price, E.baseCurrency(byA2[state.base])) + '.csv', lines.join('\n'), 'text/csv');
    }

    // ---------- AI prompt dialog ----------
    function promptText() {
        var base = byA2[state.base];
        return window.PPPPrompt.build({
            result: result, price: state.price, base: base, baseCurrency: E.baseCurrency(base),
            kind: state.kind, snap: state.snap && !!points, tiers: tiers(), data: data,
            fxDate: fx.date, fxSource: fx.source, pointsBuilt: points ? points.built : '',
            productName: $('ppp-ai-product').value, mode: $('ppp-ai-mode').value, name: name
        });
    }
    function updatePrompt() {
        if (!result || !result.anchor) return;
        $('ppp-ai-text').value = promptText();
    }
    function bindDialog() {
        var dlg = $('ppp-ai-dialog');
        $('ppp-ai-btn').addEventListener('click', function () {
            updatePrompt();
            if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
        });
        $('ppp-ai-close').addEventListener('click', function () { dlg.close(); });
        dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
        $('ppp-ai-product').addEventListener('input', updatePrompt);
        $('ppp-ai-mode').addEventListener('change', updatePrompt);
        $('ppp-ai-copy').addEventListener('click', function (e) { copyText($('ppp-ai-text').value, e.currentTarget); });
        $('ppp-ai-download').addEventListener('click', function () {
            download('pricing-setup-prompt.md', $('ppp-ai-text').value, 'text/markdown');
        });
    }

    // ---------- boot ----------
    function showMeta() {
        var age = (Date.now() - new Date(fx.date + 'T00:00:00Z').getTime()) / 86400000;
        $('ppp-fx').innerHTML = 'Exchange rates from ' + esc(fx.source) + ', dated ' + esc(fx.date) +
            (age > 3 ? ' <strong class="ppp-warn">(more than 3 days old)</strong>' : '') +
            '. PPP data built ' + esc(data.built) + '.';
        document.querySelectorAll('[data-ppp-built]').forEach(function (el) { el.textContent = data.built; });
        document.querySelectorAll('[data-ppp-count]').forEach(function (el) { el.textContent = data.countries.length; });
        document.querySelectorAll('[data-ppp-apple]').forEach(function (el) { el.textContent = data.countries.filter(function (c) { return c.apple; }).length; });
        document.querySelectorAll('[data-ppp-play]').forEach(function (el) { el.textContent = data.countries.filter(function (c) { return c.play; }).length; });
        var tb = $('ppp-tier-table');
        if (tb) {
            tb.innerHTML = data.tiers.map(function (t) {
                return '<tr><td><span class="ppp-tier t' + t.id + '">' + t.id + '</span> ' + esc(t.name) + '</td><td>' +
                    (t.max == null ? '≥ ' + t.min.toFixed(2) : t.min.toFixed(2) + ' to &lt; ' + t.max.toFixed(2)) + '</td><td>' + t.mult.toFixed(2) + '×</td><td>' + t.count + '</td></tr>';
            }).join('');
        }
    }

    function boot() {
        loadSettings();
        getJSON('data/countries.json').then(function (d) {
            data = d;
            d.countries.forEach(function (c) { byA2[c.a2] = c; });
            d.tiers.forEach(function (t) { defaultsMult[t.id] = t.mult; });
            if (!byA2[state.base]) state.base = 'US';
            var needed = {};
            d.countries.forEach(function (c) { if (c.apple) needed[c.apple] = 1; if (c.play) needed[c.play] = 1; });
            return Promise.all([loadRates(Object.keys(needed)), ensurePoints()]);
        }).then(function (res) {
            fx = res[0];
            fillCountrySelect();
            buildMultInputs();
            syncInputs();
            bind();
            showMeta();
            render();
            document.documentElement.classList.add('ppp-ready');
        }).catch(function (err) {
            $('ppp-results').innerHTML = '<p class="ppp-empty">Couldn\'t load the price data. Refresh to try again.</p>';
            if (window.console) console.error(err);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
