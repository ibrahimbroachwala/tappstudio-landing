/* ==========================================================================
   tappStudio pricing: UI
   Passcode gate, form, live summary, currency/FX, saved quotes, print/copy.
   ========================================================================== */

(function () {
    'use strict';

    var cfg = window.PRICING_CONFIG;
    var E = window.PricingEngine;

    // -----------------------------------------------------------------------
    // Safe storage
    // -----------------------------------------------------------------------
    var store = {
        get: function (area, key, fallback) {
            try {
                var raw = window[area].getItem(key);
                return raw == null ? fallback : JSON.parse(raw);
            } catch (e) { return fallback; }
        },
        set: function (area, key, value) {
            try { window[area].setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
        },
        del: function (area, key) {
            try { window[area].removeItem(key); } catch (e) { /* ignore */ }
        }
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function $(id) { return document.getElementById(id); }

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    function defaultState() {
        return {
            client: '', project: '', notes: '',
            type: 'mobile', platform: 'both', screens: 8,
            design: 'custom', complexity: 'standard', backend: 'baas',
            timeline: 'standard', support: 0, discount: 0,
            features: {}
        };
    }

    var state = Object.assign(defaultState(), store.get('localStorage', 'pq_draft', {}));
    var settings = Object.assign({ currency: 'USD', view: 'internal', overrides: {} }, store.get('localStorage', 'pq_settings', {}));
    var currentId = null;       // id of the saved quote being edited
    var fxInfo = { source: 'fallback', asOf: null, rates: {} };

    function persist() {
        store.set('localStorage', 'pq_draft', state);
        store.set('localStorage', 'pq_settings', settings);
    }

    // -----------------------------------------------------------------------
    // Passcode gate
    // -----------------------------------------------------------------------
    function sha256(text) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
            return Array.prototype.map.call(new Uint8Array(buf), function (b) {
                return b.toString(16).padStart(2, '0');
            }).join('');
        });
    }

    function isUnlocked() {
        return store.get('sessionStorage', 'pq_unlock', null) === cfg.passcodeHash ||
            store.get('localStorage', 'pq_unlock', null) === cfg.passcodeHash;
    }

    function showApp() {
        $('pq-gate').hidden = true;
        $('pq-app').hidden = false;
        initApp();
    }

    function initGate() {
        if (isUnlocked()) { showApp(); return; }
        var form = $('pq-gate-form');
        var input = $('pq-gate-input');
        input.focus();
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!window.crypto || !crypto.subtle) {
                $('pq-gate-error').textContent = 'This page needs HTTPS or localhost.';
                $('pq-gate-error').hidden = false;
                return;
            }
            sha256(input.value).then(function (hash) {
                if (hash === cfg.passcodeHash) {
                    store.set($('pq-gate-remember').checked ? 'localStorage' : 'sessionStorage', 'pq_unlock', hash);
                    input.value = '';
                    showApp();
                } else {
                    $('pq-gate-error').textContent = 'Wrong passcode.';
                    $('pq-gate-error').hidden = false;
                    input.select();
                }
            });
        });
    }

    function lock() {
        store.del('sessionStorage', 'pq_unlock');
        store.del('localStorage', 'pq_unlock');
        location.reload();
    }

    // -----------------------------------------------------------------------
    // Exchange rates
    // -----------------------------------------------------------------------
    function loadFx(force) {
        var cached = store.get('localStorage', 'pq_fx', null);
        var fresh = cached && (Date.now() - cached.fetchedAt) < cfg.fxCacheHours * 3600 * 1000;
        if (cached && fresh && !force) {
            fxInfo = { source: 'live', asOf: cached.asOf, rates: cached.rates };
            render();
            return Promise.resolve();
        }
        return fetch(cfg.fxUrl)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.rates) throw new Error('bad fx response');
                var rates = {};
                cfg.currencies.forEach(function (c) { if (data.rates[c.code]) rates[c.code] = data.rates[c.code]; });
                var asOf = data.time_last_update_unix ? data.time_last_update_unix * 1000 : Date.now();
                store.set('localStorage', 'pq_fx', { fetchedAt: Date.now(), asOf: asOf, rates: rates });
                fxInfo = { source: 'live', asOf: asOf, rates: rates };
            })
            .catch(function () {
                fxInfo = cached
                    ? { source: 'cached', asOf: cached.asOf, rates: cached.rates }
                    : { source: 'fallback', asOf: null, rates: {} };
            })
            .then(render);
    }

    // Effective rates/factors: manual override > live > config fallback.
    function resolveFx() {
        var rates = {}, factors = {};
        cfg.currencies.forEach(function (c) {
            var o = settings.overrides[c.code] || {};
            rates[c.code] = o.rate > 0 ? o.rate : (fxInfo.rates[c.code] || c.fallbackRate);
            factors[c.code] = o.factor > 0 ? o.factor : c.regionalFactor;
        });
        return { rates: rates, factors: factors };
    }

    function fxLabel() {
        if (settings.currency === 'USD') return 'Base currency';
        var o = settings.overrides[settings.currency] || {};
        if (o.rate > 0) return 'Manual rate';
        if (fxInfo.source === 'live') return 'Live rate, ' + new Date(fxInfo.asOf).toLocaleDateString();
        if (fxInfo.source === 'cached') return 'Cached rate, ' + new Date(fxInfo.asOf).toLocaleDateString();
        return 'Fallback rate (offline)';
    }

    // -----------------------------------------------------------------------
    // Form
    // -----------------------------------------------------------------------
    function seg(key, options, value, extra) {
        return '<div class="pq-seg" role="radiogroup">' + options.map(function (o) {
            var id = 'pq-' + key + '-' + o.id;
            return '<label class="pq-seg-item" for="' + id + '"' + (o.hint ? ' title="' + esc(o.hint) + '"' : '') + '>' +
                '<input type="radio" id="' + id + '" name="' + key + '" data-k="' + key + '" value="' + esc(o.id) + '"' +
                (String(o.id) === String(value) ? ' checked' : '') + '><span>' + esc(o.label) + '</span></label>';
        }).join('') + '</div>' + (extra || '');
    }

    function field(label, inner, hint) {
        return '<div class="pq-field"><div class="pq-label">' + esc(label) +
            (hint ? ' <span class="pq-hint">' + esc(hint) + '</span>' : '') + '</div>' + inner + '</div>';
    }

    function activeType() { return E.byId(cfg.projectTypes, state.type); }

    function renderForm() {
        var type = activeType();
        var html = '';

        html += '<section class="pq-card"><h2>Client</h2><div class="pq-grid2">' +
            field('Client name', '<input class="pq-input" data-k="client" value="' + esc(state.client) + '" placeholder="Acme Co." autocomplete="off">') +
            field('Project name', '<input class="pq-input" data-k="project" value="' + esc(state.project) + '" placeholder="Booking app" autocomplete="off">') +
            '</div></section>';

        html += '<section class="pq-card"><h2>Project</h2>' +
            field('What are we building?', seg('type', cfg.projectTypes, state.type)) +
            (type.mobile ? field('Platforms', seg('platform', cfg.platforms, state.platform)) : '') +
            '<div class="pq-grid2">' +
            field(type.unit.charAt(0).toUpperCase() + type.unit.slice(1) + 's', '<input class="pq-input" type="number" min="0" max="200" step="1" data-k="screens" value="' + esc(state.screens) + '">', 'about ' + type.hoursPerScreen + ' hrs each') +
            (type.app ? field('Backend', '<select class="pq-input" data-k="backend">' + cfg.backends.map(function (b) {
                return '<option value="' + b.id + '"' + (b.id === state.backend ? ' selected' : '') + '>' + esc(b.label) + '</option>';
            }).join('') + '</select>') : '') +
            '</div>' +
            field('Design', seg('design', cfg.designTiers, state.design)) +
            field('Complexity', seg('complexity', cfg.complexity, state.complexity)) +
            '</section>';

        var groups = {};
        E.featuresFor(state.type, cfg).forEach(function (f) { (groups[f.group] = groups[f.group] || []).push(f); });
        html += '<section class="pq-card"><h2>Features</h2>' + Object.keys(groups).map(function (g) {
            return '<div class="pq-group"><div class="pq-label">' + esc(g) + '</div><div class="pq-features">' +
                groups[g].map(function (f) {
                    var on = !!state.features[f.id];
                    return '<label class="pq-feature' + (on ? ' is-on' : '') + '">' +
                        '<input type="checkbox" data-feature="' + f.id + '"' + (on ? ' checked' : '') + '>' +
                        '<span class="pq-feature-label">' + esc(f.label) + '</span>' +
                        '<span class="pq-feature-hrs">' + f.hours + 'h</span>' +
                        (f.qty ? '<input class="pq-qty" type="number" min="1" max="50" data-qty="' + f.id + '" value="' + (state.features[f.id] || 1) + '"' + (on ? '' : ' disabled') + ' aria-label="' + esc(f.unit) + '">' : '') +
                        '</label>';
                }).join('') + '</div></div>';
        }).join('') + '</section>';

        html += '<section class="pq-card"><h2>Terms</h2>' +
            field('Timeline', seg('timeline', cfg.timeline, state.timeline)) +
            '<div class="pq-grid2">' +
            field('Post-launch support', seg('support', cfg.supportMonths.map(function (m) {
                return { id: m, label: m === 0 ? 'None' : m + ' mo' };
            }), state.support)) +
            field('Discount %', '<input class="pq-input" type="number" min="0" max="100" step="1" data-k="discount" value="' + esc(state.discount) + '">') +
            '</div>' +
            field('Notes for the quote', '<textarea class="pq-input" rows="3" data-k="notes" placeholder="Anything the client should read (optional)">' + esc(state.notes) + '</textarea>') +
            '</section>';

        $('pq-form').innerHTML = html;
    }

    function onFormInput(e) {
        var t = e.target;
        if (t.dataset.feature) {
            var id = t.dataset.feature;
            if (t.checked) {
                var q = document.querySelector('[data-qty="' + id + '"]');
                state.features[id] = q ? Math.max(1, Number(q.value) || 1) : 1;
            } else {
                delete state.features[id];
            }
            t.closest('.pq-feature').classList.toggle('is-on', t.checked);
            var qty = document.querySelector('[data-qty="' + id + '"]');
            if (qty) qty.disabled = !t.checked;
        } else if (t.dataset.qty) {
            if (state.features[t.dataset.qty]) state.features[t.dataset.qty] = Math.max(1, Number(t.value) || 1);
        } else if (t.dataset.k) {
            var k = t.dataset.k;
            var numeric = k === 'screens' || k === 'support' || k === 'discount';
            state[k] = numeric ? (t.value === '' ? 0 : Number(t.value)) : t.value;
            if (k === 'type') { renderForm(); }
        } else {
            return;
        }
        render();
    }

    // -----------------------------------------------------------------------
    // Summary / output
    // -----------------------------------------------------------------------
    function compute() {
        var quote = E.computeQuote(state, cfg);
        var d = E.toDisplay(quote, settings.currency, resolveFx(), cfg);
        return { quote: quote, d: d };
    }

    function quoteNumber(rec) {
        return rec ? rec.number : null;
    }

    function renderSummary(r) {
        var q = r.quote, d = r.d;
        var internal = settings.view === 'internal';
        var empty = !q.lines.length;
        var number = quoteNumber(currentRecord());

        var html = '<div class="pq-summary-top">' +
            '<div class="pq-seg pq-seg-compact" role="radiogroup" aria-label="View">' +
            ['internal', 'client'].map(function (v) {
                return '<label class="pq-seg-item"><input type="radio" name="view" data-view="' + v + '"' + (settings.view === v ? ' checked' : '') + '><span>' + (v === 'internal' ? 'Internal' : 'Client') + '</span></label>';
            }).join('') + '</div>' +
            '<span class="pq-muted pq-small">' + (number ? esc(number) : 'Draft') + '</span></div>';

        html += '<div class="pq-total-label">Total' + (d.months ? ' incl. support' : '') + '</div>' +
            '<div class="pq-total">' + d.format(d.grand) + '</div>' +
            '<div class="pq-range">Range ' + d.format(d.low) + ' to ' + d.format(d.high) + '</div>' +
            '<div class="pq-chips">' +
            '<span class="pq-chip">~' + q.weeks + ' week' + (q.weeks === 1 ? '' : 's') + '</span>' +
            (internal ? '<span class="pq-chip">' + Math.round(q.hours) + ' hrs</span><span class="pq-chip">' + d.format(Math.round(d.hourly)) + '/hr</span>' : '') +
            (d.code !== 'USD' ? '<span class="pq-chip pq-chip-muted">' + esc(fxLabel()) + '</span>' : '') +
            '</div>';

        if (internal) {
            html += '<div class="pq-factors">Complexity ×' + q.factors.complexity +
                (q.factors.platform !== 1 ? ' · Platform ×' + q.factors.platform : '') +
                ' · QA/PM + buffer ×' + q.factors.overhead.toFixed(2) +
                (q.factors.timeline !== 1 ? ' · Timeline ×' + q.factors.timeline : '') +
                ' · $' + q.factors.hourlyRateUSD + '/hr base</div>';
        }

        if (empty) {
            html += '<p class="pq-muted">Add screens or features to see a price.</p>';
        } else {
            html += '<table class="pq-lines"><tbody>' + d.lines.map(function (l) {
                return '<tr><td>' + esc(l.label) + (internal && l.hours ? '<span class="pq-line-hrs">' + l.hours.toFixed(1) + 'h</span>' : '') + '</td>' +
                    '<td class="pq-num' + (l.amount < 0 ? ' pq-neg' : '') + '">' + d.format(l.amount) + '</td></tr>';
            }).join('') +
                '<tr class="pq-sub"><td>Project total</td><td class="pq-num">' + d.format(d.total) + '</td></tr>' +
                (d.months ? '<tr><td>Support, ' + d.months + ' mo × ' + d.format(d.monthly) + '</td><td class="pq-num">' + d.format(d.support) + '</td></tr>' +
                    '<tr class="pq-sub"><td>Grand total</td><td class="pq-num">' + d.format(d.grand) + '</td></tr>' : '') +
                '</tbody></table>';
        }

        html += '<div class="pq-actions">' +
            '<button class="pq-btn pq-btn-primary" data-act="save" type="button">' + (currentId ? 'Update quote' : 'Save quote') + '</button>' +
            (currentId ? '<button class="pq-btn" data-act="save-new" type="button">Save as new</button>' : '') +
            '<button class="pq-btn" data-act="print" type="button">Print / PDF</button>' +
            '<button class="pq-btn" data-act="copy" type="button">Copy text</button>' +
            '<button class="pq-btn pq-btn-ghost" data-act="reset" type="button">Reset</button>' +
            '</div><div class="pq-toast" id="pq-toast" role="status"></div>';

        $('pq-summary').innerHTML = html;
        $('pq-mobile-bar').innerHTML = '<div><div class="pq-total-label">Total</div><div class="pq-mobile-total">' + d.format(d.grand) + '</div></div>' +
            '<div class="pq-mobile-meta">~' + q.weeks + ' wk</div>';
    }

    function renderCurrency() {
        $('pq-currency').innerHTML = cfg.currencies.map(function (c) {
            return '<label class="pq-seg-item" title="' + esc(c.label) + '"><input type="radio" name="currency" data-currency="' + c.code + '"' +
                (settings.currency === c.code ? ' checked' : '') + '><span>' + c.code + '</span></label>';
        }).join('');
    }

    // Printable client quote -------------------------------------------------------
    function renderDoc(r) {
        var q = r.quote, d = r.d;
        var type = activeType();
        var rec = currentRecord();
        var today = new Date();
        var valid = new Date(today.getTime() + cfg.validityDays * 86400000);
        var fmtDate = function (dt) { return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

        var html = '<div class="pq-doc-head"><div class="pq-doc-brand"><img src="../public/images/logo_dark.svg" alt="" width="40" height="40">' +
            '<div><div class="pq-doc-name">' + esc(cfg.company.name) + '</div><div class="pq-doc-sub">' + esc(cfg.company.site) + ' · ' + esc(cfg.company.email) + '</div></div></div>' +
            '<div class="pq-doc-meta"><div class="pq-doc-title">Quotation</div><div>' + (rec ? esc(rec.number) : 'Draft') + '</div><div>' + fmtDate(today) + '</div></div></div>';

        html += '<div class="pq-doc-parties"><div><div class="pq-doc-k">Prepared for</div><div class="pq-doc-v">' + esc(state.client || '—') + '</div></div>' +
            '<div><div class="pq-doc-k">Project</div><div class="pq-doc-v">' + esc(state.project || type.label) + '</div></div>' +
            '<div><div class="pq-doc-k">Valid until</div><div class="pq-doc-v">' + fmtDate(valid) + '</div></div></div>';

        html += '<table class="pq-doc-table"><thead><tr><th>Scope</th><th class="pq-num">Amount (' + d.code + ')</th></tr></thead><tbody>' +
            d.lines.map(function (l) { return '<tr><td>' + esc(l.label) + '</td><td class="pq-num">' + d.format(l.amount) + '</td></tr>'; }).join('') +
            '<tr class="pq-sub"><td>Project total</td><td class="pq-num">' + d.format(d.total) + '</td></tr>' +
            (d.months ? '<tr><td>Post-launch support, ' + d.months + ' month' + (d.months > 1 ? 's' : '') + '</td><td class="pq-num">' + d.format(d.support) + '</td></tr>' +
                '<tr class="pq-sub"><td>Total</td><td class="pq-num">' + d.format(d.grand) + '</td></tr>' : '') +
            '</tbody></table>';

        html += '<p class="pq-doc-line"><strong>Estimated delivery:</strong> about ' + q.weeks + ' week' + (q.weeks === 1 ? '' : 's') + ' from kickoff.</p>';

        html += '<h3>Payment schedule</h3><table class="pq-doc-table"><tbody>' + d.milestones.map(function (m) {
            return '<tr><td>' + esc(m.label) + ' (' + m.pct + '%)</td><td class="pq-num">' + d.format(m.amount) + '</td></tr>';
        }).join('') + '</tbody></table>';

        if (state.notes.trim()) html += '<h3>Notes</h3><p class="pq-doc-line">' + esc(state.notes).replace(/\n/g, '<br>') + '</p>';
        html += '<h3>Not included</h3><ul>' + cfg.exclusions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
        html += '<h3>Assumptions</h3><ul>' + cfg.assumptions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
        html += '<div class="pq-doc-foot">' + esc(cfg.company.name) + ' · ' + esc(cfg.company.by) + ' · ' + esc(cfg.company.email) + '</div>';

        $('pq-doc').innerHTML = html;
    }

    function summaryText(r) {
        var q = r.quote, d = r.d;
        var lines = ['Quotation: ' + (state.project || activeType().label) + (state.client ? ' for ' + state.client : ''), ''];
        d.lines.forEach(function (l) { lines.push('- ' + l.label + ': ' + d.format(l.amount)); });
        lines.push('', 'Project total: ' + d.format(d.total));
        if (d.months) lines.push('Support (' + d.months + ' mo): ' + d.format(d.support), 'Total: ' + d.format(d.grand));
        lines.push('Delivery: about ' + q.weeks + ' week' + (q.weeks === 1 ? '' : 's'), '', 'Payment:');
        d.milestones.forEach(function (m) { lines.push('- ' + m.label + ' (' + m.pct + '%): ' + d.format(m.amount)); });
        lines.push('', 'Valid for ' + cfg.validityDays + ' days. Prices in ' + d.code + '.', cfg.company.name + ' · ' + cfg.company.site);
        return lines.join('\n');
    }

    // -----------------------------------------------------------------------
    // Saved quotes
    // -----------------------------------------------------------------------
    function loadSaved() { return store.get('localStorage', 'pq_saved', []); }
    function writeSaved(list) { store.set('localStorage', 'pq_saved', list); }
    function currentRecord() {
        if (!currentId) return null;
        return loadSaved().filter(function (x) { return x.id === currentId; })[0] || null;
    }

    function nextNumber() {
        var n = store.get('localStorage', 'pq_seq', 0) + 1;
        store.set('localStorage', 'pq_seq', n);
        var now = new Date();
        return 'TS-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(n).padStart(3, '0');
    }

    function saveQuote(asNew) {
        var r = compute();
        var list = loadSaved();
        var existing = !asNew && currentId ? list.filter(function (x) { return x.id === currentId; })[0] : null;
        var snapshot = JSON.parse(JSON.stringify(state));
        var summary = { total: r.d.format(r.d.grand), currency: r.d.code, weeks: r.quote.weeks };
        if (existing) {
            existing.state = snapshot; existing.summary = summary; existing.updatedAt = Date.now();
        } else {
            var rec = { id: 'q' + Date.now(), number: nextNumber(), state: snapshot, summary: summary, createdAt: Date.now(), updatedAt: Date.now() };
            list.unshift(rec);
            currentId = rec.id;
        }
        writeSaved(list);
        render();
        toast(existing ? 'Quote updated' : 'Quote saved');
    }

    function renderSaved() {
        var list = loadSaved().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
        var html = '<h2>Saved quotes</h2>';
        if (!list.length) {
            html += '<p class="pq-muted">Nothing saved yet. Quotes are stored in this browser only.</p>';
        } else {
            html += '<ul class="pq-saved-list">' + list.map(function (x) {
                var s = x.state;
                var name = [s.client, s.project].filter(Boolean).join(' · ') || E.byId(cfg.projectTypes, s.type).label;
                return '<li class="' + (x.id === currentId ? 'is-current' : '') + '"><div><div class="pq-saved-name">' + esc(name) + '</div>' +
                    '<div class="pq-muted pq-small">' + esc(x.number) + ' · ' + new Date(x.updatedAt).toLocaleDateString() + ' · ' + esc(x.summary.total) + '</div></div>' +
                    '<div class="pq-row-actions"><button class="pq-btn pq-btn-small" data-saved="load" data-id="' + x.id + '" type="button">Open</button>' +
                    '<button class="pq-btn pq-btn-small" data-saved="dup" data-id="' + x.id + '" type="button">Duplicate</button>' +
                    '<button class="pq-btn pq-btn-small pq-btn-ghost" data-saved="del" data-id="' + x.id + '" type="button">Delete</button></div></li>';
            }).join('') + '</ul>';
        }
        $('pq-saved').innerHTML = html;
    }

    function onSavedClick(e) {
        var btn = e.target.closest('[data-saved]');
        if (!btn) return;
        var list = loadSaved();
        var rec = list.filter(function (x) { return x.id === btn.dataset.id; })[0];
        if (!rec) return;
        var act = btn.dataset.saved;
        if (act === 'del') {
            if (!confirm('Delete ' + rec.number + '?')) return;
            writeSaved(list.filter(function (x) { return x.id !== rec.id; }));
            if (currentId === rec.id) currentId = null;
        } else {
            state = Object.assign(defaultState(), JSON.parse(JSON.stringify(rec.state)));
            currentId = act === 'load' ? rec.id : null;
            renderForm();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        render();
        if (act === 'dup') toast('Duplicated as a new draft');
    }

    // -----------------------------------------------------------------------
    // Settings (FX overrides)
    // -----------------------------------------------------------------------
    function renderSettings() {
        var el = $('pq-settings');
        var open = el.open;
        el.innerHTML = '<summary>Rates &amp; regional pricing</summary>' +
            '<p class="pq-muted pq-small">Rates are units per 1 USD. ' + (fxInfo.source === 'live' ? 'Live rates as of ' + new Date(fxInfo.asOf).toLocaleString() + '.' :
                fxInfo.source === 'cached' ? 'Using cached rates from ' + new Date(fxInfo.asOf).toLocaleString() + '.' : 'Live rates unavailable, using fallback rates.') +
            ' The regional factor adjusts the converted price (e.g. 0.5 for India). Leave blank to use the default. Base rate card: <code>pricing/config.js</code>.</p>' +
            '<table class="pq-fx"><thead><tr><th>Currency</th><th>Rate</th><th>Regional factor</th></tr></thead><tbody>' +
            cfg.currencies.filter(function (c) { return c.code !== 'USD'; }).map(function (c) {
                var o = settings.overrides[c.code] || {};
                var live = fxInfo.rates[c.code] || c.fallbackRate;
                return '<tr><td>' + c.code + '</td>' +
                    '<td><input class="pq-input" type="number" step="any" min="0" data-fx="rate" data-code="' + c.code + '" value="' + (o.rate || '') + '" placeholder="' + live + '"></td>' +
                    '<td><input class="pq-input" type="number" step="any" min="0" data-fx="factor" data-code="' + c.code + '" value="' + (o.factor || '') + '" placeholder="' + c.regionalFactor + '"></td></tr>';
            }).join('') + '</tbody></table>' +
            '<div class="pq-actions"><button class="pq-btn" data-act="refresh-fx" type="button">Refresh live rates</button>' +
            '<button class="pq-btn pq-btn-ghost" data-act="clear-fx" type="button">Clear overrides</button></div>';
        el.open = open;
    }

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------
    var toastTimer;
    function toast(msg) {
        var el = $('pq-toast');
        if (!el) return;
        el.textContent = msg;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { var t = $('pq-toast'); if (t) t.textContent = ''; }, 2200);
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
        return Promise.resolve();
    }

    function onSummaryClick(e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        var act = btn.dataset.act;
        if (act === 'save') saveQuote(false);
        else if (act === 'save-new') saveQuote(true);
        else if (act === 'print') window.print();
        else if (act === 'copy') copyText(summaryText(compute())).then(function () { toast('Copied to clipboard'); });
        else if (act === 'reset') {
            if (!confirm('Clear the form and start a new quote?')) return;
            state = defaultState(); currentId = null; renderForm(); render();
        }
    }

    function onExtraClick(e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'refresh-fx') loadFx(true);
        if (btn.dataset.act === 'clear-fx') { settings.overrides = {}; renderSettings(); render(); }
    }

    function onSettingsInput(e) {
        var t = e.target;
        if (!t.dataset.fx) return;
        var code = t.dataset.code;
        var o = settings.overrides[code] = settings.overrides[code] || {};
        var v = parseFloat(t.value);
        if (v > 0) o[t.dataset.fx] = v; else delete o[t.dataset.fx];
        render(true);
    }

    // -----------------------------------------------------------------------
    // Render + init
    // -----------------------------------------------------------------------
    function render(skipSettings) {
        var r = compute();
        renderCurrency();
        renderSummary(r);
        renderDoc(r);
        renderSaved();
        if (!skipSettings) renderSettings();
        persist();
    }

    var booted = false;
    function initApp() {
        if (booted) return;
        booted = true;

        renderForm();
        render();

        $('pq-form').addEventListener('input', onFormInput);
        $('pq-form').addEventListener('change', onFormInput);
        $('pq-summary').addEventListener('click', onSummaryClick);
        $('pq-summary').addEventListener('change', function (e) {
            if (e.target.dataset.view) { settings.view = e.target.dataset.view; render(true); }
        });
        $('pq-currency').addEventListener('change', function (e) {
            if (e.target.dataset.currency) { settings.currency = e.target.dataset.currency; render(); }
        });
        $('pq-saved').addEventListener('click', onSavedClick);
        $('pq-settings').addEventListener('click', onExtraClick);
        $('pq-settings').addEventListener('input', onSettingsInput);
        $('pq-lock').addEventListener('click', lock);
        $('pq-theme').addEventListener('click', function () {
            var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
        });

        loadFx(false);
    }

    initGate();
})();
