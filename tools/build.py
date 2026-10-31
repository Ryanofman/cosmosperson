#!/usr/bin/env python3
"""
cosmosperson.com build — derivatives, manifest (schema v3) and photo pages.

What it does
  1. Reads originals from gallery/ (the portfolio) and images/ (sky-atlas-only captures).
  2. Writes AVIF + JPEG derivatives at several long-edge sizes to gallery/_web/
     (and 1600 px JPEGs for images/_web/), sRGB, no EXIF, no camera serial.
  3. Upgrades gallery.json to schema v3, preserving every hand-edited field
     (titles, text, acquisition data, order, visibility, settings).
  4. Pre-renders one page per photo at photo/<id>/index.html from
     tools/templates/photo.html, plus sitemap.xml.
  5. Builds a Deep Zoom tile pyramid per photo (and per version) under tiles/.
  6. Optionally plate-solves photos through nova.astrometry.net when
     ASTROMETRY_API_KEY is set (see tools/solve.py).
  7. Removes orphaned derivatives, tiles and pages.

Idempotent and incremental: existing derivatives are kept unless --force.
Runs the same way on a laptop and in GitHub Actions. Needs Python 3.10+ and
Pillow 11.3+ (AVIF support is built in from that version).

    python tools/build.py            # build what is missing
    python tools/build.py --force    # rebuild every derivative
    python tools/build.py --no-pages # skip page rendering
    python tools/build.py --no-tiles # skip the deep-zoom pyramids
    ASTROMETRY_API_KEY=... python tools/build.py --solve-limit 3
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import io
import json
import math
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

try:  # colour management is optional but strongly preferred
    from PIL import ImageCms
except Exception:  # pragma: no cover
    ImageCms = None

ROOT = Path(__file__).resolve().parent.parent
GALLERY_DIR = ROOT / "gallery"
IMAGES_DIR = ROOT / "images"
GALLERY_WEB = GALLERY_DIR / "_web"
IMAGES_WEB = IMAGES_DIR / "_web"
MANIFEST = ROOT / "gallery.json"
PHOTO_DIR = ROOT / "photo"
TEMPLATE = ROOT / "tools" / "templates" / "photo.html"
CELESTIAL_DB = ROOT / "celestial-database.js"

SITE_URL = "https://cosmosperson.com"
SITE_NAME = "Cosmos Person"

# Long-edge targets. 640/1024 feed the grid, 1600/2400/3200 the viewer and pages.
SIZES = [640, 1024, 1600, 2400, 3200]
HERO_SIZE = 5120           # one extra size for the hero photo only, so a wide band stays sharp on big screens
EXPLORE_SIZE = 1600
AVIF_QUALITY = 70          # measured 30 Oct 2026: q65-75 ≈ JPEG q82 4:4:4 fidelity at ~40 % smaller
AVIF_SPEED = 6
JPEG_QUALITY = 85
PLACEHOLDER_EDGE = 24

# Deep Zoom (DZI) pyramids for the OpenSeadragon viewer
TILES_DIR = ROOT / "tiles"
TILE_SIZE = 256
TILE_OVERLAP = 1
TILE_FORMAT = "webp"       # decoded by every current browser; ~30 % smaller than JPEG at equal quality
TILE_QUALITY = 88
TILE_MAX_EDGE = 6000       # default long edge of a pyramid; settings.tiles.max_edge / per-photo zoom.max_edge override

Image.MAX_IMAGE_PIXELS = None  # large mosaics are expected and trusted (local files)

CATEGORY_LABELS = {
    "nebulae": "Nebulae",
    "galaxies": "Galaxies",
    "star-clusters": "Star Clusters",
    "solar-system": "Solar System",
    "wide-field": "Wide Field",
}

DEFAULT_SETTINGS = {
    "hero": {
        "id": "",                     # photo id; empty = first photo
        "version": "",                # a version id (e.g. "starless") or empty for the main image
        "focal": [0.5, 0.5],          # crop focus, 0-1 from the left / top (cover mode)
        "focal_mobile": None,         # optional separate focus for phones
        "fit": "cover",               # cover: crop to the band | frame: whole wide image | condensed: centred frame over a blurred backdrop
        "height": 88,                 # band height in vh; in frame mode this is the cap
        "height_mobile": 78,
        "scrim": 1.0,                 # darkening of the gradient over the image, 0 (none) to 1.5
        "text": "center",             # center | bottom | below
        "motion": True,               # slow settle on load
        "credit": True,               # show the photo title at the bottom right
        "anchor": None,               # {"point": [x, y], "x": 0.5, "gap": 24}: that point of the image always sits just below the buttons
        "edge_fade": 0,               # condensed: % of the frame's width that fades into black on each side (0 = hard edge)
        "bottom_fade": "none",        # condensed: none | short | long
        "reveal": "instant",          # how the image appears on load: instant | quick | fade (cover/frame modes)
        "frame": "none",              # none | line | glow (condensed, hard edge)
    },
    "grid": {
        "style": "justified",          # justified | masonry | uniform
        "row_height": 300,             # target row height on desktop, px
        "gutter": 14,
        "captions": "hover",           # always | hover | none
        "caption_fields": ["title", "catalog", "integration"],
    },
    "index": {
        "default_sort": "curated",     # curated | newest | integration | title
        "facets": ["category", "palette", "constellation", "year"],
        "featured_first": False,
        "show_search": True,
    },
    "viewer": {"open_as": "overlay", "show_card": True},
    "tiles": {"max_edge": TILE_MAX_EDGE, "base": ""},   # base "" = this site; later e.g. an R2 bucket URL
    "sky": {"survey": "P/DSS2/color"},                    # survey behind the Sky panel on photo pages
    "theme": {"accent": "#7cd1c8"},
    "site": {
        "title": "Cosmos Person",
        "tagline": "Ryan's Astrophotography",
        "lede": "Nebulae, galaxies, and the occasional comet — photographed one clear night at a time.",
        "statement": "The light in these photos is old — some of it left home before humans figured out writing. Then it fell into my telescope. That still gets me every time.",
        "instagram": "https://instagram.com/cosmosperson",
        "email": "hello@cosmosperson.com",
        "licence": "© Cosmos Person. All rights reserved.",
    },
}

EMPTY_ACQUISITION = {
    "optics": "",
    "camera": "",
    "mount": "",
    "filters": "",
    "guiding": "",
    "software": "",
    "location": "",
    "bortle": "",
    "integration": "",       # free text, used when subs are not itemised
    "subs": [],              # [{"filter": "Hα", "count": 48, "seconds": 300}]
    "nights": [],            # [{"date": "2025-07-23", "moon": "", "notes": ""}]
    "conditions": {"seeing": "", "transparency": ""},
    "notes": "",
}

# Metadata for originals that are in gallery/ but were never in the manifest.
# Anything already in gallery.json wins over this table.
KNOWN_ORIGINALS = {
    "MW1.jpg": {
        "id": "milky-way",
        "title": "The Milky Way",
        "rotate": 180,              # the file is stored upside down (orientation tag says normal)
        "catalog": "",
        "type": "Milky Way",
        "category": "wide-field",
        "constellation": "",
        "distance": "",
        "skyTarget": "",
        "description": "",
    },
    "IC1396_2xUpsampled_Starreduced.jpg": {
        "id": "elephants-trunk",
        "title": "The Elephant's Trunk Nebula",
        "catalog": "IC 1396",
        "type": "Emission Nebula",
        "category": "nebulae",
        "constellation": "Cepheus",
        "distance": "≈ 2,400 light-years",
        "skyTarget": "IC1396",
        "description": "",
    },
    "M33_Finalized_2XResampled.jpg": {
        "id": "triangulum",
        "title": "The Triangulum Galaxy",
        "catalog": "Messier 33",
        "type": "Spiral Galaxy",
        "category": "galaxies",
        "constellation": "Triangulum",
        "distance": "≈ 2.7 million light-years",
        "skyTarget": "M33",
        "description": "",
    },
    "Beautiful_3xUpsampled_Eagle_SHO.jpg": {
        "id": "eagle",
        "title": "The Eagle Nebula",
        "catalog": "Messier 16",
        "type": "Emission Nebula",
        "category": "nebulae",
        "constellation": "Serpens",
        "distance": "≈ 7,000 light-years",
        "skyTarget": "M16",
        "palette": "SHO",
        "description": "The Pillars of Creation and the Spire rise from a cavern of ionised gas, mapped in the Hubble palette.",
    },
    "Lagoon_2XUpsampled_SHO_DeepDark_V1.jpg": {
        "id": "lagoon",
        "title": "The Lagoon Nebula",
        "catalog": "Messier 8",
        "type": "Emission Nebula",
        "category": "nebulae",
        "constellation": "Sagittarius",
        "distance": "≈ 4,100 light-years",
        "skyTarget": "M8",
        "palette": "SHO",
        "description": "A giant star-forming cloud in the heart of the Milky Way, its hourglass core lit by the young cluster NGC 6530.",
    },
}


# ----------------------------------------------------------------------------
# Imaging helpers
# ----------------------------------------------------------------------------

def strip_jpeg_metadata(path: Path) -> bool:
    """Drop EXIF and XMP (APP1) segments from a JPEG without re-encoding it, keeping the
    ICC profile. Originals are served as downloads, so a camera serial must never ship.
    Returns True when the file was rewritten."""
    data = path.read_bytes()
    if data[:2] != b"\xff\xd8":
        return False
    out = bytearray(b"\xff\xd8")
    i = 2
    changed = False
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            out += data[i:]
            break
        marker = data[i + 1]
        if marker == 0xD8 or 0xD0 <= marker <= 0xD7 or marker == 0x01 or marker == 0xFF:
            out += data[i:i + 2]
            i += 2
            continue
        if marker == 0xDA:                      # start of scan: the rest is image data
            out += data[i:]
            break
        seg_len = int.from_bytes(data[i + 2:i + 4], "big")
        seg = data[i:i + 2 + seg_len]
        payload = seg[4:]
        if marker == 0xE1 and (payload.startswith(b"Exif\x00") or payload.startswith(b"http://ns.adobe.com/xap/")):
            changed = True                      # dropped
        else:
            out += seg
        i += 2 + seg_len
    if changed:
        path.write_bytes(bytes(out))
    return changed


def load_image(path: Path) -> Image.Image:
    """Open, honour EXIF orientation, convert to sRGB, drop everything else."""
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    icc = img.info.get("icc_profile")
    if img.mode != "RGB":
        img = img.convert("RGB")
    if icc and ImageCms is not None:
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            desc = (ImageCms.getProfileDescription(src) or "").lower()
            if "srgb" not in desc:
                dst = ImageCms.createProfile("sRGB")
                img = ImageCms.profileToProfile(img, src, dst, outputMode="RGB")
                print(f"     converted {path.name} from '{desc.strip()}' to sRGB")
        except Exception as exc:  # keep going with the pixels as they are
            print(f"     !! could not colour-convert {path.name}: {exc}")
    img.info.pop("exif", None)
    img.info.pop("icc_profile", None)
    img.info.pop("xmp", None)
    return img


def resize_long_edge(img: Image.Image, target: int) -> Image.Image:
    w, h = img.size
    long_edge = max(w, h)
    if long_edge <= target:
        return img.copy()
    scale = target / long_edge
    return img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def save_jpeg(img: Image.Image, path: Path, quality: int = JPEG_QUALITY) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=quality, subsampling=0, optimize=True, progressive=True)


def save_avif(img: Image.Image, path: Path) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        img.save(path, "AVIF", quality=AVIF_QUALITY, subsampling="4:4:4", speed=AVIF_SPEED)
        return True
    except Exception as exc:
        print(f"     !! AVIF unavailable ({exc}); JPEG only")
        return False


def make_placeholder(img: Image.Image) -> str:
    tiny = resize_long_edge(img, PLACEHOLDER_EDGE)
    buf = io.BytesIO()
    tiny.save(buf, "JPEG", quality=40)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def average_color(img: Image.Image) -> str:
    px = img.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    r, g, b = (max(0, int(c * 0.6)) for c in px[:3])
    return f"#{r:02x}{g:02x}{b:02x}"


def file_hash(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def make_derivatives(img: Image.Image, stem: str, force: bool, referenced: set,
                     sizes: list | None = None) -> tuple[list, list]:
    """AVIF + JPEG at every size in SIZES (never upscaled) into gallery/_web/<stem>-<size>.<fmt>."""
    w, h = img.size
    avif_list, jpg_list = [], []
    have_avif = True
    for target in (sizes or SIZES):
        derived = None
        for fmt, store in (("avif", avif_list), ("jpg", jpg_list)):
            out_path = GALLERY_WEB / f"{stem}-{target}.{fmt}"
            if force or not out_path.exists():
                if derived is None:
                    derived = resize_long_edge(img, target)
                if fmt == "avif":
                    if have_avif:
                        have_avif = save_avif(derived, out_path)
                else:
                    save_jpeg(derived, out_path)
            if out_path.exists():
                dw, dh = Image.open(out_path).size
                store.append({
                    "src": f"gallery/_web/{out_path.name}",
                    "w": dw,
                    "h": dh,
                    "bytes": out_path.stat().st_size,
                })
                referenced.add(out_path.name)
        if max(w, h) <= target:
            break  # never upscale
    return avif_list, jpg_list


def tile_signature(src_hash: str, max_edge: int, rotate: int = 0) -> str:
    return f"{src_hash}:{rotate}:{max_edge}:{TILE_SIZE}:{TILE_OVERLAP}:{TILE_FORMAT}:{TILE_QUALITY}"


def apply_rotation(img: Image.Image, rotate: int) -> Image.Image:
    """rotate = clockwise degrees (0, 90, 180, 270) from the manifest; the file itself is left alone."""
    rot = int(rotate or 0) % 360
    if rot == 0:
        return img
    return img.rotate(-rot, expand=True)


def build_tiles(img: Image.Image, photo_id: str, version: str, max_edge: int,
                signature: str, previous: dict | None, force: bool) -> dict:
    """Deep Zoom pyramid at tiles/<id>/<version>_files/<level>/<col>_<row>.webp + tiles/<id>/<version>.dzi.

    Rebuilt only when the original's bytes or the tile settings change, so the
    GitHub Action never re-encodes (and re-commits) an unchanged pyramid.
    """
    out_dir = TILES_DIR / photo_id / f"{version}_files"
    dzi_path = TILES_DIR / photo_id / f"{version}.dzi"
    if (not force and previous and previous.get("signature") == signature
            and dzi_path.exists() and out_dir.exists()):
        return previous

    base = resize_long_edge(img, max_edge)
    w, h = base.size
    levels = math.ceil(math.log2(max(w, h))) + 1
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    count = 0
    total = 0
    for level in range(levels - 1, -1, -1):
        scale = 2 ** (levels - 1 - level)
        lw, lh = max(1, math.ceil(w / scale)), max(1, math.ceil(h / scale))
        level_img = base if (lw, lh) == (w, h) else base.resize((lw, lh), Image.LANCZOS, reducing_gap=2.0)
        ldir = out_dir / str(level)
        ldir.mkdir()
        cols, rows = math.ceil(lw / TILE_SIZE), math.ceil(lh / TILE_SIZE)
        for col in range(cols):
            for row in range(rows):
                x0 = max(0, col * TILE_SIZE - TILE_OVERLAP)
                y0 = max(0, row * TILE_SIZE - TILE_OVERLAP)
                x1 = min(lw, (col + 1) * TILE_SIZE + TILE_OVERLAP)
                y1 = min(lh, (row + 1) * TILE_SIZE + TILE_OVERLAP)
                tile_path = ldir / f"{col}_{row}.{TILE_FORMAT}"
                level_img.crop((x0, y0, x1, y1)).save(tile_path, "WEBP", quality=TILE_QUALITY, method=4)
                count += 1
                total += tile_path.stat().st_size
    dzi_path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="{TILE_FORMAT}" '
        f'Overlap="{TILE_OVERLAP}" TileSize="{TILE_SIZE}">\n  <Size Width="{w}" Height="{h}"/>\n</Image>\n',
        encoding="utf-8",
    )
    print(f"     tiles {version}: {w}x{h}, {levels} levels, {count} tiles, {total / 1e6:.1f} MB")
    return {
        "dzi": f"tiles/{photo_id}/{version}.dzi",
        "files": f"tiles/{photo_id}/{version}_files/",
        "width": w,
        "height": h,
        "tile_size": TILE_SIZE,
        "overlap": TILE_OVERLAP,
        "format": TILE_FORMAT,
        "levels": levels,
        "tiles": count,
        "bytes": total,
        "signature": signature,
    }


def remove_orphan_tiles(manifest_images: list) -> None:
    if not TILES_DIR.exists():
        return
    keep: dict[str, set] = {}
    for e in manifest_images:
        keep[e["id"]] = set((e.get("tiles") or {}).keys())
    for d in TILES_DIR.iterdir():
        if not d.is_dir():
            continue
        if d.name not in keep:
            shutil.rmtree(d)
            print(f"  -- removed tiles for {d.name}")
            continue
        for item in d.iterdir():
            name = item.name[:-6] if item.name.endswith("_files") else item.stem
            if name not in keep[d.name]:
                shutil.rmtree(item) if item.is_dir() else item.unlink()
                print(f"  -- removed tiles {d.name}/{item.name}")


def slugify(name: str) -> str:
    out = []
    for ch in name.lower():
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-") or "photo"


# ----------------------------------------------------------------------------
# Manifest: migration and merge
# ----------------------------------------------------------------------------

def deep_merge(base: dict, over: dict) -> dict:
    out = json.loads(json.dumps(base))
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def migrate_settings(previous: dict) -> dict:
    settings = previous.get("settings") or {}
    if isinstance(settings.get("hero"), str):           # v2: "hero": "california"
        settings = dict(settings)
        settings["hero"] = {"id": settings["hero"], "focal": [0.5, 0.5]}
    return deep_merge(DEFAULT_SETTINGS, settings)


def migrate_entry(prev: dict) -> dict:
    """Bring a v2 or v3 entry up to the v3 shape without losing anything typed by hand."""
    entry = dict(prev)
    if "acquisition" not in entry:
        cap = prev.get("capture") or {}
        entry["acquisition"] = deep_merge(EMPTY_ACQUISITION, {
            "optics": cap.get("telescope", ""),
            "camera": cap.get("camera", ""),
            "mount": cap.get("mount", ""),
            "filters": cap.get("filters", ""),
            "integration": cap.get("integration", ""),
            "location": cap.get("location", ""),
        })
        if cap.get("date") and not entry.get("date"):
            entry["date"] = cap["date"]
    else:
        entry["acquisition"] = deep_merge(EMPTY_ACQUISITION, entry["acquisition"])
    entry.pop("capture", None)
    entry.setdefault("subtitle", "")
    entry.setdefault("story", "")
    entry.setdefault("alt", "")
    entry.setdefault("tags", [])
    entry.setdefault("collections", [])
    entry.setdefault("featured", False)
    entry.setdefault("palette", "")
    entry.setdefault("date", "")
    entry.setdefault("licence", "")
    entry.setdefault("badges", [])
    entry.setdefault("layout", {"span": 1, "focal": [0.5, 0.5]})
    entry.setdefault("visible", True)
    entry.setdefault("versions", [])        # [{"id": "hoo", "label": "HOO", "original": "gallery/x.jpg"}]
    return entry


def integration_seconds(acq: dict) -> int:
    total = 0
    for sub in acq.get("subs") or []:
        try:
            total += int(float(sub.get("count") or 0) * float(sub.get("seconds") or 0))
        except (TypeError, ValueError):
            pass
    return total


def format_duration(seconds: int) -> str:
    if not seconds:
        return ""
    h, rem = divmod(int(seconds), 3600)
    m = rem // 60
    if h and m:
        return f"{h}h {m:02d}m"
    if h:
        return f"{h}h"
    return f"{m}m"


def year_of(entry: dict) -> str:
    date = entry.get("date") or ""
    nights = (entry.get("acquisition") or {}).get("nights") or []
    candidates = [date] + [n.get("date", "") for n in nights]
    for c in candidates:
        m = re.search(r"(19|20)\d{2}", str(c))
        if m:
            return m.group(0)
    return ""


def format_date(value: str) -> str:
    """'2025-09-14' -> 'September 2025'; '2025-09' -> 'September 2025'; anything else as typed."""
    if not value:
        return ""
    m = re.match(r"^(\d{4})-(\d{2})(?:-(\d{2}))?$", value.strip())
    if not m:
        return value
    try:
        dt = datetime(int(m.group(1)), int(m.group(2)), 1)
        return dt.strftime("%B %Y")
    except ValueError:
        return value


# ----------------------------------------------------------------------------
# Celestial catalogue (parsed from celestial-database.js for RA/Dec on pages)
# ----------------------------------------------------------------------------

_DB_LINE = re.compile(r"""['"]([^'"]+)['"]\s*:\s*\{\s*ra:\s*([-\d.]+)\s*,\s*dec:\s*([-\d.]+)""")


def load_celestial_db() -> dict:
    db = {}
    if not CELESTIAL_DB.exists():
        return db
    for key, ra, dec in _DB_LINE.findall(CELESTIAL_DB.read_text(encoding="utf-8")):
        db[key.replace(" ", "").upper()] = (float(ra), float(dec))
    return db


def lookup_object(db: dict, name: str):
    if not name:
        return None
    key = name.replace(" ", "").upper()
    if key in db:
        return db[key]
    key2 = re.sub(r"^(SH2|SH)-?", "SH2-", key)
    return db.get(key2)


def entry_coords(entry: dict, db: dict):
    """(ra, dec) in degrees: the plate solve when there is one, else the catalogue."""
    solve = entry.get("solve") or {}
    if solve.get("status") == "solved" and "ra" in solve and "dec" in solve:
        return (float(solve["ra"]), float(solve["dec"]))
    return lookup_object(db, entry.get("skyTarget") or entry.get("catalog", ""))


def angular_separation(a, b) -> float:
    """Great-circle distance in degrees between two (ra, dec) pairs."""
    ra1, dec1, ra2, dec2 = (math.radians(x) for x in (a[0], a[1], b[0], b[1]))
    h = (math.sin((dec2 - dec1) / 2) ** 2
         + math.cos(dec1) * math.cos(dec2) * math.sin((ra2 - ra1) / 2) ** 2)
    return math.degrees(2 * math.asin(min(1.0, math.sqrt(h))))


def format_fov(fov) -> str:
    try:
        w, h = float(fov[0]), float(fov[1])
    except (TypeError, ValueError, IndexError):
        return ""
    if max(w, h) >= 1:
        return f"{w:.1f}° × {h:.1f}°"
    return f"{w * 60:.0f}′ × {h * 60:.0f}′"


def format_ra(ra: float) -> str:
    hours = ra / 15
    h = int(hours)
    m = round((hours - h) * 60)
    if m == 60:
        h, m = h + 1, 0
    return f"{h}ʰ {m:02d}ᵐ"


def format_dec(dec: float) -> str:
    sign = "−" if dec < 0 else "+"
    a = abs(dec)
    d = int(a)
    m = round((a - d) * 60)
    if m == 60:
        d, m = d + 1, 0
    return f"{sign}{d}° {m:02d}′"


# ----------------------------------------------------------------------------
# Portfolio build
# ----------------------------------------------------------------------------

def build_portfolio(force: bool, previous: dict, tiles: bool = True) -> dict:
    prev_images = previous.get("images", []) if previous.get("version") in (2, 3) else []
    prev_by_id = {img["id"]: img for img in prev_images}
    prev_order = [img["id"] for img in prev_images]
    settings = migrate_settings(previous)
    default_max_edge = int((settings.get("tiles") or {}).get("max_edge") or TILE_MAX_EDGE)

    # Files that are alternate versions of a photo are never their own entry
    version_files: set[str] = set()
    for img in prev_images:
        for v in img.get("versions") or []:
            orig = str(v.get("original", ""))
            if orig.startswith("gallery/"):
                version_files.add(orig.split("/", 1)[1])

    # The list of originals: manifest order first, then anything new in gallery/
    filenames: list[str] = []
    for img_id in prev_order:
        orig = prev_by_id[img_id].get("original", "")
        if orig.startswith("gallery/"):
            filenames.append(orig.split("/", 1)[1])
    for p in sorted(GALLERY_DIR.iterdir()):
        if (p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png"}
                and p.name not in filenames and p.name not in version_files):
            filenames.append(p.name)

    images = []
    referenced: set[str] = set()
    for filename in filenames:
        src = GALLERY_DIR / filename
        if not src.exists():
            # Never throw away what was typed by hand: keep the entry, hidden and
            # flagged, and leave its existing web files alone. Delete it in the
            # admin (or from gallery.json) once the removal is deliberate.
            prev = next((e for e in prev_images if e.get("original") == f"gallery/{filename}"), None)
            if prev is not None:
                kept = migrate_entry(prev)
                kept["visible"] = False
                kept["missing_original"] = True
                for lst in (kept.get("sources") or {}).values():
                    for item in lst:
                        referenced.add(Path(item["src"]).name)
                images.append(kept)
                print(f"  !! original missing for '{kept['id']}' ({filename}); entry kept but hidden")
            else:
                print(f"  !! missing original, skipping: {filename}")
            continue

        known = KNOWN_ORIGINALS.get(filename, {})
        prev = next((e for e in prev_images if e.get("original") == f"gallery/{filename}"), None)
        if prev is None:
            img_id = known.get("id") or slugify(Path(filename).stem)
            base = {k: v for k, v in known.items() if k != "id"}
            prev = {"id": img_id, **base}
        entry = migrate_entry(prev)
        img_id = entry["id"]
        if entry.pop("missing_original", False):
            entry["visible"] = True
            print(f"     original is back for '{img_id}'; shown again")

        if src.suffix.lower() in {".jpg", ".jpeg"} and strip_jpeg_metadata(src):
            print(f"     stripped EXIF/XMP from the original {src.name}")
        rotate = int(entry.get("rotate") or 0) % 360
        src_hash = file_hash(src)
        source_sig = f"{src_hash}:{rotate}"
        # Web versions are regenerated when the file's bytes or the rotation change
        # (a replaced file with the same name, for example), not only when missing.
        entry_force = force or entry.get("source") != source_sig
        img = apply_rotation(load_image(src), rotate)
        w, h = img.size
        print(f"  {img_id:<22} {w}x{h}" + (f" (rotated {rotate}°)" if rotate else "") + (" rebuilding" if entry_force and not force else ""))

        is_hero = img_id == (settings.get("hero") or {}).get("id")
        avif_list, jpg_list = make_derivatives(img, img_id, entry_force, referenced,
                                               SIZES + [HERO_SIZE] if is_hero else None)
        entry["source"] = source_sig

        # Deep-zoom pyramid for the main image
        max_edge = int((entry.get("zoom") or {}).get("max_edge") or default_max_edge)
        prev_tiles = entry.get("tiles") or {}
        tile_info: dict = {}
        if tiles:
            sig = tile_signature(src_hash, max_edge, rotate)
            tile_info["main"] = build_tiles(img, img_id, "main", max_edge, sig, prev_tiles.get("main"), force)
        else:
            tile_info = prev_tiles

        # Alternate versions (other palettes, starless, single filter ...)
        versions = []
        for v in entry.get("versions") or []:
            vorig = str(v.get("original", ""))
            vsrc = ROOT / vorig
            if not vorig or not vsrc.exists():
                print(f"     !! version file missing, skipping: {vorig}")
                continue
            vid = slugify(v.get("id") or v.get("label") or vsrc.stem)
            if vsrc.suffix.lower() in {".jpg", ".jpeg"} and strip_jpeg_metadata(vsrc):
                print(f"     stripped EXIF/XMP from the original {vsrc.name}")
            v_hash = file_hash(vsrc)
            v_sig = f"{v_hash}:{rotate}"
            v_force = force or v.get("source") != v_sig
            vimg = apply_rotation(load_image(vsrc), rotate)
            vw, vh = vimg.size
            v_avif, v_jpg = make_derivatives(vimg, f"{img_id}--{vid}", v_force, referenced)
            version = {**v, "id": vid, "label": v.get("label") or vid.upper(), "original": vorig,
                       "width": vw, "height": vh, "bytes": vsrc.stat().st_size,
                       "sources": {"avif": v_avif, "jpg": v_jpg}, "source": v_sig}
            if tiles:
                vsig = tile_signature(v_hash, max_edge, rotate)
                tile_info[vid] = build_tiles(vimg, img_id, vid, max_edge, vsig, prev_tiles.get(vid), force)
            versions.append(version)
            print(f"     version {vid}: {vw}x{vh}")
        if not tiles:
            tile_info = {k: v for k, v in prev_tiles.items() if k == "main" or any(x["id"] == k for x in versions)}

        entry.update({
            "title": entry.get("title") or Path(filename).stem,
            "catalog": entry.get("catalog", ""),
            "type": entry.get("type", "Deep Sky Object"),
            "category": entry.get("category", "nebulae"),
            "constellation": entry.get("constellation", ""),
            "distance": entry.get("distance", ""),
            "description": entry.get("description", ""),
            "skyTarget": entry.get("skyTarget", ""),
            "original": f"gallery/{filename}",
            "width": w,
            "height": h,
            "placeholder": make_placeholder(img),
            "color": average_color(img),
            "srcset": [{"src": s["src"], "w": s["w"]} for s in jpg_list],   # kept for explore.html
            "sources": {"avif": avif_list, "jpg": jpg_list},
        })
        entry["versions"] = versions
        if tile_info:
            entry["tiles"] = tile_info
        else:
            entry.pop("tiles", None)
        entry["integration_seconds"] = integration_seconds(entry["acquisition"])
        entry["year"] = year_of(entry)

        # Download ladder: full resolution, then the large and medium web JPEGs
        entry["downloads"] = [{
            "label": "Full resolution JPEG",
            "url": entry["original"],
            "width": w,
            "height": h,
            "bytes": src.stat().st_size,
        }]
        for size, label in ((HERO_SIZE, "Extra large JPEG"), (3200, "Large JPEG"), (1600, "Medium JPEG")):
            if size >= max(w, h):
                continue
            d = next((j for j in jpg_list if max(j["w"], j["h"]) == size), None)
            if d:
                entry["downloads"].append({"label": label, "url": d["src"], "width": d["w"],
                                           "height": d["h"], "bytes": d["bytes"]})
        for v in versions:
            entry["downloads"].append({
                "label": f"Full resolution JPEG · {v['label']}",
                "url": v["original"],
                "width": v["width"],
                "height": v["height"],
                "bytes": v["bytes"],
            })
        images.append(entry)

    # Remove orphaned derivatives (regenerable, never hand-edited)
    if GALLERY_WEB.exists():
        for f in GALLERY_WEB.iterdir():
            if f.is_file() and f.name not in referenced:
                f.unlink()
                print(f"  -- removed orphan derivative {f.name}")

    if tiles:
        remove_orphan_tiles(images)

    ids = {e["id"] for e in images}
    if settings["hero"].get("id") not in ids:
        settings["hero"]["id"] = "california" if "california" in ids else (images[0]["id"] if images else "")

    return {
        "version": 3,
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "settings": settings,
        "collections": previous.get("collections", []),
        "images": images,
    }


def build_explore_derivatives(force: bool) -> None:
    if not IMAGES_DIR.exists():
        return
    count = 0
    for src in sorted(IMAGES_DIR.iterdir()):
        if src.suffix.lower() not in {".jpg", ".jpeg", ".png"} or src.parent.name == "_web":
            continue
        out_path = IMAGES_WEB / f"{src.stem}-{EXPLORE_SIZE}.jpg"
        if not force and out_path.exists():
            if src.suffix.lower() in {".jpg", ".jpeg"} and strip_jpeg_metadata(src):
                print(f"     stripped EXIF/XMP from the original {src.name}")
            count += 1
            continue
        try:
            if src.suffix.lower() in {".jpg", ".jpeg"} and strip_jpeg_metadata(src):
                print(f"     stripped EXIF/XMP from the original {src.name}")
            img = load_image(src)
        except Exception as exc:
            print(f"  !! unreadable, skipping: {src.name} ({exc})")
            continue
        save_jpeg(resize_long_edge(img, EXPLORE_SIZE), out_path, quality=82)
        count += 1
    print(f"  explore viewer derivatives: {count}")


# ----------------------------------------------------------------------------
# Photo pages
# ----------------------------------------------------------------------------

def esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


def paragraphs(text: str) -> str:
    """Plain text / light markdown to HTML: blank lines separate paragraphs, [text](url) links."""
    if not text:
        return ""
    out = []
    for block in re.split(r"\n\s*\n", text.strip()):
        safe = esc(block).replace("\n", "<br>")
        safe = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" rel="noopener">\1</a>', safe)
        safe = re.sub(r"\*([^*\n]+)\*", r"<em>\1</em>", safe)
        out.append(f"<p>{safe}</p>")
    return "\n".join(out)


def human_bytes(n: int) -> str:
    if n >= 1e6:
        return f"{n / 1e6:.1f} MB"
    return f"{max(1, round(n / 1024))} KB"


def srcset_attr(items: list) -> str:
    return ", ".join(f"/{esc(i['src'])} {i['w']}w" for i in items)


def card_rows(entry: dict, db: dict) -> str:
    """The technical card as grouped <dl> blocks."""
    acq = entry.get("acquisition") or {}
    groups = []

    obj = []
    if entry.get("catalog"):
        obj.append(("Catalogue", entry["catalog"]))
    if entry.get("type"):
        obj.append(("Object type", entry["type"]))
    if entry.get("constellation"):
        obj.append(("Constellation", entry["constellation"]))
    if entry.get("distance"):
        obj.append(("Distance", entry["distance"]))
    solve = entry.get("solve") or {}
    solved = solve.get("status") == "solved"
    pos = entry_coords(entry, db)
    if pos:
        where = "centre, plate-solved" if solved else "J2000"
        obj.append((f"Position ({where})", f"RA {format_ra(pos[0])} · Dec {format_dec(pos[1])}"))
    if solved and solve.get("objects"):
        names = [str(n) for n in solve["objects"]][:8]
        more = len(solve["objects"]) - len(names)
        obj.append(("In the field", ", ".join(names) + (f" +{more} more" if more > 0 else "")))
    groups.append(("Object", obj))

    gear = []
    for key, label in (("optics", "Optics"), ("camera", "Camera"), ("mount", "Mount"),
                       ("filters", "Filters"), ("guiding", "Guiding"), ("software", "Software")):
        if acq.get(key):
            gear.append((label, acq[key]))
    groups.append(("Equipment", gear))

    cap = []
    total = entry.get("integration_seconds") or 0
    if total:
        cap.append(("Integration", format_duration(total)))
    elif acq.get("integration"):
        cap.append(("Integration", acq["integration"]))
    if entry.get("palette"):
        cap.append(("Palette", entry["palette"]))
    nights = acq.get("nights") or []
    if nights:
        label = "Night" if len(nights) == 1 else f"{len(nights)} nights"
        cap.append((label, ", ".join(format_date(n.get("date", "")) or n.get("date", "") for n in nights)))
    elif entry.get("date"):
        cap.append(("Captured", format_date(entry["date"])))
    if acq.get("location"):
        loc = acq["location"]
        if acq.get("bortle"):
            loc += f" · Bortle {acq['bortle']}"
        cap.append(("Location", loc))
    cond = acq.get("conditions") or {}
    bits = [f"{k} {v}" for k, v in (("seeing", cond.get("seeing")), ("transparency", cond.get("transparency"))) if v]
    if bits:
        cap.append(("Conditions", ", ".join(bits)))
    if acq.get("notes"):
        cap.append(("Notes", acq["notes"]))
    groups.append(("Capture", cap))

    img_rows = [("Resolution", f"{entry['width']:,} × {entry['height']:,} px")]
    if solved:
        fov = format_fov(solve.get("fov"))
        if fov:
            img_rows.append(("Field of view", fov))
        if solve.get("pixscale"):
            img_rows.append(("Scale", f"{float(solve['pixscale']):.2f}″ per pixel"))
        if solve.get("orientation") is not None:
            img_rows.append(("Orientation", f"Up is {float(solve['orientation']):.1f}° E of N"))
    if entry.get("versions"):
        img_rows.append(("Versions", ", ".join([entry.get("palette") or "Original"] + [v["label"] for v in entry["versions"]])))
    groups.append(("Image", img_rows))

    out = []
    for title, rows in groups:
        if not rows:
            continue
        dl = "".join(f'<div class="spec"><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>' for k, v in rows)
        out.append(f'<section class="card-group"><h3 class="label">{esc(title)}</h3><dl class="specs">{dl}</dl></section>')

    subs = acq.get("subs") or []
    if subs:
        rows = []
        for s in subs:
            try:
                count, secs = int(float(s.get("count") or 0)), float(s.get("seconds") or 0)
            except (TypeError, ValueError):
                count, secs = 0, 0
            secs_label = f"{secs:g} s" if secs < 60 else format_duration(int(secs))
            rows.append(
                f"<tr><td>{esc(s.get('filter', ''))}</td><td>{count} × {esc(secs_label)}</td>"
                f"<td>{esc(format_duration(int(count * secs)))}</td></tr>"
            )
        table = (
            '<section class="card-group"><h3 class="label">Subframes</h3>'
            '<table class="subs"><thead><tr><th>Filter</th><th>Subs</th><th>Total</th></tr></thead>'
            f"<tbody>{''.join(rows)}</tbody>"
            f'<tfoot><tr><td>Total</td><td></td><td>{esc(format_duration(total))}</td></tr></tfoot></table></section>'
        )
        out.insert(min(2, len(out)), table)
    return "\n".join(out)


def related_photos(entry: dict, images: list, db: dict, n: int = 4) -> list:
    """Nearest on the sky first (plate solve or catalogue position), then the old heuristics."""
    others = [e for e in images if e["id"] != entry["id"]]
    here = entry_coords(entry, db)

    def score(e):
        s = 0.0
        there = entry_coords(e, db) if here else None
        sep = angular_separation(here, there) if there else None
        if sep is not None:
            if sep < 3:
                s += 6
            elif sep < 10:
                s += 4
            elif sep < 25:
                s += 2
            s += max(0.0, 1 - sep / 180)   # tie-break: closer is better
        if e.get("constellation") and e["constellation"] == entry.get("constellation"):
            s += 2
        if e.get("category") == entry.get("category"):
            s += 1
        if e.get("type") == entry.get("type"):
            s += 1
        if e.get("palette") and e["palette"] == entry.get("palette"):
            s += 1
        return -s
    return sorted(others, key=score)[:n]


def stage_tools(entry: dict, db: dict) -> str:
    """Buttons under the photo: deep zoom, labels, grid, sky, versions. Enhanced by astro.js."""
    solve = entry.get("solve") or {}
    solved = solve.get("status") == "solved"
    has_tiles = bool((entry.get("tiles") or {}).get("main"))
    coords = entry_coords(entry, db)
    out = []
    if has_tiles:
        out.append('<button class="stage-tool" type="button" data-tool="zoom" title="Deep zoom (Z)">'
                   '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/>'
                   '<path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg><span>Deep zoom</span></button>')
    if solved and solve.get("annotations"):
        out.append('<button class="stage-tool" type="button" data-tool="labels" aria-pressed="false" title="Object labels (L)">'
                   '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/>'
                   '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg><span>Labels</span></button>')
    if solved and solve.get("wcs"):
        out.append('<button class="stage-tool" type="button" data-tool="grid" aria-pressed="false" title="RA/Dec grid (G)">'
                   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>'
                   '<span>Grid</span></button>')
    if (entry.get("mosaic") or {}).get("panels"):
        out.append('<button class="stage-tool" type="button" data-tool="panels" aria-pressed="false" title="Mosaic panels (P)">'
                   '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1"/>'
                   '<path d="M12 3v18M3 12h18"/></svg><span>Panels</span></button>')
    if coords:
        out.append('<button class="stage-tool" type="button" data-tool="sky" aria-pressed="false" title="Where it is on the sky (S)">'
                   '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/>'
                   '<path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg><span>Sky</span></button>')
    versions = entry.get("versions") or []
    if versions:
        main_label = entry.get("palette") or "Original"
        buttons = [f'<button type="button" data-version="main" class="is-on" aria-pressed="true">{esc(main_label)}</button>']
        buttons += [f'<button type="button" data-version="{esc(v["id"])}" aria-pressed="false">{esc(v["label"])}</button>'
                    for v in versions]
        out.append(f'<div class="stage-versions" role="group" aria-label="Versions">{"".join(buttons)}</div>')
    if solved and format_fov(solve.get("fov")):
        out.append(f'<span class="stage-fov label" title="Field of view, plate-solved">{esc(format_fov(solve["fov"]))}</span>')
    return "".join(out)


def mini_card(e: dict) -> str:
    src = e["sources"]["jpg"]
    small = src[0] if src else {"src": e["original"], "w": e["width"]}
    avif = e["sources"].get("avif") or []
    avif_src = f'<source type="image/avif" srcset="{srcset_attr(avif[:2])}" sizes="(max-width: 720px) 46vw, 23vw">' if avif else ""
    return (
        f'<a class="mini-card" href="/photo/{esc(e["id"])}/" style="--ph-color:{esc(e.get("color", "#000"))}">'
        f'<picture>{avif_src}<img src="/{esc(small["src"])}" srcset="{srcset_attr(src[:2])}" '
        f'sizes="(max-width: 720px) 46vw, 23vw" width="{e["width"]}" height="{e["height"]}" loading="lazy" decoding="async" alt="">'
        f'</picture><span class="mini-title">{esc(e["title"])}</span>'
        f'<span class="mini-sub">{esc(e.get("catalog", ""))}</span></a>'
    )


def render_pages(manifest: dict) -> None:
    if not TEMPLATE.exists():
        print(f"  !! template missing: {TEMPLATE}")
        return
    template = TEMPLATE.read_text(encoding="utf-8")
    db = load_celestial_db()
    visible = [e for e in manifest["images"] if e.get("visible", True)]
    site = manifest["settings"]["site"]
    written = set()

    for idx, entry in enumerate(visible):
        prev_e = visible[idx - 1] if idx > 0 else visible[-1]
        next_e = visible[(idx + 1) % len(visible)]
        jpg = entry["sources"]["jpg"]
        avif = entry["sources"].get("avif") or []
        biggest = jpg[-1] if jpg else {"src": entry["original"], "w": entry["width"], "h": entry["height"]}
        og = next((s for s in jpg if s["w"] >= 1200), biggest)
        alt = entry.get("alt") or ", ".join(x for x in (
            f"{entry['title']}" + (f" ({entry['catalog']})" if entry.get("catalog") else ""),
            entry.get("type", ""),
            f"in {entry['constellation']}" if entry.get("constellation") else "",
        ) if x)
        meta_bits = [b for b in (
            entry.get("catalog"),
            entry.get("constellation"),
            entry.get("distance"),
            format_duration(entry.get("integration_seconds", 0)) or (entry.get("acquisition") or {}).get("integration"),
            entry.get("palette"),
            format_date(entry.get("date", "")),
        ) if b]
        downloads = "".join(
            f'<li><a href="/{esc(d["url"])}" download>{esc(d["label"])}</a>'
            f'<span>{d["width"]:,} × {d["height"]:,} · {esc(human_bytes(d["bytes"]))}</span></li>'
            for d in entry.get("downloads", [])
        )
        badges = "".join(
            f'<a class="badge" href="{esc(b.get("url", "#"))}" rel="noopener">{esc(b.get("label", ""))}</a>'
            for b in entry.get("badges", []) if b.get("label")
        )
        description = entry.get("description", "")
        story_html = paragraphs(entry.get("story", ""))
        sky_link = (
            f'<a class="text-link" href="/explore.html?goto={esc(entry["skyTarget"])}">View on sky map</a>'
            if entry.get("skyTarget") else ""
        )
        json_ld = {
            "@context": "https://schema.org",
            "@type": "ImageObject",
            "name": entry["title"],
            "description": description,
            "contentUrl": f"{SITE_URL}/{biggest['src']}",
            "thumbnailUrl": f"{SITE_URL}/{jpg[0]['src'] if jpg else entry['original']}",
            "url": f"{SITE_URL}/photo/{entry['id']}/",
            "creator": {"@type": "Person", "name": SITE_NAME},
            "copyrightNotice": entry.get("licence") or site.get("licence", ""),
            "width": entry["width"],
            "height": entry["height"],
        }
        ctx = {
            "id": esc(entry["id"]),
            "title": esc(entry["title"]),
            "page_title": esc(f"{entry['title']} — {site.get('title', SITE_NAME)}"),
            "subtitle": esc(entry.get("subtitle", "")),
            "kicker": esc(" · ".join(x for x in (entry.get("type"), entry.get("constellation")) if x)),
            "description": esc(description or site.get("lede", "")),
            "description_html": paragraphs(description),
            "story_html": story_html,
            "has_text": "has-text" if (description or story_html) else "",
            "meta_html": "".join(f"<span>{esc(b)}</span>" for b in meta_bits),
            "canonical": esc(f"{SITE_URL}/photo/{entry['id']}/"),
            "og_image": esc(f"{SITE_URL}/{og['src']}"),
            "og_width": og["w"],
            "og_height": og["h"],
            "color": esc(entry.get("color", "#000")),
            "placeholder": esc(entry.get("placeholder", "")),
            "alt": esc(alt),
            "width": entry["width"],
            "height": entry["height"],
            "largest_jpg": esc("/" + biggest["src"]),
            "largest_w": biggest["w"],
            "largest_h": biggest["h"],
            "jpg_srcset": srcset_attr(jpg),
            "avif_source": f'<source type="image/avif" srcset="{srcset_attr(avif)}" sizes="(max-width: 900px) 100vw, 92vw">' if avif else "",
            "card_html": card_rows(entry, db),
            "downloads_html": downloads,
            "licence": esc(entry.get("licence") or site.get("licence", "")),
            "badges_html": badges,
            "sky_link": sky_link,
            "prev_id": esc(prev_e["id"]),
            "prev_title": esc(prev_e["title"]),
            "next_id": esc(next_e["id"]),
            "next_title": esc(next_e["title"]),
            "related_html": "".join(mini_card(e) for e in related_photos(entry, visible, db)),
            "stage_tools_html": stage_tools(entry, db),
            "has_tiles": "has-tiles" if (entry.get("tiles") or {}).get("main") else "",
            "tiles_base": esc((manifest["settings"].get("tiles") or {}).get("base", "")),
            "explore_link": esc(f"/explore.html?goto={entry['skyTarget']}") if entry.get("skyTarget") else "/explore.html",
            "json_ld": json.dumps(json_ld, ensure_ascii=False).replace("</", "<\\/"),
            "site_title": esc(site.get("title", SITE_NAME)),
            "instagram": esc(site.get("instagram", "")),
            "email": esc(site.get("email", "")),
            "year": datetime.now().year,
            "index": idx,
        }
        page = re.sub(r"\{\{(\w+)\}\}", lambda m: str(ctx.get(m.group(1), "")), template)
        out_dir = PHOTO_DIR / entry["id"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(page, encoding="utf-8")
        written.add(entry["id"])

    # Pages for photos no longer visible are removed
    if PHOTO_DIR.exists():
        for d in PHOTO_DIR.iterdir():
            if d.is_dir() and d.name not in written:
                for f in d.iterdir():
                    f.unlink()
                d.rmdir()
                print(f"  -- removed page for hidden/removed photo {d.name}")

    urls = [f"{SITE_URL}/", f"{SITE_URL}/explore.html"] + [f"{SITE_URL}/photo/{e['id']}/" for e in visible]
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sitemap += "".join(f"  <url><loc>{esc(u)}</loc></url>\n" for u in urls) + "</urlset>\n"
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    print(f"  photo pages: {len(written)}; sitemap: {len(urls)} urls")


# ----------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="regenerate derivative files even if they exist")
    parser.add_argument("--no-pages", action="store_true", help="skip rendering photo pages")
    parser.add_argument("--no-tiles", action="store_true", help="skip building deep-zoom pyramids")
    parser.add_argument("--no-solve", action="store_true", help="never contact astrometry.net, even with a key")
    parser.add_argument("--solve-limit", type=int, default=3,
                        help="plate-solve at most N unsolved photos per run (default 3; 0 = no limit)")
    parser.add_argument("--resolve", action="append", default=[], metavar="ID",
                        help="re-solve this photo even if it already has a solve")
    args = parser.parse_args()

    previous = {}
    if MANIFEST.exists():
        previous = json.loads(MANIFEST.read_text(encoding="utf-8"))

    print("Portfolio derivatives (gallery/_web) and tiles (tiles/):")
    manifest = build_portfolio(args.force, previous, tiles=not args.no_tiles)

    print("Explore derivatives (images/_web):")
    build_explore_derivatives(args.force)

    api_key = os.environ.get("ASTROMETRY_API_KEY", "").strip()
    if api_key and not args.no_solve:
        print("Plate solving (nova.astrometry.net):")
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from solve import solve_entries  # noqa: E402  (tools/solve.py)
        solve_entries(manifest["images"], api_key, ROOT, load_celestial_db(),
                      limit=args.solve_limit, force_ids=set(args.resolve))
    elif args.resolve:
        print("  !! --resolve needs ASTROMETRY_API_KEY in the environment")

    # Keep the previous timestamp when nothing else changed, so a no-op build
    # (the GitHub Action after a merge, for example) does not create a commit.
    strip = lambda m: {k: v for k, v in m.items() if k != "updated"}
    if previous and strip(previous) == strip(manifest):
        manifest["updated"] = previous.get("updated", manifest["updated"])
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if not args.no_pages:
        print("Photo pages (photo/<id>/index.html):")
        render_pages(manifest)

    total = sum(f.stat().st_size for f in GALLERY_WEB.glob("*") if f.is_file()) / 1e6
    tiles_total = sum(f.stat().st_size for f in TILES_DIR.rglob("*") if f.is_file()) / 1e6 if TILES_DIR.exists() else 0
    solved = sum(1 for e in manifest["images"] if (e.get("solve") or {}).get("status") == "solved")
    print(f"\nWrote gallery.json v3 with {len(manifest['images'])} images ({solved} plate-solved); "
          f"gallery/_web {total:.1f} MB; tiles {tiles_total:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
