# Third-party code served by this site

Vendored so the site does not depend on an outside server being up.

| Folder | Library | Version | Licence | Source |
|---|---|---|---|---|
| `photoswipe/` | PhotoSwipe (core, lightbox, CSS) | 5.4.4 | MIT (see `photoswipe/LICENSE`) | https://photoswipe.com — files from cdnjs |
| `aladin-lite/` | Aladin Lite (ES module bundle) | 3.8.2 | LGPL-3.0-or-later (see `aladin-lite/LICENSE`) | https://github.com/cds-astro/aladin-lite — file from the npm package via jsDelivr |

Aladin Lite is used unmodified, loaded as a module by `explore.html`. The sky-survey
tiles it displays still come from CDS, Strasbourg.

To update a library, replace the files and the version in this table.
