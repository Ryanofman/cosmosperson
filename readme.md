# Cosmos Person — Deep-Sky Astrophotography

The portfolio site behind [cosmosperson.com](https://cosmosperson.com): a curated gallery of
deep-sky photographs, an interactive **Explore the Universe** sky atlas where every capture
appears as a beacon at its true celestial coordinates, and a built-in admin for managing it
all without touching code.

## How the site is put together

| File | Role |
|---|---|
| `index.html` + `gallery.css` + `gallery.js` | The gallery: hero, filterable collection grid, photograph viewer |
| `explore.html` + `styles.css` + `app.js` | The sky atlas (Aladin Lite) with photo beacons |
| `admin.html` + `admin.css` + `admin.js` | Gallery admin — curate and publish from the browser |
| `site.css` | Shared design system (colors, type, header/footer, controls) |
| `gallery.json` | **The single source of truth** for the collection (schema v2) |
| `celestial-database.js` | Catalog of object coordinates for beacon placement & search |
| `config.js` | Repository/owner settings used by the sky atlas and admin |
| `gallery/` | Full-resolution originals |
| `gallery/_web/` | Web derivatives (generated — do not edit by hand) |
| `images/` (+ `images/_web/`) | Additional captures shown as beacons on the sky atlas |
| `tools/build_derivatives.py` | Regenerates derivatives + `gallery.json` from the originals |

## Managing the gallery (admin)

Open **`/admin.html`** on the live site (there's a discreet `·` link in the footer).

1. **Sign in** with a GitHub fine-grained personal access token:
   - GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*
   - Repository access: **only this repository**
   - Permissions → **Contents: Read and write**
   - The token never leaves your browser; it's stored only on your device.
2. **Curate**: drag to reorder, click the eye to show/hide a photograph, click a row to edit
   its title, catalog data, description and capture details, or set it as the hero image.
3. **Add photographs**: upload JPEG/PNG files — web-sized derivatives are generated right in
   the browser, and objects are auto-recognized from filenames (`NGC7000.jpg`, `M51.jpg`, …).
4. **Publish**: everything is committed to the repository in a single commit through the
   GitHub API. GitHub Pages redeploys automatically — live in a minute or two.

Nothing changes on the live site until you press **Publish**.

## Adding photos from the command line (alternative)

Drop originals into `gallery/`, then:

```bash
python3 tools/build_derivatives.py
```

This resizes derivatives into `gallery/_web/`, generates blur-up placeholders, and updates
`gallery.json` (preserving any titles/details you've already edited). Commit and push.

For sky-atlas-only captures, drop files named after their object (e.g. `IC1805.jpg`) into
`images/` and re-run the script — it builds the `images/_web/` viewer derivatives too.

## gallery.json schema (v2)

```jsonc
{
  "version": 2,
  "settings": { "hero": "california" },       // id of the hero photograph
  "images": [
    {
      "id": "california",
      "title": "The California Nebula",
      "catalog": "NGC 1499",
      "type": "Emission Nebula",
      "category": "nebulae",                  // filter group
      "constellation": "Perseus",
      "distance": "≈ 1,000 light-years",
      "description": "…",
      "skyTarget": "NGC 1499",                // powers “View on Sky Map”
      "visible": true,                        // false hides it from the site
      "capture": { "telescope": "", "camera": "", "mount": "", "filters": "",
                   "integration": "", "date": "", "location": "" },
      "original": "gallery/California_2xUpsampled_reddragon.jpg",
      "width": 7116, "height": 3216,
      "placeholder": "data:image/jpeg;base64,…",  // blur-up thumb
      "color": "#21030a",
      "srcset": [ { "src": "gallery/_web/california-800.jpg", "w": 800 }, … ]
    }
  ]
}
```

Order in the array = order on the site.

## Explore the Universe

The sky atlas merges two beacon sources: the curated collection (via each entry's
`skyTarget`) and any recognized files in `images/`. Clicking a beacon opens the photograph
in place; curated entries link back into the gallery. Deep links work in both directions:

- `explore.html?goto=NGC 7000` — fly the atlas to an object
- `index.html#photo=california` — open a photograph in the gallery

## Development

```bash
python3 -m http.server 8123
# → http://localhost:8123
```

No build step, no dependencies — plain HTML/CSS/JS on GitHub Pages.
`tools/build_derivatives.py` needs Python 3 with Pillow (`pip install Pillow`).

## Credits

- [Aladin Lite](https://aladin.cds.unistra.fr/AladinLite/) by CDS, Strasbourg Observatory
- Typefaces: Cormorant Garamond & Inter (Google Fonts)
- All photographs © Cosmos Person
