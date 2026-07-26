/* ============================================================
   Cosmos Person — gallery page
   Consumes gallery.json (schema v2, written by tools/build_derivatives.py
   and by the admin interface).
   ============================================================ */

(function () {
    'use strict';

    const CATEGORY_LABELS = {
        'nebulae': 'Nebulae',
        'galaxies': 'Galaxies',
        'star-clusters': 'Star Clusters',
        'solar-system': 'Solar System',
        'wide-field': 'Wide Field'
    };

    const GRID_SIZES = '(max-width: 720px) 96vw, (max-width: 1200px) 46vw, 30vw';

    let allImages = [];   // visible images, manifest order
    let shown = [];       // current filter applied
    let heroId = '';
    let lbIndex = -1;
    let openedViaHash = false;

    const $ = (id) => document.getElementById(id);

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        $('year').textContent = new Date().getFullYear();
        setupHeader();
        setupLightboxChrome();

        let manifest;
        try {
            const res = await fetch('gallery.json', { cache: 'no-cache' });
            manifest = await res.json();
        } catch (err) {
            console.error('Failed to load gallery manifest', err);
            $('grid').innerHTML = '<p class="grid-empty">The photos couldn’t load. Give it a refresh.</p>';
            finishLoading();
            return;
        }

        allImages = (manifest.images || []).filter(img => img.visible !== false);
        heroId = manifest.settings && manifest.settings.hero;

        renderHero();
        renderFilters();
        applyFilter('all');
        finishLoading();
        openFromHash();
        window.addEventListener('hashchange', openFromHash);

        // Arriving from the sky atlas ("Collection" links use #gallery):
        // make sure the anchor holds even if the browser restored scroll early.
        if (location.hash === '#gallery') {
            setTimeout(() => {
                if (window.scrollY < 100) {
                    const root = document.documentElement;
                    root.style.scrollBehavior = 'auto';
                    $('gallery').scrollIntoView();
                    root.style.scrollBehavior = '';
                }
            }, 150);
        }
    }

    function finishLoading() {
        const el = $('page-loading');
        el.classList.add('done');
        setTimeout(() => el.remove(), 800);
    }

    /* ---------- Header ---------- */

    function setupHeader() {
        const header = $('site-header');
        const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 24);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ---------- Hero ---------- */

    function renderHero() {
        const entry = allImages.find(i => i.id === heroId) || allImages[0];
        if (!entry) return;

        const media = $('hero-media');
        media.style.backgroundColor = entry.color || '';
        media.style.backgroundImage = `url("${entry.placeholder}")`;
        media.style.backgroundSize = 'cover';
        media.style.backgroundPosition = 'center';

        const img = new Image();
        img.alt = '';
        img.srcset = srcsetAttr(entry);
        img.sizes = '100vw';
        img.src = largest(entry).src;
        img.fetchPriority = 'high';
        img.addEventListener('load', () => img.classList.add('loaded'));
        media.appendChild(img);

        const credit = [entry.title, entry.catalog].filter(Boolean).join(' · ');
        $('hero-credit').textContent = credit;
    }

    /* ---------- Filters ---------- */

    function renderFilters() {
        const counts = {};
        allImages.forEach(i => {
            const c = i.category || 'nebulae';
            counts[c] = (counts[c] || 0) + 1;
        });

        const cats = Object.keys(CATEGORY_LABELS).filter(c => counts[c]);
        const host = $('filters');
        host.innerHTML = '';

        const mk = (key, label) => {
            const b = document.createElement('button');
            b.className = 'filter-btn';
            b.dataset.filter = key;
            b.textContent = label;
            b.setAttribute('role', 'tab');
            b.addEventListener('click', () => applyFilter(key));
            host.appendChild(b);
            return b;
        };

        mk('all', 'All');
        cats.forEach(c => mk(c, CATEGORY_LABELS[c] || c));

        if (cats.length < 2) host.style.display = 'none';
    }

    function applyFilter(key) {
        shown = key === 'all' ? allImages.slice() : allImages.filter(i => (i.category || 'nebulae') === key);

        document.querySelectorAll('.filter-btn').forEach(b => {
            const active = b.dataset.filter === key;
            b.classList.toggle('active', active);
            b.setAttribute('aria-selected', active);
        });

        $('collection-count').textContent =
            shown.length + (shown.length === 1 ? ' photo' : ' photos');

        renderGrid();
    }

    /* ---------- Grid ---------- */

    function renderGrid() {
        const grid = $('grid');
        grid.innerHTML = '';

        if (!shown.length) {
            grid.innerHTML = '<p class="grid-empty">Nothing here yet.</p>';
            return;
        }

        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('in-view');
                    io.unobserve(e.target);
                }
            });
        }, { rootMargin: '0px 0px -4% 0px', threshold: 0.05 });

        shown.forEach((entry, idx) => {
            const card = document.createElement('figure');
            card.className = 'card';
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', entry.title);
            card.style.backgroundColor = entry.color || '';
            card.style.backgroundImage = `url("${entry.placeholder}")`;

            const img = document.createElement('img');
            img.alt = `${entry.title}${entry.catalog ? ' — ' + entry.catalog : ''}`;
            img.loading = idx < 3 ? 'eager' : 'lazy';
            img.decoding = 'async';
            img.width = entry.width;
            img.height = entry.height;
            img.srcset = srcsetAttr(entry);
            img.sizes = GRID_SIZES;
            img.src = entry.srcset[0].src;
            img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
            card.appendChild(img);

            const cap = document.createElement('figcaption');
            cap.className = 'card-caption';
            const meta = [entry.type, entry.constellation].filter(Boolean).join(' · ');
            cap.innerHTML = `<h3></h3><p></p>`;
            cap.querySelector('h3').textContent = entry.title;
            cap.querySelector('p').textContent = meta;
            card.appendChild(cap);

            const open = () => openLightbox(idx);
            card.addEventListener('click', open);
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
            });

            grid.appendChild(card);
            io.observe(card);
        });
    }

    /* ---------- Lightbox ---------- */

    function setupLightboxChrome() {
        $('lb-close').addEventListener('click', closeLightbox);
        $('lb-prev').addEventListener('click', () => step(-1));
        $('lb-next').addEventListener('click', () => step(1));
        $('lb-info').addEventListener('click', toggleDetails);

        $('lightbox').addEventListener('click', e => {
            if (e.target === $('lightbox') || e.target === $('lb-stage')) closeLightbox();
        });

        // Click-to-zoom: 1:1 with pan, centred on the click point
        $('lb-image').addEventListener('click', e => {
            e.stopPropagation();
            toggleZoom(e);
        });

        document.addEventListener('keydown', e => {
            if (!$('lightbox').classList.contains('active')) return;
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') step(-1);
            else if (e.key === 'ArrowRight') step(1);
            else if (e.key.toLowerCase() === 'i') toggleDetails();
            else if (e.key.toLowerCase() === 'z') toggleZoom();
        });

        // Swipe navigation (disabled while zoomed — scrolling pans instead)
        let touchX = null;
        $('lb-stage').addEventListener('touchstart', e => { touchX = e.changedTouches[0].clientX; }, { passive: true });
        $('lb-stage').addEventListener('touchend', e => {
            if (touchX === null || $('lb-stage').classList.contains('zoomed')) { touchX = null; return; }
            const dx = e.changedTouches[0].clientX - touchX;
            touchX = null;
            if (Math.abs(dx) > 44) step(dx > 0 ? -1 : 1);
        }, { passive: true });

        window.addEventListener('popstate', () => {
            if ($('lightbox').classList.contains('active') && !location.hash.startsWith('#photo=')) {
                hideLightbox();
            }
        });

        // Auto-hide chrome after idle (never while the details drawer is open)
        ['mousemove', 'touchstart', 'keydown'].forEach(evt =>
            $('lightbox').addEventListener(evt, wakeChrome, { passive: true })
        );
        document.addEventListener('keydown', () => {
            if ($('lightbox').classList.contains('active')) wakeChrome();
        });
    }

    let chromeTimer = null;

    function wakeChrome() {
        const lb = $('lightbox');
        lb.classList.remove('chrome-hidden');
        clearTimeout(chromeTimer);
        chromeTimer = setTimeout(() => {
            if (!lb.classList.contains('active')) return;
            if ($('lb-details').classList.contains('open')) return;
            lb.classList.add('chrome-hidden');
        }, 3000);
    }

    function toggleZoom(e) {
        const stage = $('lb-stage');
        const img = $('lb-image');
        const zoomingIn = !stage.classList.contains('zoomed');

        if (zoomingIn) {
            // Remember where the user clicked, as a fraction of the displayed image
            const rect = img.getBoundingClientRect();
            const fx = e ? (e.clientX - rect.left) / rect.width : 0.5;
            const fy = e ? (e.clientY - rect.top) / rect.height : 0.5;
            stage.classList.add('zoomed');
            stage.scrollLeft = img.clientWidth * fx - stage.clientWidth / 2;
            stage.scrollTop = img.clientHeight * fy - stage.clientHeight / 2;
        } else {
            stage.classList.remove('zoomed');
        }
    }

    function openFromHash() {
        const m = location.hash.match(/^#photo=(.+)$/);
        if (!m) return;
        const id = decodeURIComponent(m[1]);
        const idx = shown.findIndex(i => i.id === id);
        if (idx >= 0 && lbIndex !== idx) {
            openedViaHash = true;
            openLightbox(idx, { pushed: true });
        }
    }

    function openLightbox(idx, opts = {}) {
        lbIndex = idx;
        const lb = $('lightbox');
        lb.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (!opts.pushed) {
            history.pushState(null, '', '#photo=' + encodeURIComponent(shown[idx].id));
        }
        showEntry();
        wakeChrome();
    }

    function showEntry() {
        const entry = shown[lbIndex];
        if (!entry) return;

        $('lb-stage').classList.remove('zoomed');
        const img = $('lb-image');
        img.classList.remove('loaded');
        img.alt = entry.title;
        img.srcset = srcsetAttr(entry);
        img.sizes = '92vw';
        img.src = largest(entry).src;
        if (img.complete) img.classList.add('loaded');
        else img.addEventListener('load', () => img.classList.add('loaded'), { once: true });

        $('lb-title').textContent = entry.title;

        const metaBits = [entry.catalog, entry.constellation, entry.distance]
            .filter(Boolean)
            .map(t => `<span></span>`);
        $('lb-meta').innerHTML = metaBits.join('');
        [entry.catalog, entry.constellation, entry.distance].filter(Boolean)
            .forEach((t, i) => { $('lb-meta').children[i].textContent = t; });

        $('lb-counter').textContent = `${lbIndex + 1} / ${shown.length}`;

        const sky = $('lb-sky');
        if (entry.skyTarget) {
            sky.hidden = false;
            sky.href = 'explore.html?goto=' + encodeURIComponent(entry.skyTarget);
        } else {
            sky.hidden = true;
        }
        $('lb-full').href = entry.original;

        renderDetails(entry);
        history.replaceState(null, '', '#photo=' + encodeURIComponent(entry.id));

        // Preload neighbours
        [lbIndex - 1, lbIndex + 1].forEach(i => {
            const n = shown[(i + shown.length) % shown.length];
            if (n) { const pre = new Image(); pre.src = largest(n).src; }
        });
    }

    function renderDetails(entry) {
        $('lb-description').textContent = entry.description || '';
        $('lb-description').style.display = entry.description ? '' : 'none';

        const specs = [];
        if (entry.type) specs.push(['Object Type', entry.type]);
        if (entry.constellation) specs.push(['Constellation', entry.constellation]);
        if (entry.distance) specs.push(['Distance', entry.distance]);

        // Astrometry from the celestial catalog, when the object resolves
        if (entry.skyTarget && typeof findCelestialObject === 'function') {
            const obj = findCelestialObject(entry.skyTarget);
            if (obj) specs.push(['Position', formatRA(obj.ra) + '  ·  ' + formatDec(obj.dec)]);
        }

        const cap = entry.capture || {};
        const captureLabels = {
            telescope: 'Telescope', camera: 'Camera', mount: 'Mount',
            filters: 'Filters', integration: 'Integration', date: 'Captured', location: 'Location'
        };
        Object.keys(captureLabels).forEach(k => {
            if (cap[k]) specs.push([captureLabels[k], cap[k]]);
        });
        if (entry.width && entry.height) {
            specs.push(['Resolution', `${entry.width.toLocaleString()} × ${entry.height.toLocaleString()} px`]);
        }

        const host = $('lb-specs');
        host.innerHTML = '';
        specs.forEach(([dt, dd]) => {
            const wrap = document.createElement('div');
            wrap.className = 'lb-spec';
            const dtEl = document.createElement('dt');
            dtEl.textContent = dt;
            const ddEl = document.createElement('dd');
            ddEl.textContent = dd;
            wrap.append(dtEl, ddEl);
            host.appendChild(wrap);
        });
    }

    function toggleDetails() {
        const details = $('lb-details');
        const open = !details.classList.contains('open');
        details.classList.toggle('open', open);
        $('lb-info').classList.toggle('toggled', open);
        $('lb-info').setAttribute('aria-expanded', open);
    }

    function step(dir) {
        lbIndex = (lbIndex + dir + shown.length) % shown.length;
        showEntry();
    }

    function closeLightbox() {
        if (location.hash.startsWith('#photo=') && !openedViaHash) {
            history.back();               // pops our pushed state; popstate handler hides
        } else {
            history.replaceState(null, '', location.pathname + location.search);
            hideLightbox();
        }
    }

    function hideLightbox() {
        $('lightbox').classList.remove('active');
        $('lightbox').classList.remove('chrome-hidden');
        $('lb-stage').classList.remove('zoomed');
        $('lb-details').classList.remove('open');
        $('lb-info').classList.remove('toggled');
        clearTimeout(chromeTimer);
        document.body.style.overflow = '';
        lbIndex = -1;
        openedViaHash = false;
    }

    /* ---------- Helpers ---------- */

    function formatRA(ra) {
        const hours = ra / 15;
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return `RA ${h}ʰ ${String(m).padStart(2, '0')}ᵐ`;
    }

    function formatDec(dec) {
        const sign = dec < 0 ? '−' : '+';
        const abs = Math.abs(dec);
        const d = Math.floor(abs);
        const m = Math.round((abs - d) * 60);
        return `Dec ${sign}${d}° ${String(m).padStart(2, '0')}′`;
    }

    function srcsetAttr(entry) {
        return entry.srcset.map(s => `${encodeURI(s.src)} ${s.w}w`).join(', ');
    }

    function largest(entry) {
        return entry.srcset[entry.srcset.length - 1];
    }
})();
