#!/usr/bin/env python3
"""
Build web derivatives and the enriched gallery.json manifest for cosmosperson.com

- Reads originals from gallery/ (the curated portfolio) and images/ (explore-map captures)
- Writes resized JPEG derivatives to gallery/_web/ and images/_web/
- Writes gallery.json (schema v2) with titles, catalog data, blur-up placeholders,
  dominant colors, dimensions and srcset entries.

Idempotent: re-running preserves any hand-edited fields in an existing v2 gallery.json
(title, description, capture details, visibility, order, hero) and only regenerates
image data. Use --force to rebuild derivative files that already exist.
"""

import argparse
import base64
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
GALLERY_DIR = ROOT / "gallery"
IMAGES_DIR = ROOT / "images"
GALLERY_WEB = GALLERY_DIR / "_web"
IMAGES_WEB = IMAGES_DIR / "_web"
MANIFEST = ROOT / "gallery.json"

# Long-edge targets for portfolio derivatives (grid + lightbox)
SIZES = [800, 1600, 2600]
# Long-edge target for explore-map photo viewer derivatives
EXPLORE_SIZE = 1600
JPEG_QUALITY = 82
PLACEHOLDER_EDGE = 32

Image.MAX_IMAGE_PIXELS = None  # large mosaics are expected and trusted (local files)

# Curated metadata for the current portfolio, keyed by original filename.
# New uploads get their metadata through the admin interface instead.
ENRICH = {
    "SH2-142_Original_2XUpsampled.jpg": {
        "id": "wizard",
        "title": "The Wizard Nebula",
        "catalog": "NGC 7380 · Sh2-142",
        "type": "Emission Nebula",
        "category": "nebulae",
        "constellation": "Cepheus",
        "distance": "≈ 7,200 light-years",
        "skyTarget": "NGC 7380",
        "description": "An open cluster sculpting the cloud that birthed it, its gas carved by radiation into a conjurer's silhouette.",
    },
    "California_2xUpsampled_reddragon.jpg": {
        "id": "california",
        "title": "The California Nebula",
        "catalog": "NGC 1499",
        "type": "Emission Nebula",
        "category": "nebulae",
        "constellation": "Perseus",
        "distance": "≈ 1,000 light-years",
        "skyTarget": "NGC 1499",
        "description": "A drifting ribbon of hydrogen nearly one hundred light-years long, set aglow by the ultraviolet light of the star Menkib.",
    },
    "Butterfly_Mosaic_Original_2X Upsampled.jpg": {
        "id": "butterfly",
        "title": "The Butterfly Nebula",
        "catalog": "IC 1318",
        "type": "Emission Nebula",
        "category": "nebulae",
        "constellation": "Cygnus",
        "distance": "≈ 4,000 light-years",
        "skyTarget": "IC 1318",
        "description": "Wings of glowing hydrogen parted by a dark lane of dust, spread around the supergiant star Sadr at the heart of the Swan.",
    },
    "IC_63_Phoenix_3XUpsampled.jpg": {
        "id": "ghost-of-cassiopeia",
        "title": "The Ghost of Cassiopeia",
        "catalog": "IC 63",
        "type": "Emission Nebula",
        "category": "nebulae",
        "constellation": "Cassiopeia",
        "distance": "≈ 550 light-years",
        "skyTarget": "IC 63",
        "description": "A windblown apparition of gas and dust, slowly eroded by the blazing star Gamma Cassiopeiae a few light-years away.",
    },
    "Whirlpool-GrandCanyonMesaVerde-Upsampled3x.jpg": {
        "id": "whirlpool",
        "title": "The Whirlpool Galaxy",
        "catalog": "Messier 51",
        "type": "Spiral Galaxy",
        "category": "galaxies",
        "constellation": "Canes Venatici",
        "distance": "≈ 23 million light-years",
        "skyTarget": "M51",
        "description": "A grand-design spiral locked in a gravitational embrace with its companion, its arms alight with star formation stirred by the encounter.",
    },
    "North_3xResampled.jpg": {
        "id": "north-america",
        "title": "The North America Nebula",
        "catalog": "NGC 7000",
        "type": "Emission Nebula",
        "category": "nebulae",
        "constellation": "Cygnus",
        "distance": "≈ 2,600 light-years",
        "skyTarget": "NGC 7000",
        "description": "Dark rivers of dust carve a familiar continental outline into a vast field of glowing hydrogen near Deneb.",
    },
    "M101_3xUpsmpled.jpg": {
        "id": "pinwheel",
        "title": "The Pinwheel Galaxy",
        "catalog": "Messier 101",
        "type": "Spiral Galaxy",
        "category": "galaxies",
        "constellation": "Ursa Major",
        "distance": "≈ 21 million light-years",
        "skyTarget": "M101",
        "description": "A face-on spiral nearly twice the breadth of the Milky Way, its arms studded with immense star-forming regions.",
    },
    "Thor_Original_2XUpsampled.jpg": {
        "id": "thors-helmet",
        "title": "Thor's Helmet",
        "catalog": "NGC 2359",
        "type": "Wolf-Rayet Nebula",
        "category": "nebulae",
        "constellation": "Canis Major",
        "distance": "≈ 12,000 light-years",
        "skyTarget": "NGC 2359",
        "description": "A winged bubble blown by the ferocious wind of a Wolf-Rayet star — a massive sun in the brief, brilliant act before supernova.",
    },
    "CometMinimalV1_2xUpsampled.jpg": {
        "id": "comet",
        "title": "The Comet",
        "catalog": "Solar System",
        "type": "Comet",
        "category": "solar-system",
        "constellation": "",
        "distance": "",
        "skyTarget": "",
        "description": "A visitor from the cold outer solar system, its tail swept back by sunlight and the solar wind.",
    },
    "IC434_Original_Finalized_2xUpsampled.jpg": {
        "id": "horsehead",
        "title": "The Horsehead Nebula",
        "catalog": "IC 434 · Barnard 33",
        "type": "Dark Nebula",
        "category": "nebulae",
        "constellation": "Orion",
        "distance": "≈ 1,400 light-years",
        "skyTarget": "IC 434",
        "description": "The sky's most famous silhouette — a cold pillar of dust a light-year tall, backlit by a curtain of glowing hydrogen.",
    },
    "M78_3xUpsampled_W.jpg": {
        "id": "m78",
        "title": "Messier 78",
        "catalog": "M 78",
        "type": "Reflection Nebula",
        "category": "nebulae",
        "constellation": "Orion",
        "distance": "≈ 1,300 light-years",
        "skyTarget": "M78",
        "description": "The sky's brightest reflection nebula: starlight scattered blue through veils of dust at the edge of the Orion complex.",
    },
    "NGC281.JPG": {
        "id": "pacman",
        "title": "The Pacman Nebula",
        "catalog": "NGC 281",
        "type": "Emission Nebula",
        "category": "nebulae",
        "constellation": "Cassiopeia",
        "distance": "≈ 9,200 light-years",
        "skyTarget": "NGC 281",
        "description": "A pocket of vigorous star birth, its dark dust lanes and Bok globules etched against ionized hydrogen.",
    },
    "Soul_3xUpsampled_Original.jpg": {
        "id": "soul",
        "title": "The Soul Nebula",
        "catalog": "IC 1848",
        "type": "Emission Nebula",
        "category": "nebulae",
        "constellation": "Cassiopeia",
        "distance": "≈ 6,500 light-years",
        "skyTarget": "IC 1848",
        "description": "A vast stellar nursery in the Perseus Arm, its hollows carved by the winds of newborn star clusters.",
    },
    "NGC_6992_Interpret_Mosaic_3xUpsampled.jpg": {
        "id": "eastern-veil",
        "title": "The Eastern Veil Nebula",
        "catalog": "NGC 6992",
        "type": "Supernova Remnant",
        "category": "nebulae",
        "constellation": "Cygnus",
        "distance": "≈ 2,400 light-years",
        "skyTarget": "NGC 6992",
        "description": "The luminous eastern arc of the Cygnus Loop — the still-expanding shockwave of a star that died millennia ago.",
    },
    "Iris_Finalized_3xUpsampled.jpg": {
        "id": "iris",
        "title": "The Iris Nebula",
        "catalog": "NGC 7023",
        "type": "Reflection Nebula",
        "category": "nebulae",
        "constellation": "Cepheus",
        "distance": "≈ 1,300 light-years",
        "skyTarget": "NGC 7023",
        "description": "Petals of dust unfolding in blue around a hot young star, deep inside a dark molecular cloud.",
    },
}

EMPTY_CAPTURE = {
    "telescope": "",
    "camera": "",
    "mount": "",
    "filters": "",
    "integration": "",
    "date": "",
    "location": "",
}


def load_image(path: Path) -> Image.Image:
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    if img.mode != "RGB":
        img = img.convert("RGB")
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
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True)


def make_placeholder(img: Image.Image) -> str:
    tiny = resize_long_edge(img, PLACEHOLDER_EDGE)
    buf = io.BytesIO()
    tiny.save(buf, "JPEG", quality=45)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def average_color(img: Image.Image) -> str:
    px = img.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    # Darken slightly so it works as a card backdrop behind light text
    r, g, b = (max(0, int(c * 0.6)) for c in px[:3])
    return f"#{r:02x}{g:02x}{b:02x}"


def slugify(name: str) -> str:
    out = []
    for ch in name.lower():
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-") or "photo"


def build_portfolio(force: bool, previous: dict) -> dict:
    prev_by_id = {img["id"]: img for img in previous.get("images", [])} if previous.get("version") == 2 else {}
    prev_order = [img["id"] for img in previous.get("images", [])] if prev_by_id else []

    # v1 manifest provides the initial ordering and the file list
    v1_entries = previous.get("gallery") if previous.get("version") != 2 else None
    if v1_entries:
        filenames = [e["filename"] for e in v1_entries]
    elif prev_by_id:
        filenames = [prev_by_id[i]["original"].split("/", 1)[1] for i in prev_order if prev_by_id[i].get("original")]
    else:
        filenames = sorted(p.name for p in GALLERY_DIR.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})

    images = []
    for filename in filenames:
        src = GALLERY_DIR / filename
        if not src.exists():
            print(f"  !! missing original, skipping: {filename}")
            continue

        meta = ENRICH.get(filename, {})
        img_id = meta.get("id") or slugify(Path(filename).stem)
        prev = prev_by_id.get(img_id, {})

        img = load_image(src)
        w, h = img.size

        srcset = []
        for target in SIZES:
            out_path = GALLERY_WEB / f"{img_id}-{target}.jpg"
            derived = resize_long_edge(img, target)
            if force or not out_path.exists():
                save_jpeg(derived, out_path)
            srcset.append({"src": f"gallery/_web/{out_path.name}", "w": derived.size[0]})
            if max(img.size) <= target:
                break  # never upscale; stop at the first size that covers the original

        entry = {
            "id": img_id,
            "title": prev.get("title") or meta.get("title") or Path(filename).stem,
            "catalog": prev.get("catalog", meta.get("catalog", "")),
            "type": prev.get("type", meta.get("type", "Deep Sky Object")),
            "category": prev.get("category", meta.get("category", "nebulae")),
            "constellation": prev.get("constellation", meta.get("constellation", "")),
            "distance": prev.get("distance", meta.get("distance", "")),
            "description": prev.get("description", meta.get("description", "")),
            "skyTarget": prev.get("skyTarget", meta.get("skyTarget", "")),
            "visible": prev.get("visible", True),
            "capture": {**EMPTY_CAPTURE, **prev.get("capture", {})},
            "original": f"gallery/{filename}",
            "width": w,
            "height": h,
            "placeholder": make_placeholder(img),
            "color": average_color(img),
            "srcset": srcset,
        }
        images.append(entry)
        print(f"  ok {img_id:<22} {w}x{h}  {len(srcset)} sizes")

    # Preserve any previous explicit ordering of ids
    if prev_order:
        rank = {img_id: i for i, img_id in enumerate(prev_order)}
        images.sort(key=lambda e: rank.get(e["id"], len(rank)))

    settings = previous.get("settings", {}) if previous.get("version") == 2 else {}
    hero = settings.get("hero")
    if hero not in {e["id"] for e in images}:
        hero = "california" if any(e["id"] == "california" for e in images) else (images[0]["id"] if images else "")

    return {
        "version": 2,
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "settings": {"hero": hero},
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
            count += 1
            continue
        try:
            img = load_image(src)
        except Exception as exc:  # corrupt/unreadable file shouldn't kill the build
            print(f"  !! unreadable, skipping: {src.name} ({exc})")
            continue
        save_jpeg(resize_long_edge(img, EXPLORE_SIZE), out_path)
        count += 1
    print(f"  ok explore viewer derivatives: {count}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="regenerate derivative files even if they exist")
    args = parser.parse_args()

    previous = {}
    if MANIFEST.exists():
        previous = json.loads(MANIFEST.read_text())

    print("Portfolio derivatives (gallery/_web):")
    manifest = build_portfolio(args.force, previous)

    print("Explore derivatives (images/_web):")
    build_explore_derivatives(args.force)

    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    total = sum(f.stat().st_size for f in GALLERY_WEB.glob("*.jpg")) / 1e6
    print(f"\nWrote gallery.json v2 with {len(manifest['images'])} images; gallery/_web totals {total:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
