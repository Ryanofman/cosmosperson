# Third-party code served by this site

Vendored so the site does not depend on an outside server being up.

| Folder | Library | Version | Licence | Source |
|---|---|---|---|---|
| `photoswipe/` | PhotoSwipe (core, lightbox, CSS) | 5.4.4 | MIT (see `photoswipe/LICENSE`) | https://photoswipe.com — files from cdnjs |
| `aladin-lite/` | Aladin Lite (ES module bundle) | 3.8.2 | LGPL-3.0-or-later (see `aladin-lite/LICENSE`) | https://github.com/cds-astro/aladin-lite — file from the npm package via jsDelivr |
| `openseadragon/` | OpenSeadragon (deep zoom viewer) | 6.1.1 | BSD-3-Clause (see `openseadragon/LICENSE.txt`) | https://openseadragon.github.io — file from the npm package via jsDelivr |

Aladin Lite is used unmodified, loaded as a module by `explore.html` and on demand by the
Sky panel on photo pages. The sky-survey tiles it displays still come from CDS, Strasbourg.
OpenSeadragon is loaded on demand by `astro.js` when someone opens the deep zoom.

To update a library, replace the files and the version in this table.
