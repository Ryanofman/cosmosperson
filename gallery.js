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
    if (grid.row_height) g.style.setProperty('--row-h-base', grid.row_height + 'px');
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
    shown = arrange(list);

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

/* ---------- Showcase photos ---------- */

function showcaseConfig() {
    return Object.assign({ first: true, height: 0.86, include_hero: false }, (settings.grid && settings.grid.showcase) || {});
}

// A showcase photo is a true wide-field frame (the build decides from the plate solve: see
// grid.showcase.min_sky_area) or one marked by hand (layout.prominence, Featured). In the
// grid it gets a pillar several rows tall, or a wide block, instead of a sliver in a row.
function isShowcase(e) {
    const layout = e.layout || {};
    const mode = layout.prominence || 'auto';
    if (mode === 'normal') return false;
    if (mode === 'showcase' || e.featured || layout.span >= 2) return true;
    if (!e.showcase) return false;
    return !!showcaseConfig().include_hero || e.id !== heroConfig().id;
}

// Curated order leads with the showcase photos, each followed by its share of the others,
// so every pillar has photos to stand beside at any screen width.
function arrange(list) {
    const big = list.filter(isShowcase);
    if (!big.length || filters.sort !== 'curated' || showcaseConfig().first === false) return list;
    const rest = list.filter(e => !isShowcase(e));
    const share = Math.max(6, Math.ceil(rest.length / big.length));
    const out = [];
    big.forEach((b, i) => out.push(b, ...rest.slice(i * share, (i + 1) * share)));
    out.push(...rest.slice(big.length * share));
    return out;
}

function fovLabel(entry) {
    const fov = entry.solve && entry.solve.status === 'solved' && entry.solve.fov;
    if (!fov || fov.length !== 2) return '';
    const [w, h] = fov.map(Number);
    return Math.max(w, h) >= 1 ? `${w.toFixed(1)}° × ${h.toFixed(1)}° field` : `${Math.round(w * 60)}′ × ${Math.round(h * 60)}′ field`;
}

/* ---------- Grid ---------- */

let cardEls = new Map();      // photo id -> card element for the photos now shown
let layoutKey = '';
let gridWatcher = null;

function makeCard(entry, idx, fields) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = `/photo/${encodeURIComponent(entry.id)}/`;
    card.setAttribute('aria-label', entry.title);
    card.style.setProperty('--ar', (entry.width / entry.height).toFixed(4));
    card.style.setProperty('--ph-color', entry.color || '#0e1013');
    card.style.setProperty('--ph-image', `url("${entry.placeholder}")`);
    const focal = entry.layout && entry.layout.focal;
    if (focal && focal.length === 2) card.style.setProperty('--focal', `${focal[0] * 100}% ${focal[1] * 100}%`);
    const big = isShowcase(entry);
    if (big) card.classList.add('showcase');

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
    const subParts = fields.slice(1).map(f => captionValue(entry, f)).filter(Boolean);
    if (big && fovLabel(entry)) subParts.push(fovLabel(entry));
    sub.textContent = subParts.join(' · ');
    cap.append(title, sub);
    card.appendChild(cap);

    card.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let new-tab clicks through
        e.preventDefault();
        viewer.open(idx);
    });
    return card;
}

function renderGrid() {
    const grid = $('grid');
    grid.innerHTML = '';
    grid.classList.remove('rows');
    cardEls = new Map();
    layoutKey = '';

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
    shown.forEach((entry, idx) => cardEls.set(entry.id, makeCard(entry, idx, fields)));
    layoutGrid();
    cardEls.forEach(card => io.observe(card));

    if (!gridWatcher) {
        // Animation frames stop in a background tab, so a timer backs them up; layoutGrid
        // does nothing when the width has not changed.
        let raf = 0, timer = 0;
        const again = () => {
            cancelAnimationFrame(raf);
            clearTimeout(timer);
            raf = requestAnimationFrame(layoutGrid);
            timer = setTimeout(layoutGrid, 150);
        };
        gridWatcher = window.ResizeObserver ? new ResizeObserver(again) : null;
        if (gridWatcher) gridWatcher.observe(grid);
        window.addEventListener('resize', again);
    }
}

/* Rows are built here rather than left to flex-wrap, so that a showcase photo can stand as
   a pillar beside several rows of the others. Inside a row the cards still size themselves
   (flex-grow by aspect ratio), so nothing is cropped and rounding never leaves a gap. */

function computeBlocks(items, W, g, h) {
    const ar = (e) => e.width / e.height;
    const frac = Number(showcaseConfig().height) || 0.86;
    const H0max = Math.min(1100, Math.max(520, frac * window.innerHeight));
    const blocks = [];
    const n = items.length;

    // Take items from list[start…] until the justified row height reaches the target,
    // stopping before or after the last one, whichever lands closer to the target.
    const fillRow = (list, start, width, target) => {
        let sum = 0, j = start, full = false;
        while (j < list.length) {
            const next = sum + ar(list[j]);
            const hNext = (width - (j - start) * g) / next;
            if (hNext <= target) {
                const hPrev = j > start ? (width - (j - start - 1) * g) / sum : Infinity;
                full = true;
                if (hPrev - target < target - hNext) break;
                sum = next; j++;
                break;
            }
            sum = next; j++;
        }
        const count = j - start;
        return { count, sum, full, height: count ? (width - (count - 1) * g) / sum : 0 };
    };

    const pushRows = (list) => {
        let at = 0;
        while (at < list.length) {
            const r = fillRow(list, at, W, h);
            const stretchTooFar = !r.full && r.height > h * 1.25;     // a short last row keeps the row height
            blocks.push({ type: 'row', items: list.slice(at, at + r.count), capped: stretchTooFar, height: h });
            at += r.count;
        }
    };

    let i = 0, side = 'left';
    while (i < n) {
        const e = items[i];
        let j = i + 1;
        if (!isShowcase(e)) {
            while (j < n && !isShowcase(items[j])) j++;
            pushRows(items.slice(i, j));
            i = j;
            continue;
        }
        while (j < n && !isShowcase(items[j])) j++;
        const cand = items.slice(i + 1, j);        // the ordinary photos that follow, up to the next showcase
        const a = ar(e);

        if (a >= 1.9) {                            // a panorama takes a row of its own
            blocks.push({ type: 'row', items: [e], capped: false, height: h });
            i += 1;
            continue;
        }

        const p0 = Math.min(a * H0max, 0.56 * W);
        const H0 = p0 / a;
        const sideW = W - p0 - g;
        const k0 = Math.max(1, Math.round((H0 + g) / (h + g)));

        // A pillar beside k rows of the photos that follow. The rows are packed for the
        // estimated width, then the pillar's exact width p follows in closed form: its height
        // p/a must equal the rows beside it, each (W − p − g − gaps) / Σaspect tall, which is
        // linear in p.
        const pillarWith = (k) => {
            const target = (H0 - (k - 1) * g) / k;
            const rows = [];
            let used = 0;
            for (let r = 0; r < k && used < cand.length; r++) {
                const f = fillRow(cand, used, sideW, target);
                rows.push({ items: cand.slice(used, used + f.count), sum: f.sum, full: f.full, height: f.height, capped: false });
                used += f.count;
            }
            if (!rows.length) return null;
            const last = rows[rows.length - 1];
            if (!last.full && last.height > target * 1.3) {
                if (rows.length > 2) { used -= last.items.length; rows.pop(); }   // hand the stragglers back to the flow
                else last.capped = true;
            }
            if (rows.length < 2) return null;
            let A = (rows.length - 1) * g, B = 0;
            rows.forEach(r => {
                if (r.capped) { A += target; return; }
                A += (W - g - (r.items.length - 1) * g) / r.sum;
                B += 1 / r.sum;
            });
            const p = a * A / (1 + a * B);
            if (!(p > 0) || W - p - g < 200) return null;
            // how evenly the rows beside it come out: a lopsided stack reads badly
            const hs = rows.map(r => r.capped ? target : (W - p - g - (r.items.length - 1) * g) / r.sum);
            const spread = Math.max(...hs) / Math.min(...hs);
            const mean = hs.reduce((x, y) => x + y, 0) / hs.length;
            return { type: 'pillar', pillar: e, side, rows, p, used, rowH: target, H: p / a, spread, mean };
        };

        let block = null;
        if (sideW >= 240 && cand.length) {
            // one row more or fewer than the estimate: the choice that keeps the pillar near its
            // intended height and the rows beside it near the grid's own row height, and even
            const score = (b) => Math.abs(b.H - H0) / H0
                + 0.6 * Math.abs(b.mean - h) / h
                + Math.max(0, b.spread - 1.6) * 0.25;
            [k0 - 1, k0, k0 + 1].filter(k => k >= 2).forEach(k => {
                const b = pillarWith(k);
                if (b && b.H <= H0 * 1.2 && (!block || score(b) < score(block))) block = b;
            });
        }
        if (block) {
            blocks.push(block);
            side = side === 'left' ? 'right' : 'left';
            i += 1 + block.used;
            continue;
        }
        // No room or no company for a pillar: one tall row shared with whatever follows
        const f = fillRow([e, ...cand], 0, W, H0);
        blocks.push({ type: 'row', items: [e, ...cand.slice(0, f.count - 1)], capped: !f.full, height: H0, center: true });
        i += f.count;
    }
    return blocks;
}

function layoutGrid() {
    const grid = $('grid');
    if (!cardEls.size) return;
    const W = grid.clientWidth;
    if (!W) return;
    // --row-h and --gutter may be calc() expressions; a hidden box resolves them to pixels
    const ruler = document.createElement('div');
    ruler.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:var(--row-h);width:var(--gutter)';
    grid.appendChild(ruler);
    const box = ruler.getBoundingClientRect();
    ruler.remove();
    const g = box.width || 14;
    const h = box.height || 300;
    const flat = !grid.classList.contains('justified') || window.matchMedia('(max-width: 720px)').matches;
    const key = flat ? 'flat' : [Math.round(W), g, h, Math.round(window.innerHeight / 30)].join(':');
    if (key === layoutKey) return;
    layoutKey = key;

    const cardOf = (e) => {
        const c = cardEls.get(e.id);
        c.classList.remove('pillar');
        return c;
    };
    const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
    const frag = document.createDocumentFragment();

    if (flat) {
        shown.forEach(e => frag.appendChild(cardOf(e)));
    } else {
        const makeRow = (items, capped, height, center) => {
            const row = div('g-row');
            if (capped) {
                row.classList.add('capped');
                if (center) row.classList.add('center');
                row.style.setProperty('--h', height.toFixed(2) + 'px');
            }
            items.forEach(e => row.appendChild(cardOf(e)));
            return row;
        };
        computeBlocks(shown, W, g, h).forEach(b => {
            if (b.type === 'row') { frag.appendChild(makeRow(b.items, b.capped, b.height, b.center)); return; }
            const block = div('g-block ' + b.side);
            block.style.setProperty('--p', b.p.toFixed(2) + 'px');
            const pillar = cardOf(b.pillar);
            pillar.classList.add('pillar');
            block.appendChild(pillar);
            const sideEl = div('g-side');
            b.rows.forEach(r => sideEl.appendChild(makeRow(r.items, r.capped, b.rowH, false)));
            block.appendChild(sideEl);
            frag.appendChild(block);
        });
    }
    grid.classList.toggle('rows', !flat);
    grid.replaceChildren(frag);

    // Tell each image how wide it is shown, so the browser fetches a version sharp enough for it
    cardEls.forEach(card => {
        const w = Math.ceil(card.getBoundingClientRect().width);
        if (!w || w <= (card._sizedFor || 0) * 1.1) return;
        card._sizedFor = w;
        const img = card.querySelector('img'), src = card.querySelector('source');
        if (src) src.sizes = w + 'px';
        if (img) img.sizes = w + 'px';
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
