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
| `astro.js` | The astro layer on photo pages: deep zoom, labels and RA/Dec grid, versions, mosaic panels, Sky panel |
| `explore.html` + `styles.css` + `app.js` | The sky atlas (Aladin Lite) with photo beacons |
| `admin.html` + `admin.css` + `admin.js` | Gallery admin — curate and publish from the browser |
| `site.css` | Shared design system (colors, type, header/footer, controls) |
| `gallery.json` | **The single source of truth** for the collection (schema v3) |
| `celestial-database.js` | Catalog of object coordinates for beacon placement, search and RA/Dec on pages |
| `config.js` | Repository/owner settings used by the sky atlas and admin |
| `gallery/` | Full-resolution originals |
| `gallery/_web/` | Web derivatives, AVIF + JPEG at five sizes (generated) |
| `tiles/` | Deep Zoom pyramids, one per photo and version (generated) |
| `images/` (+ `images/_web/`) | Additional captures shown as beacons on the sky atlas |
| `vendor/` | PhotoSwipe, OpenSeadragon and Aladin Lite, served from this site (see `vendor/README.md`) |
| `tools/build.py` | The build: derivatives, tiles, manifest, photo pages, sitemap |
| `tools/solve.py` | Plate solving through nova.astrometry.net (used by the build when a key is set) |
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
  long edge (plus 5120 px for the hero photo), converted to sRGB, with EXIF stripped; a photo's
  `rotate` (90, 180, 270, clockwise) is applied to every web version and tile;
- EXIF and XMP removed from the originals themselves, losslessly (they are served as
  downloads, and a camera serial number must never ship); the colour profile is kept;
- a tiny blur-up placeholder and dominant color per photo;
- `gallery.json` upgraded to schema v3, preserving every hand-edited field;
- a Deep Zoom pyramid per photo (WebP tiles, 256 px, long edge capped at
  `settings.tiles.max_edge`, 6000 by default, the width of a native camera frame; a photo can override it with `zoom.max_edge`),
  rebuilt only when the original or the tile settings change;
- the same derivatives and tiles for every alternate **version** of a photo (other palettes,
  starless, single filter) listed under `versions`;
- `photo/<id>/index.html` for every visible photo, with OpenGraph/Twitter cards, JSON-LD,
  the technical card, downloads (full resolution, large, medium), prev/next and related
  photos (nearest on the sky first); plus `sitemap.xml`;
- removal of orphaned derivatives, tiles and pages.

It runs automatically in GitHub Actions on every push to `main` that changes `gallery/`,
`images/`, `gallery.json` or `tools/`, and commits the results back. To run it locally:

```bash
python tools/build.py
```

Needs Python 3.10+ and Pillow 11.3+ (`pip install "pillow>=11.3"`). Web versions and tiles are
regenerated when a file's bytes, its rotation or the tile settings change (so replacing a file
under the same name just works); `--force` rebuilds everything; `--no-pages` skips the page
rendering; `--no-tiles` skips the pyramids.

### Plate solving

With an [astrometry.net API key](https://nova.astrometry.net/api_help) in the environment
the build also plate-solves photos that have no solve yet (three per run, so a build never
waits on the solver for long):

```bash
ASTROMETRY_API_KEY=xxxx python tools/build.py
ASTROMETRY_API_KEY=xxxx python tools/solve.py --id eagle --limit 0   # on its own, one photo
```

On GitHub, add the key as the repository secret `ASTROMETRY_API_KEY` and the Action does
it. What is uploaded is the 1600 px web JPEG, as a non-public submission. The result goes
into the photo's `solve` block: centre, field of view, pixel scale, orientation, the objects
in the field, label positions, and a WCS that the page uses for the RA/Dec grid and the
footprint on the Sky panel. A failed solve is retried once on a later run and then left
alone until `--resolve <id>`.

For sky-atlas-only captures, drop files named after their object (e.g. `IC1805.jpg`) into
`images/` — the build makes their `images/_web/` viewer derivatives too.

**Replacing or removing a file by hand.** A new file in `gallery/` becomes a new entry. To
swap the file behind an existing photo, change that entry's `original` to the new filename
(in `gallery.json`) before building, so its title, text and card carry over. If an entry's
file disappears, the build keeps the entry but hides it and marks it `missing_original`;
delete it in the admin once the removal is meant, or put the file back and it shows again.

## The astro layer on photo pages

Under the photo, depending on what exists for it:

- **Deep zoom** (`Z`): OpenSeadragon on the tile pyramid. The view is in the address bar
  (`#zoom=x,y,w,h`), so a crop can be linked. `F` full screen, `+`/`−`/`0` zoom, arrows pan.
- **Labels** (`L`) and **Grid** (`G`): plate-solved object labels and an RA/Dec grid, on the
  page image and inside the deep zoom. Need a solve.
- **Panels** (`P`): the mosaic panel map, when the photo has `mosaic.panel_map`.
- **Sky** (`S`): Aladin Lite centred on the photo with its footprint drawn (or a marker at
  the catalogue position when there is no solve).
- **Versions**: a segmented switch when the photo has alternate versions, plus a blend
  slider inside the deep zoom to crossfade two of them.

Deep links: `/photo/<id>/#zoom=1`, `#labels=1&grid=1`, `#v=starless`, `#sky=1`, combined with `&`.

### The hero

`settings.hero` chooses the photo and how it sits: `fit` (`cover` crops to the band, `frame`
shows the whole image at its own aspect, for a wide-field frame), `height` in vh (the cap in
frame mode), `height_mobile`, `focal` and `focal_mobile` (crop focus, 0–1), `scrim`
(0 none … 1.5 darker), `text` (`center`, `bottom`, `below`), `motion`, `credit`, and
`version` to show one of the photo's versions. Try any photo and setting before publishing
by adding them to the address: `/?hero=lagoon&fit=frame&height=70&text=bottom&scrim=0.6`.

`anchor` pins a point of the image to the layout: `{ "point": [0.425, 0.788], "extent": 0.115,
"x": 0.5, "gap": 20, "margin": 24 }` means the point at 42.5 % across and 78.8 % down the
(rotated) image always sits 20 px below the hero's buttons, centred across the band, with
the next 11.5 % of the image (the sign itself) kept visible above a 24 px margin, whatever
the screen size or the length of the text. The text block sits from the bottom to leave that
room, the image is scaled just enough to keep filling the band, and the band grows only if
the text needs it. This is how the STOP sign in the Milky Way hero stays under *Explore the
Universe*. `/?anchor=0` previews the same photo without it.

## gallery.json schema (v3)

```jsonc
{
  "version": 3,
  "settings": {
    "hero": { "id": "milky-way", "version": "", "focal": [0.5, 0.55], "focal_mobile": null,
              "fit": "cover", "height": 88, "height_mobile": 78, "scrim": 1.0,
              "text": "center", "motion": true, "credit": true,
              "anchor": { "point": [0.425, 0.788], "extent": 0.115, "x": 0.5, "gap": 20, "margin": 24 } },
    "tiles": { "max_edge": 6000, "base": "" },      // base "" = this site; later an R2 bucket URL
    "sky": { "survey": "P/DSS2/color" },
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
      "versions": [ { "id": "starless", "label": "Starless", "original": "gallery/California_starless.jpg" } ],
      "mosaic": { "panels": 4, "panel_map": [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
      "zoom": { "max_edge": 6000 },           // optional per-photo tile cap
      "rotate": 0,                             // 90 / 180 / 270 clockwise, applied by the build (file untouched)
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
      "year": "2025",
      "tiles": { "main": { "dzi": "tiles/california/main.dzi", "files": "tiles/california/main_files/",
                           "width": 4096, "height": 1851, "tile_size": 256, "overlap": 1, "format": "webp", … } },
      // --- written by the plate solve (tools/solve.py) ---
      "solve": { "status": "solved", "ra": 60.1, "dec": 36.4, "radius": 2.1, "pixscale": 1.85,
                 "orientation": 12.3, "parity": 1, "fov": [3.6, 1.6],
                 "wcs": { "width": 1600, "height": 723, "crpix": [800.5, 362], "crval": [60.1, 36.4], "cd": [[…], […]] },
                 "objects": ["NGC 1499"], "annotations": [ { "names": ["NGC 1499"], "type": "ngc", "x": 3500, "y": 1600, "r": 900 } ] }
    }
  ]
}
```

`versions[].original` is a file in `gallery/` (upload it next to the main one); the build
makes its derivatives and tiles. `mosaic.panel_map` rows are `[x, y, w, h]` as fractions of
the image (or pixels). Everything in `tiles` and `solve` is written by the tools.

Order in the array = curated order on the site. `settings.grid.style` can be `justified`,
`masonry` or `uniform`; `settings.grid.captions` can be `hover`, `always` or `none`.

## Explore the Universe

The sky atlas merges two beacon sources: the curated collection (via each entry's
`skyTarget`) and any recognized files in `images/`. Clicking a beacon opens the photograph
in place; curated entries link to their photo page. Deep links work in both directions:

- `explore.html?goto=NGC 7000` — fly the atlas to an object
- `/photo/california/` — a photo's own page (the old `index.html#photo=california` still works)
- `/photo/california/#zoom=0.2,0.1,0.3,0.2&labels=1` — a deep-zoom crop with labels on

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
- [OpenSeadragon](https://openseadragon.github.io) (BSD-3-Clause)
- Plate solving by [astrometry.net](https://nova.astrometry.net)
- [Aladin Lite](https://aladin.cds.unistra.fr/AladinLite/) by CDS, Strasbourg Observatory (LGPL)
- Typefaces: Cormorant Garamond & Inter (Google Fonts)
- All photographs © Cosmos Person
