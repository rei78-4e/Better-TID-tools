#!/usr/bin/env python3
"""Update the manifests, commit them, and create a release tag."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


VERSION_PATTERN = re.compile(r"^\d+(?:\.\d+){0,3}$")

# Chrome uses manifest.json, Firefox gets manifest.firefox.json renamed at package time.
MANIFEST_NAMES = ("manifest.json", "manifest.firefox.json")


def parse_version(version: str) -> tuple[int, int, int, int]:
    if not VERSION_PATTERN.fullmatch(version):
        raise ValueError(
            f"Invalid version '{version}'. Use 1 to 4 dot-separated integers, e.g. 1.6 or 1.6.0."
        )

    parts = [int(part) for part in version.split(".")]
    return tuple(parts + [0] * (4 - len(parts)))  # type: ignore[return-value]


def run_git(repo_root: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo_root, check=True)


def update_manifest_version(manifest_path: Path, new_version: str) -> str:
    text = manifest_path.read_text(encoding="utf-8")
    manifest = json.loads(text)
    current_version = str(manifest["version"])

    current_parsed = parse_version(current_version)
    new_parsed = parse_version(new_version)

    if new_parsed < current_parsed:
        raise ValueError(
            f"Version must not go backwards: current={current_version}, requested={new_version}."
        )
    if new_parsed == current_parsed:
        raise ValueError(
            f"manifest.json already has version {current_version}; choose a newer version to create a release commit."
        )

    updated_text, replacements = re.subn(
        r'("version"\s*:\s*")([^"]+)(")',
        rf"\g<1>{new_version}\3",
        text,
        count=1,
    )
    if replacements != 1:
        raise RuntimeError("Could not update the version field in manifest.json.")

    manifest_path.write_text(updated_text, encoding="utf-8")
    return current_version


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Update manifest.json, commit the change, and create a v-prefixed tag."
    )
    parser.add_argument("version", help="New manifest version, e.g. 1.6")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    tag_name = f"v{args.version}"

    try:
        previous_versions = {
            name: update_manifest_version(repo_root / name, args.version)
            for name in MANIFEST_NAMES
        }
        previous_version = previous_versions[MANIFEST_NAMES[0]]
        run_git(
            repo_root,
            "commit",
            "--only",
            *MANIFEST_NAMES,
            "-m",
            f"chore: release {tag_name}",
        )
        run_git(repo_root, "tag", tag_name)
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"release failed: {exc}", file=sys.stderr)
        return 1

    print(f"Updated {', '.join(MANIFEST_NAMES)}: {previous_version} -> {args.version}")
    print(f"Created commit and tag: {tag_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
