/* ============================================================
   Cosmos Person — gallery admin
   Curates gallery.json and publishes changes as a single commit
   through the GitHub API. Requires a fine-grained personal access
   token with Contents read/write on this repository.
   ============================================================ */

(function () {
    'use strict';

    const OWNER = CONFIG.GITHUB_USERNAME;
    const REPO = CONFIG.GITHUB_REPO;
    const API = 'https://api.github.com';
    const TOKEN_KEY = 'cosmos-admin-token';

    const DERIVATIVE_SIZES = [800, 1600, 2600];
    const JPEG_QUALITY = 0.85;

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

    const CAPTURE_FIELDS = [
        ['telescope', 'Telescope', 'e.g. William Optics RedCat 51'],
        ['camera', 'Camera', 'e.g. ZWO ASI2600MC Pro'],
        ['mount', 'Mount', 'e.g. Sky-Watcher EQ6-R Pro'],
        ['filters', 'Filters', 'e.g. Optolong L-eXtreme'],
        ['integration', 'Integration', 'e.g. Ha 16 × 600″ = 2h 40′ · total 8h'],
        ['date', 'Capture date', 'e.g. March 2026'],
        ['location', 'Location', 'e.g. Bortle 4 · backyard observatory']
    ];

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
        if (json.version !== 2) {
            throw new Error('gallery.json in the repository is not schema v2. Run tools/build_derivatives.py and push first.');
        }
        state.baseline = json;
        state.manifest = clone(json);
        state.staged.clear();
        state.deletions.clear();
        renderAll();
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
        const first = entry.srcset && entry.srcset[0];
        if (first && state.staged.has(first.src)) {
            const item = state.staged.get(first.src);
            if (!item.objectUrl) item.objectUrl = URL.createObjectURL(item.blob);
            return item.objectUrl;
        }
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

        const isNew = entry.srcset.some(s => state.staged.has(s.src));
        const isHero = state.manifest.settings.hero === entry.id;

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
            [entry.catalog, entry.type, `${entry.width}×${entry.height}`].filter(Boolean).join(' · ');

        const flags = main.querySelector('.row-flags');
        if (isNew) flags.appendChild(chip('new', 'New'));
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
            textField(entry, 'catalog', 'Catalog designation'),
            typeField(entry),
            categoryField(entry),
            textField(entry, 'constellation', 'Constellation'),
            textField(entry, 'distance', 'Distance', 'e.g. ≈ 2,600 light-years'),
            textField(entry, 'skyTarget', 'Sky map target', 'e.g. NGC 7000 — powers “View on Sky Map”')
        );

        const desc = document.createElement('div');
        desc.className = 'editor-full';
        desc.appendChild(textAreaField(entry, 'description', 'Description'));

        const capCaption = document.createElement('div');
        capCaption.className = 'editor-caption';
        capCaption.textContent = 'Capture details (shown in the photo viewer)';

        const capGrid = document.createElement('div');
        capGrid.className = 'editor-grid';
        CAPTURE_FIELDS.forEach(([key, label, hint]) => capGrid.appendChild(captureField(entry, key, label, hint)));

        const actions = document.createElement('div');
        actions.className = 'editor-actions';

        const heroBtn = document.createElement('button');
        heroBtn.type = 'button';
        heroBtn.className = 'btn';
        heroBtn.textContent = state.manifest.settings.hero === entry.id ? 'Current hero image' : 'Set as hero image';
        heroBtn.disabled = state.manifest.settings.hero === entry.id;
        heroBtn.addEventListener('click', () => {
            state.manifest.settings.hero = entry.id;
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

        ed.append(grid, desc, capCaption, capGrid, actions);
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

    function captureField(entry, key, label, hint) {
        const input = document.createElement('input');
        input.type = 'text';
        entry.capture = entry.capture || {};
        input.value = entry.capture[key] || '';
        if (hint) input.placeholder = hint;
        input.addEventListener('input', () => { entry.capture[key] = input.value; markDirty(); });
        return fieldWrap(label, input);
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

        const isNew = entry.srcset.some(s => state.staged.has(s.src));
        if (isNew) {
            // Staged upload — just unstage everything.
            [entry.original, ...entry.srcset.map(s => s.src)].forEach(p => {
                const item = state.staged.get(p);
                if (item && item.objectUrl) URL.revokeObjectURL(item.objectUrl);
                state.staged.delete(p);
            });
        } else {
            if (!confirm(`Remove “${entry.title}” from the gallery?\n\nThe image files stay in the repository; you can add it back later from the “In the repository” list.`)) {
                return;
            }
            const alsoDelete = confirm('Also delete its files from the repository on publish?\n\nOK = delete files permanently (recoverable only via git history)\nCancel = keep the files');
            if (alsoDelete) {
                [entry.original, ...entry.srcset.map(s => s.src)]
                    .filter(p => state.repoTree.has(p))
                    .forEach(p => state.deletions.add(p));
            }
        }

        state.manifest.images = state.manifest.images.filter(i => i.id !== id);
        if (state.manifest.settings.hero === id) {
            const firstVisible = state.manifest.images.find(i => i.visible !== false);
            state.manifest.settings.hero = firstVisible ? firstVisible.id : '';
        }
        markDirty();
        renderAll();
    }

    function discardChanges() {
        if (!confirm('Discard all unpublished changes?')) return;
        state.staged.forEach(item => { if (item.objectUrl) URL.revokeObjectURL(item.objectUrl); });
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
       Uploads — client-side derivative generation
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

        // Derivatives
        const srcset = [];
        for (const target of DERIVATIVE_SIZES) {
            const scaled = scaleBitmap(bitmap, target);
            const blob = await canvasToJpeg(scaled.canvas);
            const path = `gallery/_web/${id}-${target}.jpg`;
            state.staged.set(path, { blob, label: `${id}-${target}.jpg` });
            srcset.push({ src: path, w: scaled.width });
            if (Math.max(bitmap.width, bitmap.height) <= target) break;
        }

        const tiny = scaleBitmap(bitmap, 32);
        const placeholder = tiny.canvas.toDataURL('image/jpeg', 0.5);
        const color = averageColor(tiny.canvas);

        state.staged.set(originalPath, { blob: file, label: safeName });

        const dbType = detected ? detected.obj.type : '';
        state.manifest.images.push({
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
            capture: { telescope: '', camera: '', mount: '', filters: '', integration: '', date: '', location: '' },
            original: originalPath,
            width: bitmap.width,
            height: bitmap.height,
            placeholder,
            color,
            srcset
        });
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
                'image/jpeg', JPEG_QUALITY
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
        const heroEntry = state.manifest.images.find(i => i.id === state.manifest.settings.hero);
        if (!heroEntry || heroEntry.visible === false) {
            const firstVisible = state.manifest.images.find(i => i.visible !== false);
            state.manifest.settings.hero = firstVisible ? firstVisible.id : '';
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
            state.staged.forEach(item => { if (item.objectUrl) URL.revokeObjectURL(item.objectUrl); });
            state.staged.clear();
            state.deletions.clear();
            state.baseline = clone(state.manifest);

            $('publish-title').textContent = 'Published';
            note.textContent = 'Changes are committed. GitHub Pages usually rebuilds within a minute or two — then the live site shows your changes.';
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
