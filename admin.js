/* ============================================================
   Cosmos Person — gallery admin
   Curates gallery.json (schema v3) and publishes changes as a single
   commit through the GitHub API. Requires a fine-grained personal
   access token with Contents read/write on this repository.
   Web derivatives and photo pages are built by the GitHub Action
   (.github/workflows/build.yml) after each publish.
   ============================================================ */

(function () {
    'use strict';

    const OWNER = CONFIG.GITHUB_USERNAME;
    const REPO = CONFIG.GITHUB_REPO;
    const API = 'https://api.github.com';
    const TOKEN_KEY = 'cosmos-admin-token';

    const THUMB_EDGE = 360;            // admin-only preview of a staged upload

    const CATEGORY_OPTIONS = [
        ['nebulae', 'Nebulae'],
        ['galaxies', 'Galaxies'],
        ['star-clusters', 'Star Clusters'],
        ['solar-system', 'Solar System'],
        ['wide-field', 'Wide Field']
    ];

    const TYPE_SUGGESTIONS = [
        'Emission Nebula', 'Reflection Nebula', 'Dark Nebula', 'Planetary Nebula',
        'Supernova Remnant', 'Wolf-Rayet Nebula', 'Spiral Galaxy', 'Elliptical Galaxy',
        'Irregular Galaxy', 'Globular Cluster', 'Open Cluster', 'Comet', 'Star Field'
    ];

    const ACQ_FIELDS = [
        ['optics', 'Optics', 'e.g. William Optics RedCat 51'],
        ['camera', 'Camera', 'e.g. ZWO ASI2600MM Pro'],
        ['mount', 'Mount', 'e.g. Sky-Watcher EQ6-R Pro'],
        ['filters', 'Filters', 'e.g. Antlia 3 nm SHO'],
        ['guiding', 'Guiding', 'e.g. ASI120MM Mini · PHD2'],
        ['software', 'Software', 'e.g. PixInsight, NINA'],
        ['location', 'Location', 'e.g. Keystone, Colorado'],
        ['bortle', 'Bortle class', 'e.g. 3'],
        ['integration', 'Integration (if subs are not listed)', 'e.g. 12h 40m'],
        ['notes', 'Notes', 'anything else worth saying']
    ];

    const PALETTES = ['SHO', 'HOO', 'HaRGB', 'LRGB', 'RGB', 'OSC', 'Hα', 'Starless'];

    const EMPTY_ACQUISITION = {
        optics: '', camera: '', mount: '', filters: '', guiding: '', software: '',
        location: '', bortle: '', integration: '', subs: [], nights: [],
        conditions: { seeing: '', transparency: '' }, notes: ''
    };

    const state = {
        token: null,
        user: null,
        branch: 'main',
        baseline: null,      // manifest as it exists in the repo
        manifest: null,      // working copy
        manifestSha: null,
        repoTree: new Map(), // path -> { sha, size }
        staged: new Map(),   // path -> { blob, label }
        deletions: new Set() // paths to delete on publish
    };

    const $ = (id) => document.getElementById(id);
    const clone = (o) => JSON.parse(JSON.stringify(o));

    /* =========================================================
       Auth
       ========================================================= */

    document.addEventListener('DOMContentLoaded', () => {
        $('help-repo').textContent = `${OWNER}/${REPO}`;
        $('auth-form').addEventListener('submit', onSignIn);
        $('signout-btn').addEventListener('click', signOut);
        $('upload-input').addEventListener('change', onUploadFiles);
        $('publish-btn').addEventListener('click', publish);
        $('discard-btn').addEventListener('click', discardChanges);
        $('publish-done-btn').addEventListener('click', () => { $('publish-overlay').hidden = true; });

        window.addEventListener('beforeunload', (e) => {
            if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
        });

        const saved = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
        if (saved) start(saved, false);
    });

    async function onSignIn(e) {
        e.preventDefault();
        const token = $('token-input').value.trim();
        if (!token) return;
        $('auth-submit').disabled = true;
        $('auth-error').hidden = true;
        await start(token, $('remember-check').checked);
        $('auth-submit').disabled = false;
    }

    async function start(token, remember) {
        state.token = token;
        try {
            const [user, repo] = await Promise.all([gh('/user'), gh(`/repos/${OWNER}/${REPO}`)]);
            if (!repo.permissions || !repo.permissions.push) {
                throw new Error(`This token can read ${OWNER}/${REPO} but cannot write to it. ` +
                    'Give it "Contents: Read and write" permission.');
            }
            state.user = user.login;
            state.branch = repo.default_branch || 'main';

            if (remember) localStorage.setItem(TOKEN_KEY, token);
            else sessionStorage.setItem(TOKEN_KEY, token);

            await loadData();
            $('auth-view').hidden = true;
            $('workspace').hidden = false;
            $('admin-user').textContent = state.user;
        } catch (err) {
            state.token = null;
            const el = $('auth-error');
            el.textContent = friendlyAuthError(err);
            el.hidden = false;
        }
    }

    function friendlyAuthError(err) {
        if (err.status === 401) return 'GitHub rejected that token. Check that it was copied completely and has not expired.';
        if (err.status === 404) return `The token works, but it cannot see ${OWNER}/${REPO}. ` +
            'Make sure the token’s repository access includes it.';
        return err.message || 'Could not sign in.';
    }

    function signOut() {
        if (isDirty() && !confirm('You have unpublished changes. Sign out anyway?')) return;
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        location.reload();
    }

    /* =========================================================
       GitHub API helpers
       ========================================================= */

    async function gh(path, options = {}) {
        const res = await fetch(API + path, {
            ...options,
            headers: {
                'Authorization': `Bearer ${state.token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers
            }
        });
        if (!res.ok) {
            let detail = '';
            try { detail = (await res.json()).message || ''; } catch (_) { /* ignore */ }
            const err = new Error(`GitHub API ${res.status}${detail ? ': ' + detail : ''}`);
            err.status = res.status;
            throw err;
        }
        return res.status === 204 ? null : res.json();
    }

    function rawUrl(path) {
        return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${state.branch}/` +
            path.split('/').map(encodeURIComponent).join('/');
    }

    async function loadData() {
        const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees/${encodeURIComponent(state.branch)}?recursive=1`);
        state.repoTree = new Map();
        (tree.tree || []).forEach(item => {
            if (item.type === 'blob') state.repoTree.set(item.path, { sha: item.sha, size: item.size });
        });

        const file = await gh(`/repos/${OWNER}/${REPO}/contents/gallery.json?ref=${encodeURIComponent(state.branch)}`);
        state.manifestSha = file.sha;
        const json = JSON.parse(new TextDecoder().decode(base64ToBytes(file.content)));
        if (![2, 3].includes(json.version)) {
            throw new Error('gallery.json in the repository is not schema v2 or v3. Run tools/build.py and push first.');
        }
        normalizeManifest(json);
        state.baseline = json;
        state.manifest = clone(json);
        state.staged.clear();
        state.deletions.clear();
        renderAll();
    }

    /* ---------- Schema helpers ---------- */

    function normalizeManifest(m) {
        m.settings = m.settings || {};
        if (typeof m.settings.hero === 'string' || !m.settings.hero) {
            m.settings.hero = { id: m.settings.hero || '', focal: [0.5, 0.5] };
        }
        m.collections = m.collections || [];
        (m.images || []).forEach(normalizeEntry);
        m.version = 3;
    }

    function normalizeEntry(e) {
        if (!e.acquisition) {
            const cap = e.capture || {};
            e.acquisition = Object.assign(clone(EMPTY_ACQUISITION), {
                optics: cap.telescope || '', camera: cap.camera || '', mount: cap.mount || '',
                filters: cap.filters || '', integration: cap.integration || '', location: cap.location || ''
            });
            if (cap.date && !e.date) e.date = cap.date;
        } else {
            e.acquisition = Object.assign(clone(EMPTY_ACQUISITION), e.acquisition);
        }
        delete e.capture;
        e.sources = e.sources || { avif: [], jpg: (e.srcset || []).map(s => ({ src: s.src, w: s.w })) };
        e.srcset = e.srcset || [];
        ['subtitle', 'story', 'alt', 'palette', 'date', 'licence'].forEach(k => { if (e[k] === undefined) e[k] = ''; });
        ['tags', 'collections', 'badges'].forEach(k => { if (!Array.isArray(e[k])) e[k] = []; });
        if (e.featured === undefined) e.featured = false;
        if (!e.layout) e.layout = { span: 1, focal: [0.5, 0.5] };
        if (e.visible === undefined) e.visible = true;
        e.integration_seconds = integrationSeconds(e.acquisition);
        return e;
    }

    function integrationSeconds(acq) {
        return (acq.subs || []).reduce((t, s) => t + (Number(s.count) || 0) * (Number(s.seconds) || 0), 0);
    }

    function formatDuration(sec) {
        if (!sec) return '';
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
        return h && m ? `${h}h ${String(m).padStart(2, '0')}m` : (h ? `${h}h` : `${m}m`);
    }

    function heroId() {
        const h = state.manifest.settings.hero;
        return typeof h === 'string' ? h : (h && h.id) || '';
    }

    function setHero(id) {
        const h = state.manifest.settings.hero;
        state.manifest.settings.hero = { id, focal: (h && h.focal) || [0.5, 0.5] };
    }

    function isBuilt(entry) {
        return !!(entry.sources && entry.sources.jpg && entry.sources.jpg.length);
    }

    /* =========================================================
       Rendering
       ========================================================= */

    function renderAll() {
        renderList();
        renderUnpublished();
        updateToolbar();
    }

    function updateToolbar() {
        const imgs = state.manifest.images;
        const visible = imgs.filter(i => i.visible !== false).length;
        $('toolbar-stats').textContent =
            `${imgs.length} photos · ${visible} visible on site` +
            (state.staged.size ? ` · ${state.staged.size} files staged` : '');
        const dirty = isDirty();
        $('publish-btn').disabled = !dirty;
        $('publish-btn').classList.toggle('attention', dirty);
        $('discard-btn').disabled = !dirty;
    }

    function isDirty() {
        return state.staged.size > 0 || state.deletions.size > 0 ||
            JSON.stringify(state.manifest) !== JSON.stringify(state.baseline);
    }

    function markDirty() { updateToolbar(); }

    function thumbSrc(entry) {
        const staged = state.staged.get(entry.original);
        if (staged && staged.thumbUrl) return staged.thumbUrl;
        const first = entry.sources && entry.sources.jpg && entry.sources.jpg[0];
        if (first && state.repoTree.has(first.src)) return rawUrl(first.src);
        if (first) return first.src;          // freshly built locally but not yet in repo
        return entry.placeholder || '';
    }

    function renderList() {
        const host = $('admin-list');
        host.innerHTML = '';
        state.manifest.images.forEach((entry, idx) => host.appendChild(buildRow(entry, idx)));
    }

    function buildRow(entry, idx) {
        const row = document.createElement('article');
        row.className = 'row';
        row.dataset.id = entry.id;
        if (entry.visible === false) row.classList.add('is-hidden');

        const isNew = state.staged.has(entry.original);
        const isHero = heroId() === entry.id;
        const built = isBuilt(entry);

        const main = document.createElement('div');
        main.className = 'row-main';
        main.innerHTML = `
            <span class="drag-handle" title="Drag to reorder">
                <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>
            </span>
            <div class="row-thumb"><img alt=""></div>
            <div class="row-text">
                <div class="row-title"></div>
                <div class="row-sub"></div>
            </div>
            <div class="row-flags"></div>
        `;
        main.querySelector('.row-thumb img').src = thumbSrc(entry);
        main.querySelector('.row-title').textContent = entry.title;
        main.querySelector('.row-sub').textContent =
            [entry.catalog, entry.type, entry.palette, formatDuration(entry.integration_seconds) || entry.acquisition.integration,
                `${entry.width}×${entry.height}`].filter(Boolean).join(' · ');

        const flags = main.querySelector('.row-flags');
        if (isNew) flags.appendChild(chip('new', 'New'));
        else if (!built) flags.appendChild(chip('new', 'Building'));
        if (entry.featured) flags.appendChild(chip('hero', 'Featured'));
        if (isHero) flags.appendChild(chip('hero', 'Hero'));
        flags.appendChild(flagBtn(
            entry.visible !== false ? eyeIcon() : eyeOffIcon(),
            entry.visible !== false ? 'Shown on site — click to hide' : 'Hidden — click to show',
            entry.visible !== false,
            (e) => { e.stopPropagation(); toggleVisible(entry.id); }
        ));

        main.addEventListener('click', (e) => {
            if (e.target.closest('.flag-btn') || e.target.closest('.drag-handle')) return;
            row.classList.toggle('open');
            if (row.classList.contains('open') && !row.querySelector('.row-editor')) {
                row.appendChild(buildEditor(entry));
            }
        });

        row.appendChild(main);
        setupDrag(row, main);
        return row;
    }

    function chip(kind, text) {
        const el = document.createElement('span');
        el.className = `row-chip ${kind}`;
        el.textContent = text;
        return el;
    }

    function flagBtn(svg, title, on, onClick) {
        const b = document.createElement('button');
        b.className = 'flag-btn' + (on ? ' on' : '');
        b.title = title;
        b.innerHTML = svg;
        b.addEventListener('click', onClick);
        return b;
    }

    const eyeIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeOffIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A16.7 16.7 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/></svg>';

    /* ---------- Editor ---------- */

    function buildEditor(entry) {
        const ed = document.createElement('div');
        ed.className = 'row-editor';

        const grid = document.createElement('div');
        grid.className = 'editor-grid';
        grid.append(
            textField(entry, 'title', 'Title'),
            textField(entry, 'subtitle', 'Subtitle', 'one line under the title, e.g. A stellar nursery in Cepheus'),
            textField(entry, 'catalog', 'Catalog designation'),
            typeField(entry),
            categoryField(entry),
            textField(entry, 'constellation', 'Constellation'),
            textField(entry, 'distance', 'Distance', 'e.g. ≈ 2,600 light-years'),
            textField(entry, 'skyTarget', 'Sky map target', 'e.g. NGC 7000 — powers “View on Sky Map”'),
            paletteField(entry),
            textField(entry, 'date', 'Capture date', 'YYYY-MM or YYYY-MM-DD (sorts newest first)'),
            checkField(entry, 'featured', 'Featured — spans a full row in the grid')
        );

        const desc = document.createElement('div');
        desc.className = 'editor-full';
        desc.append(
            textAreaField(entry, 'description', 'Description (one or two sentences, shown everywhere)'),
            textAreaField(entry, 'story', 'Story (photo page only; blank lines separate paragraphs, *italics* and [links](https://…) work)')
        );

        const capCaption = document.createElement('div');
        capCaption.className = 'editor-caption';
        capCaption.textContent = 'Acquisition (the technical card on the photo page and in the viewer)';

        const capGrid = document.createElement('div');
        capGrid.className = 'editor-grid';
        ACQ_FIELDS.forEach(([key, label, hint]) => capGrid.appendChild(acqField(entry, key, label, hint)));

        const subs = document.createElement('div');
        subs.className = 'editor-full';
        subs.appendChild(subsField(entry));

        const actions = document.createElement('div');
        actions.className = 'editor-actions';

        const heroBtn = document.createElement('button');
        heroBtn.type = 'button';
        heroBtn.className = 'btn';
        heroBtn.textContent = heroId() === entry.id ? 'Current hero image' : 'Set as hero image';
        heroBtn.disabled = heroId() === entry.id;
        heroBtn.addEventListener('click', () => {
            setHero(entry.id);
            markDirty();
            renderList();
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'danger';
        remove.textContent = 'Remove from gallery';
        remove.addEventListener('click', () => removeEntry(entry.id));

        const meta = document.createElement('span');
        meta.className = 'editor-meta mono';
        meta.textContent = entry.original;

        const left = document.createElement('div');
        left.append(heroBtn);
        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.alignItems = 'center';
        right.style.gap = '18px';
        right.append(meta, remove);
        actions.append(left, right);

        ed.append(grid, desc, capCaption, capGrid, subs, actions);
        return ed;
    }

    function fieldWrap(labelText, input) {
        const label = document.createElement('label');
        label.className = 'field';
        const span = document.createElement('span');
        span.className = 'field-label';
        span.textContent = labelText;
        label.append(span, input);
        return label;
    }

    function textField(entry, key, label, placeholder) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = entry[key] || '';
        if (placeholder) input.placeholder = placeholder;
        input.addEventListener('input', () => {
            entry[key] = input.value;
            if (key === 'title') {
                const row = input.closest('.row');
                if (row) row.querySelector('.row-title').textContent = input.value;
            }
            markDirty();
        });
        return fieldWrap(label, input);
    }

    function textAreaField(entry, key, label) {
        const input = document.createElement('textarea');
        input.value = entry[key] || '';
        input.addEventListener('input', () => { entry[key] = input.value; markDirty(); });
        return fieldWrap(label, input);
    }

    function acqField(entry, key, label, hint) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = entry.acquisition[key] || '';
        if (hint) input.placeholder = hint;
        input.addEventListener('input', () => { entry.acquisition[key] = input.value; markDirty(); });
        return fieldWrap(label, input);
    }

    function checkField(entry, key, label) {
        const wrap = document.createElement('label');
        wrap.className = 'check field-check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!entry[key];
        input.addEventListener('change', () => { entry[key] = input.checked; markDirty(); renderList(); });
        const span = document.createElement('span');
        span.textContent = label;
        wrap.append(input, span);
        return wrap;
    }

    function paletteField(entry) {
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('list', 'palette-suggestions');
        input.value = entry.palette || '';
        input.placeholder = 'e.g. SHO, HOO, LRGB';
        if (!document.getElementById('palette-suggestions')) {
            const dl = document.createElement('datalist');
            dl.id = 'palette-suggestions';
            PALETTES.forEach(t => { const o = document.createElement('option'); o.value = t; dl.appendChild(o); });
            document.body.appendChild(dl);
        }
        input.addEventListener('input', () => { entry.palette = input.value.trim(); markDirty(); });
        return fieldWrap('Palette', input);
    }

    /* Subframes as text, one per line: "Hα 48 × 300" — parsed into acquisition.subs */
    function subsField(entry) {
        const input = document.createElement('textarea');
        input.rows = 4;
        input.placeholder = 'One filter per line, e.g.\nHα 48 × 300\nOIII 47 × 300\nSII 48 × 300';
        input.value = (entry.acquisition.subs || []).map(s => `${s.filter} ${s.count} × ${s.seconds}`).join('\n');
        const summary = document.createElement('span');
        summary.className = 'field-label';
        const update = () => {
            const subs = [];
            input.value.split(/\n/).forEach(line => {
                const m = /^\s*(.+?)\s+(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:s|sec|″)?\s*$/i.exec(line);
                if (m) subs.push({ filter: m[1].trim(), count: Number(m[2]), seconds: Number(m[3]) });
            });
            entry.acquisition.subs = subs;
            entry.integration_seconds = integrationSeconds(entry.acquisition);
            summary.textContent = subs.length ? `Total integration ${formatDuration(entry.integration_seconds)}` : 'Total integration —';
        };
        update();
        input.addEventListener('input', () => { update(); markDirty(); });
        const wrap = fieldWrap('Subframes (filter, count × seconds)', input);
        wrap.appendChild(summary);
        return wrap;
    }

    function typeField(entry) {
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('list', 'type-suggestions');
        input.value = entry.type || '';
        if (!document.getElementById('type-suggestions')) {
            const dl = document.createElement('datalist');
            dl.id = 'type-suggestions';
            TYPE_SUGGESTIONS.forEach(t => {
                const o = document.createElement('option');
                o.value = t;
                dl.appendChild(o);
            });
            document.body.appendChild(dl);
        }
        input.addEventListener('input', () => { entry.type = input.value; markDirty(); });
        return fieldWrap('Object type', input);
    }

    function categoryField(entry) {
        const select = document.createElement('select');
        CATEGORY_OPTIONS.forEach(([val, label]) => {
            const o = document.createElement('option');
            o.value = val;
            o.textContent = label;
            select.appendChild(o);
        });
        select.value = entry.category || 'nebulae';
        select.addEventListener('change', () => { entry.category = select.value; markDirty(); });
        return fieldWrap('Category (filter group)', select);
    }

    /* ---------- Mutations ---------- */

    function toggleVisible(id) {
        const entry = state.manifest.images.find(i => i.id === id);
        if (!entry) return;
        entry.visible = entry.visible === false;
        markDirty();
        renderList();
    }

    function removeEntry(id) {
        const entry = state.manifest.images.find(i => i.id === id);
        if (!entry) return;

        const isNew = state.staged.has(entry.original);
        const files = () => [entry.original,
            ...((entry.sources && entry.sources.jpg) || []).map(s => s.src),
            ...((entry.sources && entry.sources.avif) || []).map(s => s.src)];
        if (isNew) {
            // Staged upload — just unstage it.
            const item = state.staged.get(entry.original);
            if (item && item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
            state.staged.delete(entry.original);
        } else {
            if (!confirm(`Remove “${entry.title}” from the gallery?\n\nThe image files stay in the repository; you can add it back later from the “In the repository” list.`)) {
                return;
            }
            const alsoDelete = confirm('Also delete its files from the repository on publish?\n\nOK = delete files permanently (recoverable only via git history)\nCancel = keep the files');
            if (alsoDelete) {
                files().filter(p => state.repoTree.has(p)).forEach(p => state.deletions.add(p));
            }
        }

        state.manifest.images = state.manifest.images.filter(i => i.id !== id);
        if (heroId() === id) {
            const firstVisible = state.manifest.images.find(i => i.visible !== false);
            setHero(firstVisible ? firstVisible.id : '');
        }
        markDirty();
        renderAll();
    }

    function discardChanges() {
        if (!confirm('Discard all unpublished changes?')) return;
        state.staged.forEach(item => { if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl); });
        state.staged.clear();
        state.deletions.clear();
        state.manifest = clone(state.baseline);
        renderAll();
    }

    /* ---------- Drag reorder ---------- */

    let dragId = null;

    function setupDrag(row, main) {
        row.draggable = false;
        const handle = main.querySelector('.drag-handle');
        handle.addEventListener('mousedown', () => { row.draggable = true; });
        document.addEventListener('mouseup', () => { row.draggable = false; }, { passive: true });

        row.addEventListener('dragstart', (e) => {
            dragId = row.dataset.id;
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            row.draggable = false;
            dragId = null;
            document.querySelectorAll('.row').forEach(r => r.classList.remove('drop-above', 'drop-below'));
        });
        row.addEventListener('dragover', (e) => {
            if (!dragId || dragId === row.dataset.id) return;
            e.preventDefault();
            const rect = row.getBoundingClientRect();
            const above = e.clientY < rect.top + rect.height / 2;
            row.classList.toggle('drop-above', above);
            row.classList.toggle('drop-below', !above);
        });
        row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!dragId || dragId === row.dataset.id) return;
            const rect = row.getBoundingClientRect();
            const above = e.clientY < rect.top + rect.height / 2;
            const imgs = state.manifest.images;
            const from = imgs.findIndex(i => i.id === dragId);
            const [moved] = imgs.splice(from, 1);
            let to = imgs.findIndex(i => i.id === row.dataset.id);
            if (!above) to += 1;
            imgs.splice(to, 0, moved);
            markDirty();
            renderList();
        });
    }

    /* =========================================================
       Uploads — the original only; the GitHub Action builds the rest
       ========================================================= */

    async function onUploadFiles(e) {
        const files = [...e.target.files];
        e.target.value = '';
        for (const file of files) {
            try {
                await stageUpload(file);
            } catch (err) {
                console.error(err);
                alert(`Could not process ${file.name}: ${err.message}`);
            }
        }
        renderAll();
    }

    async function stageUpload(file) {
        if (!/image\/(jpeg|png)/.test(file.type)) throw new Error('Only JPEG or PNG images are supported.');
        if (file.size > 60 * 1024 * 1024) throw new Error('File is larger than 60 MB.');

        const bitmap = await decodeImage(file);
        const detected = detectObject(file.name);

        const baseTitle = detected ? properName(detected.obj.name) : cleanTitle(file.name);
        const id = uniqueId(slugify(baseTitle));
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const originalPath = `gallery/${safeName}`;
        if (state.manifest.images.some(i => i.original === originalPath) || state.staged.has(originalPath)) {
            throw new Error('A photo with this file name is already in the gallery.');
        }

        const tiny = scaleBitmap(bitmap, 24);
        const placeholder = tiny.canvas.toDataURL('image/jpeg', 0.4);
        const color = averageColor(tiny.canvas);
        const thumb = scaleBitmap(bitmap, THUMB_EDGE);
        const thumbBlob = await canvasToJpeg(thumb.canvas);

        state.staged.set(originalPath, { blob: file, label: safeName, thumbUrl: URL.createObjectURL(thumbBlob) });

        const dbType = detected ? detected.obj.type : '';
        state.manifest.images.push(normalizeEntry({
            id,
            title: baseTitle,
            catalog: detected ? detected.key.replace(/^(M|NGC|IC|SH2)(\d)/, '$1 $2') : '',
            type: dbType ? titleCase(dbType) : 'Deep Sky Object',
            category: dbTypeToCategory(dbType),
            constellation: '',
            distance: '',
            description: '',
            skyTarget: detected ? detected.key : '',
            visible: true,
            original: originalPath,
            width: bitmap.width,
            height: bitmap.height,
            placeholder,
            color,
            srcset: [],
            sources: { avif: [], jpg: [] },
            downloads: []
        }));
        if (bitmap.close) bitmap.close();
    }

    async function decodeImage(source) {
        if ('createImageBitmap' in window) {
            try {
                return await createImageBitmap(source, { imageOrientation: 'from-image' });
            } catch (_) { /* fall through */ }
        }
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(source);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image.')); };
            img.src = url;
        });
    }

    function scaleBitmap(bitmap, targetLongEdge) {
        const long = Math.max(bitmap.width, bitmap.height);
        const scale = Math.min(1, targetLongEdge / long);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, width, height);
        return { canvas, width, height };
    }

    function canvasToJpeg(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => blob ? resolve(blob) : reject(new Error('JPEG encoding failed.')),
                'image/jpeg', 0.8
            );
        });
    }

    function averageColor(canvas) {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.canvas.width = 1;
        ctx.canvas.height = 1;
        ctx.drawImage(canvas, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        const hex = (n) => Math.round(n * 0.6).toString(16).padStart(2, '0');
        return `#${hex(r)}${hex(g)}${hex(b)}`;
    }

    /* ---------- Celestial matching ---------- */

    function detectObject(filename) {
        const match = findCelestialObject(filename);
        return match ? { key: match.key, obj: match } : null;
    }

    function dbTypeToCategory(dbType) {
        if (!dbType) return 'nebulae';
        if (dbType.includes('galaxy')) return 'galaxies';
        if (dbType.includes('cluster')) return 'star-clusters';
        if (dbType.includes('comet') || dbType.includes('planet') && !dbType.includes('planetary')) return 'solar-system';
        return 'nebulae';
    }

    function properName(name) {
        return /nebula|galaxy|cluster|cloud|remnant|helmet|ghost|loop/i.test(name) && !/^messier|^ngc|^ic\b/i.test(name)
            ? `The ${name}`.replace('The The', 'The')
            : name;
    }

    function cleanTitle(filename) {
        return filename.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ')
            .replace(/\b(\d+x\s*)?(upsampled|resampled|final(ized)?|original|interpret(ed)?|mosaic|v\d+)\b/gi, '')
            .replace(/\s+/g, ' ').trim() || filename;
    }

    function titleCase(s) {
        return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1));
    }

    function slugify(s) {
        return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'photo';
    }

    function uniqueId(base) {
        const taken = new Set(state.manifest.images.map(i => i.id));
        if (!taken.has(base)) return base;
        let n = 2;
        while (taken.has(`${base}-${n}`)) n++;
        return `${base}-${n}`;
    }

    /* =========================================================
       Unpublished repo images
       ========================================================= */

    function renderUnpublished() {
        const referenced = new Set(state.manifest.images.map(i => i.original));
        const candidates = [...state.repoTree.keys()].filter(p =>
            /^gallery\/[^/]+\.(jpe?g|png)$/i.test(p) &&
            !referenced.has(p) &&
            !state.deletions.has(p)
        );

        $('unpublished-section').hidden = candidates.length === 0;
        const host = $('unpublished-list');
        host.innerHTML = '';

        candidates.forEach(path => {
            const row = document.createElement('article');
            row.className = 'row';
            const name = path.split('/').pop();
            row.innerHTML = `
                <div class="row-main" style="cursor: default">
                    <div class="row-thumb"><img alt="" loading="lazy"></div>
                    <div class="row-text">
                        <div class="row-title mono" style="font-family: var(--font-ui); font-size: 0.85rem"></div>
                        <div class="row-sub"></div>
                    </div>
                    <button class="btn row-add">Add to gallery</button>
                </div>`;
            row.querySelector('img').src = rawUrl(path);
            row.querySelector('.row-title').textContent = name;
            const size = state.repoTree.get(path).size;
            row.querySelector('.row-sub').textContent = size ? `${(size / 1e6).toFixed(1)} MB` : '';
            row.querySelector('.row-add').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = 'Preparing…';
                try {
                    const res = await fetch(rawUrl(path));
                    if (!res.ok) throw new Error(`Could not fetch the image (${res.status}).`);
                    const blob = await res.blob();
                    const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
                    await stageUpload(file);
                    // The original already lives in the repo — don't re-upload it.
                    const added = state.manifest.images[state.manifest.images.length - 1];
                    state.staged.delete(added.original);
                    added.original = path;
                    renderAll();
                } catch (err) {
                    alert(`Could not add ${name}: ${err.message}`);
                    btn.disabled = false;
                    btn.textContent = 'Add to gallery';
                }
            });
            host.appendChild(row);
        });
    }

    /* =========================================================
       Publish — one commit via the Git Data API
       ========================================================= */

    async function publish() {
        if (!isDirty()) return;

        const visibleCount = state.manifest.images.filter(i => i.visible !== false).length;
        if (visibleCount === 0 &&
            !confirm('No photos are visible — the public gallery will be empty. Publish anyway?')) {
            return;
        }

        // Keep the hero pointing at a visible photograph
        const heroEntry = state.manifest.images.find(i => i.id === heroId());
        if (!heroEntry || heroEntry.visible === false) {
            const firstVisible = state.manifest.images.find(i => i.visible !== false);
            setHero(firstVisible ? firstVisible.id : '');
        }
        state.manifest.updated = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

        const overlay = $('publish-overlay');
        const stepsEl = $('publish-steps');
        const note = $('publish-note');
        $('publish-actions').hidden = true;
        $('publish-title').textContent = 'Publishing';
        note.textContent = '';
        stepsEl.innerHTML = '';
        overlay.hidden = false;

        const uploads = [...state.staged.entries()];
        const steps = [
            ...uploads.map(([path, item]) => ({ key: path, label: `Upload ${item.label}` })),
            { key: '__manifest', label: 'Update gallery.json' },
            ...(state.deletions.size ? [{ key: '__deletions', label: `Delete ${state.deletions.size} old file(s)` }] : []),
            { key: '__commit', label: 'Create commit & update site' }
        ];
        const liByKey = {};
        steps.forEach(s => {
            const li = document.createElement('li');
            li.textContent = s.label;
            liByKey[s.key] = li;
            stepsEl.appendChild(li);
        });
        const mark = (key, cls) => { liByKey[key].className = cls; };

        try {
            // Head commit + base tree
            const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/${encodeURIComponent('heads/' + state.branch)}`);
            const headSha = ref.object.sha;
            const headCommit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${headSha}`);

            const treeItems = [];

            for (const [path, item] of uploads) {
                mark(path, 'doing');
                const b64 = await blobToBase64(item.blob);
                const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
                    method: 'POST',
                    body: JSON.stringify({ content: b64, encoding: 'base64' })
                });
                treeItems.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
                mark(path, 'done');
            }

            mark('__manifest', 'doing');
            const manifestBlob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
                method: 'POST',
                body: JSON.stringify({
                    content: JSON.stringify(state.manifest, null, 2) + '\n',
                    encoding: 'utf-8'
                })
            });
            treeItems.push({ path: 'gallery.json', mode: '100644', type: 'blob', sha: manifestBlob.sha });
            mark('__manifest', 'done');

            if (state.deletions.size) {
                mark('__deletions', 'doing');
                state.deletions.forEach(path => {
                    treeItems.push({ path, mode: '100644', type: 'blob', sha: null });
                });
                mark('__deletions', 'done');
            }

            mark('__commit', 'doing');
            const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, {
                method: 'POST',
                body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: treeItems })
            });
            const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, {
                method: 'POST',
                body: JSON.stringify({
                    message: `Update gallery via admin (${state.manifest.images.length} photos)`,
                    tree: tree.sha,
                    parents: [headSha]
                })
            });
            await gh(`/repos/${OWNER}/${REPO}/git/refs/${encodeURIComponent('heads/' + state.branch)}`, {
                method: 'PATCH',
                body: JSON.stringify({ sha: commit.sha, force: false })
            });
            mark('__commit', 'done');

            // Fold staged files into our view of the repo
            for (const [path] of uploads) state.repoTree.set(path, { sha: 'new', size: 0 });
            state.deletions.forEach(path => state.repoTree.delete(path));
            state.staged.forEach(item => { if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl); });
            state.staged.clear();
            state.deletions.clear();
            state.baseline = clone(state.manifest);

            $('publish-title').textContent = 'Published';
            note.textContent = 'Changes are committed. The build runs on GitHub for a few minutes (web versions, photo pages), then GitHub Pages redeploys — allow five minutes before the live site shows everything.';
            $('publish-actions').hidden = false;
            renderAll();
        } catch (err) {
            console.error(err);
            $('publish-title').textContent = 'Publish failed';
            const current = stepsEl.querySelector('.doing');
            if (current) current.className = 'failed';
            note.textContent = `${err.message}. Nothing was changed on the live site — your edits are still here; you can try publishing again.`;
            $('publish-actions').hidden = false;
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
            reader.onerror = () => reject(new Error('Could not read file.'));
            reader.readAsDataURL(blob);
        });
    }

    function base64ToBytes(b64) {
        const bin = atob(b64.replace(/\n/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }
})();
