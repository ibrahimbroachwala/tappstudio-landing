// ---------------------------------------------------------------------------
// Reveal-on-scroll for app cards
// ---------------------------------------------------------------------------
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });
document.querySelectorAll('.app').forEach((app) => revealObserver.observe(app));

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
// Fullscreen screenshot preview
// ---------------------------------------------------------------------------
const lightbox = document.getElementById('screenshot-lightbox');
const lightboxImage = document.getElementById('screenshot-lightbox-image');
const lightboxClose = document.getElementById('screenshot-lightbox-close');
const screenshotNodes = document.querySelectorAll('.app-screenshots img');

function openLightbox(sourceImg) {
    lightboxImage.srcset = sourceImg.srcset;
    lightboxImage.src = sourceImg.src;
    lightboxImage.alt = sourceImg.alt || 'App screenshot preview';
    lightbox.setAttribute('aria-hidden', 'false');
    lightbox.classList.remove('is-closing');
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    if (!lightbox.classList.contains('is-open')) return;
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
}

screenshotNodes.forEach((img) => {
    img.addEventListener('click', () => openLightbox(img));
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
// How it works tabs
// ---------------------------------------------------------------------------
document.querySelectorAll('[data-tabs]').forEach((group) => {
    const tabs = Array.from(group.querySelectorAll('[role="tab"]'));

    function selectTab(tab, focus) {
        tabs.forEach((t) => {
            const active = t === tab;
            t.setAttribute('aria-selected', String(active));
            t.tabIndex = active ? 0 : -1;
            document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
        });
        if (focus) tab.focus();
    }

    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => selectTab(tab, false));
        tab.addEventListener('keydown', (event) => {
            const last = tabs.length - 1;
            let next = null;
            if (event.key === 'ArrowRight') next = tabs[i === last ? 0 : i + 1];
            if (event.key === 'ArrowLeft') next = tabs[i === 0 ? last : i - 1];
            if (event.key === 'Home') next = tabs[0];
            if (event.key === 'End') next = tabs[last];
            if (next) {
                event.preventDefault();
                selectTab(next, true);
            }
        });
    });
});
