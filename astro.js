/* astro.js — the astro layer on photo pages.

   Deep zoom (OpenSeadragon on the DZI tiles), plate-solve overlays (object labels,
   RA/Dec grid), mosaic panels, versions with a crossfade, and the Sky panel (Aladin
   Lite centred on the solve with the image footprint drawn).

   Loaded by photo/<id>/index.html next to viewer.js. The two big libraries load on
   first use only, so a photo page stays light until someone asks for more. */

import { loadManifest } from '/viewer.js';

const OSD_SRC = '/vendor/openseadragon/openseadragon.min.js';
const ALADIN_SRC = '/vendor/aladin-lite/aladin.js';
const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('failed to load ' + src));
        document.head.appendChild(s);
    });
}

async function loadOSD() {
    if (!window.OpenSeadragon) await loadScript(OSD_SRC);
    return window.OpenSeadragon;
}

async function loadAladin() {
    if (window.A && window.A.aladin) return window.A;
    const mod = await import(ALADIN_SRC);
    const A = mod.default || mod.A || window.A;
    if (A && A.init) await A.init;
    window.A = A;
    return A;
}

/* ---------- Formatting ---------- */

function fmtRA(ra, fine) {
    const hours = ((ra % 360) + 360) % 360 / 15;
    let h = Math.floor(hours);
    let m = (hours - h) * 60;
    let s = Math.round((m - Math.floor(m)) * 60);
    m = Math.floor(m);
    if (s === 60) { s = 0; m += 1; }
    if (m === 60) { m = 0; h = (h + 1) % 24; }
    return fine ? `${h}ʰ ${String(m).padStart(2, '0')}ᵐ ${String(s).padStart(2, '0')}ˢ`
        : `${h}ʰ ${String(m).padStart(2, '0')}ᵐ`;
}

function fmtDec(dec, fine) {
    const sign = dec < 0 ? '−' : '+';
    const a = Math.abs(dec);
    let d = Math.floor(a);
    let m = (a - d) * 60;
    let s = Math.round((m - Math.floor(m)) * 60);
    m = Math.floor(m);
    if (s === 60) { s = 0; m += 1; }
    if (m === 60) { m = 0; d += 1; }
    return fine ? `${sign}${d}° ${String(m).padStart(2, '0')}′ ${String(s).padStart(2, '0')}″`
        : `${sign}${d}° ${String(m).padStart(2, '0')}′`;
}

function fmtFov(fov) {
    if (!fov || fov.length !== 2) return '';
    const [w, h] = fov.map(Number);
    return Math.max(w, h) >= 1 ? `${w.toFixed(1)}° × ${h.toFixed(1)}°` : `${Math.round(w * 60)}′ × ${Math.round(h * 60)}′`;
}

/* ---------- WCS: TAN projection, in original-image pixels ---------- */

export function makeWCS(solve, entry) {
    const w = solve && solve.wcs;
    if (!w || !w.cd || !w.crpix || !w.crval) return null;
    const k = w.width / entry.width;              // original px -> solved px
    const [[a, b], [c, d]] = w.cd;
    const det = a * d - b * c;
    if (!det) return null;
    const ra0 = rad(w.crval[0]), dec0 = rad(w.crval[1]);
    const toSolved = (x, y) => {
        let sx = x * k, sy = y * k;
        if (w.flip_y) sy = w.height - 1 - sy;
        return [sx, sy];
    };
    const fromSolved = (sx, sy) => {
        if (w.flip_y) sy = w.height - 1 - sy;
        return [sx / k, sy / k];
    };
    return {
        pix2sky(x, y) {
            const [sx, sy] = toSolved(x, y);
            const dx = sx + 1 - w.crpix[0], dy = sy + 1 - w.crpix[1];
            const xi = rad(a * dx + b * dy), eta = rad(c * dx + d * dy);
            const den = Math.cos(dec0) - eta * Math.sin(dec0);
            const ra = ra0 + Math.atan2(xi, den);
            const dec = Math.atan2(eta * Math.cos(dec0) + Math.sin(dec0), Math.hypot(xi, den));
            return [((deg(ra) % 360) + 360) % 360, deg(dec)];
        },
        sky2pix(ra, dec) {
            const r = rad(ra), dd = rad(dec);
            const cosc = Math.sin(dd) * Math.sin(dec0) + Math.cos(dd) * Math.cos(dec0) * Math.cos(r - ra0);
            if (cosc <= 0) return null;
            const xi = deg(Math.cos(dd) * Math.sin(r - ra0) / cosc);
            const eta = deg((Math.sin(dd) * Math.cos(dec0) - Math.cos(dd) * Math.sin(dec0) * Math.cos(r - ra0)) / cosc);
            const dx = (d * xi - b * eta) / det;
            const dy = (-c * xi + a * eta) / det;
            return fromSolved(dx + w.crpix[0] - 1, dy + w.crpix[1] - 1);
        },
    };
}

/* ---------- RA/Dec grid geometry ---------- */

const DEC_STEPS = [10, 5, 2, 1, 0.5, 1 / 3, 0.25, 1 / 6, 1 / 12, 1 / 20, 1 / 30, 1 / 60];
const RA_STEPS_H = [2, 1, 0.5, 1 / 3, 1 / 6, 1 / 12, 1 / 20, 1 / 30, 1 / 60, 1 / 120, 1 / 240];

function pickStep(span, steps) {
    for (const s of steps) if (span / s >= 3) return s;
    return steps[steps.length - 1];
}

function gridGeometry(wcs, W, H) {
    const centre = wcs.pix2sky(W / 2, H / 2);
    const raC = centre[0], decC = centre[1];
    const rel = (ra) => ((ra - raC + 540) % 360) - 180;        // RA relative to the centre, −180..180
    const samples = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        samples.push(wcs.pix2sky(t * W, 0), wcs.pix2sky(t * W, H), wcs.pix2sky(0, t * H), wcs.pix2sky(W, t * H));
    }
    let decMin = Infinity, decMax = -Infinity, raMin = Infinity, raMax = -Infinity;
    for (const [ra, dec] of samples) {
        decMin = Math.min(decMin, dec); decMax = Math.max(decMax, dec);
        const r = rel(ra);
        raMin = Math.min(raMin, r); raMax = Math.max(raMax, r);
    }
    const cosD = Math.max(0.05, Math.cos(rad(decC)));
    const spanSky = Math.max(decMax - decMin, (raMax - raMin) * cosD);
    const decStep = pickStep(spanSky, DEC_STEPS);
    const raStepH = pickStep(spanSky / cosD / 15, RA_STEPS_H);
    const raStep = raStepH * 15;
    const fineRA = raStepH < 1 / 60;
    const fineDec = decStep < 1 / 60;
    const pad = 0.15;
    const decLo = decMin - (decMax - decMin) * pad, decHi = decMax + (decMax - decMin) * pad;
    const raLo = raMin - (raMax - raMin) * pad, raHi = raMax + (raMax - raMin) * pad;
    const inside = (p) => p && p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H;
    const lines = [];

    const toPath = (points) => {
        let d = '', pen = false;
        for (const p of points) {
            if (!p || !isFinite(p[0]) || !isFinite(p[1])) { pen = false; continue; }
            d += (pen ? ' L ' : ' M ') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
            pen = true;
        }
        return d.trim();
    };

    const K = 64;
    for (let dec = Math.ceil(decLo / decStep) * decStep; dec <= decHi; dec += decStep) {
        if (dec <= -90 || dec >= 90) continue;
        const pts = [];
        for (let i = 0; i <= K; i++) pts.push(wcs.sky2pix(raC + raLo + (raHi - raLo) * i / K, dec));
        const anchor = pts.filter(inside).sort((p, q) => p[0] - q[0])[0];
        lines.push({ kind: 'dec', d: toPath(pts), label: fmtDec(dec, fineDec), anchor });
    }
    for (let r = Math.ceil((raC + raLo) / raStep) * raStep; r <= raC + raHi; r += raStep) {
        const pts = [];
        for (let i = 0; i <= K; i++) pts.push(wcs.sky2pix(r, decLo + (decHi - decLo) * i / K));
        const anchor = pts.filter(inside).sort((p, q) => p[1] - q[1])[0];
        lines.push({ kind: 'ra', d: toPath(pts), label: fmtRA(r, fineRA), anchor });
    }
    return lines;
}

/* ---------- The overlay SVG (shared by the stage and the deep zoom) ---------- */

function el(name, attrs = {}, text) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    return node;
}

function buildOverlay(ctx) {
    const { entry, wcs, solve } = ctx;
    const W = entry.width, H = entry.height;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'astro-overlay', 'aria-hidden': 'true', 'font-size': (W / 72).toFixed(1) });

    if (wcs) {
        const g = el('g', { class: 'ov-grid' });
        for (const line of gridGeometry(wcs, W, H)) {
            if (!line.d) continue;
            g.appendChild(el('path', { d: line.d, class: 'ov-grid-line ov-' + line.kind }));
            if (line.anchor) {
                const t = el('text', {
                    x: line.anchor[0].toFixed(1), y: line.anchor[1].toFixed(1), class: 'ov-grid-text ov-' + line.kind,
                    dx: '0.35em', dy: line.kind === 'dec' ? '-0.35em' : '1.1em',
                }, line.label);
                g.appendChild(t);
            }
        }
        svg.appendChild(g);
    }

    const labels = (solve && solve.annotations) || [];
    if (labels.length) {
        const g = el('g', { class: 'ov-labels' });
        const minR = W / 160;
        for (const a of labels) {
            const r = Math.max(Number(a.r) || 0, minR);
            const name = (a.names || []).join(' / ');
            g.appendChild(el('circle', { cx: a.x, cy: a.y, r: r.toFixed(1), class: 'ov-label-ring ov-type-' + (a.type || 'other') }));
            g.appendChild(el('text', { x: (a.x + r * 0.72).toFixed(1), y: (a.y - r * 0.72).toFixed(1), dx: '0.25em', dy: '-0.1em', class: 'ov-label-text' }, name));
        }
        svg.appendChild(g);
    }

    const mosaic = entry.mosaic || {};
    const panels = Array.isArray(mosaic.panel_map) ? mosaic.panel_map : [];
    if (panels.length) {
        const g = el('g', { class: 'ov-panels' });
        const frac = panels.every(p => p.every(v => v <= 1.0001));   // fractions of the image or pixels
        panels.forEach((p, i) => {
            const [x, y, w, h] = frac ? [p[0] * W, p[1] * H, p[2] * W, p[3] * H] : p;
            g.appendChild(el('rect', { x: x.toFixed(1), y: y.toFixed(1), width: w.toFixed(1), height: h.toFixed(1), class: 'ov-panel' }));
            g.appendChild(el('text', { x: (x + w / 2).toFixed(1), y: (y + h / 2).toFixed(1), 'text-anchor': 'middle', dy: '0.35em', class: 'ov-panel-text' }, String(i + 1)));
        });
        svg.appendChild(g);
    }
    return svg;
}

function syncOverlayClasses(ctx, svg) {
    svg.classList.toggle('show-grid', !!ctx.show.grid);
    svg.classList.toggle('show-labels', !!ctx.show.labels);
    svg.classList.toggle('show-panels', !!ctx.show.panels);
}

/* ---------- Stage (the static image) ---------- */

function ensureStageOverlay(ctx) {
    if (ctx.stageSvg) return ctx.stageSvg;
    const host = $('photo-open');
    if (!host) return null;
    const svg = buildOverlay(ctx);
    svg.classList.add('stage-overlay');
    host.appendChild(svg);
    ctx.stageSvg = svg;
    const place = () => {
        const img = $('photo-image');
        if (!img) return;
        svg.style.left = img.offsetLeft + 'px';
        svg.style.top = img.offsetTop + 'px';
        svg.style.width = img.offsetWidth + 'px';
        svg.style.height = img.offsetHeight + 'px';
    };
    place();
    window.addEventListener('resize', place);
    const img = $('photo-image');
    if (img && !img.complete) img.addEventListener('load', place, { once: true });
    ctx.placeStage = place;
    return svg;
}

function updateOverlays(ctx) {
    const any = ctx.show.grid || ctx.show.labels || ctx.show.panels;
    if (any || ctx.stageSvg) {
        const svg = ensureStageOverlay(ctx);
        if (svg) { syncOverlayClasses(ctx, svg); svg.hidden = !any; }
    }
    if (ctx.zoomSvg) { syncOverlayClasses(ctx, ctx.zoomSvg); ctx.zoomSvg.style.display = any ? '' : 'none'; }
    for (const tool of ['grid', 'labels', 'panels']) setPressed(tool, !!ctx.show[tool]);
    writeHash(ctx);
}

function setPressed(tool, on) {
    const btn = document.querySelector(`#stage-tools [data-tool="${tool}"]`);
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const bar = document.querySelector(`.dz-bar [data-tool="${tool}"]`);
    if (bar) bar.setAttribute('aria-pressed', on ? 'true' : 'false');
}

/* ---------- Versions ---------- */

function sourcesFor(ctx, vid) {
    if (vid === 'main') return ctx.entry.sources;
    const v = (ctx.entry.versions || []).find(x => x.id === vid);
    return v ? v.sources : ctx.entry.sources;
}

function srcset(list) {
    return (list || []).map(s => `/${encodeURI(s.src)} ${s.w}w`).join(', ');
}

function swapStage(ctx, vid) {
    const src = sourcesFor(ctx, vid);
    const img = $('photo-image');
    const source = document.querySelector('#photo-open picture source[type="image/avif"]');
    if (!img || !src.jpg || !src.jpg.length) return;
    const big = src.jpg[src.jpg.length - 1];
    if (source) source.srcset = srcset(src.avif);
    img.srcset = srcset(src.jpg);
    img.src = '/' + encodeURI(big.src);
    const open = $('photo-open');
    if (open) open.href = '/' + encodeURI(big.src);
}

function selectVersion(ctx, vid, fromHash) {
    if (!ctx.versionIds.includes(vid) || vid === ctx.current) return;
    ctx.prev = ctx.current;
    ctx.current = vid;
    document.querySelectorAll('#stage-tools .stage-versions button').forEach(b => {
        const on = b.dataset.version === vid;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (ctx.blend) ctx.blend.value = '100';
    if (ctx.viewer) applyOpacities(ctx, 1);
    swapStage(ctx, vid);
    if (!fromHash) writeHash(ctx);
}

function applyOpacities(ctx, t) {
    if (!ctx.items) return;
    for (const [vid, item] of ctx.items) {
        if (vid === ctx.current) item.setOpacity(t);
        else if (vid === ctx.prev) item.setOpacity(1);
        else item.setOpacity(0);
    }
    const cur = ctx.items.get(ctx.current);
    if (cur) ctx.viewer.world.setItemIndex(cur, ctx.viewer.world.getItemCount() - 1);
}

function ensureBlend(ctx) {
    if (ctx.blend || ctx.versionIds.length < 2) return;
    const host = document.querySelector('#stage-tools .stage-versions');
    if (!host) return;
    const label = document.createElement('label');
    label.className = 'stage-blend';
    label.innerHTML = '<span class="label">Blend</span><input type="range" min="0" max="100" value="100" aria-label="Blend between versions">';
    host.after(label);
    ctx.blend = label.querySelector('input');
    ctx.blendWrap = label;
    ctx.blend.addEventListener('input', () => { if (ctx.viewer) applyOpacities(ctx, ctx.blend.value / 100); });
}

/* ---------- Deep zoom ---------- */

function dziDescriptor(base, t) {
    return {
        Image: {
            xmlns: 'http://schemas.microsoft.com/deepzoom/2008',
            Url: `${base}/${t.files}`,
            Format: t.format,
            Overlap: String(t.overlap),
            TileSize: String(t.tile_size),
            Size: { Width: String(t.width), Height: String(t.height) },
        },
    };
}

function buildBar(ctx) {
    const bar = document.createElement('div');
    bar.className = 'dz-bar';
    const btn = (tool, title, svg, toggle) =>
        `<button type="button" data-tool="${tool}" title="${title}" aria-label="${title}"${toggle ? ' aria-pressed="false"' : ''}>${svg}</button>`;
    bar.innerHTML = [
        btn('zoom-in', 'Zoom in (+)', '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'),
        btn('zoom-out', 'Zoom out (−)', '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>'),
        btn('home', 'Fit (0)', '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>'),
        ctx.wcs ? btn('grid', 'RA/Dec grid (G)', '<svg viewBox="0 0 24 24"><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>', true) : '',
        (ctx.solve && ctx.solve.annotations && ctx.solve.annotations.length) ? btn('labels', 'Object labels (L)', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>', true) : '',
        (ctx.entry.mosaic && ctx.entry.mosaic.panel_map) ? btn('panels', 'Mosaic panels (P)', '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M12 3v18M3 12h18"/></svg>', true) : '',
        btn('full', 'Full screen (F)', '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>'),
        btn('close', 'Close deep zoom (Esc)', '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>'),
    ].join('');
    bar.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const v = ctx.viewer;
        switch (b.dataset.tool) {
            case 'zoom-in': v && v.viewport.zoomBy(1.6); break;
            case 'zoom-out': v && v.viewport.zoomBy(1 / 1.6); break;
            case 'home': v && v.viewport.goHome(); break;
            case 'full': toggleFullscreen(ctx); break;
            case 'close': closeZoom(ctx); break;
            default: toggle(ctx, b.dataset.tool);
        }
        if (v) v.viewport.applyConstraints();
    });
    const scale = document.createElement('span');
    scale.className = 'dz-scale label';
    bar.appendChild(scale);
    ctx.scaleEl = scale;
    return bar;
}

async function openZoom(ctx, rect) {
    // rect: optional [x, y, w, h] in viewport units (image width = 1), from a deep link
    const stage = $('photo-stage'), dz = $('deepzoom');
    if (!dz || !(ctx.entry.tiles && ctx.entry.tiles.main)) return;
    const toRect = (OSD) => (rect && OSD) ? new OSD.Rect(rect[0], rect[1], rect[2], rect[3]) : null;
    if (ctx.zoomOpen) {
        if (rect && ctx.viewer) ctx.viewer.viewport.fitBounds(toRect(window.OpenSeadragon), true);
        return;
    }
    ctx.zoomOpen = true;
    ctx.pendingRect = rect || null;      // kept in the address until the viewer has applied it
    dz.hidden = false;
    stage.classList.add('is-zoomed');
    if (ctx.blendWrap) ctx.blendWrap.hidden = false;
    setPressed('zoom', true);
    if (ctx.viewer) {
        ctx.viewer.forceResize();
        if (rect) ctx.viewer.viewport.fitBounds(toRect(window.OpenSeadragon), true);
        ctx.pendingRect = null;
        writeHash(ctx);
        return;
    }
    let OSD;
    try {
        OSD = await loadOSD();
    } catch (err) {
        console.warn(err);
        closeZoom(ctx);
        return;
    }
    const viewportRect = toRect(OSD);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const entry = ctx.entry;
    const viewer = OSD({
        element: dz,
        prefixUrl: '',
        showNavigationControl: false,
        showNavigator: true,
        navigatorPosition: 'BOTTOM_RIGHT',
        navigatorSizeRatio: 0.14,
        navigatorAutoFade: true,
        navigatorBackground: '#000',
        navigatorBorderColor: 'rgba(255,255,255,0.25)',
        navigatorDisplayRegionColor: ctx.accent,
        animationTime: reduced ? 0 : 0.6,
        springStiffness: 7,
        zoomPerScroll: 1.25,
        zoomPerClick: 1.8,
        minZoomImageRatio: 0.85,
        maxZoomPixelRatio: 2.5,
        visibilityRatio: 0.7,
        immediateRender: true,
        blendTime: reduced ? 0 : 0.25,
        placeholderFillStyle: entry.color || '#000',
        imageSmoothingEnabled: true,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true, flickEnabled: true },
        gestureSettingsTouch: { pinchRotate: false, flickEnabled: true },
    });
    ctx.viewer = viewer;
    ctx.items = new Map();
    const sources = ctx.versionIds.map(vid => ({
        tileSource: dziDescriptor(ctx.tilesBase, entry.tiles[vid]),
        opacity: vid === ctx.current ? 1 : 0,
        width: 1,
    }));
    viewer.addOnceHandler('open', () => {
        ctx.versionIds.forEach((vid, i) => ctx.items.set(vid, viewer.world.getItemAt(i)));
        applyOpacities(ctx, 1);
        const svg = buildOverlay(ctx);
        svg.classList.add('zoom-overlay');
        ctx.zoomSvg = svg;
        viewer.addOverlay({ element: svg, location: new OSD.Rect(0, 0, 1, entry.height / entry.width), checkResize: false });
        syncOverlayClasses(ctx, svg);
        svg.style.display = (ctx.show.grid || ctx.show.labels || ctx.show.panels) ? '' : 'none';
        const rescale = () => {
            const zoom = viewer.viewport.getZoom(true);
            const pxPerUnit = zoom * viewer.container.clientWidth / entry.width;   // screen px per original px
            svg.setAttribute('font-size', (13 / pxPerUnit).toFixed(2));
            if (ctx.scaleEl) {
                const pct = Math.round(pxPerUnit * 100);
                let text = pct >= 100 ? `${(pxPerUnit).toFixed(1)}× ` : `${pct}% `;
                if (ctx.solve && ctx.solve.pixscale) {
                    const arcsecPerScreenPx = ctx.solve.pixscale / pxPerUnit;
                    text += arcsecPerScreenPx >= 60 ? `· ${(arcsecPerScreenPx / 60).toFixed(1)}′ per screen px` : `· ${arcsecPerScreenPx.toFixed(1)}″ per screen px`;
                }
                ctx.scaleEl.textContent = text;
            }
        };
        viewer.addHandler('zoom', rescale);
        viewer.addHandler('resize', rescale);
        viewer.addHandler('animation-finish', () => { rescale(); writeHash(ctx); });
        rescale();
        // The container may have been laid out after OpenSeadragon measured it
        requestAnimationFrame(() => {
            viewer.forceResize();
            if (viewportRect) viewer.viewport.fitBounds(viewportRect, true);
            else viewer.viewport.goHome(true);
            ctx.pendingRect = null;
            rescale();
            writeHash(ctx);
        });
    });
    viewer.open(sources);
    dz.appendChild(buildBar(ctx));
    document.addEventListener('fullscreenchange', () => {
        stage.classList.toggle('is-fullscreen', document.fullscreenElement === stage);
    });
}

function closeZoom(ctx) {
    if (!ctx.zoomOpen) return;
    ctx.zoomOpen = false;
    const stage = $('photo-stage'), dz = $('deepzoom');
    if (document.fullscreenElement === stage && document.exitFullscreen) document.exitFullscreen();
    dz.hidden = true;
    stage.classList.remove('is-zoomed');
    if (ctx.blendWrap) ctx.blendWrap.hidden = true;
    if (ctx.blend) { ctx.blend.value = '100'; }
    setPressed('zoom', false);
    writeHash(ctx);
}

function toggleFullscreen(ctx) {
    const stage = $('photo-stage');
    if (!ctx.zoomOpen) return;
    if (document.fullscreenElement === stage) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
}

/* ---------- Sky panel (Aladin Lite) ---------- */

async function toggleSky(ctx, force) {
    const panel = $('sky-panel');
    if (!panel) return;
    const open = force === undefined ? panel.hidden : force;
    if (!open) {
        if (panel.hidden) return;
        panel.hidden = true; setPressed('sky', false); writeHash(ctx); return;
    }
    panel.hidden = false;
    setPressed('sky', true);
    writeHash(ctx);
    panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    if (ctx.aladin || ctx.aladinLoading) return;
    ctx.aladinLoading = true;
    const cap = $('sky-caption');
    const { solve, entry } = ctx;
    const solved = solve && solve.status === 'solved';
    const centre = ctx.coords;
    if (cap && centre) {
        cap.textContent = (solved ? 'Centre ' : 'Catalogue position ') +
            `RA ${fmtRA(centre[0])} · Dec ${fmtDec(centre[1])}` +
            (solved && solve.fov ? ` · field ${fmtFov(solve.fov)}` : '');
    }
    let A;
    try {
        A = await loadAladin();
    } catch (err) {
        console.warn('Aladin Lite failed to load', err);
        const map = $('sky-map');
        if (map) map.innerHTML = '<p class="sky-error">The sky map could not load. <a href="' + (ctx.exploreLink || '/explore.html') + '">Open Explore instead.</a></p>';
        return;
    }
    const fov = solved && solve.fov ? Math.max(solve.fov[0], solve.fov[1]) * 2.4 : 4;
    try {
        const aladin = A.aladin('#sky-map', {
            survey: ctx.survey,
            target: `${centre[0]} ${centre[1]}`,
            fov,
            cooFrame: 'ICRSd',
            showReticle: false,
            showLayersControl: false,
            showGotoControl: false,
            showShareControl: false,
            showSimbadPointerControl: false,
            showProjectionControl: false,
            showFrame: false,
            showCooGridControl: true,
            showFullscreenControl: true,
            showSettingsControl: false,
            backgroundColor: '#08090b',
        });
        ctx.aladin = aladin;
        if (solved && ctx.wcs) {
            const W = entry.width, H = entry.height;
            const corners = [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => ctx.wcs.pix2sky(x, y));
            const overlay = A.graphicOverlay({ color: ctx.accent, lineWidth: 2 });
            aladin.addOverlay(overlay);
            overlay.add(A.polygon(corners));
        } else {
            const cat = A.catalog({ name: 'This photo', sourceSize: 22, shape: 'circle', color: ctx.accent });
            aladin.addCatalog(cat);
            cat.addSources([A.marker(centre[0], centre[1], { popupTitle: entry.title, popupDesc: entry.catalog || '' })]);
        }
    } catch (err) {
        console.warn('Aladin Lite could not start', err);
    }
}

/* ---------- URL hash: shareable zoom crops and toggles ---------- */

function writeHash(ctx) {
    const p = new URLSearchParams();
    if (ctx.zoomOpen && ctx.pendingRect) {
        p.set('zoom', ctx.pendingRect.map(v => Number(v).toFixed(4)).join(','));
    } else if (ctx.zoomOpen && ctx.viewer && ctx.viewer.world && ctx.viewer.world.getItemCount()) {
        const r = ctx.viewer.viewport.getBounds();
        p.set('zoom', [r.x, r.y, r.width, r.height].map(v => v.toFixed(4)).join(','));
    } else if (ctx.zoomOpen) {
        p.set('zoom', '1');
    }
    if (ctx.current !== 'main') p.set('v', ctx.current);
    for (const tool of ['labels', 'grid', 'panels']) if (ctx.show[tool]) p.set(tool, '1');
    const sky = $('sky-panel');
    if (sky && !sky.hidden) p.set('sky', '1');
    const hash = p.toString().replace(/%2C/g, ',');
    const url = location.pathname + location.search + (hash ? '#' + hash : '');
    if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', url);
}

function readHash(ctx) {
    const h = location.hash.replace(/^#/, '');
    if (!h) return null;
    const p = new URLSearchParams(h);
    const out = { zoom: null, rect: null };
    if (p.has('zoom')) {
        out.zoom = true;
        const parts = p.get('zoom').split(',').map(Number);
        if (parts.length === 4 && parts.every(n => isFinite(n))) out.rect = parts;
    }
    out.v = p.get('v');
    out.labels = p.get('labels') === '1';
    out.grid = p.get('grid') === '1';
    out.panels = p.get('panels') === '1';
    out.sky = p.get('sky') === '1';
    return out;
}

/* ---------- Tools ---------- */

function toggle(ctx, tool) {
    switch (tool) {
        case 'zoom': ctx.zoomOpen ? closeZoom(ctx) : openZoom(ctx); break;
        case 'sky': toggleSky(ctx); break;
        case 'labels': case 'grid': case 'panels':
            ctx.show[tool] = !ctx.show[tool];
            updateOverlays(ctx);
            break;
    }
}

function bindKeys(ctx) {
    document.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (document.querySelector('.pswp--open')) return;
        const has = (tool) => !!document.querySelector(`#stage-tools [data-tool="${tool}"]`);
        switch (e.key.toLowerCase()) {
            case 'z': if (has('zoom')) { toggle(ctx, 'zoom'); e.preventDefault(); } break;
            case 'l': if (has('labels')) { toggle(ctx, 'labels'); e.preventDefault(); } break;
            case 'g': if (has('grid')) { toggle(ctx, 'grid'); e.preventDefault(); } break;
            case 'p': if (has('panels')) { toggle(ctx, 'panels'); e.preventDefault(); } break;
            case 's': if (has('sky')) { toggle(ctx, 'sky'); e.preventDefault(); } break;
            case 'f': if (ctx.zoomOpen) { toggleFullscreen(ctx); e.preventDefault(); } break;
            case 'escape':
                if (ctx.zoomOpen && !document.fullscreenElement) closeZoom(ctx);
                else if (!ctx.zoomOpen) toggleSky(ctx, false);
                break;
        }
    });
}

/* ---------- Boot ---------- */

async function boot() {
    const id = document.body.dataset.photo;
    const tools = $('stage-tools');
    if (!id || !tools) return;
    let manifest;
    try {
        manifest = await loadManifest();
    } catch (err) {
        console.warn('astro.js: manifest unavailable', err);
        return;
    }
    const entry = (manifest.images || []).find(i => i.id === id);
    if (!entry) return;
    const settings = manifest.settings || {};
    const solve = entry.solve && entry.solve.status === 'solved' ? entry.solve : null;
    const wcs = solve ? makeWCS(solve, entry) : null;
    let coords = solve ? [solve.ra, solve.dec] : null;
    if (!coords && entry.skyTarget && typeof findCelestialObject === 'function') {
        const obj = findCelestialObject(entry.skyTarget);
        if (obj) coords = [obj.ra, obj.dec];
    }
    const versionIds = ['main', ...(entry.versions || []).filter(v => entry.tiles && entry.tiles[v.id]).map(v => v.id)];
    const stage = $('photo-stage');
    const ctx = {
        entry, settings, solve, wcs, coords,
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7cd1c8',
        survey: (settings.sky && settings.sky.survey) || 'P/DSS2/color',
        tilesBase: ((stage && stage.dataset.tilesBase) || (settings.tiles && settings.tiles.base) || '').replace(/\/$/, ''),
        exploreLink: entry.skyTarget ? '/explore.html?goto=' + encodeURIComponent(entry.skyTarget) : '/explore.html',
        versionIds, current: 'main', prev: null,
        show: { labels: false, grid: false, panels: false },
        zoomOpen: false, viewer: null, items: null, zoomSvg: null, stageSvg: null, aladin: null,
    };

    tools.addEventListener('click', (e) => {
        const vb = e.target.closest('[data-version]');
        if (vb) { selectVersion(ctx, vb.dataset.version); return; }
        const b = e.target.closest('[data-tool]');
        if (b) toggle(ctx, b.dataset.tool);
    });
    const close = $('sky-close');
    if (close) close.addEventListener('click', () => toggleSky(ctx, false));
    ensureBlend(ctx);
    if (ctx.blendWrap) ctx.blendWrap.hidden = true;
    bindKeys(ctx);

    // Deep links: /photo/<id>/#zoom=x,y,w,h&v=hoo&labels=1&grid=1&sky=1
    const applyHash = () => {
        const h = readHash(ctx);
        if (!h) return;
        if (h.v && ctx.versionIds.includes(h.v)) selectVersion(ctx, h.v, true);
        else if (!h.v && ctx.current !== 'main') selectVersion(ctx, 'main', true);
        ctx.show.labels = h.labels && !!(solve && solve.annotations && solve.annotations.length);
        ctx.show.grid = h.grid && !!wcs;
        ctx.show.panels = h.panels && !!(entry.mosaic && entry.mosaic.panel_map);
        if (ctx.show.labels || ctx.show.grid || ctx.show.panels || ctx.stageSvg || ctx.zoomSvg) updateOverlays(ctx);
        if (h.zoom && entry.tiles && entry.tiles.main) openZoom(ctx, h.rect);
        else if (!h.zoom && ctx.zoomOpen) closeZoom(ctx);
        if (coords) toggleSky(ctx, !!h.sky);
    };
    applyHash();
    // A pasted link with another crop or toggles while already on the page
    window.addEventListener('hashchange', applyHash);
    window.cosmosAstro = ctx;   // handy in the console
}

boot();
