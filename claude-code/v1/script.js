// Floating Hearts Animation
function createFloatingHearts() {
    const container = document.querySelector('.hearts-container');
    const hearts = ['❤️', '💕', '💖', '💗', '💝'];

    for (let i = 0; i < 15; i++) {
        const heart = document.createElement('div');
        heart.className = 'heart';
        heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
        heart.style.left = Math.random() * 100 + '%';
        heart.style.animationDelay = Math.random() * 2 + 's';
        heart.style.animationDuration = (4 + Math.random() * 4) + 's';
        container.appendChild(heart);
    }
}

// Smooth Scroll
function scrollToProposal() {
    const proposalSection = document.getElementById('proposal');
    proposalSection.scrollIntoView({ behavior: 'smooth' });
}

// No Button Escape Animation
let noClickCount = 0;
function handleNo() {
    const noBtn = document.getElementById('noBtn');
    noClickCount++;

    const randomX = Math.random() * 200 - 100;
    const randomY = Math.random() * 200 - 100;

    noBtn.style.position = 'relative';
    noBtn.style.transform = `translate(${randomX}px, ${randomY}px)`;

    if (noClickCount > 3) {
        noBtn.textContent = "You know you want to! 😄";
    } else if (noClickCount > 6) {
        noBtn.textContent = "Just say yes! 💕";
    } else if (noClickCount > 9) {
        noBtn.textContent = "Please? 🥺";
    }
}

// Yes Button Handler
function handleYes() {
    const proposalSection = document.getElementById('proposal');
    const successSection = document.getElementById('successSection');

    proposalSection.style.display = 'none';
    successSection.style.display = 'flex';

    // Create fireworks
    createFireworks();

    // Play celebration animation
    playConfetti();
}

// Fireworks Animation
function createFireworks() {
    const colors = ['#ff1493', '#ff69b4', '#ffd700', '#10b981', '#3b82f6'];

    for (let i = 0; i < 50; i++) {
        const firework = document.createElement('div');
        firework.className = 'fireworks';

        const angle = (Math.PI * 2 * i) / 50;
        const velocity = 5 + Math.random() * 8;

        const tx = Math.cos(angle) * velocity * 100;
        const ty = Math.sin(angle) * velocity * 100;

        firework.style.left = '50%';
        firework.style.top = '50%';
        firework.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        firework.style.setProperty('--tx', tx + 'px');
        firework.style.setProperty('--ty', ty + 'px');

        document.body.appendChild(firework);

        setTimeout(() => firework.remove(), 600);
    }
}

// Confetti effect
function playConfetti() {
    const colors = ['#10b981', '#059669', '#ffd700', '#ff1493'];

    setInterval(() => {
        const confetti = document.createElement('div');
        confetti.style.position = 'fixed';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = '-10px';
        confetti.style.fontSize = '2rem';
        confetti.style.pointerEvents = 'none';
        confetti.style.zIndex = '9998';
        confetti.textContent = ['🎉', '💕', '💍', '✨'][Math.floor(Math.random() * 4)];

        document.body.appendChild(confetti);

        let topPos = 0;
        const animation = setInterval(() => {
            topPos += 5;
            confetti.style.top = topPos + 'px';

            if (topPos > window.innerHeight) {
                clearInterval(animation);
                confetti.remove();
            }
        }, 30);
    }, 300);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    createFloatingHearts();
});

// Smooth scroll for all anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

/* ==========================================================================
   Mesh integration
   ==========================================================================
   Additive and best-effort, exactly like the v2 site. Served by
   `python3 -m http.server` these fetches fail and nothing changes. Served by
   the Go frontend in mesh/, this page starts talking to rsvp-service and
   shows which frontend version answered.

   v1 is the deliberately smaller integration: it has no timeline or gallery
   to hydrate, which is fine — during the canary lab the visible difference
   between v1 and v2 IS the point.
   ========================================================================== */

(function () {
    'use strict';

    var API = '/api';

    function api(path, options) {
        return fetch(API + path, options || {}).then(function (res) {
            if (!res.ok) throw new Error(res.status);
            return res.json();
        });
    }

    // Which pod served this page? Refresh during the canary lab and watch it flip.
    function showVersionBadge() {
        return api('/whoami').then(function (info) {
            var badge = document.createElement('div');
            badge.className = 'mesh-badge';
            badge.innerHTML =
                '<span class="mesh-badge-dot"></span>served by <strong>' +
                info.version + '</strong> <span class="mesh-badge-pod">' + info.pod + '</span>';
            document.body.appendChild(badge);

            var style = document.createElement('style');
            style.textContent =
                '.mesh-badge{position:fixed;left:1rem;bottom:1rem;z-index:150;display:flex;' +
                'align-items:center;gap:.5rem;padding:.5rem .85rem;border-radius:999px;' +
                'background:#fff;color:#2d2d2d;border:1px solid rgba(255,20,147,.2);' +
                'box-shadow:0 4px 12px rgba(255,20,147,.12);font-size:.78rem;font-family:Arial,sans-serif}' +
                '.mesh-badge-dot{width:8px;height:8px;border-radius:50%;background:#d9a441}' +
                '.mesh-badge-pod{opacity:.55;font-family:monospace}' +
                '@media(max-width:600px){.mesh-badge-pod{display:none}}';
            document.head.appendChild(style);
        });
    }

    // Record the answer. Stacks on top of the inline onclick handler, so the
    // celebration still fires even when an AuthorizationPolicy rejects this.
    function wireRsvp() {
        var yes = document.querySelector('.btn-yes');
        if (!yes) return;
        yes.addEventListener('click', function () {
            api('/rsvp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answer: 'yes' })
            }).catch(function () { /* no backend, or authz said no */ });
        });
    }

    function boot() {
        showVersionBadge().catch(function () { /* running standalone */ });
        wireRsvp();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
