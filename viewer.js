/* ============================================================
   Cosmos Person — photo viewer
   PhotoSwipe 5 (vendored, MIT) wrapped with:
     - a technical-card rail (side rail on wide screens, bottom sheet on phones)
     - real URLs: opening a photo pushes /photo/<id>/ so links and reloads work
     - keyboard: ← → navigate · I info · F full screen · Esc close
   Used by index.html (as an overlay over the grid) and by photo/<id>/ pages.
   ============================================================ */

import PhotoSwipeLightbox from '/vendor/photoswipe/photoswipe-lightbox.esm.min.js';

const RAIL_WIDTH = 380;
const RAIL_BREAKPOINT = 1100;

let manifestPromise = null;

export function loadManifest() {
    if (!manifestPromise) {
        manifestPromise = fetch('/gallery.json', { cache: 'no-cache' }).then(r => r.json());
    }
    return manifestPromise;
}

/* ---------- Formatting helpers (shared with the index) ---------- */

export function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h && m) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

export function integrationLabel(entry) {
    return formatDuration(entry.integration_seconds) || (entry.acquisition && entry.acquisition.integration) || '';
}

export function formatDate(value) {
    if (!value) return '';
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(value).trim());
    if (!m) return value;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, 1));
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function formatRA(ra) {
    const hours = ra / 15;
    let h = Math.floor(hours);
    let m = Math.round((hours - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    return `${h}ʰ ${String(m).padStart(2, '0')}ᵐ`;
}

export function formatDec(dec) {
    const sign = dec < 0 ? '−' : '+';
    const abs = Math.abs(dec);
    let d = Math.floor(abs);
    let m = Math.round((abs - d) * 60);
    if (m === 60) { d += 1; m = 0; }
    return `${sign}${d}° ${String(m).padStart(2, '0')}′`;
}

export function srcsetOf(list) {
    return (list || []).map(s => `/${encodeURI(s.src)} ${s.w}w`).join(', ');
}

export function largestJpg(entry) {
    const jpg = (entry.sources && entry.sources.jpg) || [];
    return jpg.length ? jpg[jpg.length - 1] : { src: entry.original, w: entry.width, h: entry.height };
}

function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- The technical card (rail content) ---------- */

export function cardHTML(entry) {
    const acq = entry.acquisition || {};
    const rows = [];
    const add = (group, k, v) => { if (v) rows.push([group, k, v]); };

    add('Object', 'Catalogue', entry.catalog);
    add('Object', 'Object type', entry.type);
    add('Object', 'Constellation', entry.constellation);
    add('Object', 'Distance', entry.distance);
    if (entry.skyTarget && typeof findCelestialObject === 'function') {
        const obj = findCelestialObject(entry.skyTarget);
        if (obj) add('Object', 'Position (J2000)', `RA ${formatRA(obj.ra)} · Dec ${formatDec(obj.dec)}`);
    }
    add('Equipment', 'Optics', acq.optics);
    add('Equipment', 'Camera', acq.camera);
    add('Equipment', 'Mount', acq.mount);
    add('Equipment', 'Filters', acq.filters);
    add('Equipment', 'Guiding', acq.guiding);
    add('Equipment', 'Software', acq.software);
    add('Capture', 'Integration', integrationLabel(entry));
    add('Capture', 'Palette', entry.palette);
    const nights = acq.nights || [];
    if (nights.length) {
        add('Capture', nights.length === 1 ? 'Night' : `${nights.length} nights`, nights.map(n => formatDate(n.date) || n.date).join(', '));
    } else {
        add('Capture', 'Captured', formatDate(entry.date));
    }
    add('Capture', 'Location', acq.location ? acq.location + (acq.bortle ? ` · Bortle ${acq.bortle}` : '') : '');
    add('Capture', 'Notes', acq.notes);
    add('Image', 'Resolution', `${entry.width.toLocaleString()} × ${entry.height.toLocaleString()} px`);

    const groups = {};
    rows.forEach(([g, k, v]) => { (groups[g] = groups[g] || []).push([k, v]); });

    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        html += `<section class="card-group"><h3 class="label">${escapeHTML(group)}</h3><dl class="specs">` +
            items.map(([k, v]) => `<div class="spec"><dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd></div>`).join('') +
            '</dl></section>';
    }

    const subs = acq.subs || [];
    if (subs.length) {
        const body = subs.map(s => {
            const count = +s.count || 0, secs = +s.seconds || 0;
            const secsLabel = secs < 60 ? `${secs} s` : formatDuration(secs);
            return `<tr><td>${escapeHTML(s.filter)}</td><td>${count} × ${secsLabel}</td><td>${formatDuration(count * secs)}</td></tr>`;
        }).join('');
        html += `<section class="card-group"><h3 class="label">Subframes</h3><table class="subs"><thead><tr><th>Filter</th><th>Subs</th><th>Total</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td>Total</td><td></td><td>${formatDuration(entry.integration_seconds)}</td></tr></tfoot></table></section>`;
    }
    return html;
}

function railHTML(entry) {
    const meta = [entry.catalog, entry.constellation, entry.distance].filter(Boolean)
        .map(t => `<span>${escapeHTML(t)}</span>`).join('');
    const big = largestJpg(entry);
    const actions = [
        `<a class="text-link" href="/photo/${encodeURIComponent(entry.id)}/" data-page-link>Photo page</a>`,
        entry.skyTarget ? `<a class="text-link" href="/explore.html?goto=${encodeURIComponent(entry.skyTarget)}">Sky map</a>` : '',
        `<a class="text-link" href="/${encodeURI(entry.original)}" download>Full resolution</a>`,
        `<button class="text-link" type="button" data-share>Copy link</button>`
    ].filter(Boolean).join('');
    return `
        <div class="rail-inner">
            <p class="label rail-kicker">${escapeHTML([entry.type, entry.constellation].filter(Boolean).join(' · '))}</p>
            <h2 class="display rail-title">${escapeHTML(entry.title)}</h2>
            ${entry.subtitle ? `<p class="rail-subtitle">${escapeHTML(entry.subtitle)}</p>` : ''}
            <p class="rail-meta">${meta}</p>
            ${entry.description ? `<p class="rail-description">${escapeHTML(entry.description)}</p>` : ''}
            <div class="rail-actions">${actions}</div>
            <div class="rail-card">${cardHTML(entry)}</div>
            <p class="rail-size label">${big.w.toLocaleString()} × ${big.h.toLocaleString()} shown · ${entry.width.toLocaleString()} × ${entry.height.toLocaleString()} original</p>
        </div>`;
}

/* ---------- Viewer ---------- */

export function createViewer(entries, options = {}) {
    const opts = Object.assign({
        pushUrls: true,            // push /photo/<id>/ while browsing
        railOpen: null,            // null = remember last choice (default open on wide screens)
        onClose: null
    }, options);

    // Wide screens show the rail beside the image by default; phones start with it
    // closed; a choice made with the I key or the info button is remembered.
    const railDefault = () => {
        if (opts.railOpen !== null) return opts.railOpen;
        let stored = null;
        try { stored = localStorage.getItem('cp-rail'); } catch (e) { /* ignore */ }
        return stored === null ? window.innerWidth >= RAIL_BREAKPOINT : stored === '1';
    };
    let railOpen = railDefault();
    let pushed = false;
    let closingFromPop = false;
    let railEl = null;
    let pswpRef = null;
    const pageTitle = document.title;

    const dataSource = entries.map(entry => {
        const big = largestJpg(entry);
        const jpg = (entry.sources && entry.sources.jpg) || [];
        return {
            src: '/' + encodeURI(big.src),
            srcset: srcsetOf(jpg),
            width: big.w,
            height: big.h,
            msrc: entry.placeholder,
            alt: entry.alt || entry.title,
            entry
        };
    });

    const isWide = () => window.innerWidth >= RAIL_BREAKPOINT;

    const lightbox = new PhotoSwipeLightbox({
        dataSource,
        pswpModule: () => import('/vendor/photoswipe/photoswipe.esm.min.js'),
        bgOpacity: 1,
        showHideAnimationType: 'fade',
        wheelToZoom: true,
        closeOnVerticalDrag: true,
        pinchToClose: true,
        loop: true,
        preloaderDelay: 400,
        zoom: true,
        counter: true,
        arrowPrev: true,
        arrowNext: true,
        imageClickAction: 'zoom-or-close',
        tapAction: 'toggle-controls',
        doubleTapAction: 'zoom',
        initialZoomLevel: 'fit',
        secondaryZoomLevel: (zl) => Math.max(zl.fill, Math.min(1, zl.fit * 3)),
        maxZoomLevel: 1.5,
        paddingFn: (vs) => {
            if (!railOpen) return { top: 0, bottom: 0, left: 0, right: 0 };
            if (vs.x >= RAIL_BREAKPOINT) return { top: 0, bottom: 0, left: 0, right: RAIL_WIDTH };
            return { top: 0, bottom: Math.round(vs.y * 0.62), left: 0, right: 0 };   // bottom sheet
        }
    });

    lightbox.on('uiRegister', () => {
        const pswp = lightbox.pswp;
        pswpRef = pswp;
        railOpen = railDefault();

        pswp.ui.registerElement({
            name: 'info-button',
            order: 9,
            isButton: true,
            title: 'Details (I)',
            ariaLabel: 'Toggle details',
            html: '<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 14v7M16 10.5v1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            onClick: () => toggleRail()
        });

        pswp.ui.registerElement({
            name: 'fullscreen-button',
            order: 10,
            isButton: true,
            title: 'Full screen (F)',
            ariaLabel: 'Toggle full screen',
            html: '<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32"><path d="M9 13V9h4M23 13V9h-4M9 19v4h4M23 19v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            onClick: () => toggleFullscreen()
        });

        pswp.ui.registerElement({
            name: 'rail',
            appendTo: 'root',
            onInit: (el) => {
                railEl = el;
                el.className = 'pswp__rail';
                el.addEventListener('click', (e) => {
                    const share = e.target.closest('[data-share]');
                    if (share) { e.preventDefault(); copyLink(share); }
                });
                // keep gestures inside the rail from reaching the slide
                ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart', 'touchmove', 'click'].forEach(evt =>
                    el.addEventListener(evt, ev => ev.stopPropagation(), { passive: evt !== 'click' })
                );
                applyRailState();
            }
        });

        pswp.ui.registerElement({
            name: 'caption',
            appendTo: 'root',
            onInit: (el) => {
                el.className = 'pswp__mini-caption';
                lightbox.pswp.on('change', () => {
                    const e = currentEntry();
                    el.innerHTML = `<span class="mc-title">${escapeHTML(e.title)}</span><span class="mc-sub">${escapeHTML([e.catalog, integrationLabel(e)].filter(Boolean).join(' · '))}</span>`;
                });
            }
        });
    });

    lightbox.on('change', () => {
        const entry = currentEntry();
        if (railEl) railEl.innerHTML = railHTML(entry);
        if (opts.pushUrls) {
            const url = `/photo/${encodeURIComponent(entry.id)}/`;
            if (location.pathname !== url) {
                if (pushed) history.replaceState({ cpPhoto: entry.id }, '', url);
                else { history.pushState({ cpPhoto: entry.id }, '', url); pushed = true; }
            }
        }
        document.title = `${entry.title} — Cosmos Person`;
    });

    lightbox.on('bindEvents', () => {
        lightbox.pswp.events.add(document, 'keydown', (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const k = e.key.toLowerCase();
            if (k === 'i') { e.preventDefault(); toggleRail(); }
            else if (k === 'f') { e.preventDefault(); toggleFullscreen(); }
        });
    });

    lightbox.on('close', () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        const entry = currentEntry();
        if (opts.pushUrls && pushed && !closingFromPop) {
            history.back();
        }
        pushed = false;
        closingFromPop = false;
        document.title = pageTitle;
        if (opts.onClose) opts.onClose(entry);
    });

    lightbox.on('destroy', () => { pswpRef = null; railEl = null; });

    window.addEventListener('popstate', (e) => {
        if (!pswpRef) return;
        const id = e.state && e.state.cpPhoto;
        if (!id) {
            closingFromPop = true;
            pswpRef.close();
        } else {
            const idx = dataSource.findIndex(d => d.entry.id === id);
            if (idx >= 0 && idx !== pswpRef.currIndex) pswpRef.goTo(idx);
        }
    });

    lightbox.init();

    function currentEntry() {
        return pswpRef ? dataSource[pswpRef.currIndex].entry : null;
    }

    function applyRailState() {
        if (!pswpRef) return;
        pswpRef.element.classList.toggle('pswp--rail-open', railOpen);
        pswpRef.element.classList.toggle('pswp--rail-side', isWide());
        pswpRef.updateSize(true);
    }

    function toggleRail(force) {
        railOpen = typeof force === 'boolean' ? force : !railOpen;
        try { localStorage.setItem('cp-rail', railOpen ? '1' : '0'); } catch (e) { /* ignore */ }
        applyRailState();
    }

    function toggleFullscreen() {
        if (!pswpRef) return;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        else if (pswpRef.element.requestFullscreen) pswpRef.element.requestFullscreen().catch(() => { });
    }

    async function copyLink(btn) {
        const entry = currentEntry();
        const url = `${location.origin}/photo/${encodeURIComponent(entry.id)}/`;
        try {
            if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
                await navigator.share({ title: entry.title, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            const old = btn.textContent;
            btn.textContent = 'Link copied';
            setTimeout(() => { btn.textContent = old; }, 1600);
        } catch (e) {
            prompt('Copy this link', url);
        }
    }

    window.addEventListener('resize', () => { if (pswpRef) applyRailState(); });

    return {
        open(index) { lightbox.loadAndOpen(index); },
        openId(id) {
            const idx = dataSource.findIndex(d => d.entry.id === id);
            if (idx >= 0) lightbox.loadAndOpen(idx);
        },
        close() { if (pswpRef) pswpRef.close(); },
        get isOpen() { return !!pswpRef; },
        lightbox
    };
}

/* ---------- Photo page bootstrap ---------- */

if (document.body.classList.contains('photo-body')) {
    const id = document.body.dataset.photo;
    loadManifest().then(manifest => {
        const entries = (manifest.images || []).filter(e => e.visible !== false && e.sources && e.sources.jpg && e.sources.jpg.length);
        const viewer = createViewer(entries, {
            pushUrls: true,
            onClose: (entry) => {
                if (entry && entry.id !== id) location.replace(`/photo/${encodeURIComponent(entry.id)}/`);
            }
        });
        const open = (e) => { e.preventDefault(); viewer.openId(id); };
        document.getElementById('photo-open').addEventListener('click', open);
        document.getElementById('btn-view').addEventListener('click', open);

        document.getElementById('btn-download').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('downloads').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        document.getElementById('btn-share').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const url = location.origin + location.pathname;
            try {
                await navigator.clipboard.writeText(url);
                btn.textContent = 'Link copied';
                setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
            } catch (err) { prompt('Copy this link', url); }
        });

        // Arrow keys move between photo pages when the viewer is closed
        document.addEventListener('keydown', (e) => {
            if (viewer.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            if (e.key === 'ArrowRight') document.querySelector('.photo-nav-link.next').click();
            else if (e.key === 'ArrowLeft') document.querySelector('.photo-nav-link.prev').click();
        });
    }).catch(err => console.error('Viewer could not load the manifest', err));
}
