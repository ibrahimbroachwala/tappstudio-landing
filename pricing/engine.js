/* ==========================================================================
   tappStudio pricing engine: pure functions, no DOM.
   computeQuote(input, cfg)        -> USD quote (lines, hours, timeline)
   toDisplay(quote, code, fx, cfg) -> rounded amounts in a chosen currency
   ========================================================================== */

(function (root) {
    function byId(list, id) {
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return list[0];
    }

    function num(v, min, max, fallback) {
        v = Number(v);
        if (!isFinite(v)) return fallback;
        return Math.min(max, Math.max(min, v));
    }

    function roundTo(x, step) { return Math.round(x / step) * step; }
    function ceilTo(x, step) { return Math.ceil(x / step - 1e-9) * step; }

    // Which features apply to a project type.
    function featuresFor(typeId, cfg) {
        return cfg.features.filter(function (f) { return f.types.indexOf(typeId) !== -1; });
    }

    function computeQuote(input, cfg) {
        var type = byId(cfg.projectTypes, input.type);
        var design = byId(cfg.designTiers, input.design);
        var cx = byId(cfg.complexity, input.complexity);
        var tl = byId(cfg.timeline, input.timeline);
        var platform = type.mobile ? byId(cfg.platforms, input.platform).factor : 1;
        var screens = Math.round(num(input.screens, 0, 200, 0));
        var discountPct = num(input.discount, 0, 100, 0);
        var months = num(input.support, 0, 36, 0);

        var overhead = (1 + cfg.qaPmOverhead) * (1 + cfg.contingency);
        var factor = cx.factor * platform * overhead; // raw hours -> billed hours
        var perHour = cfg.hourlyRateUSD * tl.surcharge;

        var lines = [];
        function add(id, label, group, rawHours) {
            if (!(rawHours > 0)) return;
            var hours = rawHours * factor;
            lines.push({ id: id, label: label, group: group, rawHours: rawHours, hours: hours, usd: hours * perHour });
        }

        add('base', 'Foundation: setup, architecture, deployment', 'Foundation', type.baseHours);

        if (screens > 0) {
            var unit = type.unit + (screens === 1 ? '' : 's');
            add('screens', screens + ' ' + unit + ', ' + design.label.toLowerCase(), 'Design & build',
                screens * type.hoursPerScreen * design.factor);
        }

        if (type.app) {
            var backend = byId(cfg.backends, input.backend);
            add('backend', 'Backend: ' + backend.label, 'Backend', backend.hours);
        }

        featuresFor(input.type, cfg).forEach(function (f) {
            var raw = input.features && input.features[f.id];
            if (!raw) return;
            var qty = f.qty ? Math.round(num(raw, 1, 50, 1)) : 1;
            add('f_' + f.id, f.label + (f.qty ? ' (' + qty + ')' : ''), f.group, f.hours * qty);
        });

        var subtotal = lines.reduce(function (s, l) { return s + l.usd; }, 0);
        var hours = lines.reduce(function (s, l) { return s + l.hours; }, 0);

        if (discountPct > 0) {
            lines.push({ id: 'discount', label: 'Discount (' + discountPct + '%)', group: 'Adjustments', rawHours: 0, hours: 0, usd: -subtotal * discountPct / 100 });
        }

        var projectUSD = lines.reduce(function (s, l) { return s + l.usd; }, 0);
        var minApplied = false;
        if (lines.length && projectUSD < cfg.minimumProjectUSD) {
            lines.push({ id: 'minimum', label: 'Minimum engagement adjustment', group: 'Adjustments', rawHours: 0, hours: 0, usd: cfg.minimumProjectUSD - projectUSD });
            projectUSD = cfg.minimumProjectUSD;
            minApplied = true;
        }

        var workDays = Math.ceil(hours / cfg.productiveHoursPerDay);
        var weeks = hours > 0 ? Math.max(1, Math.ceil(workDays * tl.durationFactor / 5)) : 0;

        var monthlyUSD = cfg.supportHoursPerMonth * cfg.hourlyRateUSD;

        return {
            lines: lines,
            subtotalUSD: subtotal,
            projectUSD: projectUSD,
            hours: hours,
            workDays: workDays,
            weeks: weeks,
            minApplied: minApplied,
            support: { months: months, monthlyUSD: monthlyUSD, usd: months * monthlyUSD },
            factors: {
                complexity: cx.factor, platform: platform, overhead: overhead,
                timeline: tl.surcharge, hourlyRateUSD: cfg.hourlyRateUSD
            },
            effectiveRateUSD: hours > 0 ? projectUSD / hours : 0
        };
    }

    // fx: { rates: {EUR: 0.86, ...}, factors: {INR: 0.5, ...} }, both optional (fall back to cfg).
    function toDisplay(quote, code, fx, cfg) {
        var cur = cfg.currencies.filter(function (c) { return c.code === code; })[0] || cfg.currencies[0];
        fx = fx || {};
        var rate = (fx.rates && fx.rates[code]) || cur.fallbackRate;
        var regional = (fx.factors && fx.factors[code] != null) ? fx.factors[code] : cur.regionalFactor;
        var k = rate * regional;

        var fmt = new Intl.NumberFormat(cur.locale, { style: 'currency', currency: cur.code, maximumFractionDigits: 0 });
        var conv = function (usd) { return usd * k; };

        var total = ceilTo(conv(quote.projectUSD), cur.roundTo);
        var lines = quote.lines.map(function (l) {
            return { id: l.id, label: l.label, group: l.group, hours: l.hours, rawHours: l.rawHours, amount: roundTo(conv(l.usd), cur.lineRound) };
        });

        // Absorb rounding drift into the largest line so lines always sum to the total.
        if (lines.length) {
            var drift = total - lines.reduce(function (s, l) { return s + l.amount; }, 0);
            var big = lines.reduce(function (m, l) { return l.amount > m.amount ? l : m; }, lines[0]);
            big.amount += drift;
        }

        var monthly = roundTo(conv(quote.support.monthlyUSD), cur.lineRound);
        var support = monthly * quote.support.months;

        var milestones = [];
        var allocated = 0;
        cfg.milestones.forEach(function (m, i) {
            var amt = i === cfg.milestones.length - 1
                ? total - allocated
                : roundTo(total * m.pct / 100, cur.lineRound);
            allocated += amt;
            milestones.push({ label: m.label, pct: m.pct, amount: amt });
        });

        return {
            code: cur.code,
            rate: rate,
            regional: regional,
            multiplier: k,
            lines: lines,
            total: total,
            low: roundTo(conv(quote.projectUSD * cfg.range.low), cur.roundTo) + support,
            high: ceilTo(conv(quote.projectUSD * cfg.range.high), cur.roundTo) + support,
            monthly: monthly,
            support: support,
            months: quote.support.months,
            grand: total + support,
            milestones: milestones,
            hourly: quote.hours > 0 ? total / quote.hours : 0,
            format: function (n) { return fmt.format(n); }
        };
    }

    var api = { computeQuote: computeQuote, toDisplay: toDisplay, featuresFor: featuresFor, byId: byId };
    root.PricingEngine = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
