/* ==========================================================================
   Our Love Story — v2
   Vanilla ES2020, no build step. Every module is independent and self-guarding
   so a missing element on one page never breaks the rest.
   ========================================================================== */

(() => {
    'use strict';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    /* ----------------------------------------------------------------------
       Personalisation — ?to=Name&from=Name&since=YYYY-MM-DD
       ---------------------------------------------------------------------- */

    const params = new URLSearchParams(window.location.search);

    const CONFIG = {
        to:    (params.get('to')   || 'you').slice(0, 40),
        from:  (params.get('from') || 'Me').slice(0, 40),
        since: parseSince(params.get('since') || '2019-06-14'),
    };

    function parseSince(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) || date > new Date() ? new Date('2019-06-14') : date;
    }

    function applyPersonalisation() {
        $$('[data-bind]').forEach((el) => {
            const key = el.dataset.bind;
            if (CONFIG[key]) el.textContent = CONFIG[key];
        });
        if (CONFIG.to !== 'you') {
            document.title = `${CONFIG.to}, will you marry me?`;
        }
    }

    /* ----------------------------------------------------------------------
       Theme
       ---------------------------------------------------------------------- */

    function initTheme() {
        const toggle = $('#themeToggle');
        const stored = safeRead('lovestory:theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        setTheme(stored || (systemDark ? 'dark' : 'light'));

        if (!toggle) return;
        toggle.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            setTheme(next);
            safeWrite('lovestory:theme', next);
        });

        function setTheme(theme) {
            document.documentElement.dataset.theme = theme;
            if (!toggle) return;
            const dark = theme === 'dark';
            toggle.setAttribute('aria-pressed', String(dark));
            toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
            $('.icon-btn-glyph', toggle).textContent = dark ? '☀️' : '🌙';
        }
    }

    function safeRead(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    }
    function safeWrite(key, value) {
        try { localStorage.setItem(key, value); } catch { /* private mode — ignore */ }
    }

    /* ----------------------------------------------------------------------
       Ambient hearts
       ---------------------------------------------------------------------- */

    function initHearts() {
        const container = $('.hearts');
        if (!container || prefersReducedMotion) return;

        const glyphs = ['❤️', '💕', '💖', '💗', '💝', '🤍'];
        const count = window.innerWidth < 700 ? 10 : 18;

        for (let i = 0; i < count; i++) {
            const heart = document.createElement('span');
            heart.className = 'heart';
            heart.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
            heart.style.left = `${Math.random() * 100}%`;
            heart.style.setProperty('--size', `${0.9 + Math.random() * 1.6}rem`);
            heart.style.setProperty('--drift', `${Math.random() * 180 - 90}px`);
            heart.style.animationDuration = `${14 + Math.random() * 14}s`;
            heart.style.animationDelay = `${-Math.random() * 20}s`;
            container.appendChild(heart);
        }
    }

    /* ----------------------------------------------------------------------
       Scroll reveal + active nav link
       ---------------------------------------------------------------------- */

    function initReveal() {
        const items = $$('.reveal');
        if (!items.length) return;

        if (prefersReducedMotion || !('IntersectionObserver' in window)) {
            items.forEach((el) => el.classList.add('is-visible'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

        // Stagger siblings so grids cascade instead of popping in together.
        items.forEach((el) => {
            const siblings = el.parentElement ? Array.from(el.parentElement.children) : [];
            const index = siblings.indexOf(el);
            el.style.transitionDelay = `${Math.min(index, 6) * 70}ms`;
            observer.observe(el);
        });
    }

    function initActiveNav() {
        const links = $$('.nav-links a');
        if (!links.length || !('IntersectionObserver' in window)) return;

        const map = new Map();
        links.forEach((link) => {
            const section = document.querySelector(link.getAttribute('href'));
            if (section) map.set(section, link);
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const link = map.get(entry.target);
                if (link) link.classList.toggle('is-active', entry.isIntersecting);
            });
        }, { rootMargin: '-45% 0px -50% 0px' });

        map.forEach((_, section) => observer.observe(section));
    }

    /* ----------------------------------------------------------------------
       "Together since" counter
       ---------------------------------------------------------------------- */

    function initCounter() {
        const root = $('#togetherCounter');
        if (!root) return;

        const fields = {
            days:  $('[data-counter="days"]', root),
            hours: $('[data-counter="hours"]', root),
            beats: $('[data-counter="beats"]', root),
        };
        const nf = new Intl.NumberFormat();

        const tick = () => {
            const ms = Date.now() - CONFIG.since.getTime();
            const hours = Math.floor(ms / 3_600_000);
            if (fields.days)  fields.days.textContent  = nf.format(Math.floor(hours / 24));
            if (fields.hours) fields.hours.textContent = nf.format(hours);
            // ~70 bpm, rounded to something readable.
            if (fields.beats) fields.beats.textContent = `${nf.format(Math.floor(hours * 4200 / 1_000_000))}M`;
        };

        tick();
        setInterval(tick, 60_000);
    }

    /* ----------------------------------------------------------------------
       Reasons — show more
       ---------------------------------------------------------------------- */

    function initReasons() {
        const button = $('#moreReasons');
        const list = $('#reasonsList');
        if (!button || !list) return;

        button.addEventListener('click', () => {
            const hidden = $$('.reason.is-hidden', list);
            if (hidden.length) {
                hidden.forEach((el) => {
                    el.classList.remove('is-hidden');
                    el.classList.add('is-visible');
                });
                button.textContent = 'Show fewer';
                button.setAttribute('aria-expanded', 'true');
            } else {
                const all = $$('.reason', list);
                const extras = all.slice(6);
                extras.forEach((el) => el.classList.add('is-hidden'));
                button.textContent = `Show ${extras.length} more reasons`;
                button.setAttribute('aria-expanded', 'false');
                list.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
            }
        });
    }

    /* ----------------------------------------------------------------------
       Gallery lightbox
       ---------------------------------------------------------------------- */

    function initLightbox() {
        const lightbox = $('#lightbox');
        const photo = $('#lightboxPhoto');
        const caption = $('#lightboxCaption');
        const closeBtn = $('#lightboxClose');
        const gallery = $('.gallery');
        if (!lightbox || !gallery) return;

        let lastFocused = null;

        const open = (trigger) => {
            lastFocused = trigger;
            photo.textContent = trigger.dataset.emoji || '💞';
            caption.textContent = trigger.dataset.caption || '';
            lightbox.hidden = false;
            document.body.style.overflow = 'hidden';
            closeBtn.focus();
        };

        const close = () => {
            lightbox.hidden = true;
            document.body.style.overflow = '';
            if (lastFocused) lastFocused.focus();
        };

        // Delegated, not bound per-card: when gallery-service supplies the
        // moments the cards are re-rendered, and per-card listeners would die.
        gallery.addEventListener('click', (e) => {
            const trigger = e.target.closest('.polaroid');
            if (trigger) open(trigger);
        });
        closeBtn.addEventListener('click', close);
        lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !lightbox.hidden) close();
        });
    }

    /* ----------------------------------------------------------------------
       The question — the "No" button that will not be caught
       ---------------------------------------------------------------------- */

    const DODGES = [
        'Are you sure? 🥺',
        'Try again, I dare you.',
        'That button is faster than it looks.',
        'It moved. That counts as a yes, right?',
        'Nine out of ten hearts say yes.',
        'You could just… press the green one.',
        'I have all day.',
        'Okay now it\'s personal. 😄',
    ];

    function initQuestion() {
        const section = $('#question');
        const yesBtn = $('#yesBtn');
        const noBtn = $('#noBtn');
        const hint = $('#noHint');
        if (!section || !yesBtn || !noBtn) return;

        let dodges = 0;

        const flee = () => {
            const bounds = section.getBoundingClientRect();
            const btn = noBtn.getBoundingClientRect();
            const pad = 16;

            if (!noBtn.classList.contains('is-loose')) {
                // Freeze current position before switching to absolute placement,
                // otherwise the button teleports on the very first dodge.
                noBtn.style.width = `${btn.width}px`;
                noBtn.style.left = `${btn.left - bounds.left}px`;
                noBtn.style.top = `${btn.top - bounds.top}px`;
                noBtn.classList.add('is-loose');
                // Force a reflow so the transition runs from the frozen position.
                void noBtn.offsetWidth;
            }

            const maxX = Math.max(pad, bounds.width - btn.width - pad);
            const maxY = Math.max(pad, bounds.height - btn.height - pad);
            const x = pad + Math.random() * (maxX - pad);
            const y = pad + Math.random() * (maxY - pad);

            noBtn.style.left = `${x}px`;
            noBtn.style.top = `${y}px`;
            noBtn.style.transform = `rotate(${Math.random() * 24 - 12}deg)`;

            dodges += 1;
            if (hint) hint.textContent = DODGES[Math.min(dodges - 1, DODGES.length - 1)];
            if (dodges >= 6) yesBtn.style.transform = `scale(${Math.min(1 + (dodges - 5) * 0.06, 1.4)})`;
        };

        // Runs away from clicks, taps, and even from the cursor getting close.
        noBtn.addEventListener('click', (e) => { e.preventDefault(); flee(); });
        noBtn.addEventListener('mouseenter', flee);
        noBtn.addEventListener('focus', flee);

        yesBtn.addEventListener('click', showSuccess);

        // Keep the loose button inside the section when the viewport changes.
        window.addEventListener('resize', () => {
            if (noBtn.classList.contains('is-loose')) flee();
        });
    }

    /* ----------------------------------------------------------------------
       Success overlay + confetti
       ---------------------------------------------------------------------- */

    function showSuccess() {
        const overlay = $('#success');
        if (!overlay) return;

        overlay.hidden = false;
        document.body.style.overflow = 'hidden';

        const stamp = $('#successStamp');
        if (stamp) {
            stamp.textContent = `Said yes on ${new Date().toLocaleDateString(undefined, {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}.`;
        }

        $('#celebrateAgain')?.focus();
        confetti.burst();
    }

    function initSuccess() {
        const overlay = $('#success');
        if (!overlay) return;

        $('#celebrateAgain')?.addEventListener('click', () => confetti.burst());
        $('#closeSuccess')?.addEventListener('click', () => {
            overlay.hidden = true;
            document.body.style.overflow = '';
            confetti.stop();
            $('#question')?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        });
    }

    /* Canvas confetti — bounded lifetime, cancels its own rAF loop when empty. */
    const confetti = (() => {
        const COLORS = ['#e0407f', '#f2679c', '#d9a441', '#10b981', '#ffffff', '#ffc4da'];
        let canvas, ctx, particles = [], frame = null, dpr = 1;

        function ensureCanvas() {
            canvas = canvas || $('#confetti');
            if (!canvas) return false;
            ctx = ctx || canvas.getContext('2d');
            resize();
            return Boolean(ctx);
        }

        function resize() {
            if (!canvas) return;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
        }

        function spawn(count) {
            const w = canvas.clientWidth;
            for (let i = 0; i < count; i++) {
                particles.push({
                    x: w * Math.random(),
                    y: -20 - Math.random() * canvas.clientHeight * 0.4,
                    vx: Math.random() * 2.4 - 1.2,
                    vy: 2 + Math.random() * 3.4,
                    size: 5 + Math.random() * 7,
                    rot: Math.random() * Math.PI,
                    vr: Math.random() * 0.2 - 0.1,
                    color: COLORS[Math.floor(Math.random() * COLORS.length)],
                    life: 1,
                });
            }
        }

        function step() {
            const h = canvas.clientHeight;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, canvas.clientWidth, h);

            particles = particles.filter((p) => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.035;
                p.vx += Math.sin(p.y / 40) * 0.02;
                p.rot += p.vr;
                if (p.y > h + 40) p.life = 0;

                if (p.life > 0) {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                    ctx.restore();
                }
                return p.life > 0;
            });

            if (particles.length) {
                frame = requestAnimationFrame(step);
            } else {
                frame = null;
            }
        }

        return {
            burst() {
                if (!ensureCanvas()) return;
                if (prefersReducedMotion) return;   // celebrate quietly
                spawn(160);
                if (frame === null) frame = requestAnimationFrame(step);
            },
            stop() {
                if (frame !== null) cancelAnimationFrame(frame);
                frame = null;
                particles = [];
                if (ctx && canvas) {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            },
            resize,
        };
    })();

    /* ----------------------------------------------------------------------
       Boot
       ---------------------------------------------------------------------- */

    function init() {
        applyPersonalisation();
        initTheme();
        initHearts();
        initReveal();
        initActiveNav();
        initCounter();
        initReasons();
        initLightbox();
        initQuestion();
        initSuccess();

        window.addEventListener('resize', () => confetti.resize());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* ==========================================================================
   Mesh integration
   ==========================================================================
   Everything below is ADDITIVE. Open this file with `python3 -m http.server`
   and none of it runs — every fetch fails, each handler bails out quietly,
   and you get exactly the static page you had before.

   Run it behind the Go frontend in mesh/ and the page instead pulls its
   content from three separate services. That is what turns this site from
   "one static file server" into something Istio actually has work to do on:

       browser → frontend → story-service     (east-west)
                          → gallery-service   (east-west)
                          → counter-service   (east-west)
                          → rsvp-service      (east-west, and the write path)

   The version badge in the corner is the point of the canary lab: refresh
   twenty times and watch it flip between v1 and v2 at whatever ratio the
   VirtualService says.
   ========================================================================== */

(() => {
    'use strict';

    const API = '/api';
    const TIMEOUT_MS = 2500;

    // Every call is best-effort. A failure here must never break the page.
    async function api(path, options = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(API + path, { ...options, signal: controller.signal });
            if (!res.ok) throw new Error(res.status);
            return await res.json();
        } finally {
            clearTimeout(timer);
        }
    }

    const el = (tag, cls, html) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (html != null) node.innerHTML = html;
        return node;
    };

    const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ── Which pod served this page? The canary made visible. ────────────── */

    async function showVersionBadge() {
        const info = await api('/whoami');

        const badge = el('div', 'mesh-badge');
        badge.innerHTML =
            `<span class="mesh-badge-dot" data-version="${esc(info.version)}"></span>` +
            `served by <strong>${esc(info.version)}</strong>` +
            `<span class="mesh-badge-pod">${esc(info.pod)}</span>`;
        document.body.appendChild(badge);

        const style = el('style');
        style.textContent = `
            .mesh-badge {
                position: fixed; left: 1rem; bottom: 1rem; z-index: 150;
                display: flex; align-items: center; gap: .5rem;
                padding: .5rem .85rem; border-radius: 999px;
                background: var(--bg-elevated, #fff); color: var(--text, #2a1d24);
                border: 1px solid var(--border, rgba(0,0,0,.12));
                box-shadow: var(--shadow-sm, 0 4px 12px rgba(0,0,0,.1));
                font-size: .78rem; font-family: var(--font-body, system-ui);
            }
            .mesh-badge-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
            .mesh-badge-dot[data-version="v1"] { background: #d9a441; }
            .mesh-badge-pod { opacity: .55; font-family: ui-monospace, monospace; }
            @media (max-width: 600px) { .mesh-badge-pod { display: none; } }
        `;
        document.head.appendChild(style);
    }

    /* ── story-service → the timeline ─────────────────────────────────────── */

    async function loadStory() {
        const { chapters } = await api('/story');
        const list = document.querySelector('.timeline');
        if (!list || !Array.isArray(chapters) || !chapters.length) return;

        list.replaceChildren(...chapters.map((c) => {
            const item = el('li', 'timeline-item reveal is-visible' + (c.now ? ' is-now' : ''));
            item.innerHTML =
                `<div class="timeline-marker" aria-hidden="true">${esc(c.icon || '✨')}</div>` +
                `<div class="timeline-card"><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></div>`;
            return item;
        }));
    }

    /* ── gallery-service → the polaroids ──────────────────────────────────── */

    async function loadGallery() {
        const { moments } = await api('/gallery');
        const list = document.querySelector('.gallery');
        if (!list || !Array.isArray(moments) || !moments.length) return;

        list.replaceChildren(...moments.map((m) => {
            const li = el('li');
            const btn = el('button', 'polaroid reveal is-visible');
            btn.type = 'button';
            btn.dataset.emoji = m.emoji;
            btn.dataset.caption = m.caption;
            btn.innerHTML =
                `<span class="polaroid-photo" aria-hidden="true">${esc(m.emoji)}</span>` +
                `<span class="polaroid-caption">${esc(m.caption)}</span>`;
            li.appendChild(btn);
            return li;
        }));
        // The lightbox listens on .gallery by delegation, so these just work.
    }

    /* ── counter-service → days together ──────────────────────────────────── */

    async function loadCounter() {
        const since = new URLSearchParams(location.search).get('since');
        const data = await api('/counter' + (since ? `?since=${encodeURIComponent(since)}` : ''));
        const nf = new Intl.NumberFormat();

        const set = (key, value) => {
            const node = document.querySelector(`[data-counter="${key}"]`);
            if (node) node.textContent = value;
        };
        set('days', nf.format(data.days));
        set('hours', nf.format(data.hours));
        set('beats', `${nf.format(data.beats)}M`);
    }

    /* ── rsvp-service → the write path, and the interesting one for authz ─── */

    function wireRsvp() {
        const yes = document.getElementById('yesBtn');
        if (!yes) return;

        // Stacks on top of the existing handler — the celebration still runs
        // even if this POST is rejected by an AuthorizationPolicy.
        yes.addEventListener('click', async () => {
            try {
                const result = await api('/rsvp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ answer: 'yes' }),
                });
                const stamp = document.getElementById('successStamp');
                if (stamp && result.yes) {
                    stamp.textContent += ` That is yes number ${result.yes}.`;
                }
            } catch {
                /* No backend, or authz said no. The page does not care. */
            }
        });
    }

    /* ── Boot: each one independent, so one failure never blocks the rest ── */

    function boot() {
        [showVersionBadge, loadStory, loadGallery, loadCounter].forEach((fn) => {
            fn().catch(() => { /* running standalone — keep the static content */ });
        });
        wireRsvp();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
