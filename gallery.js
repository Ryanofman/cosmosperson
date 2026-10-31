/* ============================================================
   Cosmos Person — gallery page (index.html)
   Consumes gallery.json (schema v3, written by tools/build.py and the admin).
   Renders the hero, the filter/sort/search controls, the grid, and opens the
   viewer (viewer.js) over the grid with real /photo/<id>/ URLs.
   ============================================================ */

import { createViewer, loadManifest, integrationLabel, formatDate, srcsetOf } from '/viewer.js';

const CATEGORY_LABELS = {
    'nebulae': 'Nebulae',
    'galaxies': 'Galaxies',
    'star-clusters': 'Star Clusters',
    'solar-system': 'Solar System',
    'wide-field': 'Wide Field'
};

const FACETS = {
    category: { param: 'c', label: 'Type', value: e => e.category || 'nebulae', display: v => CATEGORY_LABELS[v] || v },
    palette: { param: 'palette', label: 'Palette', value: e => e.palette || '', display: v => v },
    constellation: { param: 'con', label: 'Constellation', value: e => e.constellation || '', display: v => v },
    year: { param: 'year', label: 'Year', value: e => e.year || '', display: v => v },
    type: { param: 'type', label: 'Object', value: e => e.type || '', display: v => v }
};

const SORTS = {
    curated: { label: 'Curated order', fn: null },
    newest: { label: 'Newest first', fn: (a, b) => (b.date || b.year || '').localeCompare(a.date || a.year || '') },
    integration: { label: 'Most integration', fn: (a, b) => (b.integration_seconds || 0) - (a.integration_seconds || 0) },
    title: { label: 'Title A–Z', fn: (a, b) => a.title.localeCompare(b.title) }
};

const GRID_SIZES = '(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 40vw';

const $ = (id) => document.getElementById(id);

let settings = {};
let all = [];          // visible photos, curated order
let shown = [];        // after filters and sort
let viewer = null;
const filters = { category: 'all', palette: '', constellation: '', year: '', type: '', q: '', sort: 'curated' };

document.addEventListener('DOMContentLoaded', init);

async function init() {
    $('year').textContent = new Date().getFullYear();
    setupHeader();

    let manifest;
    try {
        manifest = await loadManifest();
    } catch (err) {
        console.error('Failed to load gallery manifest', err);
        $('grid').innerHTML = '<p class="grid-empty">The photos couldn’t load. Give it a refresh.</p>';
        finishLoading();
        return;
    }

    settings = manifest.settings || {};
    // Photos whose web versions have not been built yet (an upload published minutes
    // ago) are skipped until the build commits them.
    all = (manifest.images || []).filter(img => img.visible !== false && img.sources && img.sources.jpg && img.sources.jpg.length);

    applySiteSettings();
    renderHero();
    readURL();
    renderControls();
    applyFilters({ replaceUrl: false });
    finishLoading();
    openFromLegacyHash();

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

/* ---------- Settings ---------- */

function applySiteSettings() {
    const grid = settings.grid || {};
    const theme = settings.theme || {};
    const site = settings.site || {};
    const root = document.documentElement;
    if (theme.accent) {
        root.style.setProperty('--accent', theme.accent);
        root.style.setProperty('--accent-dim', theme.accent + '59');
        root.style.setProperty('--accent-faint', theme.accent + '1f');
    }
    const g = $('grid');
    if (grid.row_height) g.style.setProperty('--row-h', grid.row_height + 'px');
    if (grid.gutter !== undefined) g.style.setProperty('--gutter', grid.gutter + 'px');
    g.className = 'grid ' + (['justified', 'masonry', 'uniform'].includes(grid.style) ? grid.style : 'justified')
        + ' captions-' + (['always', 'hover', 'none'].includes(grid.captions) ? grid.captions : 'hover');

    if (site.tagline) $('hero-kicker').textContent = site.tagline;
    if (site.lede) $('hero-sub').textContent = site.lede;
    if (site.statement) $('statement-text').textContent = site.statement;
}

/* ---------- Header ---------- */

function setupHeader() {
    const header = $('site-header');
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

/* ---------- Hero ---------- */

function heroConfig() {
    const base = typeof settings.hero === 'string' ? { id: settings.hero } : (settings.hero || {});
    const hero = Object.assign({}, base);
    // Try a different hero from the address bar without publishing anything, e.g.
    //   /?hero=lagoon&fit=frame&focal=0.5,0.35&height=70&text=bottom&scrim=0.6&version=starless
    const p = new URLSearchParams(location.search);
    if (p.get('hero')) hero.id = p.get('hero');
    if (p.get('fit')) hero.fit = p.get('fit');
    if (p.get('text')) hero.text = p.get('text');
    if (p.get('version')) hero.version = p.get('version');
    if (p.get('height')) hero.height = +p.get('height');
    if (p.get('scrim')) hero.scrim = +p.get('scrim');
    if (p.get('focal')) {
        const f = p.get('focal').split(',').map(Number);
        if (f.length === 2 && f.every(n => !isNaN(n))) hero.focal = f;
    }
    if (p.get('motion')) hero.motion = p.get('motion') !== '0';
    if (p.get('anchor') === '0') hero.anchor = null;
    // Experiments: /?edge=0 (hard side edges) … edge=20 (wide fade); bottom=none|short|long;
    // reveal=instant|quick|fade; frame=none|line|glow
    if (p.get('edge') !== null) hero.edge_fade = +p.get('edge');
    if (p.get('bottom')) hero.bottom_fade = p.get('bottom');
    if (p.get('reveal')) hero.reveal = p.get('reveal');
    if (p.get('frame')) hero.frame = p.get('frame');
    return hero;
}

function renderHero() {
    const hero = heroConfig();
    const entry = all.find(i => i.id === hero.id) || all[0];
    if (!entry) return;

    const section = $('hero');
    const media = $('hero-media');
    const version = (entry.versions || []).find(v => v.id === hero.version && v.sources && v.sources.jpg && v.sources.jpg.length);
    const sources = version ? version.sources : entry.sources;
    const w = version ? version.width : entry.width;
    const h = version ? version.height : entry.height;

    const fit = ['frame', 'condensed'].includes(hero.fit) ? hero.fit : 'cover';
    const text = ['center', 'bottom', 'below'].includes(hero.text) ? hero.text : 'center';
    section.classList.remove('hero-cover', 'hero-frame', 'hero-condensed', 'text-center', 'text-bottom', 'text-below', 'no-motion', 'no-credit',
        'bottom-none', 'bottom-short', 'bottom-long', 'reveal-fade', 'reveal-quick', 'reveal-instant', 'frame-none', 'frame-line', 'frame-glow', 'edge-none');
    section.classList.add('hero-' + fit, 'text-' + text);
    // How the frame meets the black around it, and how it appears on load
    const edge = Math.max(0, Math.min(30, hero.edge_fade === undefined || hero.edge_fade === null || isNaN(+hero.edge_fade) ? 9 : +hero.edge_fade));
    section.style.setProperty('--hero-edge', edge + '%');
    section.classList.toggle('edge-none', edge === 0);   // a zero-width mask would hide the image; use none
    section.classList.add('bottom-' + (['none', 'short', 'long'].includes(hero.bottom_fade) ? hero.bottom_fade : 'short'));
    section.classList.add('reveal-' + (['fade', 'quick', 'instant'].includes(hero.reveal) ? hero.reveal : 'fade'));
    section.classList.add('frame-' + (['none', 'line', 'glow'].includes(hero.frame) ? hero.frame : 'none'));
    if (hero.motion === false) section.classList.add('no-motion');
    if (hero.credit === false) section.classList.add('no-credit');
    const clampVh = (v, fallback) => Math.min(100, Math.max(30, Number(v) || fallback));
    const vh = clampVh(hero.height, 88);
    section.style.setProperty('--hero-h', vh + 'vh');
    section.style.setProperty('--hero-hm', clampVh(hero.height_mobile, Math.min(vh, 78)) + 'vh');
    section.style.setProperty('--hero-ar', `${w} / ${h}`);
    const scrim = hero.scrim === undefined || hero.scrim === null ? 1 : Number(hero.scrim);
    section.style.setProperty('--hero-scrim', String(Math.max(0, Math.min(1.5, isNaN(scrim) ? 1 : scrim))));

    media.replaceChildren();
    const condensedFit = fit === 'condensed';
    media.style.backgroundColor = condensedFit ? '' : (entry.color || '');
    media.style.backgroundImage = condensedFit ? 'none' : `url("${entry.placeholder}")`;
    media.style.backgroundSize = 'cover';
    media.style.backgroundPosition = 'center';
    const focal = (hero.focal && hero.focal.length === 2) ? hero.focal : [0.5, 0.5];
    const focalMobile = (hero.focal_mobile && hero.focal_mobile.length === 2) ? hero.focal_mobile : focal;

    const jpg = sources.jpg;
    const avif = sources.avif || [];
    // In cover mode a tall image is scaled to the band's height, so the width the
    // browser must fetch is the band height times the aspect ratio, not the viewport width.
    const bandH = fit === 'cover' ? Math.round(innerHeight * vh / 100) : innerWidth / (w / h);
    const needPx = Math.ceil(Math.max(innerWidth, bandH * (w / h)));
    const sizes = `${needPx}px`;
    const picture = document.createElement('picture');
    if (avif.length) {
        const s = document.createElement('source');
        s.type = 'image/avif';
        s.srcset = srcsetOf(avif);
        s.sizes = sizes;
        picture.appendChild(s);
    }
    const img = new Image();
    img.alt = '';
    img.srcset = srcsetOf(jpg);
    img.sizes = sizes;
    if (condensedFit) {
        // The frame shows its blurry placeholder the instant the page paints, then the real image
        img.style.backgroundImage = `url("${entry.placeholder}")`;
        img.style.backgroundSize = 'cover';
        img.style.backgroundColor = entry.color || '';
    }
    img.src = '/' + encodeURI(jpg[jpg.length - 1].src);
    img.fetchPriority = 'high';
    img.decoding = 'async';
    img.style.setProperty('--focal', `${focal[0] * 100}% ${focal[1] * 100}%`);
    img.style.setProperty('--focal-m', `${focalMobile[0] * 100}% ${focalMobile[1] * 100}%`);
    img.addEventListener('load', () => img.classList.add('loaded'));
    picture.appendChild(img);
    media.appendChild(picture);

    // Anchored hero: a chosen point of the image (settings.hero.anchor.point, as
    // fractions of the image) always lands a small gap below the hero's buttons,
    // whatever the screen size or the length of the text. The image is scaled
    // just enough to still fill the band, so the rule holds instead of the crop.
    const anchor = hero.anchor && Array.isArray(hero.anchor.point) && hero.anchor.point.length === 2 ? hero.anchor : null;
    const condensed = fit === 'condensed';
    section.classList.toggle('hero-anchored', !!anchor);
    const content = section.querySelector('.hero-content');
    section.style.height = '';
    // Two placements are computed in JS rather than CSS:
    //  - anchored: the title block stays centred in the band; a chosen point of the image
    //    (settings.hero.anchor.point) lands a small gap below the buttons with the rest of
    //    the sign kept visible, and the band is exactly as tall as that needs;
    //  - condensed: the frame keeps its own shape, centred, only a little wider than the
    //    title, with the page's black around it, so a tall frame is not blown up on a
    //    wide screen. Both re-run when the text or the screen changes.
    if (anchor || condensed) {
        const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
        const a = anchor || {};
        const ax = anchor ? clamp01(a.point[0]) : 0.5, ay = anchor ? clamp01(a.point[1]) : 0.5;
        const tx = a.x === undefined || a.x === null ? 0.5 : clamp01(a.x);          // where the point sits across the band
        const gap = a.gap === undefined || a.gap === null ? 24 : Number(a.gap);
        const extent = anchor ? clamp01(a.extent) : 0;                               // image below the point that must stay visible
        const margin = a.margin === undefined || a.margin === null ? 24 : Number(a.margin);
        const sidePad = a.side_pad === undefined || a.side_pad === null ? 40 : Number(a.side_pad);  // condensed: beyond the title, each side
        const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72;
        const title = section.querySelector('.hero-title');
        const configuredH = () => {
            section.style.height = '';
            return media.clientHeight;
        };
        const layout = () => {
            const W = media.clientWidth;
            let H = configuredH();
            if (!W || !H || !content) return;
            const kids = [...content.children];
            const first = kids[0], last = section.querySelector(a.below || '.hero-actions') || kids[kids.length - 1];
            const blockH = first && last ? last.getBoundingClientRect().bottom - first.getBoundingClientRect().top : 0;
            let s;
            if (condensed) {
                const titleW = title ? title.getBoundingClientRect().width : 0;
                s = titleW ? Math.min(W, titleW + 2 * sidePad) / w : W / w;      // reaches past the title
            } else {
                s = W / w;                                                      // cover the width
                if (ax > 0) s = Math.max(s, (W * tx) / (ax * w));               // the point can sit at tx without a gap
                if (ax < 1) s = Math.max(s, (W * (1 - tx)) / ((1 - ax) * w));
            }
            let T = 0;
            if (anchor) {
                // The title block stays centred below the header. The band keeps its
                // configured height and grows only if the sign would not fit under the
                // buttons: half the block above centre, half below, the gap, the sign, a margin.
                const configured = H;
                for (let i = 0; i < 3; i++) {
                    const ih = h * s;
                    H = Math.max(configured, Math.ceil(headerH + blockH + 2 * (gap + extent * ih + margin)));
                    T = headerH + (H - headerH) / 2 + blockH / 2 + gap;           // the point lands here
                    if (ay > 0) s = Math.max(s, T / (ay * h));                    // image top stays above the band
                    if (ay < 1) s = Math.max(s, (H - T) / ((1 - ay) * h));        // image bottom stays below it
                }
                section.style.height = H > configured ? `${H}px` : '';
                const bottom = last ? last.getBoundingClientRect().bottom - media.getBoundingClientRect().top : T - gap;
                T = bottom + gap;                                                // measured, so rounding cannot drift
            } else {
                s = Math.max(s, H / h);                                          // the frame fills the band's height
            }
            const iw = w * s, ih = h * s;
            const left = (condensed && iw <= W) ? (W - iw) / 2                   // centred under the title
                : Math.min(0, Math.max(W - iw, W * tx - ax * iw));
            const top = anchor ? Math.min(0, Math.max(H - ih, T - ay * ih))
                : Math.min(0, Math.max(H - ih, (H - ih) * focal[1]));
            img.style.width = `${iw}px`;
            img.style.height = `${ih}px`;
            img.style.left = `${left}px`;
            img.style.top = `${top}px`;
            img.sizes = `${Math.ceil(iw)}px`;
        };
        layout();
        window.addEventListener('resize', layout);
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(layout);
            [...content.children].forEach(el => ro.observe(el));   // the text blocks change size, the box does not
        }
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
        img.addEventListener('load', layout, { once: true });
    }

    const credit = $('hero-credit');
    credit.textContent = [entry.title, entry.catalog].filter(Boolean).join(' · ') + (version ? ` · ${version.label}` : '');
    credit.href = `/photo/${encodeURIComponent(entry.id)}/`;
    // With the text below the image the credit belongs on the image, not under the text
    if (text === 'below') { media.appendChild(credit); media.removeAttribute('aria-hidden'); }
    else if (credit.parentElement !== section) section.appendChild(credit);
}

/* ---------- URL state ---------- */

function readURL() {
    const p = new URLSearchParams(location.search);
    filters.category = p.get('c') || 'all';
    filters.palette = p.get('palette') || '';
    filters.constellation = p.get('con') || '';
    filters.year = p.get('year') || '';
    filters.type = p.get('type') || '';
    filters.q = p.get('q') || '';
    filters.sort = SORTS[p.get('sort')] ? p.get('sort') : ((settings.index && settings.index.default_sort) || 'curated');
}

function writeURL() {
    const p = new URLSearchParams();
    if (filters.category !== 'all') p.set('c', filters.category);
    if (filters.palette) p.set('palette', filters.palette);
    if (filters.constellation) p.set('con', filters.constellation);
    if (filters.year) p.set('year', filters.year);
    if (filters.type) p.set('type', filters.type);
    if (filters.q) p.set('q', filters.q);
    const def = (settings.index && settings.index.default_sort) || 'curated';
    if (filters.sort !== def) p.set('sort', filters.sort);
    const qs = p.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + (location.hash === '#gallery' ? '#gallery' : ''));
}

/* ---------- Controls ---------- */

function renderControls() {
    const index = settings.index || {};
    const facets = Array.isArray(index.facets) ? index.facets : ['category', 'palette', 'constellation', 'year'];

    // Category chips
    const counts = {};
    all.forEach(e => { const c = e.category || 'nebulae'; counts[c] = (counts[c] || 0) + 1; });
    const host = $('filters');
    host.innerHTML = '';
    const mk = (key, label, count) => {
        const b = document.createElement('button');
        b.className = 'filter-btn';
        b.dataset.filter = key;
        b.setAttribute('role', 'tab');
        b.textContent = label;
        if (count !== undefined && index.show_counts !== false) {
            const s = document.createElement('small');
            s.textContent = count;
            b.appendChild(s);
        }
        b.addEventListener('click', () => { filters.category = key; applyFilters(); });
        host.appendChild(b);
    };
    mk('all', 'All', all.length);
    Object.keys(CATEGORY_LABELS).filter(c => counts[c]).forEach(c => mk(c, CATEGORY_LABELS[c], counts[c]));
    if (!facets.includes('category') || Object.keys(counts).length < 2) host.style.display = 'none';

    // Toolbar: search, facet selects, sort
    const bar = $('toolbar');
    bar.innerHTML = '';

    if (index.show_search !== false) {
        const wrap = document.createElement('label');
        wrap.className = 'control search';
        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search names and catalogues';
        input.setAttribute('aria-label', 'Search photos');
        input.value = filters.q;
        let t = null;
        input.addEventListener('input', () => {
            clearTimeout(t);
            t = setTimeout(() => { filters.q = input.value.trim(); applyFilters(); }, 160);
        });
        wrap.appendChild(input);
        bar.appendChild(wrap);
    }

    facets.filter(f => f !== 'category' && FACETS[f]).forEach(f => {
        const def = FACETS[f];
        const values = [...new Set(all.map(def.value).filter(Boolean))].sort();
        if (values.length < 2) return;
        const wrap = document.createElement('label');
        wrap.className = 'control';
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', def.label);
        sel.dataset.facet = f;
        const any = document.createElement('option');
        any.value = '';
        any.textContent = def.label;
        sel.appendChild(any);
        values.forEach(v => {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = def.display(v);
            sel.appendChild(o);
        });
        sel.value = values.includes(filters[f]) ? filters[f] : '';
        sel.classList.toggle('set', !!sel.value);
        sel.addEventListener('change', () => { filters[f] = sel.value; applyFilters(); });
        wrap.appendChild(sel);
        bar.appendChild(wrap);
    });

    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    bar.appendChild(spacer);

    const clear = document.createElement('button');
    clear.className = 'text-link clear-filters';
    clear.id = 'clear-filters';
    clear.type = 'button';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => {
        Object.assign(filters, { category: 'all', palette: '', constellation: '', year: '', type: '', q: '' });
        renderControls();
        applyFilters();
    });
    bar.appendChild(clear);

    const sortWrap = document.createElement('label');
    sortWrap.className = 'control';
    const sort = document.createElement('select');
    sort.setAttribute('aria-label', 'Sort');
    Object.entries(SORTS).forEach(([k, v]) => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = v.label;
        sort.appendChild(o);
    });
    sort.value = filters.sort;
    sort.addEventListener('change', () => { filters.sort = sort.value; applyFilters(); });
    sortWrap.appendChild(sort);
    bar.appendChild(sortWrap);
}

function syncControls() {
    document.querySelectorAll('.filter-btn').forEach(b => {
        const active = b.dataset.filter === filters.category;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active);
    });
    document.querySelectorAll('.toolbar select[data-facet]').forEach(sel => {
        sel.classList.toggle('set', !!sel.value);
    });
    const dirty = filters.category !== 'all' || filters.palette || filters.constellation || filters.year || filters.type || filters.q;
    $('clear-filters').classList.toggle('show', !!dirty);
}

/* ---------- Filtering ---------- */

function matchesQuery(e, q) {
    if (!q) return true;
    const hay = [e.title, e.subtitle, e.catalog, e.type, e.constellation, e.palette, e.skyTarget, (e.tags || []).join(' ')]
        .join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

function applyFilters(opts = {}) {
    let list = all.filter(e =>
        (filters.category === 'all' || (e.category || 'nebulae') === filters.category) &&
        (!filters.palette || (e.palette || '') === filters.palette) &&
        (!filters.constellation || (e.constellation || '') === filters.constellation) &&
        (!filters.year || (e.year || '') === filters.year) &&
        (!filters.type || (e.type || '') === filters.type) &&
        matchesQuery(e, filters.q)
    );
    const sorter = SORTS[filters.sort] && SORTS[filters.sort].fn;
    if (sorter) list = list.slice().sort(sorter);
    if (settings.index && settings.index.featured_first) {
        list = [...list.filter(e => e.featured), ...list.filter(e => !e.featured)];
    }
    shown = list;

    syncControls();
    if (opts.replaceUrl !== false) writeURL();
    $('collection-count').textContent = shown.length + (shown.length === 1 ? ' photo' : ' photos');
    renderGrid();

    if (viewer) viewer.lightbox.destroy();
    viewer = createViewer(shown, { pushUrls: true });
}

/* ---------- Grid ---------- */

function captionFields() {
    const g = settings.grid || {};
    return Array.isArray(g.caption_fields) && g.caption_fields.length ? g.caption_fields : ['title', 'catalog', 'integration'];
}

function captionValue(entry, field) {
    switch (field) {
        case 'title': return entry.title;
        case 'catalog': return entry.catalog;
        case 'integration': return integrationLabel(entry);
        case 'palette': return entry.palette;
        case 'constellation': return entry.constellation;
        case 'type': return entry.type;
        case 'date': return formatDate(entry.date) || entry.year;
        case 'distance': return entry.distance;
        default: return '';
    }
}

function renderGrid() {
    const grid = $('grid');
    grid.innerHTML = '';

    if (!shown.length) {
        grid.innerHTML = '<p class="grid-empty">Nothing matches. Try clearing a filter.</p>';
        return;
    }

    const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
            if (en.isIntersecting) { en.target.classList.add('in-view'); io.unobserve(en.target); }
        });
    }, { rootMargin: '200px 0px', threshold: 0 });

    const fields = captionFields();

    shown.forEach((entry, idx) => {
        const card = document.createElement('a');
        card.className = 'card';
        card.href = `/photo/${encodeURIComponent(entry.id)}/`;
        card.setAttribute('aria-label', entry.title);
        card.style.setProperty('--ar', (entry.width / entry.height).toFixed(4));
        card.style.setProperty('--ph-color', entry.color || '#0e1013');
        card.style.setProperty('--ph-image', `url("${entry.placeholder}")`);
        const focal = entry.layout && entry.layout.focal;
        if (focal && focal.length === 2) card.style.setProperty('--focal', `${focal[0] * 100}% ${focal[1] * 100}%`);
        const span = entry.layout && entry.layout.span;
        if (entry.featured || span >= 2) card.classList.add(entry.width / entry.height >= 1.6 || span === 3 ? 'full' : 'span-2');

        const picture = document.createElement('picture');
        const avif = entry.sources.avif || [];
        const jpg = entry.sources.jpg;
        if (avif.length) {
            const s = document.createElement('source');
            s.type = 'image/avif';
            s.srcset = srcsetOf(avif);
            s.sizes = GRID_SIZES;
            picture.appendChild(s);
        }
        const img = document.createElement('img');
        img.alt = entry.alt || `${entry.title}${entry.catalog ? ' — ' + entry.catalog : ''}`;
        img.loading = idx < 4 ? 'eager' : 'lazy';
        if (idx < 2) img.fetchPriority = 'high';
        img.decoding = 'async';
        img.width = entry.width;
        img.height = entry.height;
        img.srcset = srcsetOf(jpg);
        img.sizes = GRID_SIZES;
        img.src = '/' + encodeURI(jpg[0].src);
        if (img.complete && img.naturalWidth) img.classList.add('loaded');
        else img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
        picture.appendChild(img);
        card.appendChild(picture);

        const cap = document.createElement('figcaption');
        cap.className = 'card-caption';
        const title = document.createElement('span');
        title.className = 'c-title';
        title.textContent = captionValue(entry, fields[0]) || entry.title;
        const sub = document.createElement('span');
        sub.className = 'c-sub';
        sub.textContent = fields.slice(1).map(f => captionValue(entry, f)).filter(Boolean).join(' · ');
        cap.append(title, sub);
        card.appendChild(cap);

        card.addEventListener('click', (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let new-tab clicks through
            e.preventDefault();
            viewer.open(idx);
        });

        grid.appendChild(card);
        io.observe(card);
    });
}

/* Legacy deep links: index.html#photo=<id> (older shares and explore.html) */
function openFromLegacyHash() {
    const m = location.hash.match(/^#photo=(.+)$/);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    history.replaceState(null, '', location.pathname + location.search);
    if (!shown.some(e => e.id === id)) {
        Object.assign(filters, { category: 'all', palette: '', constellation: '', year: '', type: '', q: '' });
        renderControls();
        applyFilters();
    }
    viewer.openId(id);
}
