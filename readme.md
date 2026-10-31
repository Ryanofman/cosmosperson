# Cosmos Person — Deep-Sky Astrophotography

The portfolio site behind [cosmosperson.com](https://cosmosperson.com): a gallery of deep-sky
photographs with a page for every photo, an interactive **Explore the Universe** sky atlas where
every capture appears as a beacon at its true celestial coordinates, and a built-in admin for
managing it all without touching code.

Plain HTML, CSS and JavaScript on GitHub Pages. One Python build script. No framework.

## How the site is put together

| File | Role |
|---|---|
| `index.html` + `gallery.css` + `gallery.js` | The gallery: hero, filterable justified grid, viewer overlay |
| `photo/<id>/index.html` | One page per photo (**generated** by the build — do not edit by hand) |
| `tools/templates/photo.html` | The template those pages are rendered from |
| `viewer.js` | The photo viewer (PhotoSwipe 5 + the technical-card rail), shared by the gallery and photo pages |
| `explore.html` + `styles.css` + `app.js` | The sky atlas (Aladin Lite) with photo beacons |
| `admin.html` + `admin.css` + `admin.js` | Gallery admin — curate and publish from the browser |
| `site.css` | Shared design system (colors, type, header/footer, controls) |
| `gallery.json` | **The single source of truth** for the collection (schema v3) |
| `celestial-database.js` | Catalog of object coordinates for beacon placement, search and RA/Dec on pages |
| `config.js` | Repository/owner settings used by the sky atlas and admin |
| `gallery/` | Full-resolution originals |
| `gallery/_web/` | Web derivatives, AVIF + JPEG at five sizes (generated) |
| `images/` (+ `images/_web/`) | Additional captures shown as beacons on the sky atlas |
| `vendor/` | PhotoSwipe and Aladin Lite, served from this site (see `vendor/README.md`) |
| `tools/build.py` | The build: derivatives, manifest, photo pages, sitemap |
| `.github/workflows/build.yml` | Runs the build on GitHub after every push that touches originals or the manifest |
| `docs/gallery-upgrade-plan.md` | Research, design and roadmap for the gallery (October 2026) |

## Managing the gallery (admin)

Open **`/admin.html`** on the live site (there's a discreet `·` link in the footer).

1. **Sign in** with a GitHub fine-grained personal access token:
   - GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*
   - Repository access: **only this repository**
   - Permissions → **Contents: Read and write**
   - The token never leaves your browser; it's stored only on your device.
2. **Curate**: drag to reorder, click the eye to show/hide a photograph, click a row to edit its
   title, subtitle, catalog data, description, story, palette, date, and the acquisition card
   (optics, camera, mount, filters, location, and the subframes per filter — integration is
   computed from them). Tick *Featured* to make a photo span a full row. Set the hero image.
3. **Add photographs**: upload the full-resolution JPEG. Objects are auto-recognized from
   filenames (`NGC7000.jpg`, `M51.jpg`, …). Only the original is uploaded.
4. **Publish**: everything is committed to the repository in a single commit through the
   GitHub API. The build then runs on GitHub (web versions, photo pages) and GitHub Pages
   redeploys — allow about five minutes.

Nothing changes on the live site until you press **Publish**.

## The build

`tools/build.py` turns originals into everything the site serves:

- AVIF (q70, 4:4:4) and JPEG (q85, 4:4:4, progressive) at 640 / 1024 / 1600 / 2400 / 3200 px
  long edge, converted to sRGB, with EXIF stripped;
- a tiny blur-up placeholder and dominant color per photo;
- `gallery.json` upgraded to schema v3, preserving every hand-edited field;
- `photo/<id>/index.html` for every visible photo, with OpenGraph/Twitter cards, JSON-LD,
  the technical card, downloads, prev/next and related photos; plus `sitemap.xml`;
- removal of orphaned derivatives.

It runs automatically in GitHub Actions on every push to `main` that changes `gallery/`,
`images/`, `gallery.json` or `tools/`, and commits the results back. To run it locally:

```bash
python tools/build.py
```

Needs Python 3.10+ and Pillow 11.3+ (`pip install "pillow>=11.3"`). `--force` rebuilds every
derivative; `--no-pages` skips the page rendering.

For sky-atlas-only captures, drop files named after their object (e.g. `IC1805.jpg`) into
`images/` — the build makes their `images/_web/` viewer derivatives too.

## gallery.json schema (v3)

```jsonc
{
  "version": 3,
  "settings": {
    "hero": { "id": "california", "focal": [0.5, 0.5] },
    "grid": { "style": "justified", "row_height": 300, "gutter": 14,
              "captions": "hover", "caption_fields": ["title", "catalog", "integration"] },
    "index": { "default_sort": "curated", "facets": ["category", "palette", "constellation", "year"],
               "featured_first": false, "show_search": true },
    "theme": { "accent": "#7cd1c8" },
    "site": { "title": "Cosmos Person", "tagline": "…", "lede": "…", "statement": "…", "licence": "…" }
  },
  "collections": [],
  "images": [
    {
      "id": "california",
      "title": "The California Nebula",
      "subtitle": "",
      "catalog": "NGC 1499",
      "type": "Emission Nebula",
      "category": "nebulae",                  // filter group
      "constellation": "Perseus",
      "distance": "≈ 1,000 light-years",
      "description": "…",                     // one or two sentences, shown everywhere
      "story": "",                            // photo page only; light markdown
      "skyTarget": "NGC 1499",                // powers “View on Sky Map” and RA/Dec
      "palette": "SHO",
      "date": "2025-09",                      // YYYY-MM or YYYY-MM-DD
      "featured": false,                      // spans a full row in the grid
      "visible": true,                        // false hides it from the site
      "tags": [], "collections": [], "badges": [], "licence": "",
      "layout": { "span": 1, "focal": [0.5, 0.5] },
      "acquisition": {
        "optics": "", "camera": "", "mount": "", "filters": "", "guiding": "", "software": "",
        "location": "", "bortle": "", "integration": "",
        "subs": [ { "filter": "Hα", "count": 48, "seconds": 300 } ],
        "nights": [ { "date": "2025-09-14", "moon": "", "notes": "" } ],
        "conditions": { "seeing": "", "transparency": "" }, "notes": ""
      },
      // --- written by the build ---
      "original": "gallery/California_2xUpsampled_reddragon.jpg",
      "width": 7116, "height": 3216,
      "placeholder": "data:image/jpeg;base64,…",
      "color": "#21030a",
      "sources": { "avif": [ { "src": "gallery/_web/california-640.avif", "w": 640, "h": 289, "bytes": 26000 }, … ],
                   "jpg":  [ … ] },
      "srcset": [ { "src": "gallery/_web/california-640.jpg", "w": 640 }, … ],
      "downloads": [ { "label": "Full resolution JPEG", "url": "gallery/…", "width": 7116, "height": 3216, "bytes": 13259710 } ],
      "integration_seconds": 14400,
      "year": "2025"
    }
  ]
}
```

Order in the array = curated order on the site. `settings.grid.style` can be `justified`,
`masonry` or `uniform`; `settings.grid.captions` can be `hover`, `always` or `none`.

## Explore the Universe

The sky atlas merges two beacon sources: the curated collection (via each entry's
`skyTarget`) and any recognized files in `images/`. Clicking a beacon opens the photograph
in place; curated entries link to their photo page. Deep links work in both directions:

- `explore.html?goto=NGC 7000` — fly the atlas to an object
- `/photo/california/` — a photo's own page (the old `index.html#photo=california` still works)

Aladin Lite is served from `vendor/` with the CDS server as a fallback; if neither loads, the
page says so and points to the photos.

## Development

```bash
python tools/devserver.py 8123
# → http://127.0.0.1:8123
```

Serves the site root with the right MIME types and no caching. Make a change, reload.

## Credits

- [PhotoSwipe](https://photoswipe.com) by Dmytro Semenov (MIT)
- [Aladin Lite](https://aladin.cds.unistra.fr/AladinLite/) by CDS, Strasbourg Observatory (LGPL)
- Typefaces: Cormorant Garamond & Inter (Google Fonts)
- All photographs © Cosmos Person
