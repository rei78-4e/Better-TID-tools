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


CHROME_MANIFEST = "manifest.json"
FIREFOX_MANIFEST = "manifest.firefox.json"

CHROME_ZIP = "Better-TID-tools.zip"
FIREFOX_ZIP = "Better-TID-tools-firefox.zip"

# Files that are part of the repository but not of the shipped extension.
EXCLUDE_PATTERN = re.compile(r"^(\.github/|scripts/|README\.md$|\.gitignore$|\.gitattributes$)")

# Keys that are allowed to exist only in the Firefox manifest.
FIREFOX_ONLY_KEYS = frozenset({"browser_specific_settings"})


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


def check_manifests(chrome_manifest: dict, firefox_manifest: dict) -> None:
    """Fail if the two manifests diverge outside of the Firefox-only keys."""
    comparable = {
        key: value
        for key, value in firefox_manifest.items()
        if key not in FIREFOX_ONLY_KEYS
    }

    differing = sorted(
        key
        for key in set(comparable) | set(chrome_manifest)
        if comparable.get(key) != chrome_manifest.get(key)
    )
    if differing:
        raise ValueError(
            f"{FIREFOX_MANIFEST} is out of sync with {CHROME_MANIFEST}; "
            f"differing keys: {', '.join(differing)}"
        )

    missing = sorted(FIREFOX_ONLY_KEYS - set(firefox_manifest))
    if missing:
        raise ValueError(f"{FIREFOX_MANIFEST} is missing keys: {', '.join(missing)}")


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
        blobs = {path: read_blob(repo_root, args.revision, path) for path in files}

        for required in (CHROME_MANIFEST, FIREFOX_MANIFEST):
            if required not in blobs:
                raise ValueError(f"{required} is missing from {args.revision}.")

        check_manifests(
            json.loads(blobs[CHROME_MANIFEST]), json.loads(blobs[FIREFOX_MANIFEST])
        )

        chrome_entries = {
            path: data for path, data in blobs.items() if path != FIREFOX_MANIFEST
        }

        firefox_entries = {
            path: data for path, data in blobs.items() if path != FIREFOX_MANIFEST
        }
        firefox_entries[CHROME_MANIFEST] = blobs[FIREFOX_MANIFEST]

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
