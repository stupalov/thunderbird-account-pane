#!/usr/bin/env python3
"""Generate dist/updates.json (WebExtension update manifest) from the built XPI."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

REPOSITORY = "stupalov/thunderbird-account-pane"
ADDON_ID = "accountpane@stupalov.github.io"


def require(condition):
    if not condition:
        raise ValueError("ACCOUNTPANE_UPDATE_INVALID_INPUT")


def generate(root, xpi=None):
    dist = root / "dist"
    if xpi is None:
        candidates = sorted(p for p in dist.glob("accountpane-*.xpi") if not p.name.endswith("-atn.xpi"))
        require(len(candidates) == 1)
        xpi = candidates[0]
    require(xpi.is_file() and not xpi.is_symlink())
    data = xpi.read_bytes()
    with zipfile.ZipFile(xpi) as archive:
        manifest = json.loads(archive.read("manifest.json"))
    gecko = manifest["browser_specific_settings"]["gecko"]
    version = manifest["version"]
    require(gecko["id"] == ADDON_ID)
    # The catalogue variant has no update_url and must never be published here.
    require(gecko.get("update_url", "").endswith("/updates.json"))
    require(xpi.name == f"accountpane-{version}.xpi")
    document = {"addons": {ADDON_ID: {"updates": [{
        "version": version,
        "update_link": f"https://github.com/{REPOSITORY}/releases/download/v{version}/{xpi.name}",
        "update_hash": "sha256:" + hashlib.sha256(data).hexdigest(),
        "applications": {"gecko": {"strict_min_version": gecko["strict_min_version"],
                                   "strict_max_version": gecko["strict_max_version"]}},
    }]}}}
    output = dist / "updates.json"
    require(not output.is_symlink())
    output.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    return output


if __name__ == "__main__":
    try:
        args = sys.argv[1:]
        require(len(args) <= 1)
        print(generate(Path(__file__).resolve().parents[1], Path(args[0]) if args else None))
    except Exception:
        print("ACCOUNTPANE_UPDATE_INVALID_INPUT", file=sys.stderr)
        sys.exit(1)
