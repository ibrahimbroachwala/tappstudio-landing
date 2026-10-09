/* ==========================================================================
   tappStudio pricing: rate card
   Every number that drives a quote lives here. Edit this file to tune prices.
   Hours are build effort BEFORE the QA/PM overhead and contingency below.
   ========================================================================== */

(function (root) {
    // Project type groups used by `types` on features.
    var SITES = ['landing', 'website'];
    var MOBILE = ['mobile', 'mobile_admin'];
    var APPS = ['webapp', 'mobile', 'mobile_admin'];
    var ALL = SITES.concat(APPS);

    var config = {
        // SHA-256 of the passcode. Create one with:
        //   printf '%s' 'your-passcode' | shasum -a 256
        // The page is static, so this only keeps casual visitors out: the rates below are readable in the source.
        passcodeHash: '9cc11a1d7888aa23bd33b99fa1d5b325f1dccf38e9a2054d63649ec7171ed3ea',

        // Core rates ------------------------------------------------------------
        hourlyRateUSD: 53,
        qaPmOverhead: 0.15,          // testing, builds, client comms, revisions
        contingency: 0.10,           // unknowns
        productiveHoursPerDay: 6,    // for the timeline estimate
        range: { low: 0.9, high: 1.2 },
        minimumProjectUSD: 400,
        supportHoursPerMonth: 4,     // post-launch support retainer, billed at the hourly rate
        validityDays: 14,

        // Project types ---------------------------------------------------------
        // baseHours covers setup, repo/CI, deployment and (for mobile) store submission.
        // unit: what a "screen" is called. mobile: shows the platform picker.
        projectTypes: [
            { id: 'landing', label: 'Landing page', hint: 'One page, fast to ship', baseHours: 10, hoursPerScreen: 3, unit: 'section', mobile: false, app: false },
            { id: 'website', label: 'Website', hint: 'Multi-page marketing site', baseHours: 18, hoursPerScreen: 4, unit: 'page', mobile: false, app: false },
            { id: 'webapp', label: 'Web app', hint: 'Logged-in product in browser', baseHours: 24, hoursPerScreen: 4, unit: 'screen', mobile: false, app: true },
            { id: 'mobile', label: 'Mobile app', hint: 'iOS and/or Android', baseHours: 24, hoursPerScreen: 4, unit: 'screen', mobile: true, app: true },
            { id: 'mobile_admin', label: 'Mobile app + web admin', hint: 'App plus an admin dashboard', baseHours: 40, hoursPerScreen: 4, unit: 'screen', mobile: true, app: true }
        ],

        // Mobile platform factor (one cross-platform codebase, so "both" is not 2x).
        platforms: [
            { id: 'ios', label: 'iOS', factor: 1.0 },
            { id: 'android', label: 'Android', factor: 1.0 },
            { id: 'both', label: 'iOS + Android', factor: 1.15 }
        ],

        // Multiplies screen hours only.
        designTiers: [
            { id: 'template', label: 'Template / UI kit', hint: 'Faster, uses a ready UI kit', factor: 0.75 },
            { id: 'custom', label: 'Custom design', hint: 'Designed for the product', factor: 1.0 },
            { id: 'premium', label: 'Premium + motion', hint: 'Polish, animation, delight', factor: 1.3 }
        ],

        // Multiplies the whole build.
        complexity: [
            { id: 'simple', label: 'Simple', hint: 'Few rules, common patterns', factor: 0.85 },
            { id: 'standard', label: 'Standard', hint: 'Typical product logic', factor: 1.0 },
            { id: 'complex', label: 'Complex', hint: 'Heavy logic, many edge cases', factor: 1.3 }
        ],

        // Only for app types (not landing/website).
        backends: [
            { id: 'none', label: 'None', hint: 'Local data / no server', hours: 0 },
            { id: 'baas', label: 'Firebase / Supabase', hint: 'Managed backend', hours: 12 },
            { id: 'custom', label: 'Custom API', hint: 'Own server and database', hours: 32 }
        ],

        // surcharge multiplies price. durationFactor shrinks calendar time (you work longer days, not faster).
        timeline: [
            { id: 'standard', label: 'Standard', hint: 'Normal schedule', surcharge: 1.0, durationFactor: 1.0 },
            { id: 'fast', label: 'Fast', hint: '+20%, about 20% sooner', surcharge: 1.2, durationFactor: 0.8 },
            { id: 'rush', label: 'Rush', hint: '+40%, about 40% sooner', surcharge: 1.4, durationFactor: 0.6 }
        ],

        supportMonths: [0, 1, 3, 6],

        // Features ---------------------------------------------------------------
        // hours: per unit. qty: true shows a quantity box (e.g. languages, integrations).
        // types: project types the feature applies to.
        features: [
            { id: 'auth_email', group: 'Accounts', label: 'Email sign-in', hours: 4, types: APPS },
            { id: 'auth_social', group: 'Accounts', label: 'Social sign-in (Google / Apple)', hours: 3, types: APPS },
            { id: 'auth_phone', group: 'Accounts', label: 'Phone OTP sign-in', hours: 5, types: APPS },
            { id: 'roles', group: 'Accounts', label: 'User roles & permissions', hours: 6, types: APPS },

            { id: 'payments', group: 'Money', label: 'Payments', hours: 12, types: ['website', 'webapp', 'mobile', 'mobile_admin'] },
            { id: 'subscriptions', group: 'Money', label: 'Subscriptions / in-app purchases', hours: 8, types: APPS },

            { id: 'push', group: 'Engagement', label: 'Push notifications', hours: 4, types: MOBILE },
            { id: 'email_notif', group: 'Engagement', label: 'Transactional emails', hours: 4, types: APPS },
            { id: 'chat', group: 'Engagement', label: 'Chat / realtime', hours: 16, types: APPS },
            { id: 'maps', group: 'Engagement', label: 'Maps & location', hours: 10, types: APPS },

            { id: 'contact_form', group: 'Content & data', label: 'Contact form with email delivery', hours: 2, types: SITES },
            { id: 'blog', group: 'Content & data', label: 'Blog / articles', hours: 8, types: ['website'] },
            { id: 'cms', group: 'Content & data', label: 'CMS (editable content)', hours: 12, types: ['landing', 'website', 'webapp'] },
            { id: 'media', group: 'Content & data', label: 'Media upload', hours: 6, types: ['website'].concat(APPS) },
            { id: 'search', group: 'Content & data', label: 'Search & filters', hours: 6, types: APPS },
            { id: 'booking', group: 'Content & data', label: 'Booking / calendar', hours: 14, types: ['website'].concat(APPS) },
            { id: 'offline', group: 'Content & data', label: 'Offline mode & sync', hours: 14, types: MOBILE },
            { id: 'admin', group: 'Content & data', label: 'Admin panel', hours: 24, types: ['webapp', 'mobile'] },
            { id: 'reports', group: 'Content & data', label: 'Reports & export', hours: 8, types: APPS },

            { id: 'analytics', group: 'Growth & quality', label: 'Analytics & event tracking', hours: 3, types: ALL },
            { id: 'seo', group: 'Growth & quality', label: 'SEO & metadata', hours: 4, types: SITES },
            { id: 'store', group: 'Growth & quality', label: 'Store listing & assets', hours: 6, types: MOBILE },
            { id: 'darkmode', group: 'Growth & quality', label: 'Dark mode', hours: 4, types: APPS },
            { id: 'i18n', group: 'Growth & quality', label: 'Extra languages', hours: 4, types: ALL, qty: true, unit: 'languages' },
            { id: 'ai', group: 'Growth & quality', label: 'AI-powered features', hours: 16, types: APPS, qty: true, unit: 'features' },
            { id: 'integration', group: 'Growth & quality', label: 'Third-party API integrations', hours: 6, types: ALL, qty: true, unit: 'integrations' }
        ],

        // Payments ------------------------------------------------------------------
        milestones: [
            { label: 'On kickoff', pct: 40 },
            { label: 'On first working build', pct: 30 },
            { label: 'On launch', pct: 30 }
        ],

        // Quote text -----------------------------------------------------------------
        exclusions: [
            'Content writing, photography and brand/logo design',
            'Paid third-party services (hosting, domains, SMS, payment gateway fees, developer accounts)',
            'Features not listed in this quote (handled as a change request)',
            'Ongoing maintenance beyond the support period selected'
        ],
        assumptions: [
            'Timeline starts once scope is signed off and the kickoff payment is received.',
            'Client provides content, assets and approvals promptly.',
            'Includes two rounds of revisions per milestone.',
            'Prices are estimates within the stated range until scope is confirmed.'
        ],

        // Currencies ------------------------------------------------------------------
        // fallbackRate: units per 1 USD when the live fetch fails (approximate).
        // regionalFactor: local pricing adjustment on top of conversion.
        // roundTo: totals round up to this step. lineRound: line items round to nearest.
        currencies: [
            { code: 'USD', label: 'US Dollar', locale: 'en-US', fallbackRate: 1, regionalFactor: 1, roundTo: 50, lineRound: 5 },
            { code: 'EUR', label: 'Euro', locale: 'en-IE', fallbackRate: 0.89, regionalFactor: 1, roundTo: 50, lineRound: 5 },
            { code: 'AED', label: 'UAE Dirham', locale: 'en-AE', fallbackRate: 3.6725, regionalFactor: 1, roundTo: 100, lineRound: 10 },
            { code: 'INR', label: 'Indian Rupee', locale: 'en-IN', fallbackRate: 97, regionalFactor: 0.5, roundTo: 5000, lineRound: 500 }
        ],
        fxUrl: 'https://open.er-api.com/v6/latest/USD',
        fxCacheHours: 24,

        company: {
            name: 'tappStudio',
            site: 'tappstudio.in',
            email: 'tappstudio.in@gmail.com',
            by: 'Ibrahim Broachwala'
        }
    };

    root.PRICING_CONFIG = config;
    if (typeof module !== 'undefined' && module.exports) module.exports = config;
})(typeof window !== 'undefined' ? window : globalThis);
