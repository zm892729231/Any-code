#!/usr/bin/env python3
"""合并并生成多平台 latest.json。"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge Tauri latest.json entries")
    parser.add_argument("--version", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--output", default="latest.json")
    parser.add_argument("--existing", default="latest-existing.json")
    parser.add_argument(
        "--platform",
        action="append",
        default=[],
        help="格式：platform|signature_file|asset_name",
    )
    return parser.parse_args()


def load_existing(path: Path) -> dict:
    if not path.exists():
        return {"platforms": {}}

    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def build_platform_entry(repo: str, tag: str, spec: str) -> tuple[str, dict]:
    parts = spec.split("|", 2)
    if len(parts) != 3:
        raise ValueError(f"Invalid platform spec: {spec}")

    platform, signature_file, asset_name = parts
    signature = Path(signature_file).read_text(encoding="utf-8").strip()
    if not signature:
        raise ValueError(f"Empty signature: {signature_file}")

    return (
        platform,
        {
            "signature": signature,
            "url": f"https://github.com/{repo}/releases/download/{tag}/{asset_name}",
        },
    )


def main() -> None:
    args = parse_args()
    data = load_existing(Path(args.existing))
    data.setdefault("platforms", {})
    data["version"] = args.version
    data["pub_date"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data["notes"] = f"See the full changelog at https://github.com/{args.repo}/releases/tag/{args.tag}"

    for platform_spec in args.platform:
        platform, entry = build_platform_entry(args.repo, args.tag, platform_spec)
        data["platforms"][platform] = entry

    Path(args.output).write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
