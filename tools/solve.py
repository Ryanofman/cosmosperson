#!/usr/bin/env python3
"""
Plate-solve portfolio photos with nova.astrometry.net and keep the result in gallery.json.

tools/build.py calls this when ASTROMETRY_API_KEY is set. It also runs on its own:

    ASTROMETRY_API_KEY=... python tools/solve.py               # solve what is unsolved (3 per run)
    ASTROMETRY_API_KEY=... python tools/solve.py --id eagle    # (re)solve one photo
    ASTROMETRY_API_KEY=... python tools/solve.py --limit 0     # everything that is unsolved

All photos of a run are uploaded first and solved side by side on the server, so a
run takes a few minutes rather than a few minutes per photo.

What is uploaded: the 1600 px web JPEG of each photo (already public on the site,
no EXIF), submitted as *not publicly visible* on astrometry.net.

What is stored, per photo, under "solve": the field centre and radius, pixel scale,
orientation, field of view, a TAN WCS for the solved image, the catalogue objects
in the field, and label positions converted to original-image pixels. Failed
solves are recorded and retried once on a later run, then left alone until
--id / --resolve. Standard library only. The key is never written anywhere.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import mimetypes
import os
import re
import statistics
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request

API = "https://nova.astrometry.net/api/"
WCS_URL = "https://nova.astrometry.net/wcs_file/{job}"
ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "gallery.json"
SOLVE_IMAGE_EDGE = 1600
DEFAULT_TIMEOUT = 900       # seconds to wait for the whole batch
POLL_SECONDS = 15
MAX_ATTEMPTS = 2            # a failed photo is retried once on a later run
MAX_POLL_ERRORS = 4         # transient network errors tolerated per photo while waiting
MAX_LABELS = 80
LABEL_PRIORITY = {"messier": 0, "ngc": 1, "ic": 2, "bright": 3, "sh2": 4, "abell": 4, "ldn": 5, "lbn": 5}
SKIP_LABEL_TYPES = {"hd"}   # thousands of catalogue stars; too dense to be useful


class SolveError(Exception):
    pass


# ----------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------

def _post(path: str, payload: dict, files: dict | None = None) -> dict:
    url = API + path
    if files:
        boundary = "----cosmosperson" + uuid.uuid4().hex
        body = io.BytesIO()

        def field(name: str, value: str) -> None:
            body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())

        field("request-json", json.dumps(payload))
        for name, (filename, data, ctype) in files.items():
            body.write((f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
                        f"filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n").encode())
            body.write(data)
            body.write(b"\r\n")
        body.write(f"--{boundary}--\r\n".encode())
        req = request.Request(url, data=body.getvalue(),
                              headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    else:
        data = parse.urlencode({"request-json": json.dumps(payload)}).encode()
        req = request.Request(url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with request.urlopen(req, timeout=180) as resp:
        out = json.loads(resp.read().decode("utf-8"))
    if out.get("status") == "error":
        raise SolveError(out.get("errormessage") or str(out))
    return out


def _get(path: str) -> dict:
    with request.urlopen(API + path, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def login(apikey: str) -> str:
    out = _post("login", {"apikey": apikey})
    if not out.get("session"):
        raise SolveError("login failed (check ASTROMETRY_API_KEY)")
    return out["session"]


def submit(session: str, image_path: Path, hints: dict | None = None) -> int:
    payload = {
        "session": session,
        "publicly_visible": "n",
        "allow_modifications": "n",
        "allow_commercial_use": "n",
        "tweak_order": 2,
    }
    if hints:
        payload.update(hints)
    ctype = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    out = _post("upload", payload, files={"file": (image_path.name, image_path.read_bytes(), ctype)})
    if not out.get("subid"):
        raise SolveError(f"upload failed: {out}")
    return int(out["subid"])


def fetch_results(jobid: int) -> dict:
    calibration = _get(f"jobs/{jobid}/calibration")
    annotations = _get(f"jobs/{jobid}/annotations").get("annotations", [])
    objects = _get(f"jobs/{jobid}/objects_in_field").get("objects_in_field", [])
    try:
        cards = fetch_wcs_cards(jobid)
    except (error.URLError, OSError) as exc:
        print(f"     !! WCS file not available ({exc}); grid and footprint will be missing")
        cards = {}
    return {"calibration": calibration, "annotations": annotations, "objects": objects, "wcs_cards": cards}


# ----------------------------------------------------------------------------
# WCS (TAN projection; SIP distortion terms are ignored, fine for an overlay)
# ----------------------------------------------------------------------------

def fetch_wcs_cards(jobid: int) -> dict:
    with request.urlopen(WCS_URL.format(job=jobid), timeout=60) as resp:
        raw = resp.read()
    cards: dict = {}
    for i in range(0, len(raw), 80):
        card = raw[i:i + 80].decode("ascii", "replace")
        key = card[:8].strip()
        if key == "END":
            break
        if card[8:10] != "= ":
            continue
        value = card[10:]
        if value.lstrip().startswith("'"):
            value = value.split("'")[1].strip()
        else:
            value = value.split("/")[0].strip()
            try:
                value = float(value) if re.search(r"[.eE]", value) else int(value)
            except ValueError:
                pass
        cards[key] = value
    return cards


def wcs_from_cards(cards: dict, width: int, height: int) -> dict | None:
    try:
        if "CD1_1" in cards:
            cd = [[float(cards["CD1_1"]), float(cards.get("CD1_2", 0.0))],
                  [float(cards.get("CD2_1", 0.0)), float(cards["CD2_2"])]]
        else:
            cdelt1, cdelt2 = float(cards["CDELT1"]), float(cards["CDELT2"])
            rot = math.radians(float(cards.get("CROTA2", 0.0)))
            cd = [[cdelt1 * math.cos(rot), -cdelt2 * math.sin(rot)],
                  [cdelt1 * math.sin(rot), cdelt2 * math.cos(rot)]]
        return {
            "width": int(cards.get("IMAGEW") or width),
            "height": int(cards.get("IMAGEH") or height),
            "crpix": [float(cards["CRPIX1"]), float(cards["CRPIX2"])],
            "crval": [float(cards["CRVAL1"]), float(cards["CRVAL2"])],
            "cd": cd,
            "flip_y": False,
        }
    except (KeyError, ValueError, TypeError):
        return None


def pix2sky(wcs: dict, x: float, y: float) -> tuple[float, float]:
    """Solved-image pixel (0-based, top-left origin) to (ra, dec) in degrees."""
    if wcs.get("flip_y"):
        y = wcs["height"] - 1 - y
    dx, dy = x + 1 - wcs["crpix"][0], y + 1 - wcs["crpix"][1]
    (a, b), (c, d) = wcs["cd"]
    xi, eta = math.radians(a * dx + b * dy), math.radians(c * dx + d * dy)
    ra0, dec0 = math.radians(wcs["crval"][0]), math.radians(wcs["crval"][1])
    den = math.cos(dec0) - eta * math.sin(dec0)
    ra = ra0 + math.atan2(xi, den)
    dec = math.atan2(eta * math.cos(dec0) + math.sin(dec0), math.hypot(xi, den))
    return math.degrees(ra) % 360, math.degrees(dec)


def sky2pix(wcs: dict, ra: float, dec: float) -> tuple[float, float] | None:
    ra0, dec0 = math.radians(wcs["crval"][0]), math.radians(wcs["crval"][1])
    r, d = math.radians(ra), math.radians(dec)
    cosc = math.sin(d) * math.sin(dec0) + math.cos(d) * math.cos(dec0) * math.cos(r - ra0)
    if cosc <= 0:
        return None
    xi = math.degrees(math.cos(d) * math.sin(r - ra0) / cosc)
    eta = math.degrees((math.sin(d) * math.cos(dec0) - math.cos(d) * math.sin(dec0) * math.cos(r - ra0)) / cosc)
    (a, b), (c, dd) = wcs["cd"]
    det = a * dd - b * c
    if not det:
        return None
    dx = (dd * xi - b * eta) / det
    dy = (-c * xi + a * eta) / det
    x, y = dx + wcs["crpix"][0] - 1, dy + wcs["crpix"][1] - 1
    if wcs.get("flip_y"):
        y = wcs["height"] - 1 - y
    return x, y


def lookup(db: dict, name: str):
    key = str(name).replace(" ", "").upper()
    if key in db:
        return db[key]
    return db.get(re.sub(r"^(SH2|SH)-?", "SH2-", key))


def needs_flip(wcs: dict, annotations: list, db: dict) -> bool:
    """astrometry.net's WCS is defined on the image as uploaded. Check against known
    objects whether pixel rows count from the top (expected) or the bottom."""
    plain, flipped = [], []
    for ann in annotations:
        pos = next((p for p in (lookup(db, n) for n in ann.get("names", [])) if p), None)
        if not pos:
            continue
        for flip, store in ((False, plain), (True, flipped)):
            p = sky2pix({**wcs, "flip_y": flip}, *pos)
            if p:
                store.append(math.hypot(p[0] - float(ann["pixelx"]), p[1] - float(ann["pixely"])))
    if plain and flipped:
        return statistics.median(flipped) < statistics.median(plain) * 0.5
    return False


# ----------------------------------------------------------------------------
# Building the stored record
# ----------------------------------------------------------------------------

def pick_image(entry: dict, root: Path):
    jpgs = (entry.get("sources") or {}).get("jpg") or []
    pick = next((s for s in jpgs if max(s["w"], s["h"]) == SOLVE_IMAGE_EDGE), None) or (jpgs[-1] if jpgs else None)
    if not pick:
        raise SolveError("no web JPEG to upload; run the build first")
    path = root / pick["src"]
    if not path.exists():
        raise SolveError(f"web JPEG missing: {pick['src']}")
    return pick, path, int(pick["w"]), int(pick["h"])


def build_solve(entry: dict, pick: dict, sw: int, sh: int, subid: int, jobid: int, result: dict, db: dict) -> dict:
    cal = result["calibration"]
    scale = entry["width"] / sw                       # solved px -> original px
    wcs = wcs_from_cards(result["wcs_cards"], sw, sh) if result["wcs_cards"] else None
    raw = [a for a in result["annotations"] if str(a.get("type", "")).lower() not in SKIP_LABEL_TYPES]
    raw.sort(key=lambda a: LABEL_PRIORITY.get(str(a.get("type", "")).lower(), 9))
    if wcs and needs_flip(wcs, raw, db):
        wcs["flip_y"] = True
        print("     (pixel rows count from the bottom in this WCS; flagged)")
    labels = [{
        "names": [str(n) for n in a.get("names", [])][:3],
        "type": str(a.get("type", "")),
        "x": round(float(a["pixelx"]) * scale),
        "y": round(float(a["pixely"]) * scale),
        "r": round(float(a.get("radius") or 0) * scale),
    } for a in raw[:MAX_LABELS] if "pixelx" in a and "pixely" in a]

    solve = {
        "status": "solved",
        "solved_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "service": "nova.astrometry.net",
        "submission": subid,
        "job": jobid,
        "image": {"src": pick["src"], "w": sw, "h": sh},
        "ra": round(float(cal["ra"]), 6),
        "dec": round(float(cal["dec"]), 6),
        "radius": round(float(cal.get("radius", 0)), 4),
        "pixscale": round(float(cal["pixscale"]) / scale, 5),          # arcsec per ORIGINAL pixel
        "orientation": round(float(cal.get("orientation", 0)), 3),
        "parity": cal.get("parity"),
        "fov": [round(float(cal.get("width_arcsec", 0)) / 3600, 5),
                round(float(cal.get("height_arcsec", 0)) / 3600, 5)],
        "objects": [str(o) for o in result["objects"]],
        "annotations": labels,
    }
    if wcs:
        solve["wcs"] = wcs
    return solve


def record_failure(entry: dict, exc: Exception) -> None:
    prev = entry.get("solve") or {}
    attempts = int(prev.get("attempts", 0)) + 1 if prev.get("status") == "failed" else 1
    entry["solve"] = {"status": "failed", "attempts": attempts, "reason": str(exc)[:200],
                      "last_tried": datetime.now(timezone.utc).strftime("%Y-%m-%d")}
    print(f"     !! {entry['id']}: not solved: {exc}")


# ----------------------------------------------------------------------------
# A batch
# ----------------------------------------------------------------------------

def solve_entries(images: list, apikey: str, root: Path, db: dict, limit: int = 3,
                  force_ids: set | None = None, timeout: float = DEFAULT_TIMEOUT) -> int:
    force_ids = set(force_ids or ())
    todo = []
    for e in images:
        s = e.get("solve") or {}
        if e["id"] in force_ids:
            todo.append(e)
            continue
        if not e.get("visible", True) or e.get("missing_original"):
            continue
        if s.get("status") == "solved":
            continue
        if s.get("status") == "failed" and int(s.get("attempts", 0)) >= MAX_ATTEMPTS:
            continue
        todo.append(e)
    if limit and limit > 0:
        todo = todo[:limit]
    if not todo:
        print("  nothing to solve")
        return 0

    try:
        session = login(apikey)
    except (SolveError, error.URLError, OSError, json.JSONDecodeError) as exc:
        print(f"  !! astrometry.net login failed: {exc}")
        return 0

    pending: dict = {}
    for e in todo:
        try:
            pick, path, sw, sh = pick_image(e, root)
            subid = submit(session, path)
            pending[e["id"]] = {"entry": e, "pick": pick, "sw": sw, "sh": sh, "subid": subid, "jobid": None, "errors": 0}
            print(f"  {e['id']}: uploaded {path.name} (submission {subid})")
        except (SolveError, error.URLError, OSError, json.JSONDecodeError, KeyError, ValueError) as exc:
            record_failure(e, exc)
    if not pending:
        return 0

    print(f"  waiting for {len(pending)} solve(s), up to {int(timeout // 60)} min …")
    deadline = time.time() + timeout
    done = 0
    while pending and time.time() < deadline:
        for pid, p in list(pending.items()):
            try:
                if p["jobid"] is None:
                    sub = _get(f"submissions/{p['subid']}")
                    jobs = [j for j in (sub.get("jobs") or []) if j]
                    if not jobs:
                        continue
                    p["jobid"] = int(jobs[0])
                status = _get(f"jobs/{p['jobid']}").get("status")
                if status == "success":
                    result = fetch_results(p["jobid"])
                    p["entry"]["solve"] = build_solve(p["entry"], p["pick"], p["sw"], p["sh"],
                                                      p["subid"], p["jobid"], result, db)
                    sv = p["entry"]["solve"]
                    print(f"  {pid}: solved — RA {sv['ra']:.3f} Dec {sv['dec']:+.3f}, "
                          f"field {sv['fov'][0]:.2f}° × {sv['fov'][1]:.2f}°, {len(sv['annotations'])} labels")
                    done += 1
                    del pending[pid]
                elif status == "failure":
                    record_failure(p["entry"], SolveError(f"the solver gave up (job {p['jobid']})"))
                    del pending[pid]
            except (SolveError, KeyError, ValueError) as exc:
                record_failure(p["entry"], exc)
                del pending[pid]
            except (error.URLError, OSError, json.JSONDecodeError) as exc:
                p["errors"] += 1
                if p["errors"] >= MAX_POLL_ERRORS:
                    record_failure(p["entry"], exc)
                    del pending[pid]
        if pending:
            time.sleep(POLL_SECONDS)
    for pid, p in pending.items():
        record_failure(p["entry"], SolveError(f"timed out waiting (submission {p['subid']})"))
    return done


# ----------------------------------------------------------------------------

def _load_db() -> dict:
    """Same catalogue as build.py uses, parsed from celestial-database.js."""
    path = ROOT / "celestial-database.js"
    db: dict = {}
    if path.exists():
        line = re.compile(r"""['"]([^'"]+)['"]\s*:\s*\{\s*ra:\s*([-\d.]+)\s*,\s*dec:\s*([-\d.]+)""")
        for key, ra, dec in line.findall(path.read_text(encoding="utf-8")):
            db[key.replace(" ", "").upper()] = (float(ra), float(dec))
    return db


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--id", action="append", default=[], help="photo id to (re)solve; repeatable")
    parser.add_argument("--limit", type=int, default=3, help="max photos per run (0 = no limit)")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="seconds to wait for the batch")
    args = parser.parse_args()

    apikey = os.environ.get("ASTROMETRY_API_KEY", "").strip()
    if not apikey:
        print("Set ASTROMETRY_API_KEY (from https://nova.astrometry.net/api_help) first.")
        return 2
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    done = solve_entries(manifest["images"], apikey, ROOT, _load_db(),
                         limit=args.limit, force_ids=set(args.id), timeout=args.timeout)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\n{done} photo(s) solved; gallery.json updated. Run python tools/build.py to refresh the pages.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
