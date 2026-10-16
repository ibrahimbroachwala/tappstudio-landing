/* ==========================================================================
   tappStudio pricing: rate card editor logic (no DOM)
   Edits are a flat patch { "features.payments.hours": 14, ... } layered over config.js.
   sections(cfg)       -> editable rows, grouped for the sheet UI
   apply(cfg, patch)   -> a new config with the patch applied
   valid(row, value)   -> sanity check for a value typed into a row
   ========================================================================== */

(function (root) {
    // List sections edit a field on every item of cfg[list]. Items are found by id, code, or index.
    var SECTIONS = [
        {
            id: 'core', title: 'Core rates', rows: [
                { key: 'hourlyRateUSD', label: 'Hourly rate', unit: 'USD / hr', min: 1, step: 1, hint: 'Base rate every hour is billed at' },
                { key: 'qaPmOverhead', label: 'QA & project management', unit: '% of build', scale: 100, min: 0, step: 1, hint: 'Testing, builds, client comms, revisions' },
                { key: 'contingency', label: 'Contingency', unit: '% buffer', scale: 100, min: 0, step: 1, hint: 'Cushion for unknowns' },
                { key: 'minimumProjectUSD', label: 'Minimum project price', unit: 'USD', min: 0, step: 50, hint: 'Smaller quotes are topped up to this' },
                { key: 'range.low', label: 'Quote range, low end', unit: '× price', min: 0.1, max: 1, step: 0.05, hint: 'Shown as "Range from"' },
                { key: 'range.high', label: 'Quote range, high end', unit: '× price', min: 1, step: 0.05, hint: 'Shown as "to"' },
                { key: 'productiveHoursPerDay', label: 'Productive hours per day', unit: 'hrs', min: 1, max: 24, step: 0.5, hint: 'Used for the delivery estimate' },
                { key: 'supportHoursPerMonth', label: 'Support hours per month', unit: 'hrs', min: 0, step: 1, hint: 'Billed at the hourly rate' },
                { key: 'validityDays', label: 'Quote validity', unit: 'days', min: 1, step: 1 }
            ]
        },
        {
            id: 'types', title: 'Project types', list: 'projectTypes', fields: [
                { f: 'baseHours', label: 'Base hours', unit: 'hrs', min: 0, step: 1, hint: 'Setup, CI, deployment, store submission' },
                { f: 'hoursPerScreen', label: 'Hours per screen', unit: 'hrs', min: 0, step: 0.5 }
            ]
        },
        { id: 'platforms', title: 'Mobile platforms', list: 'platforms', fields: [{ f: 'factor', label: 'Multiplier', unit: '×', min: 0.1, step: 0.05 }] },
        { id: 'design', title: 'Design tiers', list: 'designTiers', fields: [{ f: 'factor', label: 'Multiplier on screen hours', unit: '×', min: 0.1, step: 0.05 }] },
        { id: 'complexity', title: 'Complexity', list: 'complexity', fields: [{ f: 'factor', label: 'Multiplier on the whole build', unit: '×', min: 0.1, step: 0.05 }] },
        { id: 'backends', title: 'Backend', list: 'backends', fields: [{ f: 'hours', label: 'Hours', unit: 'hrs', min: 0, step: 1 }] },
        {
            id: 'timeline', title: 'Timeline', list: 'timeline', fields: [
                { f: 'surcharge', label: 'Price multiplier', unit: '×', min: 1, step: 0.05, hint: 'e.g. 1.2 = +20%' },
                { f: 'durationFactor', label: 'Calendar time multiplier', unit: '×', min: 0.1, max: 1, step: 0.05, hint: 'e.g. 0.8 = about 20% sooner' }
            ]
        },
        { id: 'features', title: 'Features', list: 'features', groupBy: 'group', fields: [{ f: 'hours', label: 'Hours', unit: 'hrs', min: 0, step: 1, hint: 'Per unit (per language, integration, etc.)' }] },
        { id: 'milestones', title: 'Payment milestones', list: 'milestones', fields: [{ f: 'pct', label: 'Share of total', unit: '%', min: 0, max: 100, step: 5, hint: 'Should add up to 100' }] },
        {
            id: 'currencies', title: 'Currencies', list: 'currencies', fields: [
                { f: 'regionalFactor', label: 'Regional factor', unit: '×', min: 0.01, step: 0.05, hint: 'Local pricing adjustment after conversion' },
                { f: 'roundTo', label: 'Round total up to', unit: 'units', min: 1, step: 1 },
                { f: 'lineRound', label: 'Round lines to nearest', unit: 'units', min: 1, step: 1 },
                { f: 'fallbackRate', label: 'Fallback rate per 1 USD', unit: 'rate', min: 0.0001, step: 'any', hint: 'Used only when live rates fail' }
            ]
        }
    ];

    function itemId(item, index) {
        return String(item.id != null ? item.id : (item.code != null ? item.code : index));
    }

    function findItem(list, id) {
        for (var i = 0; i < list.length; i++) if (itemId(list[i], i) === id) return list[i];
        return null;
    }

    // Resolve a flat key to { node, field } inside cfg.
    function locate(cfg, key) {
        var parts = key.split('.');
        var node = cfg;
        var i = 0;
        while (i < parts.length - 1) {
            var next = node[parts[i]];
            i++;
            if (Array.isArray(next)) {
                node = findItem(next, parts[i]);
                i++;
            } else {
                node = next;
            }
            if (node == null) return null;
        }
        return { node: node, field: parts[i] };
    }

    function get(cfg, key) {
        var loc = locate(cfg, key);
        return loc ? loc.node[loc.field] : undefined;
    }

    function sections(cfg) {
        return SECTIONS.map(function (sec) {
            var rows = [];
            if (sec.rows) {
                sec.rows.forEach(function (r) { rows.push(rowFrom(cfg, r.key, r, r.label, '')); });
            } else {
                (cfg[sec.list] || []).forEach(function (item, idx) {
                    sec.fields.forEach(function (fd) {
                        var key = sec.list + '.' + itemId(item, idx) + '.' + fd.f;
                        var multi = sec.fields.length > 1;
                        rows.push(rowFrom(cfg, key, fd, item.label || item.code, multi ? fd.label : '',
                            sec.groupBy ? item[sec.groupBy] : '', multi ? fd.hint : (item.hint || fd.hint)));
                    });
                });
            }
            return { id: sec.id, title: sec.title, rows: rows };
        });
    }

    function rowFrom(cfg, key, spec, label, sub, group, hint) {
        return {
            key: key, label: label, sub: sub || '', group: group || '',
            hint: hint != null ? hint : (spec.hint || ''),
            unit: spec.unit || '', min: spec.min, max: spec.max, step: spec.step || 'any',
            scale: spec.scale || 1, def: get(cfg, key)
        };
    }

    function clone(x) { return JSON.parse(JSON.stringify(x)); }

    function apply(cfg, patch) {
        var out = clone(cfg);
        Object.keys(patch || {}).forEach(function (key) {
            var v = patch[key];
            var loc = locate(out, key);
            if (loc && typeof v === 'number' && isFinite(v)) loc.node[loc.field] = v;
        });
        return out;
    }

    // value is in raw (unscaled) units.
    function valid(row, value) {
        if (typeof value !== 'number' || !isFinite(value)) return false;
        if (row.min != null && value < row.min / row.scale - 1e-9) return false;
        if (row.max != null && value > row.max / row.scale + 1e-9) return false;
        return true;
    }

    // Keep only keys that exist in cfg and hold finite numbers (used when importing).
    function sanitize(cfg, patch) {
        var clean = {};
        Object.keys(patch || {}).forEach(function (key) {
            var loc = locate(cfg, key);
            if (loc && typeof loc.node[loc.field] === 'number' && typeof patch[key] === 'number' && isFinite(patch[key])) {
                clean[key] = patch[key];
            }
        });
        return clean;
    }

    var api = { sections: sections, apply: apply, valid: valid, sanitize: sanitize, get: get };
    root.PricingRates = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
