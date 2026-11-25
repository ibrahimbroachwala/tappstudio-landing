/* PPP price engine: pure maths, no DOM. Loaded as a global (PPPEngine) by ppp/index.html and as a
   module by Node, so it can be checked without a browser:

   node -e "const E=require('./ppp/engine.js');console.log(E.roundLocal(118.4,'INR'))"
*/
(function (root) {
    'use strict';

    // How prices look in each currency (ported from Kadak's store/scripts/regional_prices.py).
    var WHOLE_NINE = ['SEK', 'NOK', 'DKK', 'HKD', 'TWD', 'THB', 'CNY', 'PHP', 'PKR', 'BDT', 'LKR', 'NPR',
        'INR', 'EGP', 'UAH', 'MOP', 'CZK'];
    var THREE_DECIMALS = ['KWD', 'OMR', 'BHD', 'JOD'];
    // Currencies worth less than ~1/100 USD that aren't covered above: two significant digits,
    // ending in 9 or 90 (1,490 / 2,990 / 249).
    var BIG_UNITS = ['NGN', 'CLP', 'COP', 'HUF', 'KZT', 'TZS', 'PYG', 'UZS', 'MNT', 'IQD', 'MMK', 'CRC',
        'ARS', 'XAF', 'XOF', 'RSD', 'KES', 'DZD', 'ETB', 'UGX'];

    function cents(n) { return Math.round(n * 100) / 100; }

    /** A price as people expect to see it in [currency]. */
    function roundLocal(value, currency) {
        var v = Math.max(0, value);
        var step, r;
        if (THREE_DECIMALS.indexOf(currency) >= 0) {
            return Math.max(0.1, Math.round(v * 20) / 20);
        }
        if (currency === 'JPY') {
            step = v < 1000 ? 10 : 100;
            return Math.max(step, Math.round(v / step) * step);
        }
        if (currency === 'KRW') {
            step = v < 10000 ? 100 : 1000;
            return Math.max(100, Math.round(v / step) * step);
        }
        if (currency === 'IDR' || currency === 'VND') {
            step = v < 100000 ? 1000 : 5000;
            return Math.max(1000, Math.round(v / step) * step);
        }
        if (WHOLE_NINE.indexOf(currency) >= 0) {
            if (v < 10) return Math.max(1, Math.round(v));
            step = v < 100 ? 5 : v < 1000 ? 10 : 100;
            return Math.max(9, Math.round(v / step) * step - 1);
        }
        if (BIG_UNITS.indexOf(currency) >= 0) {
            if (v < 100) return Math.max(9, Math.round(v / 10) * 10 - 1);
            step = Math.pow(10, Math.floor(Math.log10(v)) - 1);
            r = Math.round(v / step) * step;
            return r - (step >= 100 ? 10 : 1);
        }
        // Cents: .x9 under 1, .49 or .99 under 10, .99 under 100, then steps of 5 ending .99.
        if (v < 1) return cents(Math.max(0.19, Math.ceil(v * 10) / 10 - 0.01));
        if (v < 10) return cents(Math.max(0.49, Math.round(v * 2) / 2 - 0.01));
        if (v < 100) return cents(Math.round(v) - 0.01);
        return cents(Math.round(v / 5) * 5 - 0.01);
    }

    /** The ladder price nearest to [value] (the lower one on a tie). Ladder sorted ascending. */
    function snap(value, ladder) {
        if (!ladder || !ladder.length) return null;
        var lo = 0, hi = ladder.length - 1;
        if (value <= ladder[0]) return ladder[0];
        if (value >= ladder[hi]) return ladder[hi];
        while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            if (ladder[mid] <= value) lo = mid; else hi = mid;
        }
        return (value - ladder[lo]) <= (ladder[hi] - value) ? ladder[lo] : ladder[hi];
    }

    /** The currency a price typed "for" [country] is in: its local store currency, else USD. */
    function baseCurrency(country) {
        if (country.play && country.play !== 'USD') return country.play;
        if (country.apple && country.apple !== 'USD') return country.apple;
        return 'USD';
    }

    function tierMult(tiers, id) {
        for (var i = 0; i < tiers.length; i++) if (tiers[i].id === id) return tiers[i].mult;
        return 1;
    }

    /**
     * The Tier 1 US dollar price that [price] in [country] corresponds to.
     * opts: { price, country, fx (currency -> units per USD), tiers }
     */
    function anchorUSD(opts) {
        var cur = baseCurrency(opts.country);
        var rate = opts.fx[cur];
        if (!rate || !(opts.price > 0)) return null;
        return opts.price / rate / tierMult(opts.tiers, opts.country.tier);
    }

    function storePrice(target, currency, ladder, snapOn, exact) {
        if (exact != null) return { price: exact, snapped: false, exact: true };
        if (snapOn && ladder) {
            // Round to the local pattern first (2.99, 99, 480), then take the nearest real price point,
            // which is usually that same price.
            var s = snap(roundLocal(target, currency), ladder);
            if (s != null) return { price: s, snapped: true };
        }
        return { price: roundLocal(target, currency), snapped: false };
    }

    /**
     * One row per country.
     * opts: { price, base (country object), countries, fx, tiers, snap, kind ('sub'|'iap'),
     *         points (apple-points.json or null) }
     */
    function computeRows(opts) {
        var anchor = anchorUSD({ price: opts.price, country: opts.base, fx: opts.fx, tiers: opts.tiers });
        if (anchor == null) return { anchor: null, rows: [] };
        var baseCur = baseCurrency(opts.base);
        var points = opts.points;
        var rows = opts.countries.map(function (c) {
            var mult = tierMult(opts.tiers, c.tier);
            var usdTarget = anchor * mult;
            var row = { country: c, tier: c.tier, mult: mult, usdTarget: usdTarget, apple: null, play: null };
            var isBase = c.a2 === opts.base.a2;
            if (c.apple && opts.fx[c.apple]) {
                var ladder = null;
                if (points && points[opts.kind] && points[opts.kind][c.a3] != null) {
                    ladder = points.ladders[points[opts.kind][c.a3]];
                }
                var exactA = isBase && c.apple === baseCur && !(opts.snap && ladder) ? opts.price : null;
                if (isBase && c.apple === baseCur && opts.snap && ladder) {
                    // Show the typed price if Apple offers it, else the nearest point.
                    exactA = ladder.indexOf(opts.price) >= 0 ? opts.price : null;
                }
                var a = storePrice(usdTarget * opts.fx[c.apple], c.apple, ladder, opts.snap, exactA);
                a.currency = c.apple;
                a.usd = a.price / opts.fx[c.apple];
                a.hasLadder = !!ladder;
                row.apple = a;
            }
            if (c.play && opts.fx[c.play]) {
                var exactP = isBase && c.play === baseCur ? opts.price : null;
                var p = storePrice(usdTarget * opts.fx[c.play], c.play, null, false, exactP);
                p.currency = c.play;
                p.usd = p.price / opts.fx[c.play];
                row.play = p;
            }
            var ref = row.apple || row.play;
            row.usd = ref ? ref.usd : null;
            return row;
        });
        return { anchor: anchor, rows: rows };
    }

    var DECIMALS = { JPY: 0, KRW: 0, IDR: 0, VND: 0, KWD: 3, OMR: 3, BHD: 3, JOD: 3 };

    function decimalsFor(currency, price) {
        if (DECIMALS[currency] != null) return DECIMALS[currency];
        if (WHOLE_NINE.indexOf(currency) >= 0 || BIG_UNITS.indexOf(currency) >= 0) {
            return Math.round(price) === price ? 0 : 2;
        }
        return 2;
    }

    /** "4.99", "99", "0.890": the plain number a store form or YAML wants. */
    function plain(price, currency) {
        return price.toFixed(decimalsFor(currency, price));
    }

    function sortRows(rows, by, names) {
        var copy = rows.slice();
        var cmpName = function (a, b) { return names(a.country).localeCompare(names(b.country)); };
        var key = {
            'name': cmpName,
            'name-desc': function (a, b) { return -cmpName(a, b); },
            'price': function (a, b) { return (a.usd || 0) - (b.usd || 0) || cmpName(a, b); },
            'price-desc': function (a, b) { return (b.usd || 0) - (a.usd || 0) || cmpName(a, b); },
            'ratio': function (a, b) { return (b.country.ratio || 9) - (a.country.ratio || 9) || cmpName(a, b); }
        }[by] || cmpName;
        copy.sort(key);
        return copy;
    }

    var api = {
        roundLocal: roundLocal,
        snap: snap,
        baseCurrency: baseCurrency,
        anchorUSD: anchorUSD,
        computeRows: computeRows,
        sortRows: sortRows,
        plain: plain
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PPPEngine = api;
})(typeof window !== 'undefined' ? window : this);
