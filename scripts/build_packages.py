#!/usr/bin/env python3
"""Build the Chrome and Firefox release zips from a git revision."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path


MANIFEST = "manifest.json"

CHROME_ZIP = "Better-TID-tools.zip"
FIREFOX_ZIP = "Better-TID-tools-firefox.zip"

# Files that are part of the repository but not of the shipped extension.
EXCLUDE_PATTERN = re.compile(r"^(\.github/|scripts/|README\.md$|\.gitignore$|\.gitattributes$)")

# Firefox-only manifest keys. Chrome warns about unknown keys, so they are added only to the Firefox build.
# The add-on ID must never change once the extension is published on AMO.
FIREFOX_SETTINGS = {
    "gecko": {
        "id": "better-tid-tools@uliboooo.github.io",
        "strict_min_version": "128.0",
        "data_collection_permissions": {"required": ["none"]},
    }
}


def git_stdout(repo_root: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", *args], cwd=repo_root, check=True, stdout=subprocess.PIPE
    )
    return result.stdout


def list_files(repo_root: Path, revision: str) -> list[str]:
    output = git_stdout(repo_root, "ls-tree", "-r", "--name-only", "-z", revision)
    names = [name for name in output.decode("utf-8").split("\0") if name]
    return [name for name in names if not EXCLUDE_PATTERN.match(name)]


def read_blob(repo_root: Path, revision: str, path: str) -> bytes:
    return git_stdout(repo_root, "cat-file", "blob", f"{revision}:{path}")


def build_firefox_manifest(chrome_manifest: dict) -> bytes:
    if "browser_specific_settings" in chrome_manifest:
        raise ValueError(f"{MANIFEST} must not contain browser_specific_settings.")

    manifest: dict = {}
    for key, value in chrome_manifest.items():
        manifest[key] = value
        # Place the Firefox settings right after the description for readability.
        if key == "description":
            manifest["browser_specific_settings"] = FIREFOX_SETTINGS
    manifest.setdefault("browser_specific_settings", FIREFOX_SETTINGS)

    return (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_zip(destination: Path, entries: dict[str, bytes]) -> None:
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(entries):
            archive.writestr(name, entries[name])


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Package the extension for Chrome and Firefox."
    )
    parser.add_argument(
        "revision", nargs="?", default="HEAD", help="Git revision to package, e.g. v1.6"
    )
    parser.add_argument(
        "--outdir", default=".", help="Directory the zips are written to"
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    outdir = Path(args.outdir).resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    try:
        files = list_files(repo_root, args.revision)
        chrome_entries = {path: read_blob(repo_root, args.revision, path) for path in files}

        if MANIFEST not in chrome_entries:
            raise ValueError(f"{MANIFEST} is missing from {args.revision}.")

        firefox_entries = dict(chrome_entries)
        firefox_entries[MANIFEST] = build_firefox_manifest(
            json.loads(chrome_entries[MANIFEST])
        )

        write_zip(outdir / CHROME_ZIP, chrome_entries)
        write_zip(outdir / FIREFOX_ZIP, firefox_entries)
    except (ValueError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        return 1

    print(f"Created {outdir / CHROME_ZIP} ({len(chrome_entries)} files)")
    print(f"Created {outdir / FIREFOX_ZIP} ({len(firefox_entries)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
