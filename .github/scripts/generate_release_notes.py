#!/usr/bin/env python3
"""生成 GitHub Release 说明。"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


def run_git(args: list[str]) -> str:
    result = subprocess.run(["git", *args], check=True, capture_output=True, text=True, encoding="utf-8")
    return result.stdout.strip()


def find_previous_tag(current_tag: str) -> str | None:
    tags_output = run_git(["tag", "--sort=-version:refname"])
    if not tags_output:
        return None

    for tag in tags_output.splitlines():
        tag = tag.strip()
        if not tag or tag == current_tag or "-macos" in tag:
            continue
        if tag.startswith("v"):
            return tag
    return None


def load_manual_notes(version: str) -> str:
    note_path = Path("docs") / "releases" / f"{version}.md"
    if note_path.exists():
        return note_path.read_text(encoding="utf-8").strip()
    return "## 更新内容\n\n- 本版本包含功能改进与稳定性修复。"


def build_commit_notes(previous_tag: str | None, current_tag: str) -> tuple[str, str]:
    if previous_tag:
        commit_lines = run_git(["log", "--pretty=- %s (%h)", f"{previous_tag}..HEAD"])
        compare_range = f"> 对比范围：{previous_tag} → {current_tag}"
    else:
        commit_lines = run_git(["log", "-n", "20", "--pretty=- %s (%h)"])
        compare_range = "> 对比范围：最近 20 条提交"

    if not commit_lines:
        commit_lines = "- 无新增提交记录"

    return commit_lines, compare_range


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate release notes markdown")
    parser.add_argument("--version", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--output", default="release-notes.md")
    args = parser.parse_args()

    previous_tag = find_previous_tag(args.tag)
    manual_notes = load_manual_notes(args.version)
    commit_lines, compare_range = build_commit_notes(previous_tag, args.tag)

    body = f"""{manual_notes}

## 提交记录

{commit_lines}

{compare_range}

## 下载说明

- Windows 安装版：`any-code_{args.version}_x64-setup.exe`
- Windows 便携版：`any-code_{args.version}_x64-portable.exe`
- Windows MSI：`any-code_{args.version}_x64.msi`
- Linux：`any-code_{args.version}_amd64.AppImage` / `*.deb`
- macOS Apple Silicon：`any-code_{args.version}_aarch64.dmg` / `any-code_{args.version}_aarch64.app.tar.gz`
- macOS Intel：`any-code_{args.version}_x64.dmg` / `any-code_{args.version}_x64.app.tar.gz`

## 自动更新

- 安装包与 updater 归档会同步刷新 `latest.json`。
- 详细变更请直接查看本页“更新内容”和“提交记录”。
"""

    Path(args.output).write_text(body.strip() + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
