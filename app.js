/* ============================================================
   Cosmos Person — Explore the Universe
   Aladin sky atlas with beacons where photographs were captured.
   Beacons come from two sources, merged:
     1. gallery.json (the curated collection, with titles/descriptions)
     2. the images/ folder of the repository (older captures)
   ============================================================ */

let aladin;
let photoCatalog;
let photoData = [];

const VIEWER_FALLBACK = new WeakSet();

$(document).ready(function () {
    initializeAladin();
    setupPanelToggle();
});

/* ---------- Aladin ---------- */

function initializeAladin() {
    aladin = A.aladin('#aladin-lite-div', {
        survey: 'P/DSS2/color',
        fov: CONFIG.DEFAULT_FOV,
        target: CONFIG.DEFAULT_TARGET,
        cooFrame: 'J2000',
        showReticle: false,
        showZoomControl: true,
        showFullscreenControl: true,
        showLayersControl: true,
        showGotoControl: false,
        showShareControl: false,
        showCatalog: true,
        showFrame: false,
        showCooGrid: false
    });

    setTimeout(() => {
        loadPhotos();
        setupEventListeners();
        hideCoordinateGrid();
        handleGotoParam();
    }, 1800);

    aladin.on('positionChanged', updateVisibleCount);
    aladin.on('zoomChanged', updateVisibleCount);
}

function hideCoordinateGrid() {
    setTimeout(() => {
        document.querySelectorAll('.aladin-cooGrid').forEach(el => { el.style.display = 'none'; });
        if (aladin.view && aladin.view.cooGrid) aladin.view.cooGrid.hide();
    }, 800);
}

/* Deep links from the gallery: explore.html?goto=NGC 7000 */
function handleGotoParam() {
    const target = new URLSearchParams(location.search).get('goto');
    if (!target) return;
    const obj = findCelestialObject(target);
    if (obj) {
        flyTo(obj.ra, obj.dec, 4);
    } else {
        aladin.gotoObject(target);
    }
}

/*
 * Smoothly fly the view to a target, then verify arrival.
 * animateToRaDec animates on requestAnimationFrame, which stalls in
 * background tabs and never changes the field of view — so after the
 * animation window we snap to the exact target and FoV if needed.
 */
function flyTo(ra, dec, fov, after) {
    try { aladin.animateToRaDec(ra, dec, 1.5); }
    catch (e) { aladin.gotoRaDec(ra, dec); }
    if (fov) {
        try { aladin.zoomToFoV(fov, 1.5); } catch (e) { /* snapped below */ }
    }
    setTimeout(() => {
        const now = aladin.getRaDec();
        const arrived = Math.abs(now[0] - ra) < 0.5 && Math.abs(now[1] - dec) < 0.5;
        if (!arrived) aladin.gotoRaDec(ra, dec);
        if (fov && Math.abs(aladin.getFov()[0] - fov) > 0.5) aladin.setFov(fov);
        if (after) after();
    }, 1650);
}

/* ---------- Photo loading ---------- */

async function loadPhotos() {
    if (loadPhotos._ran) return;
    loadPhotos._ran = true;
    updateLoadingState(true);

    const byKey = new Map();

    // 1. The curated collection — carries real titles and descriptions
    try {
        const res = await fetch('gallery.json', { cache: 'no-cache' });
        const manifest = await res.json();
        (manifest.images || [])
            .filter(img => img.visible !== false && img.skyTarget)
            .forEach(img => {
                const obj = findCelestialObject(img.skyTarget);
                if (!obj) return;
                byKey.set(obj.key, {
                    id: obj.key,
                    name: img.title,
                    ra: obj.ra,
                    dec: obj.dec,
                    type: img.type || obj.type || '',
                    meta: [img.catalog, img.constellation, img.distance].filter(Boolean),
                    description: img.description || '',
                    viewerUrl: viewerSizeFrom(img),
                    fullUrl: img.original,
                    galleryId: img.id
                });
            });
    } catch (err) {
        console.warn('Could not load gallery.json for beacons:', err);
    }

    // 2. Every recognised capture in the repository's images/ folder
    try {
        const files = await fetchRepoImages();
        files.forEach(file => {
            const obj = findCelestialObject(file.name);
            if (!obj) {
                console.warn(`No celestial match for: ${file.name}`);
                return;
            }
            if (byKey.has(obj.key)) return; // curated version wins
            // Same object under a different designation (e.g. THOR vs NGC 2359)
            const near = [...byKey.values()].some(p => angularDistance(p.ra, p.dec, obj.ra, obj.dec) < 0.25);
            if (near) return;
            const stem = file.name.replace(/\.[^.]+$/, '');
            byKey.set(obj.key, {
                id: obj.key,
                name: obj.name,
                ra: obj.ra,
                dec: obj.dec,
                type: obj.type || '',
                meta: [],
                description: '',
                viewerUrl: encodeURI(`images/_web/${stem}-1600.jpg`),
                fullUrl: file.download_url,
                galleryId: null
            });
        });
    } catch (err) {
        console.warn('Could not list repository images:', err);
    }

    photoData = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
    displayPhotosOnMap();
    updateUI();
    updateLoadingState(false);
}

async function fetchRepoImages() {
    const cached = getCachedData();
    if (cached) return cached;

    const apiUrl = `${CONFIG.GITHUB_API_BASE}/repos/${CONFIG.GITHUB_USERNAME}/${CONFIG.GITHUB_REPO}/contents/${CONFIG.IMAGES_PATH}`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);

    const files = (await response.json()).filter(file =>
        file.type === 'file' &&
        CONFIG.SUPPORTED_FORMATS.some(ext => file.name.toLowerCase().endsWith(`.${ext}`))
    ).map(f => ({ name: f.name, download_url: f.download_url }));

    setCachedData(files);
    return files;
}

function viewerSizeFrom(entry) {
    if (!entry.srcset || !entry.srcset.length) return entry.original;
    // Prefer the middle (~1600px) derivative for fast viewing
    const mid = entry.srcset.find(s => /-1600\.jpg$/.test(s.src));
    return encodeURI((mid || entry.srcset[entry.srcset.length - 1]).src);
}

/* ---------- Map beacons ---------- */

function displayPhotosOnMap() {
    if (photoCatalog) aladin.removeCatalog(photoCatalog);

    photoCatalog = A.catalog({
        name: 'Photographed by Cosmos Person',
        sourceSize: 20,
        shape: 'circle',
        color: '#7cd1c8',
        labelColumn: 'name',
        displayLabel: true,
        labelColor: '#a9e8e2',
        labelFont: '11px Inter, sans-serif',
        labelOffset: [0, -18]
    });

    photoData.forEach(photo => {
        photoCatalog.addSources([A.source(photo.ra, photo.dec, {
            name: photo.name,
            photoData: photo
        })]);
    });

    aladin.addCatalog(photoCatalog);

    photoCatalog.onClick = function (source) {
        if (source && source.data && source.data.photoData) {
            const photo = source.data.photoData;
            flyTo(photo.ra, photo.dec, 5, () => openPhotoViewer(photo));
        }
    };
}

/* ---------- UI ---------- */

function updateUI() {
    document.getElementById('capture-count').textContent = photoData.length;

    const listContainer = document.getElementById('photo-list');
    listContainer.innerHTML = '';

    photoData.forEach(photo => {
        const item = document.createElement('div');
        item.className = 'photo-list-item';
        const name = document.createElement('span');
        name.textContent = photo.name;
        const type = document.createElement('span');
        type.className = 'photo-type';
        type.textContent = shortType(photo.type);
        item.append(name, type);
        item.onclick = () => flyTo(photo.ra, photo.dec, 5, () => openPhotoViewer(photo));
        listContainer.appendChild(item);
    });

    updateVisibleCount();
}

function shortType(type) {
    if (!type) return '';
    const t = type.toLowerCase();
    if (t.includes('galaxy')) return 'Galaxy';
    if (t.includes('cluster')) return 'Cluster';
    if (t.includes('remnant')) return 'Remnant';
    if (t.includes('comet')) return 'Comet';
    if (t.includes('nebula')) return 'Nebula';
    return type;
}

function updateVisibleCount() {
    if (!photoData.length) return;
    const view = aladin.getRaDec();
    const fov = aladin.getFov()[0];
    const visible = photoData.filter(p =>
        angularDistance(view[0], view[1], p.ra, p.dec) < fov / 2
    ).length;
    document.getElementById('visible-count').textContent = visible;
}

function angularDistance(ra1, dec1, ra2, dec2) {
    const toRad = Math.PI / 180;
    const dRA = (ra2 - ra1) * toRad;
    const dDec = (dec2 - dec1) * toRad;
    const a = Math.sin(dDec / 2) ** 2 +
        Math.cos(dec1 * toRad) * Math.cos(dec2 * toRad) * Math.sin(dRA / 2) ** 2;
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 180 / Math.PI;
}

/* ---------- Search / navigation ---------- */

function searchObject() {
    const query = document.getElementById('object-search').value.trim();
    if (!query) return;

    const match = findCelestialObject(query);
    const ourPhoto = photoData.find(p =>
        (match && p.id === match.key) ||
        p.name.toLowerCase().includes(query.toLowerCase())
    );

    if (ourPhoto) {
        flyTo(ourPhoto.ra, ourPhoto.dec, 5, () => openPhotoViewer(ourPhoto));
    } else if (match) {
        flyTo(match.ra, match.dec, 3);
    } else {
        aladin.gotoObject(query);
    }
}

function goToRandomPhoto() {
    if (!photoData.length) return;
    const photo = photoData[Math.floor(Math.random() * photoData.length)];
    flyTo(photo.ra, photo.dec, 5, () => openPhotoViewer(photo));
}

function showAllPhotos() {
    if (!photoData.length) return;

    let minRa = Infinity, maxRa = -Infinity, minDec = Infinity, maxDec = -Infinity;
    photoData.forEach(p => {
        minRa = Math.min(minRa, p.ra);
        maxRa = Math.max(maxRa, p.ra);
        minDec = Math.min(minDec, p.dec);
        maxDec = Math.max(maxDec, p.dec);
    });

    if (maxRa - minRa > 180) {
        let nMin = Infinity, nMax = -Infinity;
        photoData.forEach(p => {
            const ra = p.ra > 180 ? p.ra - 360 : p.ra;
            nMin = Math.min(nMin, ra);
            nMax = Math.max(nMax, ra);
        });
        minRa = nMin;
        maxRa = nMax;
    }

    const centerRa = (minRa + maxRa) / 2;
    const centerDec = (minDec + maxDec) / 2;
    const fov = Math.max(maxRa - minRa, maxDec - minDec) * 1.5;
    flyTo(centerRa < 0 ? centerRa + 360 : centerRa, centerDec, Math.min(fov, 180));
}

/* ---------- Photo viewer ---------- */

function openPhotoViewer(photo) {
    if (!photo) return;

    document.body.classList.add('photo-viewer-active');

    const img = document.getElementById('viewer-image');
    img.onerror = () => {
        // Derivative not deployed (or missing) — fall back to the original file
        if (!VIEWER_FALLBACK.has(photo) && photo.fullUrl && img.src !== photo.fullUrl) {
            VIEWER_FALLBACK.add(photo);
            img.src = photo.fullUrl;
        }
    };
    img.src = VIEWER_FALLBACK.has(photo) ? photo.fullUrl : photo.viewerUrl;
    img.alt = photo.name;

    document.getElementById('viewer-title').textContent = photo.name;

    const metaBits = photo.meta && photo.meta.length
        ? photo.meta
        : [photo.type, formatRA(photo.ra), formatDec(photo.dec)].filter(Boolean);
    const metaEl = document.getElementById('viewer-meta');
    metaEl.innerHTML = '';
    metaBits.forEach(text => {
        const span = document.createElement('span');
        span.textContent = text;
        metaEl.appendChild(span);
    });

    const desc = document.getElementById('viewer-description');
    desc.textContent = photo.description || '';
    desc.style.display = photo.description ? '' : 'none';

    const actions = document.getElementById('viewer-actions');
    actions.innerHTML = '';
    if (photo.galleryId) {
        const a = document.createElement('a');
        a.className = 'viewer-action';
        a.href = `index.html#photo=${encodeURIComponent(photo.galleryId)}`;
        a.textContent = 'Open in Photos';
        actions.appendChild(a);
    }
    if (photo.fullUrl) {
        const a = document.createElement('a');
        a.className = 'viewer-action';
        a.href = photo.fullUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Full Resolution';
        actions.appendChild(a);
    }

    setTimeout(() => {
        document.getElementById('photo-viewer').classList.add('active');
    }, 40);
}

function closePhotoViewer() {
    document.getElementById('photo-viewer').classList.remove('active');
    document.body.classList.remove('photo-viewer-active');
}

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

/* ---------- Misc ---------- */

function changeSurvey() {
    aladin.setImageSurvey(document.getElementById('survey-select').value);
}

function setupPanelToggle() {
    const toggle = document.getElementById('panel-toggle');
    const panel = document.getElementById('control-panel');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
        const open = panel.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open);
        toggle.textContent = open ? 'Close' : 'My Photos';
    });
}

function setupEventListeners() {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePhotoViewer();
        else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey &&
            document.activeElement.tagName !== 'INPUT') {
            goToRandomPhoto();
        }
    });

    document.getElementById('object-search').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') searchObject();
    });
}

function updateLoadingState(loading) {
    const el = document.getElementById('loading-message');
    if (el) el.style.display = loading ? 'block' : 'none';
}

/* ---------- Cache ---------- */

const CACHE_KEY = 'cosmosRepoImages-v2';

function getCachedData() {
    try {
        const data = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (data && Date.now() - data.timestamp < CONFIG.CACHE_DURATION) return data.files;
    } catch (e) { /* ignore */ }
    return null;
}

function setCachedData(files) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ files, timestamp: Date.now() }));
    } catch (e) { /* ignore */ }
}

/* Globals used by inline handlers */
window.searchObject = searchObject;
window.goToRandomPhoto = goToRandomPhoto;
window.showAllPhotos = showAllPhotos;
window.closePhotoViewer = closePhotoViewer;
window.changeSurvey = changeSurvey;
