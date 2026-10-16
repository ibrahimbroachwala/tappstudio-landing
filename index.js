const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------------------
// Reveal on scroll (tiles, principles, the Now board)
// ---------------------------------------------------------------------------
const revealNodes = document.querySelectorAll('[data-reveal]');

if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealNodes.forEach((node) => {
        // Stagger siblings that enter together
        const siblings = Array.from(node.parentElement.children).filter((el) => el.hasAttribute('data-reveal'));
        node.style.setProperty('--reveal-delay', (siblings.indexOf(node) % 3) * 0.08 + 's');
        revealObserver.observe(node);
    });
} else {
    revealNodes.forEach((node) => node.classList.add('is-visible'));
}

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------
const themeBtn = document.getElementById('theme-toggle-btn');

function setTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem('theme', mode); } catch (e) { /* ignore */ }
}

if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
    });
}

// ---------------------------------------------------------------------------
// Hero: rotating word, screenshot deck and app dock stay in step
// ---------------------------------------------------------------------------
const dock = document.getElementById('dock');

if (dock) {
    const dockBtns = Array.from(dock.querySelectorAll('.dock-btn'));
    const cards = Array.from(document.querySelectorAll('#deck .deck-card'));
    const words = Array.from(document.querySelectorAll('.hero-word'));
    const caption = document.getElementById('stage-caption');
    const captionIcon = document.getElementById('stage-caption-icon');
    const captionName = document.getElementById('stage-caption-name');
    const captionLine = document.getElementById('stage-caption-line');
    const stage = document.querySelector('.hero-stage');
    const n = dockBtns.length;
    const CYCLE_MS = 3600;
    let current = 0;
    let timer = null;
    let paused = false;

    function show(index) {
        const prev = current;
        current = (index + n) % n;

        cards.forEach((card, i) => card.setAttribute('data-pos', String((i - current + n) % n)));
        dockBtns.forEach((btn, i) => btn.setAttribute('aria-pressed', String(i === current)));

        if (prev !== current && words[prev]) {
            const leaving = words[prev];
            leaving.classList.remove('is-active');
            leaving.classList.add('is-leaving');
            setTimeout(() => leaving.classList.remove('is-leaving'), 650);
        }
        words.forEach((w, i) => w.classList.toggle('is-active', i === current));

        const btn = dockBtns[current];
        caption.href = btn.dataset.href;
        captionIcon.src = btn.dataset.icon;
        captionName.textContent = btn.dataset.name;
        captionLine.textContent = btn.dataset.line;

        // Restart the timer bar animation on the newly active button
        if (dock.classList.contains('is-playing')) {
            dock.classList.remove('is-playing');
            void dock.offsetWidth;
            dock.classList.add('is-playing');
        }
    }

    function play() {
        stop();
        if (reducedMotion.matches || paused || document.hidden) return;
        dock.classList.add('is-playing');
        dockBtns.forEach((btn) => btn.style.setProperty('--cycle', CYCLE_MS + 'ms'));
        timer = setInterval(() => show(current + 1), CYCLE_MS);
    }

    function stop() {
        clearInterval(timer);
        timer = null;
        dock.classList.remove('is-playing');
    }

    dockBtns.forEach((btn, i) => {
        btn.addEventListener('click', () => {
            show(i);
            paused = true; // the visitor picked one: stop auto-playing
            stop();
        });
    });

    // Pause while the pointer or keyboard focus is on the stage
    stage.addEventListener('pointerenter', () => stop());
    stage.addEventListener('pointerleave', () => play());
    stage.addEventListener('focusin', () => stop());
    stage.addEventListener('focusout', () => play());
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));

    // Only animate while the hero is on screen
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => (entry.isIntersecting ? play() : stop()))
            .observe(document.getElementById('intro'));
    } else {
        play();
    }
}

// ---------------------------------------------------------------------------
// App tiles: spotlight follows the pointer
// ---------------------------------------------------------------------------
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.tile').forEach((tile) => {
        tile.addEventListener('pointermove', (event) => {
            const rect = tile.getBoundingClientRect();
            tile.style.setProperty('--mx', (event.clientX - rect.left) + 'px');
            tile.style.setProperty('--my', (event.clientY - rect.top) + 'px');
        });
    });
}

// ---------------------------------------------------------------------------
// Fullscreen screenshot preview
// ---------------------------------------------------------------------------
const lightbox = document.getElementById('screenshot-lightbox');
const lightboxImage = document.getElementById('screenshot-lightbox-image');
const lightboxClose = document.getElementById('screenshot-lightbox-close');
const screenshotNodes = document.querySelectorAll('.shot');
let lightboxOpener = null;

function openLightbox(sourceImg, opener) {
    lightboxOpener = opener || null;
    lightboxImage.srcset = sourceImg.srcset;
    lightboxImage.src = sourceImg.src;
    lightboxImage.alt = sourceImg.alt || 'App screenshot preview';
    lightbox.setAttribute('aria-hidden', 'false');
    lightbox.classList.remove('is-closing');
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (lightboxClose) lightboxClose.focus({ preventScroll: true });
}

function closeLightbox() {
    if (!lightbox || !lightbox.classList.contains('is-open')) return;
    lightbox.classList.remove('is-open');
    lightbox.classList.add('is-closing');

    const handleAnimationEnd = (event) => {
        if (event.target !== lightbox) return;
        lightbox.classList.remove('is-closing');
        lightbox.setAttribute('aria-hidden', 'true');
        lightboxImage.removeAttribute('srcset');
        lightboxImage.src = '';
        lightboxImage.alt = '';
        document.body.style.overflow = '';
        lightbox.removeEventListener('animationend', handleAnimationEnd);
    };

    lightbox.addEventListener('animationend', handleAnimationEnd);
    if (lightboxOpener) lightboxOpener.focus({ preventScroll: true });
}

screenshotNodes.forEach((btn) => {
    btn.addEventListener('click', () => openLightbox(btn.querySelector('img'), btn));
});

if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);

if (lightbox) {
    lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox) closeLightbox();
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeLightbox();
});

// ---------------------------------------------------------------------------
// Contact dialog
// ---------------------------------------------------------------------------
const contactDialog = document.getElementById('contact-dialog');
const contactForm = document.getElementById('contact-form');
const contactSuccess = document.getElementById('contact-success');
const contactClose = document.getElementById('contact-close');
const contactSuccessClose = document.getElementById('contact-success-close');
const contactSubmit = document.getElementById('contact-submit');
const contactStatus = document.getElementById('contact-status');
const contactSubjectField = document.getElementById('contact-subject');
const openContactButtons = document.querySelectorAll('[data-open-contact]');

function resetContactForm() {
    contactForm.hidden = false;
    contactSuccess.hidden = true;
    contactStatus.textContent = '';
    contactStatus.classList.remove('is-error');
}

function openContactDialog(event) {
    if (!contactDialog) return;
    resetContactForm();

    // Buttons can pre-select a topic, e.g. data-topic="Website"
    const topic = event && event.currentTarget && event.currentTarget.dataset
        ? event.currentTarget.dataset.topic : '';
    if (topic) {
        const radio = document.querySelector('input[name="topic"][value="' + topic + '"]');
        if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change'));
        }
    }
    contactDialog.showModal();
    const nameField = document.getElementById('contact-name');
    if (nameField) nameField.focus();
}

function closeContactDialog() {
    if (contactDialog && contactDialog.open) contactDialog.close();
}

openContactButtons.forEach((btn) => btn.addEventListener('click', openContactDialog));
if (contactClose) contactClose.addEventListener('click', closeContactDialog);
if (contactSuccessClose) contactSuccessClose.addEventListener('click', closeContactDialog);

if (contactDialog) {
    // Close on backdrop click
    contactDialog.addEventListener('click', (event) => {
        const rect = contactDialog.getBoundingClientRect();
        const inDialog = rect.top <= event.clientY && event.clientY <= rect.top + rect.height
            && rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
        if (!inDialog) closeContactDialog();
    });
}

// Keep the hidden "subject" field in sync with the chosen topic
document.querySelectorAll('input[name="topic"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        if (contactSubjectField) {
            contactSubjectField.value = 'tappStudio: ' + radio.value;
        }
    });
});

if (contactForm) {
    contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const accessKeyField = contactForm.querySelector('input[name="access_key"]');
        const accessKey = accessKeyField ? accessKeyField.value : '';
        const name = document.getElementById('contact-name').value;
        const email = document.getElementById('contact-email').value;
        const message = document.getElementById('contact-message').value;

        contactSubmit.disabled = true;
        contactSubmit.textContent = 'Sending…';
        contactStatus.textContent = '';
        contactStatus.classList.remove('is-error');

        if (!accessKey) {
            // Not configured yet: fail gracefully with a mailto fallback.
            showContactError(name, email, message, 'The contact form isn\'t wired up yet.');
            return;
        }

        try {
            const formData = new FormData(contactForm);
            const response = await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                headers: { Accept: 'application/json' },
                body: formData,
            });
            const result = await response.json();

            if (result.success) {
                contactForm.hidden = true;
                contactSuccess.hidden = false;
            } else {
                showContactError(name, email, message, result.message || 'Something went wrong.');
            }
        } catch (err) {
            showContactError(name, email, message, 'Could not reach the server.');
        }
    });
}

function showContactError(name, email, message, reason) {
    const mailBody = encodeURIComponent(
        (message || '') + '\n\n- ' + (name || '') + (email ? ' (' + email + ')' : '')
    );
    const mailtoHref = 'mailto:tappstudio.in@gmail.com?subject=' + encodeURIComponent('tappStudio inquiry') + '&body=' + mailBody;

    contactStatus.classList.add('is-error');
    contactStatus.innerHTML = reason + ' Please <a href="' + mailtoHref + '">email me directly</a> instead.';
    contactSubmit.disabled = false;
    contactSubmit.textContent = 'Send message';
}

// ---------------------------------------------------------------------------
// Portrait card tilt
// ---------------------------------------------------------------------------
const tiltCard = document.querySelector('[data-tilt]');
const canTilt = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');

if (tiltCard && canTilt.matches) {
    tiltCard.addEventListener('pointermove', (event) => {
        const rect = tiltCard.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        tiltCard.style.setProperty('--ry', (x * 22).toFixed(2) + 'deg');
        tiltCard.style.setProperty('--rx', (-y * 16).toFixed(2) + 'deg');
    });
    tiltCard.addEventListener('pointerleave', () => {
        tiltCard.style.removeProperty('--ry');
        tiltCard.style.removeProperty('--rx');
    });
}

// ---------------------------------------------------------------------------
// Section nav ("spine"): right-edge track on desktop, chip + sheet on mobile
// ---------------------------------------------------------------------------
const spine = document.getElementById('spine');

if (spine) {
    const spineToggle = document.getElementById('spine-toggle');
    const spinePanel = document.getElementById('spine-panel');
    const ringFill = document.getElementById('spine-ring-fill');
    const spineLinks = Array.from(spine.querySelectorAll('.spine-link'));
    const spineSections = spineLinks.map((link) => document.getElementById(link.hash.slice(1)));
    const numSlots = spine.querySelectorAll('[data-spine-num]');
    const labelSlots = spine.querySelectorAll('[data-spine-label]');
    const hero = document.getElementById('intro');
    const footer = document.querySelector('.site-footer');
    const TICK_GAP = 22; // min px between ticks on the desktop track

    let sectionTops = [];
    let activeIndex = -1;
    let ticking = false;

    function maxScroll() {
        return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    }

    // Place each tick at the scroll progress where its section reaches the top,
    // nudging neighbours apart so they stay clickable.
    function layoutSpine() {
        sectionTops = spineSections.map((s) => s.getBoundingClientRect().top + window.scrollY);
        const trackH = spinePanel.clientHeight;
        if (!trackH || getComputedStyle(spineToggle).display !== 'none') return;
        const n = spineLinks.length;
        const pos = sectionTops.map((top) => Math.min(1, top / maxScroll()) * trackH);
        for (let i = 1; i < n; i++) pos[i] = Math.max(pos[i], pos[i - 1] + TICK_GAP);
        for (let i = n - 1; i >= 0; i--) pos[i] = Math.min(pos[i], trackH - (n - 1 - i) * TICK_GAP);
        pos.forEach((px, i) => spineLinks[i].parentElement.style.setProperty('--pos', px + 'px'));
    }

    function setActive(index) {
        if (index === activeIndex) return;
        activeIndex = index;
        spineLinks.forEach((link, i) => {
            if (i === index) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
        });
        const num = String(index + 1).padStart(2, '0');
        const label = spineLinks[index].querySelector('.spine-name').textContent;
        numSlots.forEach((el) => { el.textContent = num; });
        labelSlots.forEach((el) => { el.textContent = label; });
    }

    function updateSpine() {
        ticking = false;
        const y = window.scrollY;
        const p = Math.min(1, Math.max(0, y / maxScroll()));
        spine.style.setProperty('--spine-p', p.toFixed(4));
        if (ringFill) ringFill.style.strokeDashoffset = String(100 - p * 100);

        // Active = last section whose top has passed 40% of the viewport
        const line = y + window.innerHeight * 0.4;
        let index = 0;
        sectionTops.forEach((top, i) => { if (top <= line) index = i; });
        if (p > 0.995) index = spineLinks.length - 1;
        setActive(index);

        // Mobile chip stays out of the way over the hero and the footer
        const pastHero = hero ? hero.getBoundingClientRect().bottom < window.innerHeight * 0.5 : true;
        const atFooter = footer ? footer.getBoundingClientRect().top < window.innerHeight - 40 : false;
        spine.classList.toggle('is-hidden', !pastHero || atFooter);
    }

    function requestUpdate() {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(updateSpine);
        }
    }

    function setOpen(open) {
        spine.classList.toggle('is-open', open);
        spineToggle.setAttribute('aria-expanded', String(open));
    }

    // iOS swallows the click when a tap lands on a page that is still coasting from a
    // swipe (the tap only stops the momentum). Act on touchend instead, unless the
    // finger moved (a scroll), and cancel the click so it doesn't fire twice.
    function onTap(el, handler) {
        let start = null;
        el.addEventListener('touchstart', (event) => {
            const t = event.touches[0];
            start = { x: t.clientX, y: t.clientY };
        }, { passive: true });
        el.addEventListener('touchend', (event) => {
            const t = event.changedTouches[0];
            const moved = !start || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10;
            start = null;
            if (moved) return;
            event.preventDefault();
            handler(event);
        });
        el.addEventListener('click', handler);
    }

    onTap(spineToggle, () => {
        const open = !spine.classList.contains('is-open');
        setOpen(open);
        if (open) (spineLinks[activeIndex] || spineLinks[0]).focus({ preventScroll: true });
    });

    onTap(document.getElementById('spine-backdrop'), () => setOpen(false));

    spineLinks.forEach((link) => onTap(link, (event) => {
        setOpen(false);
        if (event.type !== 'touchend') return; // mouse/keyboard: let the anchor navigate
        const target = document.getElementById(link.hash.slice(1));
        if (!target) return;
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
        history.pushState(null, '', link.hash);
    }));

    document.addEventListener('click', (event) => {
        if (spine.classList.contains('is-open') && !spine.contains(event.target)) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && spine.classList.contains('is-open')) {
            setOpen(false);
            spineToggle.focus();
        }
    });

    function relayout() {
        layoutSpine();
        requestUpdate();
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', relayout);
    window.addEventListener('load', relayout);
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.body);
    relayout();
}
