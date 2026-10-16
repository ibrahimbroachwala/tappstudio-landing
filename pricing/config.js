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
            { id: 'landing', unitHint: 'A block on the page, e.g. hero, features, pricing, contact', label: 'Landing page', hint: 'One page, fast to ship', baseHours: 10, hoursPerScreen: 3, unit: 'section', mobile: false, app: false },
            { id: 'website', unitHint: 'A separate page, e.g. Home, About, Services, Contact', label: 'Website', hint: 'Multi-page marketing site', baseHours: 18, hoursPerScreen: 4, unit: 'page', mobile: false, app: false },
            { id: 'webapp', unitHint: 'A distinct view, e.g. login, dashboard, settings, profile', label: 'Web app', hint: 'Logged-in product in browser', baseHours: 24, hoursPerScreen: 4, unit: 'screen', mobile: false, app: true },
            { id: 'mobile', unitHint: 'A distinct app screen, e.g. login, home, detail, profile', label: 'Mobile app', hint: 'iOS and/or Android', baseHours: 24, hoursPerScreen: 4, unit: 'screen', mobile: true, app: true },
            { id: 'mobile_admin', unitHint: 'A distinct app screen, e.g. login, home, detail, profile', label: 'Mobile app + web admin', hint: 'App plus an admin dashboard', baseHours: 40, hoursPerScreen: 4, unit: 'screen', mobile: true, app: true }
        ],

        // Mobile platform factor (one cross-platform codebase, so "both" is not 2x).
        platforms: [
            { id: 'ios', label: 'iOS', hint: 'iPhone and iPad, published on the App Store', factor: 1.0 },
            { id: 'android', label: 'Android', hint: 'Android phones, published on Google Play', factor: 1.0 },
            { id: 'both', label: 'iOS + Android', hint: 'One codebase for both stores, about 15% more than one platform', factor: 1.15 }
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

        // Post-launch support retainer options (hours/month come from supportHoursPerMonth).
        supportMonths: [
            { id: 0, label: 'None', hint: 'No support after launch. Later fixes are quoted separately.' },
            { id: 1, label: '1 mo', hint: 'One month of bug fixes and small updates after launch' },
            { id: 3, label: '3 mo', hint: 'Three months of bug fixes and small updates after launch' },
            { id: 6, label: '6 mo', hint: 'Six months of bug fixes and small updates after launch' }
        ],

        // Features ---------------------------------------------------------------
        // hours: per unit. qty: true shows a quantity box (e.g. languages, integrations).
        // types: project types the feature applies to.
        features: [
            { id: 'auth_email', group: 'Accounts', label: 'Email sign-in', hint: 'Sign up and log in with email and password, including password reset', hours: 4, types: APPS },
            { id: 'auth_social', group: 'Accounts', label: 'Social sign-in (Google / Apple)', hint: 'One-tap login with a Google or Apple account', hours: 3, types: APPS },
            { id: 'auth_phone', group: 'Accounts', label: 'Phone OTP sign-in', hint: 'Log in with a one-time code sent by SMS', hours: 5, types: APPS },
            { id: 'roles', group: 'Accounts', label: 'User roles & permissions', hint: 'Different access levels, e.g. admin, staff, customer', hours: 6, types: APPS },

            { id: 'payments', group: 'Money', label: 'Payments', hint: 'Checkout through a gateway (Stripe, Razorpay): cards, UPI, wallets. For goods and services.', hours: 12, types: ['website', 'webapp', 'mobile', 'mobile_admin'] },
            { id: 'subscriptions', group: 'Money', label: 'Subscriptions / in-app purchases', hint: 'Apple / Google billing for premium plans and digital items bought inside the app', hours: 8, types: APPS },

            { id: 'push', group: 'Engagement', label: 'Push notifications', hint: 'Notifications delivered to users\' phones', hours: 4, types: MOBILE },
            { id: 'email_notif', group: 'Engagement', label: 'Transactional emails', hint: 'Automatic emails such as welcome, receipts and alerts', hours: 4, types: APPS },
            { id: 'chat', group: 'Engagement', label: 'Chat / realtime', hint: 'Live messaging or real-time updates between users', hours: 16, types: APPS },
            { id: 'maps', group: 'Engagement', label: 'Maps & location', hint: 'Maps, location pins, nearby search and directions', hours: 10, types: APPS },

            { id: 'contact_form', group: 'Content & data', label: 'Contact form with email delivery', hint: 'Enquiry form that emails you each submission', hours: 2, types: SITES },
            { id: 'blog', group: 'Content & data', label: 'Blog / articles', hint: 'Article pages with a listing and categories', hours: 8, types: ['website'] },
            { id: 'cms', group: 'Content & data', label: 'CMS (editable content)', hint: 'Edit text and images yourself without touching code', hours: 12, types: ['landing', 'website', 'webapp'] },
            { id: 'media', group: 'Content & data', label: 'Media upload', hint: 'Upload and show photos, videos or files', hours: 6, types: ['website'].concat(APPS) },
            { id: 'search', group: 'Content & data', label: 'Search & filters', hint: 'Search bar with filters and sorting', hours: 6, types: APPS },
            { id: 'booking', group: 'Content & data', label: 'Booking / calendar', hint: 'Pick a date or time slot and confirm a booking', hours: 14, types: ['website'].concat(APPS) },
            { id: 'offline', group: 'Content & data', label: 'Offline mode & sync', hint: 'Works without internet and syncs when back online', hours: 14, types: MOBILE },
            { id: 'admin', group: 'Content & data', label: 'Admin panel', hint: 'Web dashboard to manage users and content', hours: 24, types: ['webapp', 'mobile'] },
            { id: 'reports', group: 'Content & data', label: 'Reports & export', hint: 'Summary screens with CSV / PDF export', hours: 8, types: APPS },

            { id: 'analytics', group: 'Growth & quality', label: 'Analytics & event tracking', hint: 'See how people use it: screens, events, funnels', hours: 3, types: ALL },
            { id: 'seo', group: 'Growth & quality', label: 'SEO & metadata', hint: 'Page titles, descriptions and link-sharing previews', hours: 4, types: SITES },
            { id: 'store', group: 'Growth & quality', label: 'Store listing & assets', hint: 'App Store / Play Store listing, screenshots and submission', hours: 6, types: MOBILE },
            { id: 'darkmode', group: 'Growth & quality', label: 'Dark mode', hint: 'Light and dark appearance', hours: 4, types: APPS },
            { id: 'i18n', group: 'Growth & quality', label: 'Extra languages', hint: 'Interface translated into more languages (priced per language)', hours: 4, types: ALL, qty: true, unit: 'languages' },
            { id: 'ai', group: 'Growth & quality', label: 'AI-powered features', hint: 'Chatbot, summaries, or text / image generation (priced per feature)', hours: 16, types: APPS, qty: true, unit: 'features' },
            { id: 'integration', group: 'Growth & quality', label: 'Third-party API integrations', hint: 'Connect to outside services through their API (priced per integration)', hours: 6, types: ALL, qty: true, unit: 'integrations' }
        ],

        // Payments ------------------------------------------------------------------
        milestones: [
            { label: 'On kickoff', pct: 40 },
            { label: 'On first working build', pct: 30 },
            { label: 'On launch', pct: 30 }
        ],

        // Quote text -----------------------------------------------------------------
        // Show each line item's short description under it on the printed quote.
        quoteShowDescriptions: true,
        // Printed when the quote includes Payments or Subscriptions / in-app purchases.
        paymentsNote: [
            'Payments use a gateway such as Stripe or Razorpay for goods and services, and the gateway charges its own fee (typically 2-3%).',
            'In-app purchases and subscriptions use Apple and Google billing, are required for digital content sold inside mobile apps, and carry a 15-30% store fee.'
        ],
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
