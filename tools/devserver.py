#!/usr/bin/env python3
"""Static dev server with caching disabled — so edits show up on every reload.

Serves the site root, with /photo/<id>/ resolving to its index.html, and the
MIME types the build produces (AVIF, SVG, JSON, ES modules).
"""
import http.server
import mimetypes
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

mimetypes.add_type("image/avif", ".avif")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/manifest+json", ".webmanifest")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter console: only non-200s
        if len(args) >= 2 and str(args[1]).startswith(("2", "3")):
            return
        super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    os.chdir(ROOT)
    print(f"Serving on http://127.0.0.1:{port}/")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
